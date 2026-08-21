import { createStorage } from "unstorage";
import { createStashServer, type StashServer } from "@stash/server-core";
import { getBrotliFunctions } from "@stash/shared";
import { browserStorageDriver } from "./storage-driver";
import { extensionOrigin } from "./origin";

let _server: StashServer | null = null;

/** The extension-hosted stash server (browser.storage.local backed). */
export function getExtensionServer(): StashServer {
  if (!_server) {
    _server = createStashServer({
      storage: createStorage({ driver: browserStorageDriver({ area: browser.storage.local }) }),
      origin: extensionOrigin(),
      getBrotli: getBrotliFunctions,
    });
  }
  return _server;
}

/** unstorage instance over browser.storage.local (shared with MCP tools). */
export function getExtensionStorage() {
  return createStorage({
    driver: browserStorageDriver({ area: browser.storage.local }),
  });
}
