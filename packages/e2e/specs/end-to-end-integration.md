# End-to-End Integration

This specification tests complete user journeys from sharing tabs to viewing them in the browser.

## Scenario: Happy path - Share single tab and view in browser
Given the browser is launched with the Stash extension loaded
And a new tab is opened with URL "https://github.com"
When the user right-clicks on the tab
And the user clicks on "Share selected tabs…" menu item
Then a share link should be generated and copied to clipboard
When the user navigates to the share link
Then the viewer page should display 1 tab item
And the tab item should display the correct title "GitHub"
And the tab item should display the correct domain "github.com"
And a favicon should be displayed

## Scenario: Happy path - Share 5 tabs, view, and copy URLs
Given the browser is launched with the Stash extension loaded
And a new tab is opened with URL "https://github.com"
And a new tab is opened with URL "https://stackoverflow.com"
And a new tab is opened with URL "https://developer.mozilla.org"
And a new tab is opened with URL "https://www.reddit.com/r/webdev"
And a new tab is opened with URL "https://css-tricks.com"
When the user selects all 5 tabs
And the user clicks on "Share selected tabs…" menu item
Then a share link should be generated and copied to clipboard
When the user navigates to the share link
Then the viewer page should display 5 tab items
And each tab item should display the correct title and domain
When the user clicks on the "Copy URLs" button
Then all 5 URLs should be copied to clipboard
And a notification should be displayed

## Scenario: Link expiry validation (24 hours)
Given the browser is launched with the Stash extension loaded
And a new tab is opened with URL "https://github.com"
When the user clicks on "Share selected tabs…" menu item
Then a share link should be generated and copied to clipboard
When the user navigates to the share link immediately
Then the viewer page should display the tab item
When the user mocks the time to 25 hours in the future
And the user refreshes the page
Then an error message should be displayed indicating the link has expired

## Scenario: Round-trip encoding preserves data (special chars)
Given the browser is launched with the Stash extension loaded
And a new tab is opened with URL "https://example.com/path?query=value&other=123#section"
And the tab title is "URL with special chars & # ?"
When the user clicks on "Share selected tabs…" menu item
Then a share link should be generated and copied to clipboard
When the user navigates to the share link
Then the viewer page should display the tab item
And the URL should be "https://example.com/path?query=value&other=123#section"
And the title should be "URL with special chars & # ?"

## Scenario: Round-trip encoding preserves data (Unicode)
Given the browser is launched with the Stash extension loaded
And a new tab is opened with URL "https://example.com/日本語/テスト"
And the tab title is "日本語のページ - Unicode Test"
When the user clicks on "Share selected tabs…" menu item
Then a share link should be generated and copied to clipboard
When the user navigates to the share link
Then the viewer page should display the tab item
And the URL should be "https://example.com/日本語/テスト"
And the title should be "日本語のページ - Unicode Test"

## Scenario: Large tab set triggers truncation (150 tabs)
Given the browser is launched with the Stash extension loaded
And 150 new tabs are opened with various URLs
When the user selects all 150 tabs
And the user clicks on "Share selected tabs…" menu item
Then a share link should be generated and copied to clipboard
And the total URL length should be less than or equal to 8000 characters
When the user navigates to the share link
Then the viewer page should display the maximum number of tabs that fit within the budget
And the number of displayed tabs should be less than 150

## Scenario: Empty selection shows error
Given the browser is launched with the Stash extension loaded
And no tabs are selected
When the user tries to click on "Share selected tabs…" menu item
Then an error notification should be displayed
And the error message should indicate that no tabs are selected
And no share link should be generated

## Scenario: Share and open all tabs
Given the browser is launched with the Stash extension loaded
And a new tab is opened with URL "https://github.com"
And a new tab is opened with URL "https://stackoverflow.com"
And a new tab is opened with URL "https://developer.mozilla.org"
When the user selects all 3 tabs
And the user clicks on "Share selected tabs…" menu item
Then a share link should be generated and copied to clipboard
When the user navigates to the share link
Then the viewer page should display 3 tab items
When the user clicks on the "Open All Tabs" button
Then 3 new tabs should be opened in the browser
And each new tab should have the correct URL

## Scenario: Share chrome:// pages are filtered out
Given the browser is launched with the Stash extension loaded
And a new tab is opened with URL "chrome://extensions"
And a new tab is opened with URL "chrome://settings"
And a new tab is opened with URL "https://github.com"
When the user selects all 3 tabs
And the user clicks on "Share selected tabs…" menu item
Then a share link should be generated and copied to clipboard
When the user navigates to the share link
Then the viewer page should display 1 tab item
And the tab item should be for "https://github.com"

## Scenario: Long title truncation in round-trip
Given the browser is launched with the Stash extension loaded
And a new tab is opened with URL "https://example.com/long-url-path"
And the tab title is "This is a very long title that exceeds the thirty character limit and should be truncated"
When the user clicks on "Share selected tabs…" menu item
Then a share link should be generated and copied to clipboard
When the user navigates to the share link
Then the viewer page should display the tab item
And the displayed title should be 30 characters or less

## Scenario: Share link is accessible from different browser
Given the browser is launched with the Stash extension loaded
And a new tab is opened with URL "https://github.com"
When the user clicks on "Share selected tabs…" menu item
Then a share link should be generated and copied to clipboard
When a new browser session is opened
And the user navigates to the share link in the new session
Then the viewer page should display the tab item
And the tab item should display the correct title and domain

## Scenario: Multiple users can view the same shared link
Given the browser is launched with the Stash extension loaded
And a new tab is opened with URL "https://github.com"
When the user clicks on "Share selected tabs…" menu item
Then a share link should be generated and copied to clipboard
When user A navigates to the share link
Then user A should see the tab item
When user B navigates to the same share link
Then user B should see the same tab item
