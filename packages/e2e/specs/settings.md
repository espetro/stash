# Settings Configuration

This specification tests the settings/options page functionality of the TabShare browser extension, including expiry configuration and theme preferences.

## Scenario: Opening settings page from popup
Given the browser is launched with the TabShare extension loaded
When the user clicks the extension icon
And the user clicks the settings button
Then a new tab should open with the settings page

## Scenario: Changing expiry to 7 days
Given the browser is launched with the TabShare extension loaded
When the user navigates to the options page
And the user selects the "7 days" expiry option
Then the expiry setting should be saved to localStorage

## Scenario: Changing expiry to Never
Given the browser is launched with the TabShare extension loaded
When the user navigates to the options page
And the user selects the "Never" expiry option
Then the expiry setting should be saved to localStorage

## Scenario: Changing theme to dark mode
Given the browser is launched with the TabShare extension loaded
When the user navigates to the options page
And the user selects the dark theme
Then the theme setting should be saved to localStorage

## Scenario: Changing theme to light mode
Given the browser is launched with the TabShare extension loaded
When the user navigates to the options page
And the user selects the light theme
Then the theme setting should be saved to localStorage

## Scenario: Link with 7-day expiry uses settings
Given the browser is launched with the TabShare extension loaded
And a new tab is opened with URL "https://github.com"
When the user navigates to the options page
And the user selects the "7 days" expiry option
And the user navigates back to a content page
And the user clicks the extension icon
And the user clicks Create Link from popup
Then a share link should be generated from popup
And the link expiry should be approximately 168 hours from now

## Scenario: Link with Never expiry uses settings
Given the browser is launched with the TabShare extension loaded
And a new tab is opened with URL "https://github.com"
When the user navigates to the options page
And the user selects the "Never" expiry option
And the user navigates back to a content page
And the user clicks the extension icon
And the user clicks Create Link from popup
Then a share link should be generated from popup
And the link expiry should be greater than 438000 hours from now
