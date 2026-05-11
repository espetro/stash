---
title: FAQ
description: Answers to common questions about Stash and how it works
---

Here are answers to common questions about Stash.

## General Questions

### Q: Do my tabs get stored on a server?
**A:** No. Stash works entirely in your browser. Tab information is encoded directly into the share link itself—nothing is sent to or stored on any server.

### Q: What happens when the link expires?
**A:** The link stops working and shows an "expired" message. Expired links cannot be used to access the shared tabs. This is enforced client-side in the viewer.

### Q: How many tabs can I share?
**A:** It depends on URL length, but most users can share 50-100 typical tabs. If you select too many, Stash automatically finds the largest subset that fits the 8,000 character limit.

### Q: Does it work on mobile?
**A:** Yes. Anyone with the share link can open it in any mobile browser (iOS Safari, Android Chrome, etc.)—no app installation needed.

### Q: Is it open source?
**A:** Yes. Stash is fully open source and available on GitHub. The code is transparent and anyone can inspect it.

### Q: Can I self-host the viewer?
**A:** Yes. The viewer is a static site that can be hosted anywhere. You can configure the extension to use your own viewer URL in settings.

## Installation & Setup

### Q: How do I install Stash?
**A:** Get it from the [Chrome Web Store](https://chrome.google.com/webstore/detail/stash/...) or [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/stash/). Click "Add to Browser" and follow the prompts.

### Q: What browsers are supported?
**A:** Stash works on Chrome, Firefox, Edge, and other Chromium-based browsers. Mobile browsers work for viewing shared links but not for the extension itself.

### Q: Do I need to create an account?
**A:** No. Stash doesn't require any accounts or registration. It's completely anonymous and doesn't track users.

### Q: What permissions does Stash need?
**A:** Minimal permissions only—access to tab URLs and titles, clipboard access for copying links, and notification permissions for status messages.

## Usage & Features

### Q: How do I select multiple tabs?
**A:** Use **Cmd+Click** (Mac) or **Ctrl+Click** (Windows/Linux) to select individual tabs, or **Shift+Click** to select a consecutive range.

### Q: Can I share tabs from different windows?
**A:** Not currently. Stash only shares tabs from the current browser window.

### Q: What URL types are supported?
**A:** HTTP:// and HTTPS:// URLs are supported. Other protocols like file:// or chrome:// are filtered out for security.

### Q: Can I edit shared links after creating them?
**A:** No. Share links are static—once created, they cannot be modified or updated.

### Q: How do I access my sharing history?
**A:** Open the Stash extension popup and click the clock icon (🕐) to view your recent shares and their expiry status.

## Privacy & Security

### Q: Is my browsing data safe?
**A:** Yes. Stash only accesses the tabs you explicitly choose to share. No browsing history, passwords, or personal data is ever collected.

### Q: Can you see what I share?
**A:** No. We don't have servers that could track this information. All sharing happens privately between you and your recipients.

### Q: Are shared links encrypted?
**A:** They're base64 encoded for URL safety, but not encrypted in the traditional sense. Anyone with the link can view the shared tabs.

### Q: What if I share something accidentally?
**A:** Unfortunately, there's no way to "unshare" a link once it's created. Be careful about what you select before sharing.

### Q: Do you track who views my links?
**A:** No. The viewer doesn't collect any analytics or track link visitors.

## Technical Questions

### Q: Why is there an 8,000 character limit?
**A:** This limit ensures links work reliably across different platforms, apps, and communication tools. It also prevents performance issues with very large datasets.

### Q: What compression method do you use?
**A:** Stash uses pako compression for efficient encoding of tab data into share links.

### Q: Why do titles get truncated to 30 characters?
**A:** Title truncation helps save space in the URL budget while keeping tabs identifiable. You can hover over truncated titles to see the full name.

### Q: Can I change the expiry time after sharing?
**A:** No. Expiry is set when you create the link and cannot be changed later.

### Q: What if the viewer site is down?
**A:** You can configure a custom viewer URL in extension settings to use your own instance or a backup server.

## Troubleshooting

### Q: "No tabs selected" error
**A:** Make sure you've highlighted at least one tab before trying to share. Try right-clicking on a selected tab instead.

### Q: Extension not working in Firefox
**A:** Firefox may require additional permissions. Check that Stash has the necessary permissions in about:addons.

### Q: Link won't open on mobile
**A:** Make sure you're opening the full URL (not just the fragment). Some mobile apps may strip URL fragments—paste in a browser address bar.

### Q: Can't find Stash in toolbar
**A:** Check your browser's extension settings to make sure Stash is enabled and pinned to the toolbar.

### Q: Popup won't open
**A:** Try refreshing the extension in browser management. If that doesn't work, reinstall the extension.

## Contributing & Support

### Q: How can I contribute to Stash?
**A:** Stash is open source! You can contribute code, report bugs, suggest features, or help with documentation on GitHub.

### Q: How do I report a bug?
**A:** Check the GitHub issues page for existing reports, or create a new issue with detailed steps to reproduce the problem.

### Q: Is there a community or forum?
**A:** Yes, you can join discussions on GitHub or check the project README for links to community resources.

### Q: Can I request a feature?
**A:** Feature requests are welcome on GitHub. Please search existing issues first to avoid duplicates.

## Other Questions

### Q: Why is it called "Stash"?
**A:** Stash suggests storing or saving things temporarily—perfect for sharing collections of tabs that you want to keep together for a while.

### Q: Is there a premium version?
**A:** No. Stash is free and will always remain free. There are no premium features or paid plans.

### Q: Will you add more features?
**A:** We focus on keeping Stash simple and reliable. Major new features are unlikely, but we'll improve performance and fix bugs.

If you have a question that's not answered here, check our [privacy policy](/privacy), [getting started guide](/getting-started), or open an issue on GitHub.
