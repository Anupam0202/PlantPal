import { describe, expect, it } from 'vitest';
import { pdfFromJpegPages } from '../src/features/labels/pdf';

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

describe('label sheet PDF', () => {
  it('writes a valid PDF whose cross-reference table points at every object', () => {
    // Bytes that look like a JPEG (start and end markers); the PDF stores them unchanged.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    const pdf = pdfFromJpegPages(
      [
        { jpeg, widthPx: 2480, heightPx: 3508 },
        { jpeg, widthPx: 2480, heightPx: 3508 },
      ],
      { w: 210, h: 297 },
    );
    const text = latin1(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text).toContain('/MediaBox [0 0 595.28 841.89]');
    expect(text).toContain('/Filter /DCTDecode');

    // startxref points at the xref table, and each entry at "n 0 obj".
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const entries = text
      .slice(startxref)
      .split('\n')
      .filter((l) => / 00000 n $/.test(l))
      .map((l) => Number(l.slice(0, 10)));
    expect(entries).toHaveLength(8);
    entries.forEach((offset, i) => expect(text.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true));
    // The JPEG bytes are embedded exactly.
    expect(text).toContain(latin1(jpeg));
  });
});
