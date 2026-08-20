import type Browser from "webextension-polyfill";

/** Minimal structural port type shared by the MCP transport wrappers. */
export interface RuntimePort {
  name: string;
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: {
    addListener(callback: (message: unknown) => void): void;
    removeListener(callback: (message: unknown) => void): void;
  };
  onDisconnect: {
    addListener(callback: () => void): void;
    removeListener(callback: () => void): void;
  };
}

declare global {
  const browser: typeof Browser;
  /** chrome.runtime.Port-compatible runtime port (webextension-polyfill typed). */
  type ChromeRuntimePort = Browser.Runtime.Port;
}

declare global {
  namespace browser {
    export * from "webextension-polyfill";
  }
}

export {};
