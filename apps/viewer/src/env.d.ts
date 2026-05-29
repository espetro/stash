/// <reference types="astro/client" />

interface ImportMetaEnv {
  // * Used to connect to Posthog Analytics
  readonly VITE_PUBLIC_POSTHOG_KEY: string;
  readonly VITE_PUBLIC_POSTHOG_HOST?: string;
  // * Used to link to project sites
  readonly VITE_VIEWER_ORIGIN: string;
  readonly VITE_CHROME_DOWNLOAD_URL: string;
  readonly VITE_FIREFOX_DOWNLOAD_URL: string;
}
