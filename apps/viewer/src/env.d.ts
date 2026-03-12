interface ImportMetaEnv {
  readonly SITE: string;
  readonly VITE_VIEWER_ORIGIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
