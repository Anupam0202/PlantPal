import { Bird, LayoutGrid, Sprout, Sun, Users, type LucideIcon } from 'lucide-react';
import type { Messages } from '../i18n/en';

export interface Destination {
  key: keyof Pick<Messages['nav'], 'today' | 'garden' | 'plan' | 'nature' | 'community'>;
  to: '/today' | '/garden' | '/plan' | '/nature' | '/community';
  icon: LucideIcon;
}

/** Five destinations replace the legacy 17 equal tabs (master prompt §5.1). */
export const destinations: Destination[] = [
  { key: 'today', to: '/today', icon: Sun },
  { key: 'garden', to: '/garden', icon: Sprout },
  { key: 'plan', to: '/plan', icon: LayoutGrid },
  { key: 'nature', to: '/nature', icon: Bird },
  { key: 'community', to: '/community', icon: Users },
];
