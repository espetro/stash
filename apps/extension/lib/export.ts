export interface TabItem {
  url: string;
  title: string;
}

/**
 * Export tabs as a JSON string with items array.
 */
export function exportToJSON(tabs: TabItem[]): string {
  return JSON.stringify({ items: tabs }, null, 2);
}

/**
 * Export tabs as a Markdown list with [title](url) format.
 */
export function exportToMarkdown(tabs: TabItem[]): string {
  return tabs
    .map(({ url, title }) => {
      const escaped = title.replace(/\]/g, "\\]").replace(/\[/g, "\\[");
      return `[${escaped}](${url})`;
    })
    .join("\n");
}
