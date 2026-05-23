"use client";

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
  items: [string, string][];
  title?: string;
}

interface ShareDrawerProps {
  open: boolean;
  onClose: () => void;
  data: DecodedData;
}

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

export function ShareDrawer({ open, onClose, data }: ShareDrawerProps) {
  const [jsonLabel, setJsonLabel] = React.useState("Share as JSON");
  const [mdLabel, setMdLabel] = React.useState("Share as Markdown");

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

  return (
    <Drawer open={open} onClose={onClose} direction="bottom">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Export Options</DrawerTitle>
          <DrawerDescription>Choose how to format your links</DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-3 px-4 pb-4">
          <Button
            variant="outline"
            size="lg"
            className="h-auto flex-col items-start py-4"
            onClick={handleCopyJSON}
          >
            <span className="font-medium">{jsonLabel}</span>
            <span className="text-xs text-muted-foreground">Raw data format for developers</span>
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="h-auto flex-col items-start py-4"
            onClick={handleCopyMarkdown}
          >
            <span className="font-medium">{mdLabel}</span>
            <span className="text-xs text-muted-foreground">Formatted list with links</span>
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
