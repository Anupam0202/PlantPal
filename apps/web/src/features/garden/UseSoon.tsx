import { dueSoon, todayIn } from '@plantpal/domain';
import type { Garden } from '@plantpal/schemas';
import { Notice } from '@plantpal/ui';
import { Link } from '@tanstack/react-router';
import { usePantry } from '../../data/queries';
import { useT } from '../../i18n';

/** Pantry items whose use-by date (set by the person) is within two days. */
export function UseSoon({ garden }: { garden: Garden }) {
  const t = useT();
  const pantry = usePantry(garden.id);
  const soon = pantry ? dueSoon(pantry, todayIn(garden.timezone)) : [];
  if (soon.length === 0) return null;
  return (
    <Notice
      tone="warning"
      title={t.today.useSoon}
      action={
        <Link to="/garden/harvest" className="text-body-s font-medium underline">
          {t.today.openPantry}
        </Link>
      }
    >
      {t.today.useSoonBody(soon.length)} {soon.map((s) => s.name).join(', ')}
    </Notice>
  );
}
