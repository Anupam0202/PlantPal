import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { Card, PageHeader } from '@plantpal/ui';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import { createGarden } from '../../data/commands';
import { GardenForm } from '../../features/garden/GardenForm';
import { reportError } from '../../features/garden/errors';
import { useT } from '../../i18n';

export const Route = createFileRoute('/garden/new')({
  component: NewGarden,
});

function NewGarden() {
  const t = useT();
  const navigate = useNavigate();
  const router = useRouter();
  return (
    <Page width="narrow">
      <PageHeader title={t.garden.newGarden} description={t.garden.noGardenBody} />
      <Card className="mt-6" padding="lg">
        <GardenForm
          submitLabel={t.garden.createGarden}
          onCancel={() => router.history.back()}
          onSubmit={async (input) => {
            try {
              await createGarden(input);
              toast.success(t.garden.created);
              await navigate({ to: '/garden' });
            } catch (e) {
              reportError(t, e);
            }
          }}
        />
      </Card>
    </Page>
  );
}
