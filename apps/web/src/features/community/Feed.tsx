import { Badge, Button, Card, EmptyState, Spinner, TextField } from '@plantpal/ui';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { MessagesSquare } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { community, type Post } from '../../community/api';
import { useFormat } from '../../i18n';
import type { Member } from './CommunityGate';
import { problemText } from './hooks';
import { useCommunityT } from './messages';
import { BlockButton, ReportButton } from './Safety';

const PAGE = 30;
export const FEED_KEY = ['community-content', 'feed'] as const;

export function Feed({ me }: { me: Member }) {
  const c = useCommunityT();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const feed = useInfiniteQuery({
    queryKey: FEED_KEY,
    queryFn: ({ pageParam }) => community.feed(pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.posts.length === PAGE ? last.posts.at(-1)?.createdAt : undefined),
  });
  const posts = feed.data?.pages.flatMap((p) => p.posts) ?? [];

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await community.post(body.trim());
      setBody('');
      toast.success(c.feed.posted);
      await qc.invalidateQueries({ queryKey: FEED_KEY });
    } catch (e) {
      toast.error(problemText(e, c.failed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <TextField
          label={c.feed.composer}
          placeholder={c.feed.placeholder}
          value={body}
          onValueChange={setBody}
          maxLength={2000}
          multiline
          rows={3}
        />
        <div>
          <Button loading={busy} disabled={!body.trim()} onClick={() => void send()}>
            {c.feed.post}
          </Button>
        </div>
      </Card>
      {feed.isPending ? (
        <Spinner />
      ) : posts.length === 0 ? (
        <EmptyState
          illustration={<MessagesSquare className="size-14" strokeWidth={1.25} aria-hidden="true" />}
          title={c.feed.empty}
          description={c.feed.emptyBody}
        />
      ) : (
        <ul className="flex flex-col gap-3" aria-label={c.tabs.feed}>
          {posts.map((p) => (
            <PostCard key={p.id} post={p} mine={p.authorId === me.profile.userId} />
          ))}
        </ul>
      )}
      {feed.hasNextPage && (
        <div>
          <Button
            variant="secondary"
            loading={feed.isFetchingNextPage}
            onClick={() => void feed.fetchNextPage()}
          >
            {c.feed.more}
          </Button>
        </div>
      )}
    </div>
  );
}

function PostCard({ post: p, mine }: { post: Post; mine: boolean }) {
  const c = useCommunityT();
  const fmt = useFormat();
  return (
    <li>
      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium text-ink">{p.authorName}</span>
          <time className="text-caption text-muted" dateTime={new Date(p.createdAt).toISOString()}>
            {fmt.date(new Date(p.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
          </time>
        </div>
        {p.visibility === 'hidden' && (
          <Badge tone="warning" className="self-start">
            {c.hidden}
          </Badge>
        )}
        <p className="text-body whitespace-pre-line text-ink [overflow-wrap:anywhere]">{p.body}</p>
        {!mine && (
          <div className="-ml-2 flex flex-wrap gap-1">
            <ReportButton type="post" id={p.id} />
            <BlockButton userId={p.authorId} name={p.authorName} />
          </div>
        )}
      </Card>
    </li>
  );
}
