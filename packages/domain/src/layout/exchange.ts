import { LayoutBody, LayoutExport } from '@plantpal/schemas';

/** JSON export in the named local metric frame. Never GeoJSON: there is no georeference (Appendix B). */
export function toLayoutExport(body: LayoutBody): LayoutExport {
  return {
    type: 'plantpal-layout',
    schema: 1,
    frame: body.frame,
    name: body.name,
    outline: body.outline,
    items: body.items,
  };
}

export class LayoutImportError extends Error {
  constructor(
    /** 'geojson': a map file with no local frame; 'not-layout': anything else. The UI words it. */
    readonly code: 'geojson' | 'not-layout',
    message: string,
  ) {
    super(message);
    this.name = 'LayoutImportError';
  }
}

/** Reads an exported layout back. GeoJSON and unknown shapes are refused rather than guessed. */
export function fromLayoutExport(json: unknown): LayoutBody {
  const t = (json as { type?: unknown } | null)?.type;
  if (t === 'FeatureCollection' || t === 'Feature')
    throw new LayoutImportError(
      'geojson',
      'GeoJSON has no local frame; PlantPal layouts use metres in a local frame.',
    );
  const r = LayoutExport.safeParse(json);
  if (!r.success) throw new LayoutImportError('not-layout', 'This file is not a PlantPal layout.');
  return LayoutBody.parse({
    name: r.data.name,
    frame: r.data.frame,
    outline: r.data.outline,
    items: r.data.items,
  });
}
