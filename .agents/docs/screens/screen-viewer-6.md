---
screen: viewer-6
name: QR dialog
route: viewer, dialog opened from the tab viewer "Share QR" button
file: apps/viewer/src/components/QrDialog.tsx
---

```text
+------------------------------------------+
|             Share this stash             |
|   Scan this QR code to import the tabs   |
|                                          |
|            +------------+                |
|            |  QR code   |   180px        |
|            +------------+                |
|       (or: Generating QR code...         |
|        or: This stash is too large       |
|            to fit in a QR code.)         |
|                                          |
|               [ Close ]                  |
+------------------------------------------+
```

## Elements

| Element | State | Description |
|---|---|---|
| Title / description | always | "Share this stash" / "Scan this QR code to import the tabs" |
| QR code | encoded | Rendered via lean-qr (180px, black on white) from the worker result |
| Loading | encoding | "Generating QR code..." in a 60px-tall center block |
| Error | too large or worker failure | "This stash is too large to fit in a QR code." or worker message |
| Close | always | Full-width outline button |

## Behavior

- Encoding runs in a Web Worker (`lib/qr-encoder.worker`); stale results
  are discarded via a monotonic `encodingId`.
- Estimated bits above `MAX_QR_CAPACITY` from `@stash/codec` produce the
  too-large error without rendering.
- Opening the ShareDrawer from the split button closes this dialog first.
