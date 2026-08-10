import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { scanUrl } from '../../src/scanner/scan.js';
import type { TextNodeSnapshot } from '../../src/types.js';
import { findClosedPort, startFixtureServer, type FixtureServer } from './fixture-server.js';

let server: FixtureServer;

beforeAll(async () => {
  server = await startFixtureServer();
});

afterAll(async () => {
  await server.close();
});

/** Find the captured node for a fixture element, by its selector. */
function nodeFor(nodes: TextNodeSnapshot[], selector: string): TextNodeSnapshot | undefined {
  return nodes.find((node) => node.selector === selector);
}

describe('scanUrl against a clean page', () => {
  it('reports no axe violations', async () => {
    const result = await scanUrl(server.fixture('clean.html'));

    expect(result.error).toBeUndefined();
    expect(result.standard.violations).toEqual([]);
    expect(result.standard.passes).toBeGreaterThan(0);
  });

  it('produces a snapshot at the declared version', async () => {
    const result = await scanUrl(server.fixture('clean.html'));

    expect(result.snapshot?.snapshotVersion).toBe(1);
    expect(result.snapshot?.documentLang).toBe('en');
    expect(result.snapshot?.truncated).toBe(false);
    expect(result.snapshot?.nodes.length).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('leaves the script-aware side empty, since no rules exist yet', async () => {
    const result = await scanUrl(server.fixture('clean.html'));

    expect(result.scriptAware.violations).toEqual([]);
  });
});

describe('scanUrl against a page with a real axe violation', () => {
  it('passes axe-core findings through untouched', async () => {
    const result = await scanUrl(server.fixture('missing-alt.html'));

    expect(result.error).toBeUndefined();
    const ids = result.standard.violations.map((violation) => (violation as { id: string }).id);
    expect(ids).toContain('image-alt');

    // The finding keeps axe's own shape. Re-wording or re-scoring it would destroy the one
    // thing that makes the script-aware layer measurable against a known baseline.
    const imageAlt = result.standard.violations.find(
      (violation) => (violation as { id: string }).id === 'image-alt',
    ) as { helpUrl: string; nodes: unknown[] };
    expect(imageAlt.helpUrl).toContain('dequeuniversity.com');
    expect(imageAlt.nodes.length).toBeGreaterThan(0);
  });
});

describe('snapshot capture', () => {
  it('records the computed CSS that a rule will judge', async () => {
    const result = await scanUrl(server.fixture('multi-script.html'));
    const nodes = result.snapshot?.nodes ?? [];

    const arabic = nodeFor(nodes, '#arabic-spaced');
    expect(arabic).toBeDefined();
    // The computed value, not the stylesheet text: this is the defect the project exists for.
    expect(arabic?.css.letterSpacing).toBe('2px');
    expect(arabic?.css.direction).toBe('rtl');
    expect(arabic?.dominantScript).toBe('arabic');
    expect(arabic?.ownLang).toBe('ar');
    expect(arabic?.ownDir).toBe('rtl');
    expect(arabic?.computedDirection).toBe('rtl');
    expect(arabic?.ancestorHasDirRtl).toBe(true);
    expect(arabic?.tagName).toBe('P');
    expect(arabic?.classNames).toContain('spaced-arabic');
  });

  it('records line height and box metrics', async () => {
    const result = await scanUrl(server.fixture('multi-script.html'));
    const nodes = result.snapshot?.nodes ?? [];

    const thai = nodeFor(nodes, '#thai-tight');
    expect(thai?.dominantScript).toBe('thai');
    // 1.1 of the 16px default, resolved by the browser to an absolute length.
    expect(thai?.css.lineHeight).toBe('17.6px');
    expect(thai?.box.clientHeight).toBeGreaterThan(0);
  });

  it('flags the Vietnamese profile on Latin text rather than inventing a script', async () => {
    const result = await scanUrl(server.fixture('multi-script.html'));
    const nodes = result.snapshot?.nodes ?? [];

    const vietnamese = nodeFor(nodes, '#vietnamese-clipped');
    expect(vietnamese?.dominantScript).toBe('latin');
    expect(vietnamese?.isVietnameseProfile).toBe(true);
    expect(vietnamese?.css.height).toBe('20px');

    const plainLatin = nodeFor(nodes, '#plain-latin');
    expect(plainLatin?.dominantScript).toBe('latin');
    expect(plainLatin?.isVietnameseProfile).toBe(false);
  });

  it('records inherited language separately from the element´s own', async () => {
    const result = await scanUrl(server.fixture('multi-script.html'));
    const nodes = result.snapshot?.nodes ?? [];

    const hebrew = nodeFor(nodes, '#bidi-isolated');
    expect(hebrew?.ownLang).toBe('he');
    // The page is lang="en"; the element overrides it. Keeping both is what lets a rule tell
    // "this element declared a language" from "this element inherited one".
    expect(hebrew?.inheritedLang).toBe('en');
    expect(hebrew?.hasBdiAncestor).toBe(true);
    expect(hebrew?.dominantScript).toBe('hebrew');

    const plainLatin = nodeFor(nodes, '#plain-latin');
    expect(plainLatin?.ownLang).toBeNull();
    expect(plainLatin?.inheritedLang).toBe('en');
  });

  it('skips text that nobody can read', async () => {
    const result = await scanUrl(server.fixture('multi-script.html'));
    const captured = (result.snapshot?.nodes ?? []).map((node) => node.text).join('\n');

    expect(captured).not.toContain('display:none');
    expect(captured).not.toContain('visibility:hidden');
    // Script contents are text nodes in the tree but are never rendered.
    expect(captured).not.toContain('glyphlintFixtureMarker');
    expect(captured).not.toContain('must never appear in a snapshot');
  });

  it('probes the font stack without overclaiming', async () => {
    const result = await scanUrl(server.fixture('multi-script.html'));
    const thai = nodeFor(result.snapshot?.nodes ?? [], '#thai-tight');

    expect(thai?.fontProbe.declaredStack.length).toBeGreaterThan(0);
    expect(typeof thai?.fontProbe.fallbackSuspected).toBe('boolean');
  });

  it('counts the writing systems it found', async () => {
    const result = await scanUrl(server.fixture('multi-script.html'));

    expect(result.scriptsDetected.arabic).toBeGreaterThan(0);
    expect(result.scriptsDetected.thai).toBeGreaterThan(0);
    expect(result.scriptsDetected.latin).toBeGreaterThan(0);
    expect(result.scriptsDetected.hebrew).toBeGreaterThan(0);
  });

  it('caps the node count and says so', async () => {
    const result = await scanUrl(server.fixture('multi-script.html'), { maxNodes: 2 });

    expect(result.snapshot?.nodes).toHaveLength(2);
    expect(result.snapshot?.truncated).toBe(true);
  });

  it('caps the text length', async () => {
    const result = await scanUrl(server.fixture('clean.html'), { maxTextLength: 10 });

    for (const node of result.snapshot?.nodes ?? []) {
      expect(node.text.length).toBeLessThanOrEqual(10);
    }
  });
});

describe('writing systems GlyphLint does not model', () => {
  it('reports them instead of staying quiet', async () => {
    const result = await scanUrl(server.fixture('unsupported-script.html'));

    expect(result.error).toBeUndefined();
    expect(result.unsupportedScript).toBeDefined();
    expect(result.unsupportedScript?.nodeCount).toBeGreaterThan(0);
    expect(result.unsupportedScript?.samples.length).toBeGreaterThan(0);
    // The page produced no script-aware findings, so without this field the result would be
    // indistinguishable from a page we fully understood.
    expect(result.scriptAware.violations).toEqual([]);
  });

  it('counts the unattributable text in scriptsDetected too', async () => {
    const result = await scanUrl(server.fixture('unsupported-script.html'));

    expect(result.scriptsDetected.unknown).toBeGreaterThan(0);
  });

  it('notices unsupported text even when the node is dominantly Latin', async () => {
    const result = await scanUrl(server.fixture('unsupported-script.html'));
    const mixed = nodeFor(result.snapshot?.nodes ?? [], '#mixed-latin-bengali');

    // The node reads as Latin overall, which is correct — and is exactly why looking only at
    // the dominant script would have hidden the Bengali word inside it.
    expect(mixed?.dominantScript).toBe('latin');
    expect(mixed?.scriptRuns.some((run) => run.script === 'unknown')).toBe(true);
  });

  it('keeps the samples short and few', async () => {
    const result = await scanUrl(server.fixture('unsupported-script.html'));
    const samples = result.unsupportedScript?.samples ?? [];

    expect(samples.length).toBeLessThanOrEqual(5);
    for (const sample of samples) {
      expect(sample.length).toBeLessThanOrEqual(40);
      expect(sample.trim()).toBe(sample);
    }
  });

  it('says nothing at all when every script is supported', async () => {
    const result = await scanUrl(server.fixture('clean.html'));

    expect(result.unsupportedScript).toBeUndefined();
  });
});

describe('screenshots', () => {
  it('writes one only when asked', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'glyphlint-'));
    const target = path.join(directory, 'shot.png');

    try {
      const withoutScreenshot = await scanUrl(server.fixture('clean.html'));
      expect(withoutScreenshot.screenshotPath).toBeUndefined();

      const withScreenshot = await scanUrl(server.fixture('clean.html'), {
        screenshotPath: target,
      });
      expect(withScreenshot.screenshotPath).toBe(target);
      expect((await stat(target)).size).toBeGreaterThan(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('failures are sentences, not stack traces', () => {
  it('reports a timeout without crashing', async () => {
    const result = await scanUrl(server.hanging(), { timeoutMs: 2000 });

    expect(result.error?.kind).toBe('timeout');
    expect(result.error?.message).toContain('did not finish loading');
    expect(result.error?.message).not.toContain('at ');
    expect(result.snapshot).toBeUndefined();
    expect(result.standard.violations).toEqual([]);
  });

  it('reports a host that does not resolve', async () => {
    // `.invalid` is reserved by RFC 2606 and can never resolve, so this reaches no real network.
    const result = await scanUrl('http://glyphlint-nonexistent-host.invalid', { timeoutMs: 5000 });

    expect(result.error?.kind).toBe('dns-failure');
    expect(result.error?.message).toContain('could not be resolved');
  });

  it('reports a refused connection', async () => {
    const port = await findClosedPort();
    const result = await scanUrl(`http://127.0.0.1:${port}/`, { timeoutMs: 5000 });

    expect(result.error?.kind).toBe('unreachable-host');
    expect(result.error?.message).toContain('did not accept the connection');
  });

  it('explains a port the browser refuses to open', async () => {
    // Chromium blocks well-known ports such as 22 outright. Without its own message this comes
    // back as "unknown", which tells the person running the scan nothing they can act on.
    const result = await scanUrl('http://127.0.0.1:22/', { timeoutMs: 5000 });

    expect(result.error?.kind).toBe('blocked-port');
    expect(result.error?.message).toContain('port is one it blocks');
  });

  it('refuses content that is not a page', async () => {
    const result = await scanUrl(server.notHtml(), { timeoutMs: 5000 });

    expect(result.error?.kind).toBe('non-html-content');
    expect(result.error?.message).toContain('HTML pages only');
  });

  it('reports an empty body', async () => {
    const result = await scanUrl(server.empty(), { timeoutMs: 5000 });

    expect(result.error?.kind).toBe('empty-body');
    expect(result.error?.message).toContain('nothing to scan');
  });

  it('keeps the technical detail out of the message but available', async () => {
    const result = await scanUrl('http://glyphlint-nonexistent-host.invalid', { timeoutMs: 5000 });

    expect(result.error?.detail).toBeDefined();
    expect(result.error?.detail).toContain('ERR_NAME_NOT_RESOLVED');
    expect(result.error?.message).not.toContain('ERR_NAME_NOT_RESOLVED');
  });
});
