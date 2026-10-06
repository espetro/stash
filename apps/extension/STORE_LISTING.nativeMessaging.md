# Store listing draft: nativeMessaging permission

Status: DRAFT, for review before any Chrome Web Store / AMO submission.

## What changed and why

Starting with the local-first re-platform (spec §3), Stash can sync with the
user's locally installed Stash daemon. The daemon runs on the user's machine
and the extension talks to it over the browser's native messaging API
(`runtime.connectNative`), which requires the `nativeMessaging` permission.

Native messaging is local-only: the extension launches or attaches to a
program the user installed themselves. No data is sent anywhere by this
permission itself.

## data_collection_permissions

`required: ["none"]` stays truthful. Native messaging to a local daemon does
not imply data collection: nothing leaves the user's machine through this
channel.

## Chrome Web Store: permission justification

Permission requested: `nativeMessaging`

> Stash uses native messaging solely to communicate with the Stash daemon,
> a companion program the user installs on their own computer. This lets the
> extension sync saved tab snapshots to local storage owned by the user.
> All traffic stays on the local machine over stdio; Stash's servers are
> never involved in this channel. No remote hosts are contacted through
> native messaging.

Single-purpose note: this does not change Stash's single purpose (saving and
restoring tab snapshots); the daemon is another sink for the same data the
user already saves.

## Firefox (AMO) notes

- Add-on ID used in the host manifest's `allowed_extensions`:
  `stash@stash-extension` (from `browser_specific_settings.gecko.id` in
  `wxt.config.ts`).
- AMO review will see `nativeMessaging` in the permission list; reference the
  justification above. Mention the host manifest requirement in the review
  notes and link the daemon's install docs.
- Host manifests for Firefox are installed outside the add-on package; state
  this explicitly in the submission notes so the reviewer can test with the
  daemon installed.
