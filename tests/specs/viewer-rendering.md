# Viewer Rendering

This specification tests the viewer page display and interactions of the TabShare application.

## Scenario: Display single tab with favicon, title, and domain
Given the viewer server is running on localhost:4321
And the browser is navigated to the viewer URL with a valid single tab payload
Then the page should display 1 tab item
And the tab item should display a favicon
And the tab item should display the title "GitHub"
And the tab item should display the domain "github.com"

## Scenario: Display multiple tabs
Given the viewer server is running on localhost:4321
And the browser is navigated to the viewer URL with a valid payload containing 5 tabs
Then the page should display 5 tab items
And each tab item should display a favicon
And each tab item should display a title
And each tab item should display a domain

## Scenario: "Open All Tabs" button functionality
Given the viewer server is running on localhost:4321
And the browser is navigated to the viewer URL with a valid payload containing 3 tabs
Then the "Open All Tabs" button should be visible
When the user clicks on the "Open All Tabs" button
Then all 3 tabs should be opened in new browser tabs

## Scenario: "Copy URLs" button functionality
Given the viewer server is running on localhost:4321
And the browser is navigated to the viewer URL with a valid payload containing 3 tabs
Then the "Copy URLs" button should be visible
When the user clicks on the "Copy URLs" button
Then all 3 URLs should be copied to clipboard
And a notification should be displayed indicating URLs were copied

## Scenario: Individual tab click opens in new tab
Given the viewer server is running on localhost:4321
And the browser is navigated to the viewer URL with a valid payload
Then the tab item for "https://github.com" should be visible
When the user clicks on the tab item
Then a new tab should be opened with URL "https://github.com"

## Scenario: Expired link shows error message
Given the viewer server is running on localhost:4321
And the browser is navigated to the viewer URL with an expired payload
Then an error message should be displayed
And the error message should indicate that the link has expired
And the tab list should not be displayed

## Scenario: Invalid payload shows error
Given the viewer server is running on localhost:4321
And the browser is navigated to the viewer URL with invalid base64url encoding
Then an error message should be displayed
And the error message should indicate that the payload is invalid
And the tab list should not be displayed

## Scenario: Missing fragment shows error
Given the viewer server is running on localhost:4321
And the browser is navigated to "http://localhost:4321/s/"
Then an error message should be displayed
And the error message should indicate that no payload was provided
And the tab list should not be displayed

## Scenario: Invalid fragment format shows error
Given the viewer server is running on localhost:4321
And the browser is navigated to "http://localhost:4321/s/#invalid"
Then an error message should be displayed
And the error message should indicate that the fragment format is invalid
And the tab list should not be displayed

## Scenario: Unsupported payload version shows error
Given the viewer server is running on localhost:4321
And the browser is navigated to the viewer URL with a payload version 999
Then an error message should be displayed
And the error message should indicate that the payload version is unsupported
And the tab list should not be displayed

## Scenario: Favicon fallback on load error
Given the viewer server is running on localhost:4321
And the browser is navigated to the viewer URL with a valid payload
And the favicon fails to load
Then a fallback icon should be displayed
And the tab item should still be visible and functional

## Scenario: Display tabs with special characters
Given the viewer server is running on localhost:4321
And the browser is navigated to the viewer URL with a payload containing special characters
Then the tab items should display correctly
And special characters in titles should be preserved
And special characters in URLs should be preserved

## Scenario: Display tabs with Unicode
Given the viewer server is running on localhost:4321
And the browser is navigated to the viewer URL with a payload containing Unicode characters
Then the tab items should display correctly
And Unicode characters in titles should be preserved
And Unicode characters in URLs should be preserved

## Scenario: Display empty payload
Given the viewer server is running on localhost:4321
And the browser is navigated to the viewer URL with an empty items array
Then an empty state message should be displayed
And the message should indicate that no tabs were shared

## Scenario: Truncated title display
Given the viewer server is running on localhost:4321
And the browser is navigated to the viewer URL with a payload containing a long title
Then the tab item should display the truncated title
And the title should be 30 characters or less

## Scenario: Responsive layout on mobile viewport
Given the viewer server is running on localhost:4321
And the browser viewport is set to 375x667 (mobile size)
And the browser is navigated to the viewer URL with a valid payload
Then the page should be displayed in a mobile-friendly layout
And all tab items should be accessible
And buttons should be tappable on touch devices
