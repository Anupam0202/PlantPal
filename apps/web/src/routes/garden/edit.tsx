import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button, Card, Dialog, PageHeader, Section } from '@plantpal/ui';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import { deleteGarden, updateGarden } from '../../data/commands';
import { useActiveGarden } from '../../data/queries';
import { GardenForm } from '../../features/garden/GardenForm';
import { reportError } from '../../features/garden/errors';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { useT } from '../../i18n';

export const Route = createFileRoute('/garden/edit')({
  component: EditGarden,
});

function EditGarden() {
  const t = useT();
  const navigate = useNavigate();
  const { garden } = useActiveGarden();
  const [confirm, setConfirm] = useState(false);

  if (garden === undefined)
    return (
      <Page width="narrow">
        <GardenLoading />
      </Page>
    );
  if (garden === null)
    return (
      <Page width="narrow">
        <NoGarden />
      </Page>
    );

  return (
    <Page width="narrow">
      <PageHeader title={t.garden.settings} eyebrow={garden.name} />
      <Card className="mt-6" padding="lg">
        <GardenForm
          key={garden.id + garden.version}
          initial={garden}
          submitLabel={t.common.save}
          onCancel={() => void navigate({ to: '/garden' })}
          onSubmit={async (input) => {
            try {
              await updateGarden(garden.id, garden.version, input);
              toast.success(t.garden.saved);
              await navigate({ to: '/garden' });
            } catch (e) {
              reportError(t, e);
            }
          }}
        />
      </Card>
      <Section title={t.garden.deleteGarden} className="mt-10" headingLevel={2}>
        <Button variant="danger-soft" onClick={() => setConfirm(true)}>
          {t.garden.deleteGarden}
        </Button>
      </Section>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t.garden.deleteTitle}
        description={t.garden.deleteBody}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                void deleteGarden(garden.id, garden.version)
                  .then(() => {
                    toast.success(t.garden.deleted);
                    return navigate({ to: '/garden' });
                  })
                  .catch((e: unknown) => reportError(t, e))
              }
            >
              {t.common.delete}
            </Button>
          </>
        }
      />
    </Page>
  );
}
