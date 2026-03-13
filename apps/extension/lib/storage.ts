// WXT storage definitions for the extension
// See: https://wxt.dev/storage#defining-storage-items

import { storage } from '@wxt-dev/storage'
import type { ExpiryMode, Settings } from './settings'
import { DEFAULT_SETTINGS } from './settings'

/**
 * WXT storage item for settings with sync prefix for cross-device synchronization.
 * Key format: 'sync:stash-settings' (WXT's storage areas are: local, sync, or managed)
 */
export const settingsItem = storage.defineItem<Settings>('sync:stash-settings', {
  fallback: DEFAULT_SETTINGS,
})

// Re-export types for convenience
export type { ExpiryMode, Settings }
