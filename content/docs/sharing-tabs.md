---
title: Sharing Tabs
description: Learn how Stash works and understand the technical details of sharing tabs
---

Understanding how Stash works helps you use it more effectively and feel confident about your privacy.

## How Sharing Works

### Client-Side Encoding

When you share tabs, everything happens locally in your browser:

1. **Tab Collection**: The extension gathers URLs and titles of selected tabs
2. **Payload Creation**: Creates a JSON object with version, expiry timestamp, and tab data
3. **Compression**: Uses pako compression to reduce the size
4. **Encoding**: Converts to base64 URL-safe format
5. **URL Construction**: Builds the final share link

### What's In the Share Link

Each share link contains:
- Version information
- Expiry timestamp  
- Tab URLs (compressed)
- Tab titles (truncated to 30 characters max)

The link format is: `https://stash.illo.fyi/s/#p=compressed-data`

## Technical Details

### URL Budget

Stash has a **8,000 character limit** for share links. This prevents overly long links that might break in messaging apps or email.

- **Normal usage**: Most users can share 50-100 tabs
- **Auto-trimming**: If you select too many tabs, Stash automatically finds the largest subset that fits
- **Title optimization**: Long titles are truncated to save space

### Expiry System

Shared links have configurable expiry times:

- **24 hours**: Links work for one day
- **7 days**: Links work for one week  
- **30 days**: Links work for one month
- **Never**: Links work indefinitely (default)

Expiry is enforced client-side—when someone opens an expired link, they see a message that it has expired.

### Compression Benefits

Stash uses pako compression to:
- Reduce link size for easier sharing
- Allow more tabs per link
- Minimize encoding overhead

## What Recipients See

When someone opens your share link, they see:

### Clean Tab List
- Each tab shows the title and URL
- Tabs can be opened individually
- All tabs load in new browser windows

### Mobile-Friendly
The viewer works on:
- Desktop browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Android Chrome)
- Tablets
- No app installation required

### Available Formats
Users can choose to view shared tabs as:
- **Normal**: Interactive tab list
- **JSON**: Raw data for developers
- **Markdown**: Formatted markdown links

## Security Features

### No Server Storage
- Tab data never leaves your browser
- No database or server storage involved
- Links are self-contained

### Validation
The viewer performs several checks:
- Validates payload structure
- Checks expiry timestamp
- Verifies compression integrity
- Handles errors gracefully

### Error Handling
If something goes wrong, users see helpful messages like:
- "No share data found in URL"
- "This share link has expired"
- "Failed to load shared tabs"

## Best Practices

### For Sharers
- Keep selections relevant to your audience
- Use descriptive tab names
- Consider expiry time based on content sensitivity
- Test links before sharing important information

### For Recipients  
- Open links promptly if they have expiry
- Be aware that links contain only the tab information shared
- No personal information is collected when viewing links

## Technical Limits

### Supported URL Types
- HTTP:// URLs
- HTTPS:// URLs
- URLs are filtered to exclude sensitive protocols

### Unsupported Features
- Real-time updates (links are static)
- Collaborative editing
- Server-side analytics
- User accounts or authentication

Stash is designed to be simple, private, and reliable—focusing on its core function of sharing tab collections securely.
