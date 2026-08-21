import { step } from "../lib/step-registry";
import { getActiveState } from "../lib/scenario-state";
import type { Page } from "playwright";

/**
 * Set the current page on the active scenario state.
 */
export function setCurrentPage(page: Page): void {
  getActiveState().currentPage = page;
}

/**
 * Get the current page from the active scenario state.
 */
export function getCurrentPage(): Page {
  const page = getActiveState().currentPage;
  if (!page) {
    throw new Error("No current page. Initialize a page first.");
  }
  return page;
}

step("Wait for element <selector> to be visible", async (selector) => {
  const page = getCurrentPage();
  await page.waitForSelector(selector, { state: "visible", timeout: 10000 });
});

step("Wait for element <selector> to be attached", async (selector) => {
  const page = getCurrentPage();
  await page.waitForSelector(selector, { state: "attached", timeout: 10000 });
});

step("Element <selector> should contain text <text>", async (selector, text) => {
  const page = getCurrentPage();
  const element = await page.waitForSelector(selector, { state: "visible" });
  const elementText = await element.textContent();
  if (!elementText || !elementText.includes(text)) {
    throw new Error(
      `Expected element "${selector}" to contain "${text}", but got "${elementText}"`,
    );
  }
});

step("Element <selector> should have text <text>", async (selector, text) => {
  const page = getCurrentPage();
  const element = await page.waitForSelector(selector, { state: "visible" });
  const elementText = await element.textContent();
  if (elementText !== text) {
    throw new Error(
      `Expected element "${selector}" to have text "${text}", but got "${elementText}"`,
    );
  }
});

step("Count of elements <selector> should be <count>", async (selector, countStr) => {
  const page = getCurrentPage();
  const count = parseInt(countStr, 10);
  const elements = await page.locator(selector).count();
  if (elements !== count) {
    throw new Error(`Expected ${count} elements matching "${selector}", but found ${elements}`);
  }
});

step("Element <selector> should be visible", async (selector) => {
  const page = getCurrentPage();
  const element = await page.waitForSelector(selector, { state: "visible" });
  if (!element) {
    throw new Error(`Element "${selector}" is not visible`);
  }
});

step("Element <selector> should not be visible", async (selector) => {
  const page = getCurrentPage();
  const elements = await page.locator(selector).count();
  if (elements > 0) {
    const isVisible = await page.locator(selector).isVisible();
    if (isVisible) {
      throw new Error(`Element "${selector}" should not be visible`);
    }
  }
});

step("Wait for <duration> milliseconds", async (durationStr) => {
  const duration = parseInt(durationStr, 10);
  await new Promise((resolve) => setTimeout(resolve, duration));
});

step("Wait for <duration> seconds", async (durationStr) => {
  const duration = parseFloat(durationStr);
  await new Promise((resolve) => setTimeout(resolve, duration * 1000));
});

step("Navigate to <url>", async (url) => {
  const page = getCurrentPage();
  await page.goto(url, { waitUntil: "networkidle" });
});

step("Click on element <selector>", async (selector) => {
  const page = getCurrentPage();
  await page.click(selector);
});

step("Type <text> into element <selector>", async (text, selector) => {
  const page = getCurrentPage();
  await page.fill(selector, text);
});

step(
  "Get text from element <selector> and store as <variableName>",
  async (selector, variableName) => {
    const page = getCurrentPage();
    const element = await page.waitForSelector(selector, { state: "visible" });
    const text = await element.textContent();
    getActiveState().variables[variableName] = text;
  },
);

step("Store <value> as <variableName>", async (value, variableName) => {
  getActiveState().variables[variableName] = value;
});

step(
  "Variable <variableName> should equal <expectedValue>",
  async (variableName, expectedValue) => {
    const state = getActiveState();
    const actualValue = state.variables[variableName];
    if (actualValue !== expectedValue) {
      throw new Error(
        `Expected variable "${variableName}" to be "${expectedValue}", but got "${actualValue}"`,
      );
    }
  },
);

step(
  "Variable <variableName> should contain <expectedValue>",
  async (variableName, expectedValue) => {
    const state = getActiveState();
    const actualValue = state.variables[variableName];
    if (!actualValue || !String(actualValue).includes(expectedValue)) {
      throw new Error(
        `Expected variable "${variableName}" to contain "${expectedValue}", but got "${actualValue}"`,
      );
    }
  },
);

step("Take screenshot with name <filename>", async (filename) => {
  const page = getCurrentPage();
  await page.screenshot({ path: `screenshots/${filename}` });
});

step("Refresh the page", async () => {
  const page = getCurrentPage();
  await page.reload({ waitUntil: "networkidle" });
});

step("Go back", async () => {
  const page = getCurrentPage();
  await page.goBack({ waitUntil: "networkidle" });
});

step("Go forward", async () => {
  const page = getCurrentPage();
  await page.goForward({ waitUntil: "networkidle" });
});

step("Page title should be <expectedTitle>", async (expectedTitle) => {
  const page = getCurrentPage();
  const title = await page.title();
  if (title !== expectedTitle) {
    throw new Error(`Expected page title to be "${expectedTitle}", but got "${title}"`);
  }
});

step("Page URL should contain <expectedUrl>", async (expectedUrl) => {
  const page = getCurrentPage();
  const url = page.url();
  if (!url.includes(expectedUrl)) {
    throw new Error(`Expected page URL to contain "${expectedUrl}", but got "${url}"`);
  }
});

step("Execute JavaScript <script>", async (script) => {
  const page = getCurrentPage();
  await page.evaluate(script);
});

step(
  "Get attribute <attribute> from element <selector> and store as <variableName>",
  async (attribute, selector, variableName) => {
    const page = getCurrentPage();
    const element = await page.waitForSelector(selector, { state: "visible" });
    const value = await element.getAttribute(attribute);
    getActiveState().variables[variableName] = value;
  },
);

step(
  "Element <selector> should have attribute <attribute> with value <value>",
  async (selector, attribute, value) => {
    const page = getCurrentPage();
    const element = await page.waitForSelector(selector, { state: "visible" });
    const actualValue = await element.getAttribute(attribute);
    if (actualValue !== value) {
      throw new Error(
        `Expected element "${selector}" to have attribute "${attribute}" with value "${value}", but got "${actualValue}"`,
      );
    }
  },
);

step("Element <selector> should be enabled", async (selector) => {
  const page = getCurrentPage();
  const element = await page.waitForSelector(selector, { state: "visible" });
  const isEnabled = await element.isEnabled();
  if (!isEnabled) {
    throw new Error(`Element "${selector}" should be enabled`);
  }
});

step("Element <selector> should be disabled", async (selector) => {
  const page = getCurrentPage();
  const element = await page.waitForSelector(selector, { state: "visible" });
  const isEnabled = await element.isEnabled();
  if (isEnabled) {
    throw new Error(`Element "${selector}" should be disabled`);
  }
});
