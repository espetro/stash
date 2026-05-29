const GOOGLE_FAVICON_URL = "https://www.google.com/s2/favicons?domain=";

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function getFaviconUrl(url: string): string {
  const domain = getDomain(url);
  return `${GOOGLE_FAVICON_URL}${domain}&sz=32`;
}
