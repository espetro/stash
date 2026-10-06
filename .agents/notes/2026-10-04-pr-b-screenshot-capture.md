# PR B screenshot capture

The shared Chrome CDP browser may have an unpacked extension from another worktree. Compare the popup entry script URL with the current worktree's `.output/chrome-mv3/popup.html`; differing hashed bundle names indicate a stale build. For reliable captures, load the current output in an isolated Chrome profile instead of changing the shared browser.

When seeding extension settings for a capture, write a complete `stash-settings` object. `StorageItem` uses `DEFAULT_SETTINGS` only when the key is absent; it does not merge missing fields into an existing partial value.
