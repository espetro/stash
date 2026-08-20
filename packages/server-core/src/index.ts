import { handleRequest } from "./routes";
import type { StashServerConfig, StashServerDeps } from "./config";

export type { StashServerConfig } from "./config";

export interface StashServer {
  handle(request: Request): Promise<Response>;
}

/** Build a runtime-agnostic stash server. Adapters (CF worker, extension
 *  background) supply the ports via config and relay Request/Response. */
export function createStashServer(config: StashServerConfig): StashServer {
  const deps: StashServerDeps = config;
  return {
    handle: (request: Request) => handleRequest(request, deps),
  };
}

export { handleRequest } from "./routes";
export { handleMcpRequest, serverCardResponse, buildServer, MCP_TOOLS } from "./mcp";
export {
  createStash,
  getStash,
  isServerTtl,
  isExpired,
  cacheControlFor,
  renderMarkdown,
  jsonHeaders,
  SERVER_TTL_HOURS,
  type StoredEntry,
  type ServerTtl,
} from "./store";
export { MAX_PAYLOAD_CHARS, ID_RE, cors } from "./constants";
