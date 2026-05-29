import { EXPIRY_HOURS_MAP } from "@stash/codec";

export interface ExpiryOption {
  label: string;
  value: string;
}

export const EXPIRY_OPTIONS: ExpiryOption[] = [
  { value: "never", label: "Never expires" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

export function extractTitle(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 30);
  }
}

export function validateExpiryValue(value: string): boolean {
  return value in EXPIRY_HOURS_MAP;
}
