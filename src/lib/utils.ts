import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and resolves Tailwind conflicts. Use for every component className. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
