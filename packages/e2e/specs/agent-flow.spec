# Agent Flow

Fetch-only agent stand-in over the viewer's machine-readable surfaces.
No browser rendering is asserted here, only what an HTTP client (an
agent, a crawler, curl) sees: alternate links in the HTML, content
negotiation via Accept, and ?format= variants.

## JSON alternate link round-trip
* The viewer server is running on localhost:4321
* The agent is given a fixture share URL three-tabs
* The agent reads the alternate link of type application/json from the page HTML
* The agent fetches the alternate link and receives JSON items
* The JSON body should contain 3 items
* The JSON body should contain the URL https://github.com with title GitHub

## Markdown alternate link round-trip
* The viewer server is running on localhost:4321
* The agent is given a fixture share URL three-tabs
* The agent reads the alternate link of type text/markdown from the page HTML
* The agent fetches the share URL with Accept text/markdown and receives 3 items as text
* The markdown body should contain a link to https://github.com

## Plain text negotiation
* The viewer server is running on localhost:4321
* The agent is given a fixture share URL five-tabs
* The agent fetches the share URL with Accept text/plain and receives 5 items as text

## Single tab across formats
* The viewer server is running on localhost:4321
* The agent is given a fixture share URL single-tab
* The agent reads the alternate link of type application/json from the page HTML
* The agent fetches the alternate link and receives JSON items
* The JSON body should contain 1 items
* The JSON body should contain the URL https://github.com with title GitHub
