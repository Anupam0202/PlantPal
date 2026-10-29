import { z } from 'zod';
import type { SpeciesMedia } from '@plantpal/schemas';
import { ProviderError } from '../core/errors';
import { provenance } from '../core/provenance';

export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

/** File search for a scientific name, with licence metadata. `origin=*` allows anonymous CORS. */
export function commonsUrl(scientificName: string, limit = 8): string {
  const q = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `"${scientificName.trim()}" filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|mime',
    iiurlwidth: '640',
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist',
  });
  return `${COMMONS_API}?${q.toString()}`;
}

const Meta = z.object({ value: z.string() }).optional();
const Raw = z.object({
  query: z
    .object({
      pages: z.record(
        z.string(),
        z.object({
          title: z.string(),
          index: z.number().optional(),
          imageinfo: z
            .array(
              z.object({
                thumburl: z.string().optional(),
                descriptionurl: z.string().optional(),
                mime: z.string().optional(),
                extmetadata: z
                  .object({ LicenseShortName: Meta, LicenseUrl: Meta, Artist: Meta })
                  .partial()
                  .optional(),
              }),
            )
            .optional(),
        }),
      ),
    })
    .optional(),
});

/** Only licences that allow reuse with attribution; NC and ND are left out. */
export function isOpenLicence(licence: string): boolean {
  const l = licence.trim();
  if (/\b(NC|ND)\b/i.test(l)) return false;
  return /^(CC0|CC BY(-SA)?( \d(\.\d)?)?|Public domain|PD\b)/i.test(l);
}

/** Plain text from Commons' HTML author field. */
export function plainText(html: string): string {
  return (
    html
      .replace(/<[^>]{0,500}>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      // Rendered as text, never HTML; drop any angle bracket left over.
      .replace(/[<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200)
  );
}

export function parseCommons(json: unknown, ctx: { retrievedAt: string; demo?: boolean }): SpeciesMedia {
  const r = Raw.safeParse(json);
  if (!r.success) throw new ProviderError('BAD_RESPONSE', 'wikimedia-commons', 'Unexpected Commons shape');
  const pages = Object.values(r.data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const items = pages.flatMap((p) => {
    const ii = p.imageinfo?.[0];
    const licence = ii?.extmetadata?.LicenseShortName?.value ?? '';
    if (!ii?.thumburl || !ii.descriptionurl || !isOpenLicence(licence)) return [];
    if (ii.mime && !/^image\/(jpeg|png|webp)$/.test(ii.mime)) return [];
    if (!ii.thumburl.startsWith('https://upload.wikimedia.org/')) return [];
    return [
      {
        title: p.title.replace(/^File:/, ''),
        thumbUrl: ii.thumburl,
        pageUrl: ii.descriptionurl,
        licence,
        licenceUrl: ii.extmetadata?.LicenseUrl?.value ?? null,
        author: plainText(ii.extmetadata?.Artist?.value ?? '') || 'Unknown author',
      },
    ];
  });
  return {
    provenance: provenance('wikimedia-commons', {
      retrievedAt: ctx.retrievedAt,
      lat: null,
      lon: null,
      demo: ctx.demo,
    }),
    items,
  };
}
