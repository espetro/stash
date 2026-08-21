# End-to-End Integration

Integration scenarios from sharing tabs (via the encoder pipeline, the
codec layer that also powers the extension) to viewing in the viewer.

The "extension is launched" step here is a no-op alias for "the codec
pipeline is ready" — the same encoding path the extension uses. We
then immediately feed tabs through `encodeTabsToShareUrl` so we test
the full encode -> URL -> viewer round trip without the GUI overhead
of launching an MV3 extension under headless Chromium.

## Happy path - Share single tab and view in browser
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The tab title is "GitHub"
* The user selects the open tab
* A share link should be generated
* The viewer server is running on localhost:4321
* The user navigates to the share link
* The viewer page should display 1 tab items
* The tab item should display the correct title "GitHub"
* The tab item should display the correct domain "github.com"
* A favicon should be displayed

## Happy path - Share 5 tabs and view
* The browser is launched with the Stash extension loaded
* 5 new tabs are opened with various URLs
* The user selects all 5 tabs
* A share link should be generated
* The viewer server is running on localhost:4321
* The user navigates to the share link
* The viewer page should display 5 tab items

## Round-trip encoding preserves data (special chars)
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://example.com/path?query=value&other=123#section"
* The tab title is "URL with special chars & # ?"
* The user selects the open tab
* A share link should be generated
* The viewer server is running on localhost:4321
* The user navigates to the share link
* The viewer page should display 1 tab items
* Special characters in URLs should be preserved
* Special characters in titles should be preserved

## Round-trip encoding preserves data (Unicode)
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://example.com/日本語/テスト"
* The tab title is "日本語のページ - Unicode Test"
* The user selects the open tab
* A share link should be generated
* The viewer server is running on localhost:4321
* The user navigates to the share link
* The viewer page should display 1 tab items
* Unicode characters in URLs should be preserved
* Unicode characters in titles should be preserved

## URL budget truncation is enforced (codec-level)
* The codec roundtrip for 100 long-URL tabs stays under the budget

## Empty selection produces no link
* The browser is launched with the Stash extension loaded
* The user selects no tabs
* No share link should be generated

## chrome:// pages are filtered out
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "chrome://extensions"
* A new tab is opened with URL "chrome://settings"
* A new tab is opened with URL "https://github.com"
* The user selects all 3 tabs
* A share link should be generated
* The viewer server is running on localhost:4321
* The user navigates to the share link
* The viewer page should display 1 tab items
* The tab item should be for "https://github.com"

## Long title truncation in round-trip
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://example.com/long-url-path"
* The tab title is "This is a very long title that exceeds the thirty character limit and should be truncated"
* The user selects the open tab
* A share link should be generated
* The viewer server is running on localhost:4321
* The user navigates to the share link
* The viewer page should display 1 tab items
* The displayed title should be 120 characters or less

## Link contains base64url fragment
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user selects the open tab
* A share link should be generated
* The share link should contain encoded data

## Payload contains correct version
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user selects the open tab
* A share link should be generated
* The decoded payload version should be 5

## Payload contains future expiry
* The browser is launched with the Stash extension loaded
* A new tab is opened with URL "https://github.com"
* The user selects the open tab
* A share link should be generated
* The decoded payload expiry should be in the future
