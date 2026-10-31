import { clsx, type ClassValue } from 'clsx';

/** Join class names; later classes win by order in the stylesheet (we avoid conflicting utilities). */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
