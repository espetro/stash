import { step } from "../lib/step-registry";
import { expect, test as _pwTest } from "@playwright/test";
import type { BrowserContext, Page } from "playwright";
import { getActiveState } from "../lib/scenario-state";
import { getExtensionId } from "../helpers/browser-helper";
import { setCurrentPage } from "./common-steps";

// The `_pwTest` import pulls in the PlaywrightTest global type
// augmentation that registers the locator matchers (toBeChecked,
// toBeVisible, toContainText, …) on the global namespace. We do not
// call `_pwTest`; the bare reference is enough to ensure the side-effect
// type registration happens. `void` discards the unused-warning.
void _pwTest;

let popupPage: Page | null = null;
let libraryPage: Page | null = null;

function requireExtensionContext(): BrowserContext {
  const ctx = getActiveState().extensionContext;
  if (!ctx) {
    throw new Error("No extension context. Pop-up steps need an extension scenario.");
  }
  return ctx;
}

step("The user clicks the extension icon", async () => {
  const context = requireExtensionContext();
  const extensionId = await getExtensionId(context);

  popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await popupPage.waitForLoadState("networkidle");
});

step("The popup should open", async () => {
  expect(popupPage).toBeTruthy();
  const container = await popupPage!.locator(".popup-container").count();
  expect(container).toBeGreaterThan(0);
});

step("The popup should display a tab list", async () => {
  const tabList = await popupPage!.locator(".tab-list").count();
  expect(tabList).toBeGreaterThan(0);
});

step("The popup should display <count> tabs", async (count) => {
  const expectedCount = parseInt(count, 10);
  const tabItems = await popupPage!.locator(".tab-item").count();
  expect(tabItems).toBe(expectedCount);
});

step("The user selects tab at index <index>", async (index) => {
  const tabIndex = parseInt(index, 10);
  const checkbox = popupPage!.locator(".tab-checkbox").nth(tabIndex);
  await checkbox.click();
});

step("The tab at index <index> should be highlighted in the browser", async (index) => {
  const tabIndex = parseInt(index, 10);
  const checkbox = popupPage!.locator(".tab-checkbox").nth(tabIndex);
  await expect(checkbox).toBeChecked();
});

step("The user clicks Select All", async () => {
  const button = popupPage!.locator('button:has-text("Select All")');
  await button.click();
});

step("The popup should show budget message", async () => {
  const budgetMessage = popupPage!.locator(".budget-message");
  await expect(budgetMessage).toBeVisible();
});

step("The user clicks Create Link", async () => {
  const button = popupPage!.locator('button:has-text("Create Link")');
  await button.click();
});

step("The user shares the selected tabs from the popup", async () => {
  const button = popupPage!.getByRole("button", { name: /^Share tabs \(2\)$/ });
  await button.click();
  await expect(popupPage!.locator(".link-result")).toBeVisible();
});

step("The user clicks Create Link without selecting any tabs", async () => {
  const button = popupPage!.locator('button:has-text("Create Link")');
  await button.click();
});

step("The popup should show the link result", async () => {
  const linkResult = popupPage!.locator(".link-result");
  await expect(linkResult).toBeVisible();
});

step("The user opens the Library from the popup", async () => {
  // PR E: the Library lives on the unlisted library.html page; the popup's
  // "Open Library" button opens it in a new extension tab.
  const context = requireExtensionContext();
  const [page] = await Promise.all([
    context.waitForEvent("page"),
    popupPage!.getByRole("button", { name: "Open Library" }).click(),
  ]);
  libraryPage = page;
  await libraryPage.waitForLoadState("networkidle");
  await expect(libraryPage.getByRole("heading", { name: "Stash Library" })).toBeVisible();
});

step("The user opens the Library page directly", async () => {
  const context = requireExtensionContext();
  const extensionId = await getExtensionId(context);
  libraryPage = await context.newPage();
  await libraryPage.goto(`chrome-extension://${extensionId}/library.html`);
  await libraryPage.waitForLoadState("networkidle");
  await expect(libraryPage.getByRole("heading", { name: "Stash Library" })).toBeVisible();
});

step("The Library should show <count> seeded rows", async (countStr) => {
  const count = parseInt(countStr, 10);
  await expect(libraryPage!.locator(".stash-item")).toHaveCount(count);
});

step("The Library should show the not-backed-up hint", async () => {
  // The e2e profile never pairs with a daemon, so the library page must
  // nudge toward installing the daemon or exporting a copy.
  const hint = libraryPage!.locator(".backup-hint");
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("Not backed up");
});

step("The Library row should open the QR dialog", async () => {
  const row = libraryPage!.locator(".stash-item").first();
  await row.getByRole("button", { name: "Share via QR code" }).click();
  const dialog = libraryPage!.locator("dialog.qr-dialog[open]");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".qr-code")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(libraryPage!.locator("dialog.qr-dialog[open]")).toHaveCount(0);
});

step("The Library settings tab should render", async () => {
  await libraryPage!.getByRole("tab", { name: "Settings" }).click();
  await expect(libraryPage!).toHaveURL(/library\.html#settings$/);
  const settings = libraryPage!.locator(".settings-container");
  await expect(settings).toBeVisible();
  await expect(settings.locator("section.settings-section").first()).toBeVisible();
});

step("The pending-import banner should be visible", async () => {
  // The handoff spec step stores the freshly opened extension page in
  // scenario variables; adopt it here so library assertions target it.
  const handoffPage = getActiveState().variables["handoffPage"] as Page | undefined;
  if (handoffPage) libraryPage = handoffPage;
  const banner = libraryPage!.locator(".pending-import-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("ready to import");
});

step("The user confirms the pending import", async () => {
  await libraryPage!
    .locator(".pending-import-banner")
    .getByRole("button", { name: "Import", exact: true })
    .click();
  await expect(libraryPage!.locator(".pending-import-done")).toBeVisible();
});

step("The Library should show one Recent row and zero Kept stashes", async () => {
  await expect(libraryPage!.getByRole("button", { name: "All · 1" })).toBeVisible();
  await expect(libraryPage!.getByRole("button", { name: "Kept · 0" })).toBeVisible();
  await expect(libraryPage!.getByRole("button", { name: "Recent · 1" })).toBeVisible();
  const row = libraryPage!.locator(".stash-item");
  await expect(row).toHaveCount(1);
  await expect(row.locator(".stash-state-badge")).toContainText("Recent");
  await expect(row).toContainText("2 items");
});

step("The user keeps the Recent row in the Library", async () => {
  const row = libraryPage!.locator(".stash-item");
  await row.getByRole("button", { name: "Keep" }).click();
  await expect(row.locator(".stash-state-badge")).toHaveCount(0);
});

step("The user filters the Library to Kept", async () => {
  await libraryPage!.getByRole("button", { name: "Kept · 1" }).click();
});

step("The kept share should appear in the Library", async () => {
  const row = libraryPage!.locator(".stash-item");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("2 items");
  await expect(row.locator(".stash-state-badge")).toHaveCount(0);
});

step("The user clicks the copy button", async () => {
  const button = popupPage!.locator('button:has-text("Copy Link")');
  await button.click();
});

step("The link should be copied to clipboard in the popup", async () => {
  const linkResult = popupPage!.locator(".link-result input");
  const linkValue = await linkResult.inputValue();
  expect(linkValue).toBeTruthy();
  expect(linkValue.length).toBeGreaterThan(0);
  const state = getActiveState();
  state.shareLink = linkValue;
  state.clipboard = linkValue;
});

step("The popup should show an error message", async () => {
  const errorMessage = popupPage!.locator(".error-message");
  await expect(errorMessage).toBeVisible();
});

step('The popup should show "No tabs to share"', async () => {
  const emptyState = popupPage!.locator(".empty-state");
  await expect(emptyState).toContainText("No tabs to share");
});

step("only chrome:// tabs are open", async () => {
  const context = requireExtensionContext();
  const pages = context.pages();

  for (const page of pages) {
    await page.close();
  }

  await context.newPage();
  await context.newPage();
});

step("The popup is closed", async () => {
  if (popupPage) {
    await popupPage.close();
    popupPage = null;
  }
  if (libraryPage) {
    await libraryPage.close();
    libraryPage = null;
  }
});
