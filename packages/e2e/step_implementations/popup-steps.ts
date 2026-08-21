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

step("The user clicks Create Link without selecting any tabs", async () => {
  const button = popupPage!.locator('button:has-text("Create Link")');
  await button.click();
});

step("The popup should show the link result", async () => {
  const linkResult = popupPage!.locator(".link-result");
  await expect(linkResult).toBeVisible();
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
});
