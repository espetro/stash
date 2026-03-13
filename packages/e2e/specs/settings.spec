# Settings Configuration

This specification tests the settings/options page functionality of the Stash browser extension, including expiry configuration and theme preferences.

## Opening settings page from popup
* The browser is launched with the Stash extension loaded
* The user clicks the extension icon
* The user clicks the settings button
* A new tab should open with the settings page

## Changing expiry to 7 days
* The browser is launched with the Stash extension loaded
* The user navigates to the options page
* The user selects the "7 days" expiry option
* The expiry setting should be saved to chrome.storage.sync

## Changing expiry to Never
* The browser is launched with the Stash extension loaded
* The user navigates to the options page
* The user selects the "Never" expiry option
* The expiry setting should be saved to chrome.storage.sync

## Changing theme to dark mode
* The browser is launched with the Stash extension loaded
* The user navigates to the options page
* The user selects the dark theme
* The theme setting should be saved to chrome.storage.sync

## Changing theme to light mode
* The browser is launched with the Stash extension loaded
* The user navigates to the options page
* The user selects the light theme
* The theme setting should be saved to chrome.storage.sync

## Link with 7-day expiry uses settings
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user navigates to the options page
* The user selects the "7 days" expiry option
* The user navigates back to a content page
* The user clicks the extension icon
* The user clicks Create Link from popup
* A share link should be generated from popup
* The link expiry should be approximately 168 hours from now

## Link with Never expiry uses settings
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user navigates to the options page
* The user selects the "Never" expiry option
* The user navigates back to a content page
* The user clicks the extension icon
* The user clicks Create Link from popup
* A share link should be generated from popup
* The link expiry should be greater than 438000 hours from now
