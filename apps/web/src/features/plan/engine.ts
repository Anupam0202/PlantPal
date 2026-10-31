import { SEED_PACK, sourceById, taxonById } from '@plantpal/catalog';
import {
  manualClimate,
  rankCandidates,
  sowWindows,
  type Candidate,
  type ClimateFacts,
  type EligibilityContext,
  type Finding,
  type ZoneFacts,
} from '@plantpal/domain';
import type { ClimateProfile, Garden, GardenProfile, Taxon, Zone, ZoneKind } from '@plantpal/schemas';
import { useMemo } from 'react';
import type { LocalePref } from '../../state/prefs';
import type { PlanMessages } from './messages';

export const ENGINE_VERSION = 'eligibility-1';
export const CATALOG_VERSION = SEED_PACK.version;
export const CATALOG_TAXA: readonly Taxon[] = SEED_PACK.taxa;

const GROUND_KINDS: readonly ZoneKind[] = ['yard', 'community-plot', 'bed'];
const INDOOR_KINDS: readonly ZoneKind[] = ['indoor', 'windowsill'];

type ZoneLike = Pick<
  Zone,
  'kind' | 'covered' | 'areaM2' | 'sun' | 'indoorLight' | 'clearanceCm' | 'maxContainerL'
>;

export function zoneFactsOf(zone: ZoneLike): ZoneFacts {
  const indoor = INDOOR_KINDS.includes(zone.kind) && !zone.sun;
  return {
    indoor,
    covered: indoor ? true : zone.covered,
    containers: !GROUND_KINDS.includes(zone.kind),
    rooftop: zone.kind === 'rooftop',
    // Preserve 0: only a missing profile is unknown.
    sunMonthly: zone.sun ? zone.sun.monthlyHours : null,
    indoorLight: zone.indoorLight,
    areaM2: zone.areaM2,
    clearanceCm: zone.clearanceCm,
    maxContainerL: zone.maxContainerL,
  };
}

export function climateFactsOf(
  profile: ClimateProfile | null | undefined,
  manual: GardenProfile['manualClimate'] | null | undefined,
): ClimateFacts {
  if (profile && profile.extremeMinC !== null) {
    return {
      extremeMinC: profile.extremeMinC,
      basis: 'measured',
      seasonDays: profile.seasonDays,
      hotSummers: profile.hotSummers,
    };
  }
  return manualClimate(manual?.frost ?? null, manual?.hotSummers ?? null);
}

export interface PlanInputs {
  /** Local monthly normals, when measured: sowing windows come from them (§6.15). */
  normals?: ClimateProfile['months'] | null;
  lat: number | null;
  region: Garden['region'];
  profile: GardenProfile | null;
  zone: ZoneLike;
  climate: ClimateFacts;
  month: number;
}

export function contextOf(i: PlanInputs): EligibilityContext {
  return {
    lat: i.lat,
    region: { countryCode: i.region?.countryCode ?? null, l3: i.region?.l3 ?? null },
    household: i.profile?.household ?? null,
    showToxicWithWarning: i.profile?.showToxicWithWarning ?? false,
    zone: zoneFactsOf(i.zone),
    climate: i.climate,
    water: { access: i.profile?.waterAccess ?? null, minutesPerWeek: i.profile?.minutesPerWeek ?? null },
    goals: i.profile?.goals ?? [],
    containerMarginC: 5,
    month: i.month,
    sowWindows: i.normals ? sowWindows(i.normals) : null,
  };
}

export function useCandidates(ctx: EligibilityContext | null): Candidate[] {
  return useMemo(() => (ctx ? rankCandidates(CATALOG_TAXA, ctx) : []), [ctx]);
}

/** Short, stable fingerprint of the inputs (FNV-1a), stored with a plan to detect later changes. */
export function inputsHash(ctx: EligibilityContext): string {
  const s = JSON.stringify(ctx);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const tagOf = (locale: LocalePref) => (locale === 'hi' ? 'hi-IN' : locale);

export function monthName(m: number, locale: LocalePref): string {
  return new Intl.DateTimeFormat(tagOf(locale), { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, m, 15)),
  );
}

export function regionName(code: string, locale: LocalePref): string {
  const bare = code.replace(/^L3:/, '');
  if (/^[A-Z]{2}$/.test(bare)) {
    try {
      return new Intl.DisplayNames([tagOf(locale)], { type: 'region' }).of(bare) ?? bare;
    } catch {
      return bare;
    }
  }
  return bare;
}

export function taxonName(t: Taxon, locale: LocalePref): string {
  return (locale === 'hi' ? t.names.hi : locale === 'es' ? t.names.es : undefined) ?? t.names.en;
}

/** Human sentence for one engine finding, in the current language. */
export function reasonText(f: Finding, m: PlanMessages, locale: LocalePref): string {
  const p = f.params ?? {};
  const r = m.reason;
  switch (f.code) {
    case 'invasiveListed':
      return r.invasiveListed(p, regionName(String(p.region ?? ''), locale));
    case 'toxicTo':
      return r.toxicTo(p, m.plan.groups[String(p.group)] ?? String(p.group));
    case 'toxicityUnverified':
      return r.toxicityUnverified(
        p,
        String(p.groups ?? '')
          .split(',')
          .map((g) => m.plan.groups[g] ?? g)
          .join(', '),
      );
    case 'plantLater':
      return r.plantLater(p, monthName(Number(p.month), locale));
    default: {
      const fn = (
        r as unknown as Record<string, ((p: Record<string, string | number>) => string) | undefined>
      )[f.code];
      return fn ? fn(p) : f.code;
    }
  }
}

export function sourceLabel(id: string | undefined): { title: string; url: string | null } | null {
  if (!id) return null;
  const s = sourceById(id);
  return s ? { title: `${s.publisher}: ${s.title}`, url: s.url } : null;
}

export { taxonById };

/** Items to store: every candidate with its snapshot; chosen ones become planned specimens. */
export function planItemsOf(
  candidates: readonly Candidate[],
  chosen: ReadonlySet<string>,
  zoneId: string | number,
) {
  return candidates.map((c) => {
    const t = taxonById(c.taxonId);
    return {
      taxonId: c.taxonId,
      status: c.status,
      chosen: chosen.has(c.taxonId) && c.status === 'ELIGIBLE',
      score: c.score,
      findings: c.findings.map((f) => ({ ...f })),
      flags: [...c.flags],
      zone: zoneId,
      displayName: t?.names.en ?? c.taxonId,
      scientificName: t?.scientificName ?? c.taxonId,
    };
  });
}
