/**
 * A minimal PDF writer for printable sheets: each page is one JPEG drawn edge to edge. JPEG is a
 * native PDF image format (DCTDecode), so no PDF library or font embedding is needed, and every
 * script the canvas can draw (Hindi, Spanish accents) prints correctly.
 */
export interface PdfPage {
  jpeg: Uint8Array;
  widthPx: number;
  heightPx: number;
}

const MM_TO_PT = 72 / 25.4;

export function pdfFromJpegPages(pages: PdfPage[], pageMm: { w: number; h: number }): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array | string) => {
    const bytes = typeof b === 'string' ? enc.encode(b) : b;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, body: () => void) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    body();
    push('\nendobj\n');
  };

  const w = +(pageMm.w * MM_TO_PT).toFixed(2);
  const h = +(pageMm.h * MM_TO_PT).toFixed(2);
  // Objects: 1 catalog, 2 pages, then per page: page, content, image.
  const pageObj = (i: number) => 3 + i * 3;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () =>
    push(
      `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>`,
    ),
  );
  pages.forEach((p, i) => {
    const page = pageObj(i);
    const content = page + 1;
    const image = page + 2;
    object(page, () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i} ${image} 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
    const draw = `q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q`;
    object(content, () => push(`<< /Length ${enc.encode(draw).length} >>\nstream\n${draw}\nendstream`));
    object(image, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${p.widthPx} /Height ${p.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      );
      push(p.jpeg);
      push('\nendstream');
    });
  });
  const count = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
