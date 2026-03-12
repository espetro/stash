# Extension Link Generation

This specification tests the share link generation and encoding functionality of the TabShare browser extension.

## Scenario: Generate link for single tab
Given the browser is launched with the TabShare extension loaded
And a new tab is opened with URL "https://github.com"
When the user clicks on "Share selected tabs…" menu item
Then a share link should be generated
And the link should be copied to clipboard
And the clipboard content should start with "http://localhost:4321/s/#p="
And the clipboard content should contain valid base64url encoding

## Scenario: Generate link for multiple tabs
Given the browser is launched with the TabShare extension loaded
And a new tab is opened with URL "https://github.com"
And a new tab is opened with URL "https://stackoverflow.com"
And a new tab is opened with URL "https://developer.mozilla.org"
And a new tab is opened with URL "https://www.reddit.com/r/webdev"
And a new tab is opened with URL "https://css-tricks.com"
When the user selects all 5 tabs
And the user clicks on "Share selected tabs…" menu item
Then a share link should be generated
And the link should be copied to clipboard
And the clipboard content should contain encoded data for 5 tabs

## Scenario: Long title truncation
Given the browser is launched with the TabShare extension loaded
And a new tab is opened with URL "https://example.com/long-url-path"
And the tab title is "This is a very long title that exceeds the thirty character limit and should be truncated"
When the user clicks on "Share selected tabs…" menu item
Then a share link should be generated
And the clipboard content should contain encoded data
And the decoded title should be truncated to 30 characters or less

## Scenario: URL budget truncation with 100 tabs
Given the browser is launched with the TabShare extension loaded
And 100 new tabs are opened with various URLs
When the user clicks on "Share selected tabs…" menu item
Then a share link should be generated
And the link should be copied to clipboard
And the total URL length should be less than or equal to 8000 characters
And the link should contain the maximum number of tabs that fit within the budget

## Scenario: Filter tabs without URLs (chrome:// pages)
Given the browser is launched with the TabShare extension loaded
And a new tab is opened with URL "chrome://extensions"
And a new tab is opened with URL "chrome://settings"
And a new tab is opened with URL "https://github.com"
When the user selects all 3 tabs
And the user clicks on "Share selected tabs…" menu item
Then a share link should be generated
And the clipboard content should contain encoded data for 1 tab only
And chrome:// pages should be excluded from the share link

## Scenario: Preserve special characters in URLs and titles
Given the browser is launched with the TabShare extension loaded
And a new tab is opened with URL "https://example.com/path?query=value&other=123#section"
And the tab title is "URL with special chars & # ?"
When the user clicks on "Share selected tabs…" menu item
Then a share link should be generated
And the clipboard content should contain valid base64url encoding
And the decoded URL should preserve special characters
And the decoded title should preserve special characters

## Scenario: Preserve Unicode in URLs and titles
Given the browser is launched with the TabShare extension loaded
And a new tab is opened with URL "https://example.com/日本語/テスト"
And the tab title is "日本語のページ - Unicode Test"
When the user clicks on "Share selected tabs…" menu item
Then a share link should be generated
And the clipboard content should contain valid base64url encoding
And the decoded URL should preserve Unicode characters
And the decoded title should preserve Unicode characters

## Scenario: Valid base64url encoding in clipboard
Given the browser is launched with the TabShare extension loaded
And a new tab is opened with URL "https://github.com"
When the user clicks on "Share selected tabs…" menu item
Then the clipboard content should be a valid URL
And the clipboard content should contain only base64url characters (A-Z, a-z, 0-9, -, _)
And the clipboard content should not contain padding characters (=)

## Scenario: Empty selection shows error
Given the browser is launched with the TabShare extension loaded
And no tabs are selected
When the user tries to access the share functionality
Then an error notification should be displayed
And the error message should indicate that no tabs are selected

## Scenario: Link contains correct viewer URL
Given the browser is launched with the TabShare extension loaded
And a new tab is opened with URL "https://github.com"
When the user clicks on "Share selected tabs…" menu item
Then the clipboard content should start with "http://localhost:4321/s/#p="
And the clipboard content should contain the fragment parameter "p="

## Scenario: Payload contains correct version
Given the browser is launched with the TabShare extension loaded
And a new tab is opened with URL "https://github.com"
When the user clicks on "Share selected tabs…" menu item
Then the clipboard content should contain encoded data
And the decoded payload should have version "v": 1

## Scenario: Payload contains future expiry
Given the browser is launched with the TabShare extension loaded
And a new tab is opened with URL "https://github.com"
When the user clicks on "Share selected tabs…" menu item
Then the clipboard content should contain encoded data
And the decoded payload should have an expiry timestamp in the future
And the expiry should be approximately 24 hours from now
