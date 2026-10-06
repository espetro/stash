/** Store listing URLs (single source of truth for install links). */
export const INSTALL_FIREFOX_URL =
  "https://addons.mozilla.org/en-US/firefox/addon/stash-snapshot-tabs/";

export const INSTALL_CHROME_URL =
  import.meta.env.VITE_CHROME_DOWNLOAD_URL ??
  `https://chromewebstore.google.com/detail/stash/npkcdanhacbmbinabhogbngifebkfpeo`;
