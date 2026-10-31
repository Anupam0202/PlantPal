import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { Drawer } from '@base-ui/react/drawer';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from './cn';

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element that opens the dialog (rendered as the trigger). */
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

/** Modal dialog: inert background, focus trap, Escape, focus return (Base UI). */
export function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  size = 'md',
}: DialogProps) {
  return (
    <BaseDialog.Root
      {...(open !== undefined ? { open } : {})}
      {...(defaultOpen !== undefined ? { defaultOpen } : {})}
      {...(onOpenChange ? { onOpenChange: (o: boolean) => onOpenChange(o) } : {})}
    >
      {trigger && <BaseDialog.Trigger render={trigger} />}
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-scrim transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <BaseDialog.Popup
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-xl border border-line bg-raised text-ink shadow-3 outline-none',
            'transition-[scale,opacity] duration-200 ease-[var(--ease-emphasized)] data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0',
            widths[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 p-5 pb-3">
            <div>
              <BaseDialog.Title className="text-h3 text-ink">{title}</BaseDialog.Title>
              {description && (
                <BaseDialog.Description className="mt-1 text-body-s text-muted">
                  {description}
                </BaseDialog.Description>
              )}
            </div>
            <BaseDialog.Close
              aria-label="Close"
              className="-mt-1 -mr-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink"
            >
              <X className="size-5" aria-hidden="true" />
            </BaseDialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto px-5 pb-5">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>
          )}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export interface SheetProps extends Omit<DialogProps, 'size'> {
  /** Bottom sheet on mobile, right drawer on large screens. */
  side?: 'bottom' | 'right';
}

/** Draggable sheet (Base UI Drawer) with snap-back and swipe-to-dismiss. */
export function Sheet({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  side = 'bottom',
}: SheetProps) {
  const bottom = side === 'bottom';
  return (
    <Drawer.Root
      swipeDirection={bottom ? 'down' : 'right'}
      {...(open !== undefined ? { open } : {})}
      {...(defaultOpen !== undefined ? { defaultOpen } : {})}
      {...(onOpenChange ? { onOpenChange: (o: boolean) => onOpenChange(o) } : {})}
    >
      {trigger && <Drawer.Trigger render={trigger} />}
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-scrim opacity-[calc(1-var(--drawer-swipe-progress,0))] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Drawer.Viewport
          className={cn(
            'fixed inset-0 z-50 flex',
            bottom ? 'items-end justify-center' : 'items-stretch justify-end',
          )}
        >
          <Drawer.Popup
            className={cn(
              'flex flex-col border-line bg-raised text-ink shadow-3 outline-none transition-transform duration-300 ease-[var(--ease-emphasized)]',
              bottom
                ? 'safe-bottom max-h-[90dvh] w-full max-w-2xl rounded-t-xl border-t data-ending-style:translate-y-full data-starting-style:translate-y-full'
                : 'h-full w-full max-w-md border-l data-ending-style:translate-x-full data-starting-style:translate-x-full',
            )}
          >
            {bottom && (
              <div aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-strong" />
            )}
            <Drawer.Content className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-2">
                <div>
                  <Drawer.Title className="text-h3 text-ink">{title}</Drawer.Title>
                  {description && (
                    <Drawer.Description className="mt-1 text-body-s text-muted">
                      {description}
                    </Drawer.Description>
                  )}
                </div>
                <Drawer.Close
                  aria-label="Close"
                  className="-mr-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink"
                >
                  <X className="size-5" aria-hidden="true" />
                </Drawer.Close>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
              {footer && (
                <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
                  {footer}
                </div>
              )}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

/** Hover + focus tooltip; never the only place for essential information. */
export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={8} className="z-50">
          <BaseTooltip.Popup className="max-w-64 rounded-md bg-ink px-2.5 py-1.5 text-caption text-bg shadow-2 transition-[opacity,scale] duration-150 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}

export const TooltipProvider = BaseTooltip.Provider;
