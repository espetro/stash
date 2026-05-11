---
title: Privacy & Data
description: Learn how Stash protects your privacy and handles data sharing securely
---

Stash is designed with privacy as a core principle. This page explains exactly how your data is handled—and more importantly, what doesn't happen with your information.

## No Data Collection

### Zero Tracking
Stash does not track, monitor, or collect any information about you:

- **No analytics**: No user behavior tracking
- **No cookies**: No persistent storage for tracking
- **No logging**: No activity logs or usage records
- **No fingerprinting**: No device or browser fingerprinting
- **No user accounts**: No registration or login required

### Browser-Only Processing
All tab sharing happens entirely within your browser:

- **Extension processing**: Tab selection and encoding happens locally
- **No server requests**: No data sent to external servers during normal use
- **Client-side expiry**: Expiration checked in browser, not on servers

## How Sharing Actually Works

### Local Encoding Process
When you share tabs, this is the complete process:

1. **Tab selection**: You choose tabs in your browser
2. **Local encoding**: URLs and titles are encoded into a share link
3. **Clipboard copy**: Only the final share link is copied
4. **No transmission**: No data sent anywhere except when you intentionally share the link

### What's In the Share Link
Share links contain only what you explicitly share:

- **Tab URLs**: The web addresses you selected
- **Tab titles**: Page titles (max 30 characters)
- **Version info**: For technical compatibility
- **Expiry timestamp**: For automatic link expiration

**No personal information** is included:
- No browsing history
- No user identity
- No device information
- No location data
- No timestamps beyond expiry

## Data Security

### Server Architecture
Stash has minimal server infrastructure:

- **Viewer only**: `stash.illo.fyi` only renders share links
- **No storage**: No database or persistent storage
- **No processing**: No server-side data manipulation
- **Static hosting**: Viewer site is static files with no dynamic processing

### Link Security
Shared links are designed for security:

- **Self-contained**: All data encoded in the link itself
- **No decryption keys**: Anyone with the link can view it
- **Expiry enforcement**: Links automatically become inaccessible
- **HTTPS only**: All communications use encryption

## Third-Party Services

### No External Dependencies
Stash avoids third-party services:

- **CDN only**: Static assets served from CDN
- **No APIs**: No external API calls during normal use
- **No authentication**: No OAuth or external identity providers
- **No advertising**: No ad networks or marketing pixels

### Open Source
The entire project is open source:

- **Code transparency**: All source code available for inspection
- **Community review**: Anyone can verify security practices
- **No hidden features**: What you see is what you get

## User Controls

### Complete User Control
You have full control over your data:

- **Manual sharing**: You choose what to share and with whom
- **No auto-sharing**: No automatic or unexpected sharing
- **Settings control**: You configure expiry and other preferences
- **No backup**: No data is backed up or stored anywhere

### Extension Permissions
Stash requests minimal permissions:

- **Tab access**: Only to read URLs and titles of selected tabs
- **Clipboard access**: Only to copy share links
- **Notifications**: Only to show status messages
- **No sensitive permissions**: No access to passwords, history, or bookmarks

## Recipient Privacy

### Viewer Privacy
People who view your shared links have privacy too:

- **No tracking**: Viewer doesn't track link visitors
- **No collection**: No personal information from viewers
- **No analytics**: No data about who views your links
- **Temporary access**: Links expire automatically

### Mobile Compatibility
Shared links work on any device without compromising privacy:

- **No apps needed**: Works in any browser
- **No installation**: No required downloads or setup
- **No accounts**: No registration to view links

## Legal Compliance

### Privacy Policy
For complete legal details, see our full [Privacy Policy](/privacy).

### Terms of Service
For usage terms, see our [Terms](/terms).

### Open Source License
Stash is licensed under AGPL-3.0—free to use, modify, and distribute.

## Common Privacy Questions

**Q: Does Stash collect any user data?**
A: No. Stash processes everything locally and collects no data.

**Q: Are my browsing habits tracked?**
A: No. Stash only sees the tabs you explicitly choose to share.

**Q: How do you make money?**
A: Stash is free and open source. There's no business model that involves data collection.

**Q: Can you see who shares what?**
A: No. We don't have servers that could track this information.

Stash exists because privacy matters. We believe sharing information should be simple, fast, and private by design.
