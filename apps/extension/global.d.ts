import Browser from "webextension-polyfill";

declare global {
  const browser: typeof Browser;
  namespace browser {
    export * from "webextension-polyfill";
  }
}

export {};
