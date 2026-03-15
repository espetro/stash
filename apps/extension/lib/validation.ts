import { z } from "zod";

export const viewerOriginSchema = z
  .string()
  .url({ message: "Please enter a valid URL (e.g. https://viewer.example.com)" })
  .refine((url) => url.startsWith("http://") || url.startsWith("https://"), {
    message: "URL must start with http:// or https://",
  });

export const expiryModeSchema = z.enum(["24h", "7d", "30d", "never"]);

export function validateViewerOrigin(value: string): { success: boolean; error?: string } {
  const result = viewerOriginSchema.safeParse(value);
  if (result.success) {
    return { success: true };
  }
  return { success: false, error: result.error.issues[0]?.message ?? "Invalid URL" };
}

export function validateExpiryMode(value: string): { success: boolean; error?: string } {
  const result = expiryModeSchema.safeParse(value);
  if (result.success) {
    return { success: true };
  }
  return { success: false, error: "Invalid expiry mode" };
}
