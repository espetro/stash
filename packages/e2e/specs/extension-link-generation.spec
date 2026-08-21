# Extension Link Generation

These scenarios exercise the codec pipeline directly (the same one
the extension's "Share selected tabs…" menu invokes). We test the
URL/clipboard/encoding behavior end-to-end through the helper layer
rather than driving the extension GUI under headless Chromium, which
keeps the suite fast and the assertion surface stable. The extension
itself is covered by its own unit tests in `apps/extension/__tests__/`.

## Generate link for single tab
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user selects the open tab
* A share link should be generated
* The share link should contain encoded data
* The decoded payload should have 1 item
* The link should be marked as valid base64url

## Generate link for multiple tabs
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* A new tab is opened with URL "https://stackoverflow.com"
* A new tab is opened with URL "https://developer.mozilla.org"
* A new tab is opened with URL "https://www.reddit.com/r/webdev"
* A new tab is opened with URL "https://css-tricks.com"
* The user selects all 5 tabs
* A share link should be generated
* The decoded payload should have 5 items

## Long title truncation
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://example.com/long-url-path"
* The tab title is "This is a very long title that exceeds the thirty character limit and should be truncated"
* The user selects the open tab
* A share link should be generated
* The decoded payload should have 1 item
* The decoded title should be 120 characters or less

## URL budget truncation with 5 tabs (in-process)
* An encoder run with 5 stubbed long-URL tabs finishes under 8 seconds
* The encoded URL is at most 8000 characters

## URL budget truncation with 100 tabs (codec unit)
* The codec roundtrip for 100 long-URL tabs stays under the budget

## Filter tabs without URLs (chrome:// pages)
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "chrome://extensions"
* A new tab is opened with URL "chrome://settings"
* A new tab is opened with URL "https://github.com"
* The user selects all 3 tabs
* A share link should be generated
* The decoded payload should have 1 item
* The decoded item URL should be "https://github.com"

## Preserve special characters in URLs and titles
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://example.com/path?query=value&other=123#section"
* The tab title is "URL with special chars & # ?"
* The user selects the open tab
* A share link should be generated
* The decoded URL should preserve special characters
* The decoded title should preserve special characters

## Preserve Unicode in URLs and titles
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://example.com/日本語/テスト"
* The tab title is "日本語のページ - Unicode Test"
* The user selects the open tab
* A share link should be generated
* The decoded URL should preserve Unicode characters
* The decoded title should preserve Unicode characters

## Valid base64url encoding
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user selects the open tab
* A share link should be generated
* The encoded fragment should match base64url pattern

## Link contains correct fragment marker
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user selects the open tab
* A share link should be generated
* The share link should contain the fragment parameter "p="
