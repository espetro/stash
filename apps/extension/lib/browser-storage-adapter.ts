import type { StorageAdapter } from "@stash/theme";

let cachedTheme: string | null = null;

export class BrowserStorageAdapter implements StorageAdapter {
  constructor() {
    browser.storage.sync
      .get("theme")
      .then((result: { theme?: string }) => {
        if (result.theme) {
          cachedTheme = result.theme;
        }
      })
      .catch(() => {});
  }

  getItem(key: string): string | null {
    if (key === "theme") {
      return cachedTheme;
    }
    return null;
  }

  setItem(key: string, value: string): void {
    if (key === "theme") {
      cachedTheme = value;
    }

    browser.storage.sync.set({ [key]: value }).catch(() => {});
  }
}

export const browserStorageAdapter = new BrowserStorageAdapter();
