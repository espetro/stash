import { useCallback, useEffect, useState, ChangeEventHandler } from "react";
import { LuCircleAlert, LuPlug, LuPlay, LuRefreshCcw, LuWrench } from "react-icons/lu";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ChromePortTransport } from "@/lib/mcp/ChromePortTransport";
import { connectToBackgroundMcp } from "@/lib/mcp/client";
import type { RuntimePort } from "../../../global";

interface ToolInfo {
  name: string;
  description?: string;
}

type Status = "idle" | "connecting" | "connected" | "error";

const EMPTY_ARGS = "{}";

/**
 * Options-page panel that dogfoods `connectToBackgroundMcp()` by:
 *  - opening a runtime port to the background MCP server
 *  - wrapping it in `ChromePortTransport` (the same transport the server uses)
 *  - listing tools and letting the user invoke one with arbitrary JSON args
 */
export default function TryMcpPanel() {
  const [status, setStatus] = useState<Status>("idle");
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [selectedTool, setSelectedTool] = useState<string>("");
  const [argsJson, setArgsJson] = useState<string>(EMPTY_ARGS);
  const [response, setResponse] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Refs to the live client + port so we can tear them down on unmount.
  const [client, setClient] = useState<Client | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setTools([]);
    setSelectedTool("");
    setArgsJson(EMPTY_ARGS);
    setResponse("");
    setError("");
    setClient((prev) => {
      if (prev) {
        prev.close().catch(() => {});
      }
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (client) {
        client.close().catch(() => {});
      }
    };
  }, [client]);

  const handleConnect = async () => {
    setStatus("connecting");
    setError("");
    setResponse("");
    try {
      const port = connectToBackgroundMcp() as unknown as RuntimePort;
      const transport = new ChromePortTransport(port);
      const next = new Client({ name: "stash-options-try-mcp", version: "0.0.1" });
      await next.connect(transport);
      const { tools: listed } = await next.listTools();
      setTools(listed.map((t) => ({ name: t.name, description: t.description })));
      setClient(next);
      setStatus("connected");
      if (listed.length > 0) {
        setSelectedTool(listed[0].name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const handleToolChange: ChangeEventHandler<HTMLSelectElement> = (_) => {
    setSelectedTool(_.target.value);
    setResponse("");
    setError("");
  };

  const handleArgsChange: ChangeEventHandler<HTMLTextAreaElement> = (_) => {
    setArgsJson(_.target.value);
    setError("");
  };

  const handleCall = async () => {
    if (!client) {
      setError("Not connected. Click Connect first.");
      return;
    }
    if (!selectedTool) {
      setError("Pick a tool to call.");
      return;
    }
    let parsed: unknown;
    try {
      parsed = argsJson.trim() === "" ? {} : JSON.parse(argsJson);
    } catch (parseErr) {
      setError(`Invalid JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
      return;
    }
    setError("");
    setResponse("");
    try {
      const result = await client.callTool({
        name: selectedTool,
        arguments: parsed as Record<string, unknown>,
      });
      const content = result.content as Array<{ type: string; text?: string }>;
      const firstText = content.find((c) => c.type === "text")?.text;
      setResponse(firstText ?? JSON.stringify(result, null, 2));
    } catch (callErr) {
      setError(callErr instanceof Error ? callErr.message : String(callErr));
    }
  };

  const isConnected = status === "connected";

  return (
    <>
      <h2 id="try-mcp-heading" className="settings-section-title">
        Try MCP
      </h2>
      <p className="settings-section-description">
        Connect to the local MCP server running in the background, list its tools, and call one with
        arbitrary JSON arguments. Useful for sanity-checking the wire protocol.
      </p>

      <div className="form-group">
        <div className="viewer-origin-row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleConnect}
            disabled={status === "connecting"}
            aria-label="Connect to background MCP server"
          >
            <LuPlug aria-hidden="true" />
            {status === "connecting" ? "Connecting…" : isConnected ? "Reconnect" : "Connect"}
          </button>
          {isConnected && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={reset}
              aria-label="Disconnect from background MCP server"
            >
              <LuRefreshCcw aria-hidden="true" />
              Disconnect
            </button>
          )}
          <span className="try-mcp-status" aria-live="polite">
            {isConnected ? (
              <>
                <LuWrench aria-hidden="true" /> {tools.length} tool{tools.length === 1 ? "" : "s"}{" "}
                loaded
              </>
            ) : status === "connecting" ? (
              "Connecting…"
            ) : status === "error" ? (
              <>
                <LuCircleAlert aria-hidden="true" /> Error
              </>
            ) : (
              "Not connected"
            )}
          </span>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="try-mcp-tool-select" className="form-label">
          Tool
        </label>
        <select
          id="try-mcp-tool-select"
          className="settings-select"
          value={selectedTool}
          onChange={handleToolChange}
          disabled={!isConnected || tools.length === 0}
          aria-label="Select an MCP tool to call"
        >
          {tools.length === 0 ? (
            <option value="">(no tools)</option>
          ) : (
            tools.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))
          )}
        </select>
        {selectedTool && tools.find((t) => t.name === selectedTool)?.description && (
          <p className="try-mcp-tool-description">
            {tools.find((t) => t.name === selectedTool)?.description}
          </p>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="try-mcp-args-input" className="form-label">
          Arguments (JSON)
        </label>
        <textarea
          id="try-mcp-args-input"
          className="settings-input try-mcp-args"
          value={argsJson}
          onChange={handleArgsChange}
          rows={5}
          spellCheck={false}
          aria-label="Tool arguments as JSON"
          placeholder={EMPTY_ARGS}
        />
      </div>

      <div className="form-group">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleCall}
          disabled={!isConnected || !selectedTool}
          aria-label="Call selected tool"
        >
          <LuPlay aria-hidden="true" />
          Call
        </button>
      </div>

      {error && (
        <p className="settings-error" role="alert" aria-live="assertive">
          {error}
        </p>
      )}

      {response && (
        <div className="form-group">
          <label className="form-label">Response</label>
          <pre className="try-mcp-response" aria-label="Tool response">
            {response}
          </pre>
        </div>
      )}
    </>
  );
}
