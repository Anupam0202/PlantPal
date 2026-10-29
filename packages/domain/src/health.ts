import type {
  HealthChange,
  HealthQuestionnaire,
  HealthSign,
  HealthTriage,
  Likelihood,
} from '@plantpal/schemas';

/**
 * Deterministic health triage (§6.8, the fallback for F4). It reads the questionnaire and the plant's
 * context and returns candidates in the same shape as the AI triage, with likelihood classes only and
 * non-chemical first steps. It never names a product or a dose and never claims a diagnosis.
 */

export interface HealthContext {
  /** Direct-sun hours in the plant's space this month, when known. */
  sunHours: number | null;
  container: boolean;
  /** Forecast extremes over the next 3 days, when known. */
  maxTempC: number | null;
  minTempC: number | null;
  /** Waterings logged in the last 14 days. */
  wateringsLast14: number | null;
  covered: boolean | null;
}

type Candidate = HealthTriage['candidates'][number];

const RANK: Record<Likelihood, number> = { LIKELY: 0, POSSIBLE: 1, UNLIKELY: 2 };

/** Region-keyed advice services to escalate to (§6.8). URLs must be verified before launch. */
export const ADVICE_SERVICES: Record<string, Array<{ name: string; url: string | null }>> = {
  IN: [{ name: 'Krishi Vigyan Kendra (KVK) for your district', url: 'https://kvk.icar.gov.in/' }],
  GB: [{ name: 'RHS gardening advice', url: 'https://www.rhs.org.uk/advice' }],
  US: [{ name: 'Your county Cooperative Extension office', url: 'https://extension.org/' }],
  AU: [{ name: 'Your state or territory agriculture department', url: 'https://www.outbreak.gov.au/' }],
  ES: [
    {
      name: 'Servicio de Sanidad Vegetal de tu comunidad autónoma',
      url: 'https://www.mapa.gob.es/es/agricultura/temas/sanidad-vegetal/',
    },
  ],
  default: [
    { name: 'A local plant clinic, botanic garden or experienced nursery', url: null },
    { name: 'CABI PlantwisePlus Knowledge Bank', url: 'https://plantwiseplusknowledgebank.org/' },
  ],
};

export function adviceServices(countryCode: string | null): Array<{ name: string; url: string | null }> {
  return [...(countryCode ? (ADVICE_SERVICES[countryCode] ?? []) : []), ...(ADVICE_SERVICES.default ?? [])];
}

export function rulesTriage(q: HealthQuestionnaire, ctx: HealthContext): HealthTriage {
  const has = (s: HealthSign) => q.signs.includes(s);
  const changed = (c: HealthChange) => q.changes.includes(c);
  const out: Candidate[] = [];
  const add = (c: Candidate) => out.push(c);

  // ---------------------------------------------------------------- abiotic

  const wetSigns = has('drooping-wet-soil') || has('mushy-stem') || (has('yellow-lower') && q.soil === 'wet');
  if (wetSigns || (changed('watered-more') && (has('yellow-lower') || has('wilting')))) {
    const strong = q.soil === 'wet' && (has('drooping-wet-soil') || has('mushy-stem') || has('yellow-lower'));
    add({
      category: 'abiotic',
      name: 'Too much water (roots short of air)',
      likelihood: strong ? 'LIKELY' : 'POSSIBLE',
      evidenceFor: [
        q.soil === 'wet' ? 'Soil is wet at 2 cm' : null,
        has('drooping-wet-soil') ? 'Drooping although the soil is wet' : null,
        has('yellow-lower') ? 'Lower leaves turning yellow' : null,
        changed('watered-more') ? 'Watered more than usual lately' : null,
      ].filter((x): x is string => x !== null),
      evidenceAgainst: q.soil === 'dry' ? ['Soil is dry at 2 cm'] : [],
      checksToConfirm: [
        'Does water drain out of the pot within a minute?',
        'Do the roots look brown and soft rather than white and firm?',
      ],
    });
  }

  if (has('wilting') || has('brown-edges') || changed('watered-less')) {
    const dry = q.soil === 'dry';
    if (dry || changed('watered-less') || (has('wilting') && q.soil === null)) {
      add({
        category: 'abiotic',
        name: 'Too little water',
        likelihood: dry && has('wilting') ? 'LIKELY' : 'POSSIBLE',
        evidenceFor: [
          dry ? 'Soil is dry at 2 cm' : null,
          has('wilting') ? 'Wilting' : null,
          has('brown-edges') ? 'Crisp brown leaf edges' : null,
          ctx.container ? 'Grows in a container, which dries fast' : null,
        ].filter((x): x is string => x !== null),
        evidenceAgainst: q.soil === 'wet' ? ['Soil is wet at 2 cm'] : [],
        checksToConfirm: ['Does it perk up within a few hours of a thorough watering?'],
      });
    }
  }

  const hot = ctx.maxTempC !== null && ctx.maxTempC >= 35;
  if (
    has('pale-bleached') ||
    ((has('brown-spots') || has('brown-edges')) && (changed('moved') || hot || changed('heatwave')))
  ) {
    add({
      category: 'abiotic',
      name: 'Sun scorch',
      likelihood:
        has('pale-bleached') && (changed('moved') || (ctx.sunHours ?? 0) >= 6) ? 'LIKELY' : 'POSSIBLE',
      evidenceFor: [
        has('pale-bleached') ? 'Pale or bleached patches' : null,
        changed('moved') ? 'Recently moved, possibly into stronger sun' : null,
        ctx.sunHours !== null && ctx.sunHours >= 6
          ? `About ${Math.round(ctx.sunHours)} h of direct sun`
          : null,
      ].filter((x): x is string => x !== null),
      evidenceAgainst: ctx.sunHours !== null && ctx.sunHours < 2 ? ['Very little direct sun here'] : [],
      checksToConfirm: ['Is the damage only on leaves facing the sun?'],
    });
  }

  if (changed('heatwave') || (hot && (has('wilting') || has('brown-edges')))) {
    add({
      category: 'abiotic',
      name: 'Heat stress',
      likelihood: changed('heatwave') && (has('wilting') || has('brown-edges')) ? 'LIKELY' : 'POSSIBLE',
      evidenceFor: [
        changed('heatwave') ? 'Recent very hot days' : null,
        hot ? `Forecast maximum about ${Math.round(ctx.maxTempC ?? 0)} °C` : null,
      ].filter((x): x is string => x !== null),
      evidenceAgainst: [],
      checksToConfirm: ['Does it recover in the evening once it is cooler?'],
    });
  }

  const cold = ctx.minTempC !== null && ctx.minTempC <= 2;
  if (changed('cold-night') || (cold && (has('brown-spots') || has('leaf-drop') || has('mushy-stem')))) {
    add({
      category: 'abiotic',
      name: 'Cold damage',
      likelihood: changed('cold-night') && q.onset === 'sudden' ? 'LIKELY' : 'POSSIBLE',
      evidenceFor: [
        changed('cold-night') ? 'A recent cold night' : null,
        q.onset === 'sudden' ? 'Appeared suddenly' : null,
        cold ? `Forecast minimum about ${Math.round(ctx.minTempC ?? 0)} °C` : null,
      ].filter((x): x is string => x !== null),
      evidenceAgainst: [],
      checksToConfirm: ['Are the damaged leaves the most exposed ones?'],
    });
  }

  if (changed('repotted') && (has('wilting') || has('leaf-drop') || has('drooping-wet-soil'))) {
    add({
      category: 'abiotic',
      name: 'Transplant shock',
      likelihood: q.onset === 'sudden' || q.onset === 'unsure' ? 'LIKELY' : 'POSSIBLE',
      evidenceFor: ['Repotted recently'],
      evidenceAgainst: [],
      checksToConfirm: ['Is new growth still appearing at the tips?'],
    });
  }

  if (has('yellow-lower') && q.onset !== 'sudden' && q.soil !== 'wet' && !changed('fed')) {
    add({
      category: 'abiotic',
      name: 'Running low on nutrients',
      likelihood: ctx.container ? 'POSSIBLE' : 'UNLIKELY',
      evidenceFor: [
        'Older leaves yellowing first',
        ctx.container ? 'Container soil runs out of nutrients' : null,
      ].filter((x): x is string => x !== null),
      evidenceAgainst: changed('fed') ? ['Fed recently'] : [],
      checksToConfirm: ['When was it last fed or given fresh compost?'],
    });
  }
  if (has('yellow-new')) {
    add({
      category: 'abiotic',
      name: 'Nutrients not taken up (often soil pH or wet roots)',
      likelihood: 'POSSIBLE',
      evidenceFor: ['Youngest leaves are yellow'],
      evidenceAgainst: [],
      checksToConfirm: ['Are the leaf veins still green while the rest is yellow?'],
    });
  }
  if (has('stunted') && ctx.container && q.onset !== 'sudden') {
    add({
      category: 'abiotic',
      name: 'Root-bound in its pot',
      likelihood: 'POSSIBLE',
      evidenceFor: ['Slow growth in a container'],
      evidenceAgainst: [],
      checksToConfirm: ['Are roots circling the pot or coming out of the drainage holes?'],
    });
  }

  // ---------------------------------------------------------------- pests

  if (has('sticky-or-webbing') || (changed('pests-seen') && !has('holes'))) {
    add({
      category: 'pest',
      name: 'Sap-sucking insects or mites (for example aphids, mealybugs, spider mites)',
      likelihood: has('sticky-or-webbing') ? 'LIKELY' : 'POSSIBLE',
      evidenceFor: [
        has('sticky-or-webbing') ? 'Sticky leaves or fine webbing' : null,
        changed('pests-seen') ? 'Insects seen' : null,
      ].filter((x): x is string => x !== null),
      evidenceAgainst: [],
      checksToConfirm: [
        'Look under the leaves with a magnifier.',
        'Ladybird larvae and hoverfly larvae look odd but eat aphids — leave them.',
      ],
    });
  }
  if (has('holes')) {
    add({
      category: 'pest',
      name: 'Chewing insects, snails or slugs',
      likelihood: 'POSSIBLE',
      evidenceFor: ['Holes in the leaves'],
      evidenceAgainst: [],
      checksToConfirm: ['Check at dusk and under the pot rim for snails, slugs or caterpillars.'],
    });
  }

  // ---------------------------------------------------------------- diseases (candidates only)

  if (has('white-powder')) {
    add({
      category: 'disease',
      name: 'Powdery mildew (fungal)',
      likelihood: 'POSSIBLE',
      evidenceFor: ['White powdery coating on leaves'],
      evidenceAgainst: [],
      checksToConfirm: ['Does the coating rub off with a finger?'],
    });
  }
  if (has('brown-spots') && (q.spread === 'spreading-fast' || q.spread === 'several-plants')) {
    add({
      category: 'disease',
      name: 'Leaf-spot disease (fungal or bacterial)',
      likelihood: 'POSSIBLE',
      evidenceFor: ['Spots spreading'],
      evidenceAgainst: [],
      checksToConfirm: ['Do the spots have a yellow halo or a darker ring?'],
    });
  }
  if (has('mushy-stem')) {
    add({
      category: 'disease',
      name: 'Root or stem rot',
      likelihood: q.soil === 'wet' ? 'POSSIBLE' : 'UNLIKELY',
      evidenceFor: ['Soft, dark stem base'],
      evidenceAgainst: q.soil === 'dry' ? ['Soil is dry'] : [],
      checksToConfirm: ['Does the stem base smell sour or feel hollow?'],
    });
  }

  const candidates = out.sort((a, b) => RANK[a.likelihood] - RANK[b.likelihood]).slice(0, 6);
  const names = new Set(candidates.map((c) => c.name));

  const steps: string[] = [];
  if (names.has('Too much water (roots short of air)'))
    steps.push('Stop watering until the top 2 cm is dry; make sure the pot drains and empty any saucer.');
  if (names.has('Too little water')) steps.push('Water slowly until it drains, then check daily at 2 cm.');
  if (names.has('Sun scorch') || names.has('Heat stress'))
    steps.push('Give afternoon shade for the next hot days; do not cut scorched leaves yet.');
  if (names.has('Cold damage')) steps.push('Move the pot to a sheltered spot on cold nights.');
  if (candidates.some((c) => c.category === 'pest'))
    steps.push('Wipe or rinse pests off with water and check again in 3 days.');
  if (candidates.some((c) => c.category === 'disease'))
    steps.push('Remove the worst-affected leaves, keep foliage dry and space plants for air.');
  if (steps.length === 0 && candidates.length > 0)
    steps.push('Change one thing at a time and watch for a week.');

  const spreading = q.spread === 'spreading-fast' || q.spread === 'several-plants';
  const escalateNeeded = (spreading && candidates.some((c) => c.category !== 'abiotic')) || has('mushy-stem');

  return {
    imageUsable: true,
    plantPresent: true,
    identityGuess: null,
    candidates,
    immediateSafeSteps: steps.slice(0, 5),
    escalate: {
      needed: escalateNeeded,
      reason: escalateNeeded
        ? 'It is spreading or affects the stem base; a local expert can look at it in person.'
        : 'Not needed now; ask an expert if it gets worse.',
    },
    followUpDays: [3, 7],
    abstainReason: candidates.length === 0 ? 'No signs were selected, so there is nothing to compare.' : null,
  };
}

/** Garden-local dates for follow-up checks. */
export function followUpDates(openedOn: string, days: readonly number[]): string[] {
  const [y, m, d] = openedOn.split('-').map(Number);
  return [...new Set(days)]
    .filter((n) => n >= 1 && n <= 30)
    .sort((a, b) => a - b)
    .map((n) => {
      const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n));
      return t.toISOString().slice(0, 10);
    });
}
