import Browser from "webextension-polyfill";

declare global {
  const browser: typeof Browser;
}

declare global {
  namespace browser {
    export * from "webextension-polyfill";
  }
}

export {};
