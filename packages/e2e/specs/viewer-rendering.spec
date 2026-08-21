# Viewer Rendering

Tests the Stash viewer page at `localhost:4321` against real DOM behavior.
The viewer renders shared tab lists as anchor (`<a target="_blank" href=...>`)
items inside an Astro page that hydrates React. These scenarios exercise
decode-and-display behaviors at the URL/page level, not the underlying
selectors, so they remain stable as styling evolves.

## Display single tab with favicon, title, and domain
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with a valid single tab payload
* The page should display 1 tab items
* The tab item should display a favicon
* The tab item should display the title "GitHub"
* The tab item should display the domain "github.com"

## Display multiple tabs
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with a valid payload containing 5 tabs
* The page should display 5 tab items
* Each tab item should display a favicon
* Each tab item should display a title
* Each tab item should display a domain

## Open selected tabs flow
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with a valid payload containing 3 tabs
* The viewer should show a "Select all" button
* The user clicks on the "Select all" button
* The viewer should show a "Deselect all" button after selection
* The viewer should show a "Open selected" button after selection


## Share as QR button visibility
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with a valid payload containing 3 tabs
* The viewer should show a "Share as QR" button

## New button visibility
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with a valid payload containing 3 tabs
* The viewer should show a "New" button

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

## Unsupported payload version shows error
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with a payload version 0
* An error message should be displayed
* The error message should indicate that the payload version is unsupported
* The tab list should not be displayed

## Display empty payload
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with an empty items array
* An error message should be displayed
* The error message should indicate that the fragment format is invalid

## Truncated title display
* The viewer server is running on localhost:4321
* The browser is navigated to the viewer URL with a payload containing a long title
* The tab item should display the truncated title
* The title should be 120 characters or less

## Responsive layout on mobile viewport
* The viewer server is running on localhost:4321
* The browser viewport is set to 375x667 (mobile size)
* The browser is navigated to the viewer URL with a valid payload containing 3 tabs
* The page should display 3 tab items
* All tab items should be accessible
* The page should be displayed in a mobile-friendly layout
