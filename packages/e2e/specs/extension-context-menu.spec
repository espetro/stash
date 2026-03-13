# Extension Context Menu Behavior

This specification tests the context menu behavior and visibility of the Stash browser extension.

## Context menu appears for single selected tab
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user right-clicks on the tab
* The context menu should be displayed
* The menu item "Share selected tabs…" should be visible

## Context menu appears for multiple selected tabs
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* A new tab is opened with URL "https://stackoverflow.com"
* A new tab is opened with URL "https://developer.mozilla.org"
* The user selects multiple tabs using Ctrl+Click
* The user right-clicks on one of the selected tabs
* The context menu should be displayed
* The menu item "Share selected tabs…" should be visible

## Menu item click triggers extension
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user right-clicks on the tab
* The user clicks on "Share selected tabs…" menu item
* The extension should be triggered
* A notification should be displayed

## Context menu NOT visible on page context
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user right-clicks on the page content
* The context menu should be displayed
* The menu item "Share selected tabs…" should NOT be visible

## Context menu appears with keyboard shortcut
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user focuses on the tab
* The user presses the context menu key
* The context menu should be displayed
* The menu item "Share selected tabs…" should be visible

## Menu item disabled when no tabs selected
* The browser is launched with the Stash extension loaded
* The user tries to access the tab context menu without selecting a tab
* The menu item "Share selected tabs…" should be disabled or not visible
