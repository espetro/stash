# Extension Context Menu Behavior

This specification tests the context menu behavior and visibility of the TabShare browser extension.

## Scenario: Context menu appears for single selected tab
Given the browser is launched with the TabShare extension loaded
And a new tab is opened with URL "https://github.com"
When the user right-clicks on the tab
Then the context menu should be displayed
And the menu item "Share selected tabs…" should be visible

## Scenario: Context menu appears for multiple selected tabs
Given the browser is launched with the TabShare extension loaded
And a new tab is opened with URL "https://github.com"
And a new tab is opened with URL "https://stackoverflow.com"
And a new tab is opened with URL "https://developer.mozilla.org"
When the user selects multiple tabs using Ctrl+Click
And the user right-clicks on one of the selected tabs
Then the context menu should be displayed
And the menu item "Share selected tabs…" should be visible

## Scenario: Menu item click triggers extension
Given the browser is launched with the TabShare extension loaded
And a new tab is opened with URL "https://github.com"
When the user right-clicks on the tab
And the user clicks on "Share selected tabs…" menu item
Then the extension should be triggered
And a notification should be displayed

## Scenario: Context menu NOT visible on page context
Given the browser is launched with the TabShare extension loaded
And a new tab is opened with URL "https://github.com"
When the user right-clicks on the page content
Then the context menu should be displayed
And the menu item "Share selected tabs…" should NOT be visible

## Scenario: Context menu appears with keyboard shortcut
Given the browser is launched with the TabShare extension loaded
And a new tab is opened with URL "https://github.com"
When the user focuses on the tab
And the user presses the context menu key
Then the context menu should be displayed
And the menu item "Share selected tabs…" should be visible

## Scenario: Menu item disabled when no tabs selected
Given the browser is launched with the TabShare extension loaded
When the user tries to access the tab context menu without selecting a tab
Then the menu item "Share selected tabs…" should be disabled or not visible
