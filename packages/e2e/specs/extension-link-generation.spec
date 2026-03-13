# Extension Link Generation

This specification tests the share link generation and encoding functionality of the Stash browser extension.

## Generate link for single tab
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated
* The link should be copied to clipboard
* The clipboard content should start with "http://localhost:4321/s/#p="
* The clipboard content should contain valid base64url encoding

## Generate link for multiple tabs
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* A new tab is opened with URL "https://stackoverflow.com"
* A new tab is opened with URL "https://developer.mozilla.org"
* A new tab is opened with URL "https://www.reddit.com/r/webdev"
* A new tab is opened with URL "https://css-tricks.com"
* The user selects all 5 tabs
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated
* The link should be copied to clipboard
* The clipboard content should contain encoded data for 5 tabs

## Long title truncation
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://example.com/long-url-path"
* The tab title is "This is a very long title that exceeds the thirty character limit and should be truncated"
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated
* The clipboard content should contain encoded data
* The decoded title should be truncated to 30 characters or less

## URL budget truncation with 100 tabs
* The browser is launched with the Stash extension loaded
* 100 new tabs are opened with various URLs
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated
* The link should be copied to clipboard
* The total URL length should be less than or equal to 8000 characters
* The link should contain the maximum number of tabs that fit within the budget

## Filter tabs without URLs (chrome:// pages)
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "chrome://extensions"
* A new tab is opened with URL "chrome://settings"
* A new tab is opened with URL "https://github.com"
* The user selects all 3 tabs
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated
* The clipboard content should contain encoded data for 1 tab only
* chrome:// pages should be excluded from the share link

## Preserve special characters in URLs and titles
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://example.com/path?query=value&other=123#section"
* The tab title is "URL with special chars & # ?"
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated
* The clipboard content should contain valid base64url encoding
* The decoded URL should preserve special characters
* The decoded title should preserve special characters

## Preserve Unicode in URLs and titles
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://example.com/日本語/テスト"
* The tab title is "日本語のページ - Unicode Test"
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated
* The clipboard content should contain valid base64url encoding
* The decoded URL should preserve Unicode characters
* The decoded title should preserve Unicode characters

## Valid base64url encoding in clipboard
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user clicks on "Share selected tabs…" menu item
* The clipboard content should be a valid URL
* The clipboard content should contain only base64url characters (A-Z, a-z, 0-9, -, _)
* The clipboard content should not contain padding characters (=)

## Empty selection shows error
* The browser is launched with the Stash extension loaded
* no tabs are selected
* The user tries to access the share functionality
* An error notification should be displayed
* The error message should indicate that no tabs are selected

## Link contains correct viewer URL
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user clicks on "Share selected tabs…" menu item
* The clipboard content should start with "http://localhost:4321/s/#p="
* The clipboard content should contain the fragment parameter "p="

## Payload contains correct version
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user clicks on "Share selected tabs…" menu item
* The clipboard content should contain encoded data
* The decoded payload should have version "v": 1

## Payload contains future expiry
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user clicks on "Share selected tabs…" menu item
* The clipboard content should contain encoded data
* The decoded payload should have an expiry timestamp in the future
* The expiry should be approximately 24 hours from now
