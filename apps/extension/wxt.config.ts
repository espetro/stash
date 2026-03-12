import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: 'Stash',
    description: 'Stash lets you save open tabs as a shareable snapshot link. No accounts. No servers. No tracking.',
    version: '0.1.0',
    permissions: ['contextMenus', 'tabs', 'clipboardWrite', 'notifications'],
    action: { default_popup: "popup/index.html" },
    icons: {
      16: 'icon-16.png',
      48: 'icon-48.png',
      128: 'icon-128.png'
    },
    browser_specific_settings: {
      gecko: {
        id: 'stash@stash-extension',
        strict_min_version: '109.0'
      }
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
    }
  }
});
