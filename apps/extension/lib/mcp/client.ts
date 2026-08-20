import type { RuntimePort } from "../../global";
import { MCP_PORT_NAME } from "./constants";
export { MCP_PORT_NAME };

/**
 * Open a runtime port to the extension's background MCP server.
 *
 * For use from extension pages (popup, options) or future in-extension
 * agents: wrap the returned port in a client-side transport mirroring
 * ChromePortTransport, then connect an SDK Client to it.
 */
export function connectToBackgroundMcp(): RuntimePort {
  return browser.runtime.connect({ name: MCP_PORT_NAME }) as unknown as RuntimePort;
}
