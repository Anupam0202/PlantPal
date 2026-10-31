import { createFileRoute, Link } from '@tanstack/react-router';
import { Card, PageHeader, Section, SegmentedControl, SelectField, SwitchField } from '@plantpal/ui';
import { ChevronRight, CloudSun, Database, Monitor, Moon, Sparkles, Sun, UserRound } from 'lucide-react';
import { Page } from '../../app/Page';
import { useAccountT } from '../../features/account/messages';
import { localeNames, useT } from '../../i18n';
import { usePrefs, type LocalePref, type ThemePref, type UnitsPref } from '../../state/prefs';

export const Route = createFileRoute('/settings/')({
  component: SettingsPage,
});

function SettingsPage() {
  const t = useT();
  const at = useAccountT();
  const prefs = usePrefs();
  return (
    <Page width="narrow">
      <PageHeader title={t.settings.title} />
      <div className="mt-6 flex flex-col gap-6">
        <Section title={t.settings.appearance}>
          <Card className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-body-s font-medium text-ink" id="theme-label">
                {t.settings.theme}
              </span>
              <SegmentedControl<ThemePref>
                label={t.settings.theme}
                value={prefs.theme}
                onValueChange={(theme) => prefs.set({ theme })}
                options={[
                  {
                    value: 'system',
                    label: t.settings.themeSystem,
                    icon: <Monitor className="size-4" aria-hidden="true" />,
                  },
                  {
                    value: 'light',
                    label: t.settings.themeLight,
                    icon: <Sun className="size-4" aria-hidden="true" />,
                  },
                  {
                    value: 'dark',
                    label: t.settings.themeDark,
                    icon: <Moon className="size-4" aria-hidden="true" />,
                  },
                ]}
              />
            </div>
            <SwitchField
              label={t.settings.contrastMore}
              checked={prefs.contrast === 'more'}
              onCheckedChange={(on) => prefs.set({ contrast: on ? 'more' : 'system' })}
            />
            <SwitchField
              label={t.settings.reduceMotion}
              checked={prefs.motion === 'reduce'}
              onCheckedChange={(on) => prefs.set({ motion: on ? 'reduce' : 'system' })}
            />
            <SwitchField
              label={t.settings.lowData}
              description={t.settings.lowDataHint}
              checked={prefs.lowData}
              onCheckedChange={(lowData) => prefs.set({ lowData })}
            />
          </Card>
        </Section>
        <Section title={`${t.settings.language} · ${t.settings.units}`}>
          <Card className="flex flex-col gap-4">
            <SelectField<LocalePref>
              label={t.settings.language}
              value={prefs.locale}
              onValueChange={(locale) => prefs.set({ locale })}
              options={(Object.keys(localeNames) as LocalePref[]).map((l) => ({
                value: l,
                label: localeNames[l],
              }))}
              description="Hindi and Spanish are draft translations awaiting review by native speakers."
            />
            <div className="flex flex-col gap-2">
              <span className="text-body-s font-medium text-ink">{t.settings.units}</span>
              <SegmentedControl<UnitsPref>
                label={t.settings.units}
                value={prefs.units}
                onValueChange={(units) => prefs.set({ units })}
                options={[
                  { value: 'metric', label: t.settings.metric },
                  { value: 'imperial', label: t.settings.imperial },
                ]}
              />
            </div>
          </Card>
        </Section>
        <Section title={t.settings.data}>
          <div className="flex flex-col gap-2">
            {(
              [
                ['/settings/account', at.account.title, 'account'],
                ['/settings/ai', t.settings.ai, 'ai'],
                ['/settings/data', t.settings.dataLink, 'data'],
                ['/settings/sources', t.env.sources.title, 'sources'],
              ] as const
            ).map(([to, label, icon]) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 shadow-1 transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus"
              >
                {icon === 'account' ? (
                  <UserRound className="size-5 text-accent-ink" aria-hidden="true" />
                ) : icon === 'ai' ? (
                  <Sparkles className="size-5 text-accent-ink" aria-hidden="true" />
                ) : icon === 'data' ? (
                  <Database className="size-5 text-accent-ink" aria-hidden="true" />
                ) : (
                  <CloudSun className="size-5 text-accent-ink" aria-hidden="true" />
                )}
                <span className="flex-1 font-medium text-ink">{label}</span>
                <ChevronRight className="size-5 text-muted" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </Section>
      </div>
    </Page>
  );
}
