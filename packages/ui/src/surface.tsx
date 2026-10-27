import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** "plate" uses the signature leaf corner for specimen-like content. */
  variant?: 'default' | 'plate' | 'sunken' | 'outline';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  as?: 'div' | 'section' | 'article' | 'li';
}

const pad = { none: '', sm: 'p-3', md: 'p-4 sm:p-5', lg: 'p-5 sm:p-7' } as const;

export function Card({
  variant = 'default',
  padding = 'md',
  as: Tag = 'div',
  className,
  ...rest
}: CardProps) {
  const Comp = Tag as 'div';
  return (
    <Comp
      className={cn(
        variant === 'default' && 'rounded-lg border border-line bg-surface shadow-1',
        variant === 'plate' && 'grain rounded-leaf border border-line bg-surface shadow-2',
        variant === 'sunken' && 'rounded-lg bg-sunken',
        variant === 'outline' && 'rounded-lg border border-line-strong',
        pad[padding],
        className,
      )}
      {...rest}
    />
  );
}

export interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-caption font-semibold tracking-wide text-accent-ink uppercase">{eyebrow}</p>
        )}
        <h1 className="text-h1 text-balance text-ink">{title}</h1>
        {description && <p className="mt-2 max-w-[65ch] text-body-s text-muted text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  headingLevel?: 2 | 3;
}

export function Section({
  title,
  description,
  action,
  headingLevel = 2,
  className,
  children,
  ...rest
}: SectionProps) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className={cn('flex flex-col gap-3', className)} {...rest}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <H className={cn(headingLevel === 2 ? 'text-h3' : 'text-body font-semibold font-sans', 'text-ink')}>
            {title}
          </H>
          {description && <p className="text-body-s text-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong bg-sunken px-1 font-mono text-[0.75rem] text-muted">
      {children}
    </kbd>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-0 border-t border-line', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('skeleton rounded-md', className)} />;
}
