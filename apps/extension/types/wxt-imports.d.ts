/// <reference types="wxt/browser" />

// Declare the #imports alias used by WXT for auto-imports
declare module '#imports' {
  // Storage type with defineItem method
  interface Storage {
    defineItem<T>(
      key: string,
      options: {
        fallback?: T;
        init?: () => T;
        version?: number;
        migrations?: Record<number, (value: T) => T>;
      }
    ): {
      getValue: () => Promise<T>;
      setValue: (value: T) => Promise<void>;
      removeValue: () => Promise<void>;
      watch: (
        callback: (newValue: T, oldValue: T | null) => void
      ) => () => void;
      getMeta: <TMeta>(key: string) => Promise<TMeta>;
      setMeta: (key: string, meta: TMeta) => Promise<void>;
      removeMeta: (key: string, meta?: string | string[]) => Promise<void>;
    };
  }

  const wxt: {
    storage: Storage;
  };
  export default wxt;
  export { wxt };
}
