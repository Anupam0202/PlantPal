import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface EmptyStateProps {
  illustration?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** One illustration, one explanation, one primary action. */
export function EmptyState({ illustration, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      {illustration && <div className="mb-1 text-accent-ink">{illustration}</div>}
      <h2 className="text-h3 text-balance text-ink">{title}</h2>
      {description && <p className="max-w-[48ch] text-body-s text-muted text-pretty">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

const noticeTone: Record<NoticeTone, string> = {
  info: 'bg-info-soft text-info',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  success: 'bg-accent-soft text-accent-ink',
};

export interface NoticeProps {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Use "alert" only for errors that need immediate attention. */
  role?: 'status' | 'alert';
}

export function Notice({ tone = 'info', title, children, action, className, role = 'status' }: NoticeProps) {
  const Icon = tone === 'danger' ? CircleAlert : tone === 'warning' ? TriangleAlert : Info;
  return (
    <div role={role} className={cn('flex gap-3 rounded-lg p-3.5', noticeTone[tone], className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-body-s">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-ink/90">{children}</div>}
        {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

export interface ErrorStateProps {
  title?: ReactNode;
  message: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  secondaryAction?: ReactNode;
}

/** Error with a clear recovery path. Drafts are never discarded by showing this. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  secondaryAction,
}: ErrorStateProps) {
  return (
    <Notice
      tone="danger"
      role="alert"
      title={title}
      action={
        <>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-9 items-center rounded-full bg-danger px-3.5 text-body-s font-medium text-on-accent hover:brightness-95"
            >
              {retryLabel}
            </button>
          )}
          {secondaryAction}
        </>
      }
    >
      {message}
    </Notice>
  );
}
