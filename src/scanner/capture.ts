/**
 * Snapshot capture.
 *
 * This module is impure by design: it drives a real browser. It is also the only place where
 * that impurity is allowed to touch text analysis, and it is arranged so that it does not.
 *
 * Capture happens in two stages. Inside the page we collect **raw facts only** — text, computed
 * styles, box metrics, attributes. Back in Node we apply the pure functions from `src/scripts/`
 * to that text. Two reasons for the split: we never inject our own analysis code into somebody
 * else's page, and `src/scripts/` stays a set of pure functions that does not know a browser
 * exists.
 */

import type { Page } from 'playwright';

import { dominantScript, isVietnameseProfile, scriptRuns } from '../scripts/detect.js';
import type {
  DomSnapshot,
  FontProbe,
  TextNodeBox,
  TextNodeCss,
  TextNodeSnapshot,
} from '../types.js';

/** What the in-page pass returns: everything except the script analysis. */
interface RawTextNode {
  selector: string;
  text: string;
  ownLang: string | null;
  inheritedLang: string | null;
  ownDir: string | null;
  computedDirection: string;
  ancestorHasDirRtl: boolean;
  css: TextNodeCss;
  box: TextNodeBox;
  fontProbe: FontProbe;
  classNames: string[];
  tagName: string;
  hasBdiAncestor: boolean;
  unicodeBidi: string;
}

interface RawCapture {
  finalUrl: string;
  documentLang: string | null;
  documentDir: string | null;
  viewport: { width: number; height: number };
  nodes: RawTextNode[];
  truncated: boolean;
}

export interface CaptureLimits {
  maxNodes: number;
  maxTextLength: number;
}

/**
 * Walk the page and collect one raw record per visible text node.
 *
 * Serialised into the page by Playwright, so it must be entirely self-contained: it cannot see
 * anything from this module's scope except the `limits` argument.
 */
/* eslint-disable-next-line -- runs in the browser, not in Node */
function capturePage(limits: CaptureLimits): RawCapture {
  const { maxNodes, maxTextLength } = limits;

  /** Text that exists in the tree but is never read: markup plumbing, not content. */
  const NON_CONTENT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  // A family name no system can have. Anything measured against it is measured against the
  // browser's last-resort font.
  const MISSING_FAMILY = '"__glyphlint_family_that_does_not_exist__"';

  function cssPath(element: Element): string {
    if (element.id !== '') return `#${CSS.escape(element.id)}`;

    const parts: string[] = [];
    let current: Element | null = element;

    while (current !== null && current !== document.documentElement) {
      const parent: Element | null = current.parentElement;
      if (parent === null) break;

      let part = current.nodeName.toLowerCase();
      const sameTag = Array.prototype.filter.call(
        parent.children,
        (child: Element) => child.nodeName === current?.nodeName,
      ) as Element[];
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
      parts.unshift(part);

      if (parent.id !== '') {
        parts.unshift(`#${CSS.escape(parent.id)}`);
        return parts.join(' > ');
      }
      current = parent;
    }

    parts.unshift('html');
    return parts.join(' > ');
  }

  function isRendered(element: Element, style: CSSStyleDeclaration): boolean {
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    // An element inside a `display: none` ancestor keeps its own computed display but collapses
    // to a zero box, so this check also covers everything hidden further up the tree.
    const rect = element.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  function nearestLang(element: Element, includeSelf: boolean): string | null {
    let current: Element | null = includeSelf ? element : element.parentElement;
    while (current !== null) {
      const lang = current.getAttribute('lang');
      if (lang !== null && lang.trim() !== '') return lang;
      current = current.parentElement;
    }
    return null;
  }

  function hasAncestorMatching(element: Element, matches: (el: Element) => boolean): boolean {
    let current: Element | null = element;
    while (current !== null) {
      if (matches(current)) return true;
      current = current.parentElement;
    }
    return false;
  }

  /** Split a computed `font-family` into individual family names, quotes removed. */
  function parseStack(fontFamily: string): string[] {
    return fontFamily
      .split(',')
      .map((family) => family.trim().replace(/^["']|["']$/g, ''))
      .filter((family) => family !== '');
  }

  function probeFont(style: CSSStyleDeclaration, text: string): FontProbe {
    const declaredStack = parseStack(style.fontFamily);
    if (context === null || text === '') {
      return { declaredStack, renderedFamily: null, fallbackSuspected: false };
    }

    // Measuring the whole of a long paragraph buys no extra confidence and costs time.
    const sample = text.slice(0, 100);
    const prefix = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}`;
    const widthWith = (family: string): number => {
      context.font = `${prefix} ${family}`;
      return context.measureText(sample).width;
    };

    const baseline = widthWith(MISSING_FAMILY);
    const declaredWidth = widthWith(style.fontFamily);

    // The first declared family that measurably differs from the last-resort font is the one
    // doing the work. When nothing differs we say `null` rather than name a family we cannot
    // actually confirm is rendering.
    let renderedFamily: string | null = null;
    for (const family of declaredStack) {
      if (widthWith(`"${family}"`) !== baseline) {
        renderedFamily = family;
        break;
      }
    }

    return { declaredStack, renderedFamily, fallbackSuspected: declaredWidth === baseline };
  }

  const nodes: RawTextNode[] = [];
  let truncated = false;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();

  while (textNode !== null) {
    if (nodes.length >= maxNodes) {
      truncated = true;
      break;
    }

    const element = textNode.parentElement;
    const raw = textNode.nodeValue ?? '';
    const text = raw.trim();

    if (element !== null && text !== '' && !NON_CONTENT_TAGS.has(element.nodeName)) {
      const style = getComputedStyle(element);
      if (isRendered(element, style)) {
        const capped = text.slice(0, maxTextLength);
        nodes.push({
          selector: cssPath(element),
          text: capped,
          ownLang: element.getAttribute('lang'),
          inheritedLang: nearestLang(element, false),
          ownDir: element.getAttribute('dir'),
          computedDirection: style.direction,
          ancestorHasDirRtl: hasAncestorMatching(
            element,
            (el) => (el.getAttribute('dir') ?? '').toLowerCase() === 'rtl',
          ),
          css: {
            letterSpacing: style.letterSpacing,
            lineHeight: style.lineHeight,
            fontSize: style.fontSize,
            fontFamily: style.fontFamily,
            textAlign: style.textAlign,
            textTransform: style.textTransform,
            direction: style.direction,
            writingMode: style.writingMode,
            wordBreak: style.wordBreak,
            overflowWrap: style.overflowWrap,
            hyphens: style.hyphens,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            height: style.height,
            marginLeft: style.marginLeft,
            marginRight: style.marginRight,
            paddingLeft: style.paddingLeft,
            paddingRight: style.paddingRight,
          },
          box: {
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          },
          fontProbe: probeFont(style, capped),
          classNames: Array.from(element.classList),
          tagName: element.tagName,
          hasBdiAncestor: hasAncestorMatching(element, (el) => el.nodeName === 'BDI'),
          unicodeBidi: style.unicodeBidi,
        });
      }
    }

    textNode = walker.nextNode();
  }

  return {
    finalUrl: document.location.href,
    documentLang: document.documentElement.getAttribute('lang'),
    documentDir: document.documentElement.getAttribute('dir'),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    nodes,
    truncated,
  };
}

/** Apply the pure writing-system functions to one raw record. */
function analyse(raw: RawTextNode): TextNodeSnapshot {
  return {
    selector: raw.selector,
    text: raw.text,
    dominantScript: dominantScript(raw.text),
    scriptRuns: scriptRuns(raw.text),
    isVietnameseProfile: isVietnameseProfile(raw.text),
    ownLang: raw.ownLang,
    inheritedLang: raw.inheritedLang,
    ownDir: raw.ownDir,
    computedDirection: raw.computedDirection === 'rtl' ? 'rtl' : 'ltr',
    ancestorHasDirRtl: raw.ancestorHasDirRtl,
    css: raw.css,
    box: raw.box,
    fontProbe: raw.fontProbe,
    classNames: raw.classNames,
    tagName: raw.tagName,
    hasBdiAncestor: raw.hasBdiAncestor,
    unicodeBidi: raw.unicodeBidi,
  };
}

/** Capture the snapshot for an already-loaded page. */
export async function captureSnapshot(
  page: Page,
  requestedUrl: string,
  limits: CaptureLimits,
): Promise<DomSnapshot> {
  const raw = await page.evaluate(capturePage, limits);

  return {
    snapshotVersion: 1,
    url: requestedUrl,
    finalUrl: raw.finalUrl,
    capturedAt: new Date().toISOString(),
    viewport: raw.viewport,
    documentLang: raw.documentLang,
    documentDir: raw.documentDir,
    nodes: raw.nodes.map(analyse),
    truncated: raw.truncated,
  };
}
