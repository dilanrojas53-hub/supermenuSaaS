import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * YIQ Contrast Algorithm — returns '#000000' or '#ffffff'
 * based on the perceived brightness of a hex color.
 */
export function getContrastColor(hexColor: string | undefined | null): string {
  if (!hexColor) return '#ffffff';
  const hex = hexColor.replace('#', '');
  if (hex.length < 6) return '#ffffff';
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
}

/**
 * Returns a softer contrast color for backgrounds.
 * Light bg → dark gray (#1a1a1a), Dark bg → off-white (#f5f5f5)
 */
export function getContrastColorSoft(hexColor: string | undefined | null): string {
  if (!hexColor) return '#f5f5f5';
  const hex = hexColor.replace('#', '');
  if (hex.length < 6) return '#f5f5f5';
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 128 ? '#1a1a1a' : '#f5f5f5';
}
