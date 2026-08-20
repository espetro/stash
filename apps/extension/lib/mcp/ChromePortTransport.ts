import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { RuntimePort } from "../../global";

/**
 * MCP Transport implementation over a `chrome.runtime.Port`.
 *
 * Messages arriving on the port are forwarded to `onmessage`; `send()`
 * posts to the port; `close()` disconnects the port and fires `onclose`.
 */
export class ChromePortTransport implements Transport {
  private port: RuntimePort;
  private started = false;
  private _closed = false;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(port: RuntimePort) {
    this.port = port;
  }

  async start(): Promise<void> {
    if (this.started) {
      throw new Error("ChromePortTransport already started");
    }
    this.started = true;

    this.port.onMessage.addListener(this.handleMessage);
    this.port.onDisconnect.addListener(this.handleDisconnect);
  }

  private handleMessage = (message: unknown): void => {
    try {
      this.onmessage?.(message as JSONRPCMessage);
    } catch (error) {
      this.onerror?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  private handleDisconnect = (): void => {
    this.cleanup();
    this._closed = true;
    this.onclose?.();
  };

  async send(message: JSONRPCMessage): Promise<void> {
    if (this._closed) {
      throw new Error("ChromePortTransport is closed");
    }
    try {
      this.port.postMessage(message);
    } catch (error) {
      this.onerror?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this._closed) return;
    this.cleanup();
    try {
      this.port.disconnect();
    } catch {
      // Port may already be disconnected
    }
    this._closed = true;
    this.onclose?.();
  }

  private cleanup(): void {
    this.port.onMessage.removeListener(this.handleMessage);
    this.port.onDisconnect.removeListener(this.handleDisconnect);
  }
}
