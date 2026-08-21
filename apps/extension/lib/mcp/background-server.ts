import { ChromePortTransport } from "./ChromePortTransport";
import { startMcpServerOverTransport } from "./server";
import { getSettings } from "../../lib/settings";

import type { RuntimePort } from "../../global.d";
import { MCP_PORT_NAME } from "./constants";
export { MCP_PORT_NAME };

/** Start a fresh MCP server over an incoming runtime port. */
export function startMcpServerOverPort(port: RuntimePort): void {
  const transport = new ChromePortTransport(port);
  getSettings()
    .then((settings) =>
      startMcpServerOverTransport(transport, {
        experimentalServer: settings.experimentalServer,
      }),
    )
    .catch((error) => {
      console.error("[mcp] failed to start server over port:", error);
      try {
        port.disconnect();
      } catch {
        // already disconnected
      }
    });
}
