---
"@stash/extension": patch
---

Fix MCP self-connect blocker: allow runtime ports whose sender id equals the extension's own `browser.runtime.id` (popup/options pages), while still rejecting foreign ids spoofing a `chrome-extension://` URL.
