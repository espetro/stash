# End-to-End Integration

This specification tests complete user journeys from sharing tabs to viewing them in the browser.

## Happy path - Share single tab and view in browser
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user right-clicks on the tab
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated and copied to clipboard
* The user navigates to the share link
* The viewer page should display 1 tab item
* The tab item should display the correct title "GitHub"
* The tab item should display the correct domain "github.com"
* A favicon should be displayed

## Happy path - Share 5 tabs, view, and copy URLs
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* A new tab is opened with URL "https://stackoverflow.com"
* A new tab is opened with URL "https://developer.mozilla.org"
* A new tab is opened with URL "https://www.reddit.com/r/webdev"
* A new tab is opened with URL "https://css-tricks.com"
* The user selects all 5 tabs
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated and copied to clipboard
* The user navigates to the share link
* The viewer page should display 5 tab items
* each tab item should display the correct title and domain
* The user clicks on the "Copy URLs" button
* all 5 URLs should be copied to clipboard
* A notification should be displayed

## Link expiry validation (24 hours)
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated and copied to clipboard
* The user navigates to the share link immediately
* The viewer page should display the tab item
* The user mocks the time to 25 hours in the future
* The user refreshes the page
* An error message should be displayed indicating the link has expired

## Round-trip encoding preserves data (special chars)
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://example.com/path?query=value&other=123#section"
* The tab title is "URL with special chars & # ?"
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated and copied to clipboard
* The user navigates to the share link
* The viewer page should display the tab item
* The URL should be "https://example.com/path?query=value&other=123#section"
* The title should be "URL with special chars & # ?"

## Round-trip encoding preserves data (Unicode)
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://example.com/日本語/テスト"
* The tab title is "日本語のページ - Unicode Test"
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated and copied to clipboard
* The user navigates to the share link
* The viewer page should display the tab item
* The URL should be "https://example.com/日本語/テスト"
* The title should be "日本語のページ - Unicode Test"

## Large tab set triggers truncation (150 tabs)
* The browser is launched with the Stash extension loaded
* 150 new tabs are opened with various URLs
* The user selects all 150 tabs
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated and copied to clipboard
* The total URL length should be less than or equal to 8000 characters
* The user navigates to the share link
* The viewer page should display the maximum number of tabs that fit within the budget
* The number of displayed tabs should be less than 150

## Empty selection shows error
* The browser is launched with the Stash extension loaded
* no tabs are selected
* The user tries to click on "Share selected tabs…" menu item
* An error notification should be displayed
* The error message should indicate that no tabs are selected
* no share link should be generated

## Share and open all tabs
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* A new tab is opened with URL "https://stackoverflow.com"
* A new tab is opened with URL "https://developer.mozilla.org"
* The user selects all 3 tabs
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated and copied to clipboard
* The user navigates to the share link
* The viewer page should display 3 tab items
* The user clicks on the "Open All Tabs" button
* 3 new tabs should be opened in the browser
* each new tab should have the correct URL

## Share chrome:// pages are filtered out
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "chrome://extensions"
* A new tab is opened with URL "chrome://settings"
* A new tab is opened with URL "https://github.com"
* The user selects all 3 tabs
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated and copied to clipboard
* The user navigates to the share link
* The viewer page should display 1 tab item
* The tab item should be for "https://github.com"

## Long title truncation in round-trip
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://example.com/long-url-path"
* The tab title is "This is a very long title that exceeds the thirty character limit and should be truncated"
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated and copied to clipboard
* The user navigates to the share link
* The viewer page should display the tab item
* The displayed title should be 30 characters or less

## Share link is accessible from different browser
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated and copied to clipboard
* A new browser session is opened
* The user navigates to the share link in the new session
* The viewer page should display the tab item
* The tab item should display the correct title and domain

## Multiple users can view the same shared link
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user clicks on "Share selected tabs…" menu item
* A share link should be generated and copied to clipboard
* user A navigates to the share link
* user A should see the tab item
* user B navigates to the same share link
* user B should see the same tab item
