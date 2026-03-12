# Extension Popup Behavior

This specification tests the popup UI behavior and functionality of the Stash browser extension.

## Scenario: Popup opens when extension icon is clicked
Given the browser is launched with the Stash extension loaded
When the user clicks the extension icon
Then the popup should open
And the popup should display a tab list

## Scenario: Tab list displays all current window tabs
Given the browser is launched with the Stash extension loaded
And a new tab is opened with URL "https://github.com"
And a new tab is opened with URL "https://stackoverflow.com"
When the user clicks the extension icon
Then the popup should open
And the popup should display 2 tabs

## Scenario: Checkbox toggles tab selection and syncs with browser
Given the browser is launched with the Stash extension loaded
And a new tab is opened with URL "https://github.com"
When the user clicks the extension icon
And the user selects tab at index 0
Then the tab at index 0 should be highlighted in the browser

## Scenario: Select All respects URL budget
Given the browser is launched with the Stash extension loaded
And 50 new tabs are opened with various URLs
When the user clicks the extension icon
And the user clicks Select All
Then the popup should show budget message

## Scenario: Create Link generates valid share URL
Given the browser is launched with the Stash extension loaded
And a new tab is opened with URL "https://github.com"
When the user clicks the extension icon
And the user selects tab at index 0
And the user clicks Create Link
Then the link should be copied to clipboard
And the popup should show the link result

## Scenario: Copy button copies URL to clipboard
Given the browser is launched with the Stash extension loaded
And a new tab is opened with URL "https://github.com"
When the user clicks the extension icon
And the user selects tab at index 0
And the user clicks Create Link
And the user clicks the copy button
Then the link should be copied to clipboard

## Scenario: Error handling shows in popup
Given the browser is launched with the Stash extension loaded
When the user clicks the extension icon
And the user clicks Create Link without selecting any tabs
Then the popup should show an error message

## Scenario: Empty state shows when no valid tabs
Given the browser is launched with the Stash extension loaded
And only chrome:// tabs are open
When the user clicks the extension icon
Then the popup should show "No tabs to share"
