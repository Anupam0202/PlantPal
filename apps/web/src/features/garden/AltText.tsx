import type { AltTextInput } from '@plantpal/ai';
import type { AltText as AltTextResult, Media } from '@plantpal/schemas';
import { Badge, Button, Card, TextField } from '@plantpal/ui';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AiButton, AiFlow } from '../../ai/AiButton';
import { useAiT } from '../../ai/messages';
import { useAiAction } from '../../ai/useAiAction';
import { db } from '../../data/db';
import { setMediaAlt } from '../../data/commands';
import { imageForAi } from '../../data/media';
import { useT } from '../../i18n';
import { usePrefs } from '../../state/prefs';
import { reportError } from './errors';

/**
 * Alt text editor for one stored photo (F12). The person writes it, or asks AI for a draft, edits it
 * and saves; an AI draft is never saved on its own.
 */
export function AltTextEditor({
  media,
  plantName,
  onDone,
}: {
  media: Media;
  plantName?: string | null;
  onDone: () => void;
}) {
  const t = useT();
  const at = useAiT();
  const locale = usePrefs((s) => s.locale);
  const units = usePrefs((s) => s.units);
  const [text, setText] = useState(media.alt);
  const [image, setImage] = useState<AltTextInput['image'] | null>(null);
  const [fromAi, setFromAi] = useState(false);

  // Prepare the small copy only when this editor is open.
  useEffect(() => {
    let live = true;
    void db.mediaBlobs
      .get(media.id)
      .then((b) => (b ? imageForAi(b.full) : null))
      .then((img) => {
        if (live && img) setImage(img);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [media.id]);

  const ai = useAiAction<AltTextInput, AltTextResult>(
    'alt-text',
    () =>
      image
        ? { policy: { locale, units, seasonModel: 'not relevant' }, image, plantName: plantName ?? null }
        : null,
    {
      onResult: (r) => {
        setText(r.altText);
        setFromAi(true);
      },
    },
  );

  const save = async () => {
    try {
      await setMediaAlt(media.id, text);
      toast.success(at.alt.saved);
      onDone();
    } catch (e) {
      reportError(t, e);
    }
  };

  return (
    <Card className="flex flex-col gap-3" data-testid="alt-editor">
      <TextField
        label={at.alt.label}
        description={at.alt.hint}
        value={text}
        onValueChange={(v) => {
          setText(v);
          setFromAi(false);
        }}
        multiline
        rows={2}
        maxLength={200}
      />
      {fromAi && <Badge className="self-start">{at.suggestedByAi}</Badge>}
      {ai.result && !ai.result.plantVisible && <p className="text-caption text-muted">{at.alt.noPlant}</p>}
      {image && (
        <div>
          <AiButton ai={ai} label={at.alt.suggest} />
        </div>
      )}
      <AiFlow ai={ai} fallback={at.alt.fallback} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void save()}>
          {at.alt.save}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {at.cancel}
        </Button>
      </div>
    </Card>
  );
}
