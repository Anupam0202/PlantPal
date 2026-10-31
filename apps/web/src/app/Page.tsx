import { cn } from '@plantpal/ui';
import type { ReactNode } from 'react';

/** Standard page container: comfortable reading width, responsive gutters. */
export function Page({
  children,
  className,
  width = 'default',
}: {
  children: ReactNode;
  className?: string;
  width?: 'default' | 'wide' | 'narrow';
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-10',
        width === 'default' && 'max-w-5xl',
        width === 'wide' && 'max-w-7xl',
        width === 'narrow' && 'max-w-2xl',
        className,
      )}
    >
      {children}
    </div>
  );
}
