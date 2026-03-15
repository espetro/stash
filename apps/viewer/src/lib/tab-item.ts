function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return `https://www.google.com/s2/favicons?domain=${url}&sz=32`;
  }
}

export function createTabItemElement(url: string, title: string): HTMLAnchorElement {
  const faviconUrl = getFaviconUrl(url);

  const itemEl = document.createElement("a");
  itemEl.className = "tab-item";
  itemEl.href = url;
  itemEl.target = "_blank";
  itemEl.rel = "noopener noreferrer";

  const faviconEl = document.createElement("img");
  faviconEl.className = "tab-favicon";
  faviconEl.src = faviconUrl;
  faviconEl.alt = "";
  faviconEl.onerror = function (this: HTMLImageElement) {
    this.classList.add("error");
  };

  const contentEl = document.createElement("div");
  contentEl.className = "tab-content";

  const titleEl = document.createElement("span");
  titleEl.className = "tab-title";
  titleEl.textContent = title;

  const urlEl = document.createElement("span");
  urlEl.className = "tab-url";
  urlEl.textContent = url;

  contentEl.appendChild(titleEl);
  contentEl.appendChild(urlEl);
  itemEl.appendChild(faviconEl);
  itemEl.appendChild(contentEl);

  return itemEl;
}
