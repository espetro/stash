import * as React from "react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

interface DecodedData {
  expiry: number;
  isExpired: boolean;
  items: [string, string, ("url" | "note")?][];
  title?: string;
}

interface ShareDrawerProps {
  open: boolean;
  onClose: () => void;
  data: DecodedData;
}

const SHARE_PATH_FRAGMENT_PREFIX = "#p=";

function exportToJSON(data: DecodedData): string {
  const output = {
    expiry: data.expiry,
    isExpired: data.isExpired,
    items: data.items.map(([url, title]) => ({ url, title })),
    title: data.title,
  };
  return JSON.stringify(output, null, 2);
}

function exportToMarkdown(data: DecodedData): string {
  return data.items
    .map(([url, title]) => {
      const escaped = title.replace(/\]/g, "\\]").replace(/\[/g, "\\[");
      return `[${escaped}](${url})`;
    })
    .join("\n");
}

/**
 * Build an agent-friendly share URL by moving the encoded payload from the
 * fragment (`#p=…`) into the query string (`?p=…`). The fragment is opaque
 * to fetch-only agents (curl, HTTP libs), so a query-string variant makes
 * the same link consumable by every class of agent without losing the
 * fragment form for browsers.
 */
function buildAgentShareUrl(origin: string): string | null {
  if (typeof window === "undefined") return null;
  const fragment = window.location.hash;
  if (!fragment.startsWith(SHARE_PATH_FRAGMENT_PREFIX)) return null;
  const encoded = fragment.slice(SHARE_PATH_FRAGMENT_PREFIX.length);
  if (!encoded) return null;
  return `${origin}/s?p=${encoded}`;
}

export function ShareDrawer({ open, onClose, data }: ShareDrawerProps) {
  const [jsonLabel, setJsonLabel] = React.useState("Share as JSON");
  const [mdLabel, setMdLabel] = React.useState("Share as Markdown");
  const [agentLabel, setAgentLabel] = React.useState("Copy as agent URL");

  const handleCopyJSON = React.useCallback(() => {
    const text = exportToJSON(data);
    navigator.clipboard.writeText(text).then(() => {
      setJsonLabel("Copied!");
      setTimeout(() => setJsonLabel("Share as JSON"), 2000);
      onClose();
    });
  }, [data, onClose]);

  const handleCopyMarkdown = React.useCallback(() => {
    const text = exportToMarkdown(data);
    navigator.clipboard.writeText(text).then(() => {
      setMdLabel("Copied!");
      setTimeout(() => setMdLabel("Share as Markdown"), 2000);
      onClose();
    });
  }, [data, onClose]);

  const handleCopyAgentUrl = React.useCallback(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = buildAgentShareUrl(origin);
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setAgentLabel("Copied!");
      setTimeout(() => setAgentLabel("Copy as agent URL"), 2000);
      onClose();
    });
  }, [onClose]);

  return (
    <Drawer open={open} onClose={onClose} direction="bottom">
      <DrawerContent className="sm:max-w-160 sm:mx-auto">
        <DrawerHeader>
          <DrawerTitle>Export Options</DrawerTitle>
          <DrawerDescription>Choose how to format your links</DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-3 px-4 pb-4">
          <Button
            variant="outline"
            size="lg"
            className="group h-auto flex-col items-start py-4 rounded-xl"
            onClick={handleCopyJSON}
          >
            <span className="font-medium text-foreground">{jsonLabel}</span>
            <span className="text-xs text-muted-foreground group-hover:text-accent-foreground transition-colors">{`Raw data format for developers`}</span>
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="group h-auto flex-col items-start py-4 rounded-xl"
            onClick={handleCopyMarkdown}
          >
            <span className="font-medium text-foreground">{mdLabel}</span>
            <span className="text-xs text-muted-foreground group-hover:text-accent-foreground transition-colors">{`Formatted list with links`}</span>
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="group h-auto flex-col items-start py-4 rounded-xl"
            onClick={handleCopyAgentUrl}
            data-testid="copy-agent-url"
          >
            <span className="font-medium text-foreground">{agentLabel}</span>
            <span className="text-xs text-muted-foreground group-hover:text-accent-foreground transition-colors">{`?p=<payload> form for curl + agents`}</span>
          </Button>
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
