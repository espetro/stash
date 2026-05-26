/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly SITE: string;
  readonly VITE_VIEWER_ORIGIN: string;
  readonly VITE_PUBLIC_POSTHOG_KEY: string;
  readonly VITE_PUBLIC_POSTHOG_HOST?: string;
}
