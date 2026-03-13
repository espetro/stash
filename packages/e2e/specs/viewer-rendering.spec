# Viewer Rendering

This specification tests the viewer page display and interactions of the Stash application.

## Display single tab with favicon, title, and domain
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with a valid single tab payload
* The page should display 1 tab item
* The tab item should display a favicon
* The tab item should display the title "GitHub"
* The tab item should display the domain "github.com"

## Display multiple tabs
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with a valid payload containing 5 tabs
* The page should display 5 tab items
* each tab item should display a favicon
* each tab item should display a title
* each tab item should display a domain

## "Open All Tabs" button functionality
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with a valid payload containing 3 tabs
* The "Open All Tabs" button should be visible
* The user clicks on the "Open All Tabs" button
* all 3 tabs should be opened in new browser tabs

## "Copy URLs" button functionality
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with a valid payload containing 3 tabs
* The "Copy URLs" button should be visible
* The user clicks on the "Copy URLs" button
* all 3 URLs should be copied to clipboard
* A notification should be displayed indicating URLs were copied

## Individual tab click opens in new tab
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with a valid payload
* The tab item for "https://github.com" should be visible
* The user clicks on the tab item
* A new tab should be opened with URL "https://github.com"

## Expired link shows error message
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with an expired payload
* An error message should be displayed
* The error message should indicate that the link has expired
* The tab list should not be displayed

## Invalid payload shows error
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with invalid base64url encoding
* An error message should be displayed
* The error message should indicate that the payload is invalid
* The tab list should not be displayed

## Missing fragment shows error
* The viewer server is running on localhost:4321
* The browser is navigated to "http://localhost:4321/s/"
* An error message should be displayed
* The error message should indicate that no payload was provided
* The tab list should not be displayed

## Invalid fragment format shows error
* The viewer server is running on localhost:4321
* The browser is navigated to "http://localhost:4321/s/#invalid"
* An error message should be displayed
* The error message should indicate that the fragment format is invalid
* The tab list should not be displayed

## Unsupported payload version shows error
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with a payload version 999
* An error message should be displayed
* The error message should indicate that the payload version is unsupported
* The tab list should not be displayed

## Favicon fallback on load error
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with a valid payload
* The favicon fails to load
* A fallback icon should be displayed
* The tab item should still be visible and functional

## Display tabs with special characters
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with a payload containing special characters
* The tab items should display correctly
* special characters in titles should be preserved
* special characters in URLs should be preserved

## Display tabs with Unicode
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with a payload containing Unicode characters
* The tab items should display correctly
* Unicode characters in titles should be preserved
* Unicode characters in URLs should be preserved

## Display empty payload
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with an empty items array
* An empty state message should be displayed
* The message should indicate that no tabs were shared

## Truncated title display
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with a payload containing a long title
* The tab item should display the truncated title
* The title should be 30 characters or less

## Responsive layout on mobile viewport
* The viewer server is running on localhost:4321
* The browser viewport is set to 375x667 (mobile size)
* The browser is navigated to the viewer URL with a valid payload
* The page should be displayed in a mobile-friendly layout
* all tab items should be accessible
* buttons should be tappable on touch devices
