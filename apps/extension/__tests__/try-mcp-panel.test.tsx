import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// --- Mocks (hoisted) ---------------------------------------------------

// A fake runtime port that satisfies the structural RuntimePort type but is
// inert — the panel's `ChromePortTransport` will register listeners on it, but
// nothing on the test side ever drives messages back. That's fine because we
// also stub the SDK Client so neither transport actually exercises JSON-RPC.
function makeFakePort() {
  const onMessageListeners: Array<(m: unknown) => void> = [];
  const onDisconnectListeners: Array<() => void> = [];
  return {
    name: "stash-mcp",
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: {
      addListener: (cb: (m: unknown) => void) => {
        onMessageListeners.push(cb);
      },
      removeListener: (cb: (m: unknown) => void) => {
        const idx = onMessageListeners.indexOf(cb);
        if (idx >= 0) onMessageListeners.splice(idx, 1);
      },
    },
    onDisconnect: {
      addListener: (cb: () => void) => {
        onDisconnectListeners.push(cb);
      },
      removeListener: (cb: () => void) => {
        const idx = onDisconnectListeners.indexOf(cb);
        if (idx >= 0) onDisconnectListeners.splice(idx, 1);
      },
    },
    // helpers for test wiring if ever needed
    __emitMessage: (m: unknown) => onMessageListeners.forEach((cb) => cb(m)),
    __emitDisconnect: () => onDisconnectListeners.forEach((cb) => cb()),
  };
}

const fakePort = makeFakePort();

vi.mock("@/lib/mcp/client", () => ({
  connectToBackgroundMcp: vi.fn(() => fakePort),
}));

// Stub the SDK Client. We don't exercise the real protocol — we just want
// to confirm the panel calls `.connect()`, then renders the tool list and
// passes the right args to `.callTool()`.
const listToolsMock = vi.fn(async () => ({
  tools: [
    { name: "stash_snapshot_tabs", description: "Snapshot current tabs" },
    { name: "stash_list", description: "List local stashes" },
  ],
}));

const callToolMock = vi.fn(async ({ name }: { name: string; arguments?: unknown }) => ({
  content: [{ type: "text", text: `called:${name}` }],
  isError: false,
}));

const connectMock = vi.fn();
const closeMock = vi.fn(async () => undefined);

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class FakeClient {
    options: unknown;
    constructor(opts: unknown) {
      this.options = opts;
    }
    async connect(_transport: unknown) {
      connectMock();
    }
    async close() {
      closeMock();
    }
    async listTools() {
      return listToolsMock();
    }
    async callTool(args: { name: string; arguments?: unknown }) {
      return callToolMock(args);
    }
  },
}));

// --- Tests --------------------------------------------------------------

import TryMcpPanel from "../entrypoints/options/components/TryMcpPanel";

describe("TryMcpPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Connect button and a disabled Call button initially", () => {
    render(<TryMcpPanel />);
    const connectBtn = screen.getByRole("button", { name: /connect to background mcp server/i });
    expect(connectBtn).toBeInTheDocument();
    expect(connectBtn).not.toBeDisabled();

    const callBtn = screen.getByRole("button", { name: /call selected tool/i });
    expect(callBtn).toBeDisabled();
  });

  it("connects, lists tools, and enables Call when a tool is selected", async () => {
    render(<TryMcpPanel />);

    fireEvent.click(screen.getByRole("button", { name: /connect to background mcp server/i }));

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "stash_snapshot_tabs" })).toBeInTheDocument();
    });
    expect(screen.getByRole("option", { name: "stash_list" })).toBeInTheDocument();

    const callBtn = screen.getByRole("button", { name: /call selected tool/i });
    expect(callBtn).not.toBeDisabled();

    // Status reflects loaded count
    expect(screen.getByText(/2 tools loaded/)).toBeInTheDocument();
  });

  it("calls the selected tool with parsed JSON args and renders the response", async () => {
    render(<TryMcpPanel />);

    fireEvent.click(screen.getByRole("button", { name: /connect to background mcp server/i }));

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "stash_list" })).toBeInTheDocument();
    });

    // Switch to stash_list
    fireEvent.change(screen.getByLabelText(/select an mcp tool to call/i), {
      target: { value: "stash_list" },
    });

    // Edit the JSON arguments textarea
    const argsArea = screen.getByLabelText(/tool arguments as json/i);
    fireEvent.change(argsArea, { target: { value: '{"query":"x"}' } });

    fireEvent.click(screen.getByRole("button", { name: /call selected tool/i }));

    await waitFor(() => {
      expect(callToolMock).toHaveBeenCalledWith({
        name: "stash_list",
        arguments: { query: "x" },
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/called:stash_list/)).toBeInTheDocument();
    });
  });

  it("surfaces a JSON parse error when arguments are not valid JSON", async () => {
    render(<TryMcpPanel />);

    fireEvent.click(screen.getByRole("button", { name: /connect to background mcp server/i }));

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "stash_list" })).toBeInTheDocument();
    });

    const argsArea = screen.getByLabelText(/tool arguments as json/i);
    fireEvent.change(argsArea, { target: { value: "not-json" } });

    fireEvent.click(screen.getByRole("button", { name: /call selected tool/i }));

    expect(await screen.findByText(/invalid json/i)).toBeInTheDocument();
    expect(callToolMock).not.toHaveBeenCalled();
  });
});