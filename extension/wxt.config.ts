import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'TabShare',
    description: 'Share selected tabs with snapshot links',
    version: '0.1.0',
    permissions: ['contextMenus', 'tabs', 'clipboardWrite', 'notifications'],
    icons: {
      16: '/icon-16.png',
      48: '/icon-48.png',
      128: '/icon-128.png'
    }
  }
});
