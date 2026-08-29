import { describe, expect, it } from "vitest";
import {
  GECKO_EXTENSION_ID,
  HOST_NAME,
  allInstallLocations,
  buildHostManifest,
  installLocation,
  windowsRegistryKey,
} from "./manifest";

const CHROME_ID = "mhipkdochajohklmmjinmicahanmldbj";

describe("buildHostManifest", () => {
  it("chrome manifest matches spec §3.2 shape, no wildcards", () => {
    const json = JSON.parse(
      buildHostManifest({
        browser: "chrome",
        daemonPath: "/usr/local/bin/stashd",
        chromeExtensionId: CHROME_ID,
      }),
    );
    expect(json).toEqual({
      name: HOST_NAME,
      type: "stdio",
      path: "/usr/local/bin/stashd",
      allowed_origins: [`chrome-extension://${CHROME_ID}/`],
    });
    expect(JSON.stringify(json)).not.toContain("*");
  });

  it("firefox manifest uses allowed_extensions with the gecko id", () => {
    const json = JSON.parse(
      buildHostManifest({ browser: "firefox", daemonPath: "/usr/bin/stashd" }),
    );
    expect(json.allowed_extensions).toEqual([GECKO_EXTENSION_ID]);
    expect(json.allowed_origins).toBeUndefined();
  });

  it("rejects relative daemon paths", () => {
    expect(() => buildHostManifest({ browser: "firefox", daemonPath: "bin/stashd" })).toThrow(
      /absolute/,
    );
  });

  it("chrome without extension id throws", () => {
    expect(() => buildHostManifest({ browser: "chrome", daemonPath: "/bin/stashd" })).toThrow(
      /chromeExtensionId/,
    );
  });

  it("output is pure JSON with trailing newline", () => {
    const out = buildHostManifest({
      browser: "firefox",
      daemonPath: "/bin/stashd",
    });
    expect(out.endsWith("\n")).toBe(true);
    expect(() => JSON.parse(out)).not.toThrow();
  });
});

describe("windowsRegistryKey", () => {
  it("uses HKCU Google\\Chrome key for chrome", () => {
    expect(windowsRegistryKey("chrome")).toBe(
      `HKEY_CURRENT_USER\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
    );
  });
  it("uses HKCU Mozilla key for firefox", () => {
    expect(windowsRegistryKey("firefox")).toContain("SOFTWARE\\Mozilla\\NativeMessagingHosts\\");
  });
});

describe("installLocation", () => {
  it("macOS chrome path", () => {
    expect(installLocation("chrome", "macos", "/Users/x").location).toBe(
      `/Users/x/Library/Application Support/Google/Chrome/NativeMessagingHosts/${HOST_NAME}.json`,
    );
  });
  it("linux firefox path per MDN", () => {
    expect(installLocation("firefox", "linux", "/home/x").location).toBe(
      `/home/x/.mozilla/native-messaging-hosts/${HOST_NAME}.json`,
    );
  });
  it("windows is a registry key, not a file path", () => {
    const loc = installLocation("chrome", "windows", "C:\\Users\\x");
    expect(loc.registry).toBe(true);
    expect(loc.location).toBe(windowsRegistryKey("chrome"));
  });
  it("allInstallLocations covers 3 OSes", () => {
    expect(allInstallLocations("firefox", "/h")).toHaveLength(3);
  });
});
