import { createFileRoute, Link } from '@tanstack/react-router';
import { buttonClasses, SeedlingIllustration } from '@plantpal/ui';
import { useT } from '../i18n';

export const Route = createFileRoute('/welcome')({
  component: Welcome,
});

function Welcome() {
  const t = useT();
  return (
    <div className="grain mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-8 px-6 py-12">
      <div className="text-accent-ink">
        <SeedlingIllustration size={140} />
      </div>
      <div className="flex flex-col gap-4">
        <h1 className="text-display-l text-balance text-ink">{t.welcome.title}</h1>
        <p className="text-body text-muted text-pretty">{t.tagline}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link to="/today" className={buttonClasses('primary', 'lg')}>
          {t.welcome.start}
        </Link>
      </div>
    </div>
  );
}
