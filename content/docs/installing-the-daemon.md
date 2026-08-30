---
title: Installing the Daemon
description: Install the Stash daemon on macOS, Linux or Windows to unlock local-first sync and the MCP server.
---

The Stash daemon is a single local binary. It speaks native messaging with the browser extension (local-first sync) and stdio MCP (agent and headless clients). It has no listening socket and makes no network connections on its own.

## macOS (Homebrew)

```sh
brew install espetro/tap/stash-daemon
```

## Linux and universal fallback (curl)

```sh
curl -fsSL https://stash.illo.fyi/install.sh | sh
```

The script detects your platform, downloads the latest release from GitHub Releases into `/usr/local/bin` (or `./bin` if that is not writable), and prints the next steps. Override the install directory with `BIN_DIR`, or pin a version with `STASH_VERSION`.

## mise

```sh
mise use github:espetro/stash-daemon@latest
```

## Windows

 winget support is planned. Until then, download the windows amd64 archive from the [releases page](https://github.com/espetro/stash/releases) and place `stash-daemon.exe` on your `PATH`.

## Register the browser host

After installing, register the native-messaging host manifests so the extension can talk to the daemon:

```sh
stash-daemon install
```

This writes the host manifest (`io.illo.stash`) for Chrome and Firefox. Pass `--chrome-id <id>` to point at a specific Chrome extension build, or `--autostart` to also install a launchd user agent (macOS) or systemd user unit (Linux) so the daemon starts at login.

Then verify:

```sh
stash-daemon doctor
```

## Autostart

Autostart is optional: the browser spawns the daemon on demand over native messaging. Enable it only if you want the MCP server reachable before a browser opens:

- **macOS**: `launchctl bootstrap gui/$UID ~/Library/LaunchAgents/fyi.illo.stash-daemon.plist`
- **Linux**: `systemctl --user enable --now stash-daemon.service` (plus `loginctl enable-linger $USER` to keep it running after logout)

## Uninstall

```sh
stash-daemon uninstall
```

This removes the host manifests and the autostart unit. Your stash library (SQLite, logs, config) is kept and the path is printed. To delete it too:

```sh
stash-daemon uninstall --yes
```

`--yes` deletes the config directory: on macOS `~/Library/Application Support/stash`, on Linux `~/.config/stash`, on Windows `%APPDATA%\stash`. Export anything you want to keep first.

## Versioning

The daemon versions independently of the extension (`daemon-vX.Y.Z` tags). Compatibility is expressed as a `protocolVersion` range advertised in the handshake; the extension refuses to sync with an incompatible daemon rather than corrupting the library. Run `stash-daemon --version` and `stash-daemon doctor` if sync ever refuses to start.
