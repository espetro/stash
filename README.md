# Stash

Your tabs are your thinking. Stop losing them.

Share your entire browser context as one link — or save it for later. Locally. Privately. No account. No cloud. No noise.

<!-- TODO: Add screenshot or GIF showing extension in action -->

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web_Store-blue?logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/stash/hmbicgabmfokajcfljebjldnhhefngld)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox-Add-ons-orange?logo=firefox&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/stash-snapshot-tabs/)

- 🔄 Share multiple tabs with a single URL
- 🤖 Built for AI: local MCP server exposes your tabs and stash library to agents like Claude and Cursor
- 💾 Local stash library: save sessions with tags and notes, entirely in your browser
- 🔒 No account, no cloud — tab data is encoded in the link itself; saved stashes never leave `storage.local`
- 📱 Works on any device (just open the link)
- ⏰ Links auto-expire; opt-in short links last at most 7 days
- 🌐 Cross-browser (Chrome, Firefox, Edge)

How it works:

1. Select the tabs you want to share or save
2. Stash encodes them into a link, or saves the session to your local stash library
3. AI agents can snapshot your tabs, search stashes, and create new ones over MCP

Docs for agents: the viewer serves JSON, Markdown, and an OpenAPI schema at
[stash.illo.fyi/llms.txt](https://stash.illo.fyi/llms.txt), and an MCP endpoint at `https://s.illo.fyi/mcp`.

If you find Stash useful, please ⭐ star the repo on GitHub!

Learn more in the [documentation](https://stash.illo.fyi/docs)
Questions? Check the [FAQ](https://stash.illo.fyi/docs/faq)

Licensed under AGPL-3.0. See [LICENSE](./LICENSE)