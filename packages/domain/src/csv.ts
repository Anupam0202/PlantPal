/**
 * CSV writer that is safe to open in spreadsheet apps: cells that start with a formula trigger
 * (= + - @, tab, carriage return) are prefixed with an apostrophe so they are shown as text.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (typeof value === 'number') s = Number.isFinite(value) ? String(value) : '';
  else if (typeof value === 'boolean') s = value ? 'true' : 'false';
  else if (typeof value === 'bigint') s = value.toString();
  else if (typeof value === 'string') s = value;
  else s = JSON.stringify(value);

  // Plain negative numbers are data, not formulas.
  if (typeof value !== 'number' && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

/** RFC 4180 CSV with CRLF line endings and a UTF-8 byte-order mark for spreadsheet apps. */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
