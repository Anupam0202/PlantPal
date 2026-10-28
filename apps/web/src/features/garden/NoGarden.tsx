import { Link } from '@tanstack/react-router';
import { buttonClasses, EmptyState, SeedlingIllustration, Skeleton } from '@plantpal/ui';
import { useT } from '../../i18n';

export function NoGarden() {
  const t = useT();
  return (
    <EmptyState
      className="mt-8"
      illustration={<SeedlingIllustration />}
      title={t.garden.noGardenTitle}
      description={t.garden.noGardenBody}
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/garden/new" className={buttonClasses('primary', 'lg')}>
            {t.garden.createGarden}
          </Link>
          <Link to="/settings/data" className={buttonClasses('secondary', 'lg')}>
            {t.garden.importData}
          </Link>
        </div>
      }
    />
  );
}

export function GardenLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-11 w-full" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Skeleton className="aspect-[4/3]" />
        <Skeleton className="aspect-[4/3]" />
        <Skeleton className="aspect-[4/3]" />
      </div>
    </div>
  );
}
