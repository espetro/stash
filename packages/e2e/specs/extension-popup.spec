# Extension Popup Behavior

This specification tests the popup UI behavior and functionality of the Stash browser extension.

## Popup opens when extension icon is clicked
* The browser is launched with the Stash extension loaded
* The user clicks the extension icon
* The popup should open
* The popup should display a tab list

## Tab list displays all current window tabs
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* A new tab is opened with URL "https://stackoverflow.com"
* The user clicks the extension icon
* The popup should open
* The popup should display 2 tabs

## Checkbox toggles tab selection and syncs with browser
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user clicks the extension icon
* The user selects tab at index 0
* The tab at index 0 should be highlighted in the browser

## Select All respects URL budget
* The browser is launched with the Stash extension loaded
* 50 new tabs are opened with various URLs
* The user clicks the extension icon
* The user clicks Select All
* The popup should show budget message

## Create Link generates valid share URL
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user clicks the extension icon
* The user selects tab at index 0
* The user clicks Create Link
* The link should be copied to clipboard
* The popup should show the link result

## Copy button copies URL to clipboard
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user clicks the extension icon
* The user selects tab at index 0
* The user clicks Create Link
* The user clicks the copy button
* The link should be copied to clipboard

## Error handling shows in popup
* The browser is launched with the Stash extension loaded
* The user clicks the extension icon
* The user clicks Create Link without selecting any tabs
* The popup should show an error message

## Empty state shows when no valid tabs
* The browser is launched with the Stash extension loaded
* only chrome:// tabs are open
* The user clicks the extension icon
* The popup should show "No tabs to share"
