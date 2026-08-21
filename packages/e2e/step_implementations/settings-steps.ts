import { step } from "../lib/step-registry";
import { expect } from "@playwright/test";
import type { BrowserContext, Page } from "playwright";
import { getActiveState } from "../lib/scenario-state";
import { getExtensionId } from "../helpers/browser-helper";
import { setCurrentPage } from "./common-steps";
import { decodeShareUrl } from "../helpers/decoder-helper";

let optionsPage: Page | null = null;
let popupPage: Page | null = null;

function requireExtensionContext(): BrowserContext {
  const ctx = getActiveState().extensionContext;
  if (!ctx) {
    throw new Error("No extension context. Settings steps need an extension scenario.");
  }
  return ctx;
}

step("The user clicks the settings button", async () => {
  const context = requireExtensionContext();

  const pages = context.pages();
  const extensionId = await getExtensionId(context);
  popupPage =
    pages.find((p) => p.url().includes(`chrome-extension://${extensionId}/popup.html`)) || null;

  if (!popupPage) {
    popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.waitForLoadState("networkidle");
  }

  const settingsButton = popupPage
    .locator('button[aria-label*="settings" i], button:has-text("⚙️")')
    .first();

  if ((await settingsButton.count()) === 0) {
    throw new Error("Settings button not found in popup");
  }

  await settingsButton.click();
});

step("A new tab should open with the settings page", async () => {
  const context = requireExtensionContext();

  await popupPage!.waitForTimeout(500);

  const pages = context.pages();

  const extensionId = await getExtensionId(context);
  const optionsUrl = `chrome-extension://${extensionId}/options.html`;

  optionsPage = pages.find((page) => page.url().includes("options.html")) || null;

  if (!optionsPage) {
    throw new Error("Options page not found after clicking settings button");
  }

  await optionsPage.waitForLoadState("networkidle");
  void optionsUrl;
});

step("The user navigates to the options page", async () => {
  const context = requireExtensionContext();

  const extensionId = await getExtensionId(context);

  if (optionsPage && !optionsPage.isClosed()) {
    await optionsPage.close();
  }

  optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
  await optionsPage.waitForLoadState("networkidle");
});

step('The user selects the "<option>" expiry option', async (option) => {
  if (!optionsPage) {
    throw new Error("Options page is not initialized. Navigate to options page first.");
  }

  const expirySelect = optionsPage
    .locator('select[name*="expiry" i], #expiry-select, .expiry-select')
    .first();

  if ((await expirySelect.count()) === 0) {
    const expiryOption = optionsPage.locator(`label:has-text("${option}")`).first();

    if ((await expiryOption.count()) === 0) {
      throw new Error(`Expiry option "${option}" not found`);
    }

    await expiryOption.click();
  } else {
    await expirySelect.selectOption(option);
  }

  await optionsPage.waitForTimeout(100);
});

step("The expiry setting should be saved to localStorage", async () => {
  if (!optionsPage) {
    throw new Error("Options page is not initialized");
  }

  const result = await optionsPage.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (globalThis as any).chrome;
    const stored = await c.storage.sync.get("stash-settings");
    return stored["stash-settings"];
  });

  if (!result) {
    throw new Error("Expiry setting not saved to chrome.storage.sync");
  }

  try {
    const settings = JSON.parse(result);
    if (!settings.expiryMode) {
      throw new Error("Expiry mode not found in settings");
    }
  } catch (error) {
    throw new Error("Invalid settings JSON format");
  }
});

step("The user selects the <theme> theme", async (theme) => {
  if (!optionsPage) {
    throw new Error("Options page is not initialized. Navigate to options page first.");
  }

  const themeRadio = optionsPage
    .locator(
      `input[type="radio"][name*="theme" i][value="${theme}"], input[value="${theme}"][data-theme]`,
    )
    .first();

  if ((await themeRadio.count()) === 0) {
    const themeLabel = optionsPage.locator(`label:has-text("${theme}")`).first();

    if ((await themeLabel.count()) === 0) {
      throw new Error(`Theme option "${theme}" not found`);
    }

    await themeLabel.click();
  } else {
    await themeRadio.check();
  }

  await optionsPage.waitForTimeout(100);
});

step("The theme setting should be saved to localStorage", async () => {
  if (!optionsPage) {
    throw new Error("Options page is not initialized");
  }

  const result = await optionsPage.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (globalThis as any).chrome;
    const stored = await c.storage.sync.get("theme");
    return stored["theme"];
  });

  if (!result) {
    throw new Error("Theme setting not saved to chrome.storage.sync");
  }
});

step("The user navigates back to a content page", async () => {
  const context = requireExtensionContext();

  if (optionsPage && !optionsPage.isClosed()) {
    await optionsPage.close();
  }

  if (popupPage && !popupPage.isClosed()) {
    await popupPage.close();
    popupPage = null;
  }

  const contentPage = await context.newPage();
  await contentPage.goto("https://example.com", { waitUntil: "networkidle" });
  setCurrentPage(contentPage);
});

step("The user clicks Create Link from popup", async () => {
  const context = requireExtensionContext();

  if (!popupPage || popupPage.isClosed()) {
    const extensionId = await getExtensionId(context);
    const pages = context.pages();
    popupPage =
      pages.find((p) => p.url().includes(`chrome-extension://${extensionId}/popup.html`)) || null;
    if (!popupPage) {
      popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
      await popupPage.waitForLoadState("networkidle");
    }
  }

  await popupPage.locator('input[type="checkbox"]').first().check();

  const button = popupPage.locator('button:has-text("Create Link")');
  await button.click();

  await popupPage.waitForTimeout(1000);

  const linkResult = popupPage.locator("input[readonly], .link-url");
  const linkValue = await linkResult.inputValue().catch(() => linkResult.textContent());

  if (!linkValue) {
    throw new Error("Link was not generated");
  }

  getActiveState().shareLink = linkValue;
  getActiveState().clipboard = linkValue;
});

step("A share link should be generated from the popup", async () => {
  if (!getActiveState().shareLink) {
    throw new Error("Share link was not generated");
  }
});

step("The link expiry should be approximately <hours> hours from now", async (hoursStr) => {
  const hours = parseInt(hoursStr, 10);
  const shareLink = getActiveState().shareLink;

  if (!shareLink) {
    throw new Error("No share link available");
  }

  const decodedPayload = await decodeShareUrl(shareLink);

  const now = Math.floor(Date.now() / 1000);
  const expectedExpiry = now + hours * 3600;
  const tolerance = 60;

  const difference = Math.abs(decodedPayload.expiry - expectedExpiry);

  if (difference > tolerance) {
    throw new Error(`Expiry timestamp is not approximately ${hours} hours from now`);
  }
});

step("The link expiry should be greater than <hours> hours from now", async (hoursStr) => {
  const hours = parseInt(hoursStr, 10);
  const shareLink = getActiveState().shareLink;

  if (!shareLink) {
    throw new Error("No share link available");
  }

  const decodedPayload = await decodeShareUrl(shareLink);

  const now = Math.floor(Date.now() / 1000);
  const minimumExpiry = now + hours * 3600;

  if (decodedPayload.expiry < minimumExpiry) {
    throw new Error(
      `Expiry timestamp (${decodedPayload.expiry}) is not greater than ${hours} hours from now (${minimumExpiry})`,
    );
  }
});
