/** Pseudo-origin for the in-extension server: the extension's own URL origin
 *  (e.g. `chrome-extension://<id>`). Share URLs use `${origin}/s/${id}`. */
export function extensionOrigin(): string {
  return new URL(browser.runtime.getURL("")).origin;
}
