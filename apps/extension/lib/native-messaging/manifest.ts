/**
 * Pure core for native-messaging host manifest generation (F1.W2).
 *
 * Emits plain JSON strings; no I/O here. Thin wrappers (installers, doctor)
 * own writing files and registry keys. Consumed by F2 (`doctor`) and F10
 * (`install`/`uninstall`) — do not fork, import this module verbatim.
 */

export const GECKO_EXTENSION_ID = "stash@stash-extension";
export const HOST_NAME = "io.illo.stash" as const;

export type Browser = "chrome" | "firefox";
export type OS = "macos" | "linux" | "windows";

export interface ManifestInput {
  browser: Browser;
  /** Absolute path to the daemon (host) executable. */
  daemonPath: string;
  /**
   * Chrome extension id. Determined at store publication; required for
   * chrome, ignored (asserted absent) for firefox.
   */
  chromeExtensionId?: string;
  /** Host display name, defaults to HOST_NAME. */
  name?: string;
}

export interface InstallLocation {
  browser: Browser;
  os: OS;
  /** Human-readable location: filesystem dir or registry key. */
  location: string;
  /** True when the location is a Windows registry key rather than a path. */
  registry: boolean;
}

function assertAbsolute(path: string): string {
  if (!path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path)) {
    throw new Error(`daemonPath must be absolute, got: ${path}`);
  }
  return path;
}

/**
 * Build the host manifest JSON for one browser/OS pair (spec §3.2).
 * Chrome uses `allowed_origins` (no wildcards); Firefox uses
 * `allowed_extensions`.
 */
export function buildHostManifest(input: ManifestInput): string {
  const name = input.name ?? HOST_NAME;
  const path = assertAbsolute(input.daemonPath);
  const base: Record<string, unknown> = { name, type: "stdio", path };
  if (input.browser === "chrome") {
    if (!input.chromeExtensionId) {
      throw new Error("chrome requires chromeExtensionId");
    }
    base.allowed_origins = [`chrome-extension://${input.chromeExtensionId}/`];
  } else {
    base.allowed_extensions = [GECKO_EXTENSION_ID];
  }
  return `${JSON.stringify(base, null, 2)}\n`;
}

/** Windows registry key (not a path) that points at the manifest file. */
export function windowsRegistryKey(browser: Browser, name = HOST_NAME): string {
  const vendor = browser === "chrome" ? "Google\\Chrome" : "Mozilla";
  return `HKEY_CURRENT_USER\\SOFTWARE\\${vendor}\\NativeMessagingHosts\\${name}`;
}

/** Filesystem install directory for the manifest on macOS/Linux. */
export function installLocation(browser: Browser, os: OS, home: string): InstallLocation {
  if (os === "windows") {
    return {
      browser,
      os,
      location: windowsRegistryKey(browser),
      registry: true,
    };
  }
  const dirs: Record<Exclude<OS, "windows">, Record<Browser, string>> = {
    macos: {
      chrome: `${home}/Library/Application Support/Google/Chrome/NativeMessagingHosts`,
      firefox: `${home}/Library/Application Support/Mozilla/NativeMessagingHosts`,
    },
    linux: {
      chrome: `${home}/.config/google-chrome/NativeMessagingHosts`,
      // MDN (Native manifests docs) confirms ~/.mozilla/native-messaging-hosts
      // for Linux — the spec originally left this UNVERIFIED.
      firefox: `${home}/.mozilla/native-messaging-hosts`,
    },
  };
  return {
    browser,
    os,
    location: `${dirs[os][browser]}/${HOST_NAME}.json`,
    registry: false,
  };
}

/** All install locations for one browser across OSes (for `doctor` output). */
export function allInstallLocations(browser: Browser, home: string): InstallLocation[] {
  return (["macos", "linux", "windows"] as const).map((os) => installLocation(browser, os, home));
}
