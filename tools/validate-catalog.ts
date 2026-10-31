// Fails the build when a catalogue pack has an assertion without a unit, evidence grade or known
// source, or toxicity that does not come from a cited source (§17.4, S10).
import { SEED_PACK, validateCatalog } from '@plantpal/catalog';

const packs = [SEED_PACK];
let failed = false;
for (const pack of packs) {
  const issues = validateCatalog(pack);
  const assertions = pack.taxa.reduce(
    (n, t) => n + t.traits.length + t.regions.length + t.toxicity.length,
    0,
  );
  const pending = pack.taxa.reduce(
    (n, t) =>
      n +
      t.traits.filter((a) => a.review === 'needs_review').length +
      t.regions.filter((a) => a.review === 'needs_review').length +
      t.toxicity.filter((a) => a.review === 'needs_review').length,
    0,
  );
  if (issues.length > 0) {
    failed = true;
    console.error(`✗ ${pack.id}@${pack.version}: ${issues.length} problem(s)`);
    for (const i of issues) console.error(`  ${i.taxonId ?? '(pack)'} ${i.path}: ${i.message}`);
  } else {
    console.log(
      `✓ ${pack.id}@${pack.version}: ${pack.taxa.length} taxa, ${assertions} assertions (${pending} awaiting curator review)`,
    );
  }
}
process.exit(failed ? 1 : 0);
