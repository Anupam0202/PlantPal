import { Card, EmptyState, Notice, Spinner } from '@plantpal/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { CommunityProfile, Notice as ModNotice } from '../../community/api';
import { useT } from '../../i18n';
import { clockNow } from '../../lib/clock';
import { SignInPanel } from '../account/SignInPanel';
import { COMMUNITY_KEY, useCommunity } from './hooks';
import { useCommunityT } from './messages';
import { ProfileForm } from './ProfileForm';
import { ModerationNotices } from './Safety';

export interface Member {
  profile: CommunityProfile;
  staff: 'moderator' | 'admin' | null;
  notices: ModNotice[];
}

/**
 * Shows the community only when it is switched on, the person is signed in and has a profile; otherwise
 * explains what is missing. No placeholder activity is ever shown.
 */
export function CommunityGate({ children }: { children: (m: Member) => ReactNode }) {
  const t = useT();
  const c = useCommunityT();
  const qc = useQueryClient();
  const state = useCommunity();
  const [now] = useState(clockNow);

  switch (state.kind) {
    case 'loading':
      return (
        <div className="mt-8 flex justify-center">
          <Spinner />
        </div>
      );
    case 'off':
      return (
        <EmptyState
          className="mt-8"
          illustration={<Users className="size-16" strokeWidth={1.25} aria-hidden="true" />}
          title={t.community.disabledTitle}
          description={t.community.disabledBody}
        />
      );
    case 'offline':
      return (
        <Notice tone="warning" className="mt-6">
          {c.offline}
        </Notice>
      );
    case 'unavailable':
      return <Notice className="mt-6">{c.unavailable}</Notice>;
    case 'signed-out':
      return (
        <Card className="mt-6 flex flex-col gap-4">
          <div>
            <h2 className="text-h3 text-ink">{c.signInTitle}</h2>
            <p className="mt-1 text-body-s text-muted">{c.signInBody}</p>
          </div>
          <SignInPanel onDone={() => void qc.invalidateQueries({ queryKey: COMMUNITY_KEY })} />
        </Card>
      );
    case 'ready':
      if (!state.profile)
        return (
          <div className="mt-6">
            <ProfileForm profile={null} />
          </div>
        );
      return (
        <>
          <ModerationNotices notices={state.notices} now={now} />
          {children({ profile: state.profile, staff: state.staff, notices: state.notices })}
        </>
      );
  }
}
