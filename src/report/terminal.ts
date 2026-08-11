/**
 * The terminal report: coloured, summarised, and still separated.
 *
 * The two layers get two headings and two count lines here exactly as they do in the HTML. A
 * terminal is where the temptation to print one number is strongest, and one number is the thing
 * this project must not print.
 *
 * **Colour is a parameter, not a decision made here.** `report/` is pure: it does not read
 * `process.env`, does not ask whether stdout is a terminal, and does not know what `NO_COLOR` is.
 * The CLI answers those questions and passes the answer in, which is also what makes the plain
 * output testable without faking a terminal.
 */

import type { Confidence, Severity } from '../types.js';
import { DISCLAIMER, SEVERITIES, type ReportModel } from './model.js';

export interface TerminalReportOptions {
  /** Emit ANSI colour. The caller decides; see the note above. */
  colour?: boolean;
  /** Findings listed per rule before the rest are summarised as a count. Defaults to 5. */
  maxFindingsPerRule?: number;
}

const DEFAULT_MAX_FINDINGS = 5;

/**
 * The escape character that begins an ANSI sequence.
 *
 * Built from its code point rather than typed into the source. The character itself is invisible
 * in an editor and survives a copy-paste badly, and a colour bug caused by a control byte nobody
 * can see is not a bug anyone finds quickly.
 */
const ESC = String.fromCharCode(27);

/** SGR codes, written out rather than pulled from a package. */
const CODES = {
  reset: '0',
  bold: '1',
  dim: '2',
  red: '31',
  yellow: '33',
  blue: '34',
  magenta: '35',
  cyan: '36',
  grey: '90',
} as const;

type ColourName = keyof typeof CODES;

const SEVERITY_COLOUR: Readonly<Record<Severity, ColourName>> = {
  critical: 'red',
  serious: 'yellow',
  moderate: 'blue',
  minor: 'grey',
};

class Painter {
  constructor(private readonly enabled: boolean) {}

  paint(text: string, ...names: ColourName[]): string {
    if (!this.enabled || names.length === 0) return text;
    const codes = names.map((name) => CODES[name]).join(';');
    return `${ESC}[${codes}m${text}${ESC}[${CODES.reset}m`;
  }
}

/** `3 findings` / `1 finding`, so no line ever reads "1 findings". */
function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** One line of counts: every severity that occurred, in severity order. */
function countsLine(counts: ReportModel['standard']['counts'], painter: Painter): string {
  const parts: string[] = [];

  for (const severity of SEVERITIES) {
    const value = counts[severity];
    if (value === 0) continue;
    parts.push(painter.paint(`${severity} ${value}`, SEVERITY_COLOUR[severity]));
  }
  if (counts.ungraded > 0) parts.push(painter.paint(`not graded ${counts.ungraded}`, 'grey'));

  if (parts.length === 0) return painter.paint('no findings', 'grey');
  return parts.join('  ');
}

const CONFIDENCE_MARK: Readonly<Record<Confidence, string>> = {
  high: '',
  medium: ' [confidence: medium]',
  heuristic: ' [heuristic]',
};

/** Wrap a block of prose to a readable width, indented. Pure string arithmetic. */
function wrap(text: string, indent: string, width = 92): string {
  const words = text.split(/\s+/u).filter((word) => word !== '');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    if (line === '') line = word;
    else if (`${line} ${word}`.length + indent.length <= width) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== '') lines.push(line);

  return lines.map((entry) => `${indent}${entry}`).join('\n');
}

/**
 * Render one scan for a terminal.
 *
 * Deliberately summarised: the full text of every finding belongs in the HTML or the JSON, and a
 * terminal that scrolls past the top of the window has told the reader nothing.
 */
export function renderTerminalReport(model: ReportModel, options: TerminalReportOptions = {}): string {
  const painter = new Painter(options.colour ?? false);
  const limit = options.maxFindingsPerRule ?? DEFAULT_MAX_FINDINGS;
  const lines: string[] = [];

  lines.push(painter.paint(`GlyphLint — ${model.finalUrl}`, 'bold'));
  lines.push(painter.paint(`scanned at ${model.scannedAt} in ${model.durationMs} ms`, 'grey'));
  lines.push('');

  if (model.error !== undefined) {
    lines.push(painter.paint(`This scan did not complete: ${model.error.message}`, 'red'));
    lines.push('');
  }

  // The two summary lines. Two lines, never one: the moment they are added together, this tool
  // starts reporting axe's work as its own.
  const standardLabel = painter.paint('Standard rules   (axe-core) ', 'bold');
  const scriptAwareLabel = painter.paint('Script-aware     (glyphlint)', 'bold');
  lines.push(`  ${standardLabel}  ${countsLine(model.standard.counts, painter)}`);
  lines.push(
    painter.paint(
      `                                ${plural(model.standard.ruleCount, 'rule')}, ` +
        `${plural(model.standard.elementCount, 'element')}, ` +
        `${model.standard.passes} checks passed`,
      'grey',
    ),
  );
  lines.push(`  ${scriptAwareLabel}  ${countsLine(model.scriptAware.counts, painter)}`);
  lines.push(
    painter.paint(
      `                                ${plural(model.scriptAware.ruleCount, 'rule')}, ` +
        `${plural(model.scriptAware.elementCount, 'element')}`,
      'grey',
    ),
  );
  lines.push('');

  if (model.scriptAware.byScript.length > 0) {
    const byScript = model.scriptAware.byScript
      .map((entry) => `${entry.label} ${entry.count}`)
      .join('  ');
    lines.push(`  ${painter.paint('By writing system', 'bold')}  ${byScript}`);
    lines.push('');
  }

  if (model.filters !== undefined) {
    const { standard, scriptAware } = model.filters.withheld;
    lines.push(
      painter.paint(
        `  Filtered run: ${standard} axe-core and ${scriptAware} GlyphLint finding(s) were ` +
          'withheld and are not shown below.',
        'magenta',
      ),
    );
    lines.push('');
  }

  if (model.unsupportedScript !== undefined) {
    const { nodeCount, samples } = model.unsupportedScript;
    lines.push(
      painter.paint(
        `  ${plural(nodeCount, 'text node')} carried a writing system GlyphLint does not model, ` +
          'so no script-aware rule looked at them.',
        'cyan',
      ),
    );
    lines.push(painter.paint(`  Samples: ${samples.join('  |  ')}`, 'grey'));
    lines.push('');
  }

  lines.push(painter.paint('Standard rules — found by axe-core, reproduced unchanged', 'bold'));
  if (model.standard.groups.length === 0) {
    lines.push(painter.paint('  axe-core reported no violations.', 'grey'));
  }
  for (const group of model.standard.groups) {
    const impact = group.axe.impact ?? null;
    const grade = painter.paint(
      (impact ?? 'not graded').padEnd(10),
      impact === null ? 'grey' : SEVERITY_COLOUR[impact],
    );
    lines.push(`  ${grade}${painter.paint(group.axe.id, 'bold')}  (${plural(group.elementCount, 'element')})`);
    lines.push(wrap(group.axe.help, '            '));
    lines.push(painter.paint(`            ${group.axe.helpUrl}`, 'grey'));
  }
  lines.push('');

  lines.push(painter.paint('Script-aware rules — found by GlyphLint', 'bold'));
  if (model.scriptAware.groups.length === 0) {
    lines.push(painter.paint('  GlyphLint reported no script-aware violations.', 'grey'));
  }
  for (const group of model.scriptAware.groups) {
    const grade = painter.paint(group.severity.padEnd(10), SEVERITY_COLOUR[group.severity]);
    const mark = painter.paint(CONFIDENCE_MARK[group.confidence], 'magenta');
    lines.push(
      `  ${grade}${painter.paint(group.ruleId, 'bold')}  (${plural(group.elementCount, 'element')})${mark}`,
    );
    lines.push(wrap(group.title, '            '));
    if (group.limitations !== '') {
      lines.push(painter.paint(wrap(`Limits: ${group.limitations}`, '            '), 'grey'));
    }

    for (const violation of group.violations.slice(0, limit)) {
      lines.push(`            ${painter.paint(violation.selector, 'cyan')}`);
      lines.push(wrap(violation.whatIsWrong, '              '));
    }
    const remaining = group.violations.length - limit;
    if (remaining > 0) {
      lines.push(painter.paint(`            … and ${plural(remaining, 'more element')}`, 'grey'));
    }
    lines.push('');
  }

  lines.push(painter.paint(wrap(DISCLAIMER, '  '), 'grey'));
  lines.push('');

  return `${lines.join('\n')}\n`;
}
