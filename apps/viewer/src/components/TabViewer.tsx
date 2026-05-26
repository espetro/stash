import * as React from "react";
import { useState, useCallback } from "react";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { ShareDrawer } from "./ShareDrawer";
import { QrDialogContent } from "./QrDialog";
import { Dialog } from "@/components/ui/dialog";
import { TabListItem } from "@/components/TabListItem";
import { useDecodeShareUrl, type DecodedData } from "@/hooks/useDecodeShareUrl";
import { buildCaption } from "@/lib/format";
import {
  SharedCard,
  SharedCardHeader,
  SharedCardContent,
  SharedButtonArea,
  SplitButtonGroup,
  OutlineButton,
} from "@/components/shared";

function JsonOutput({ data }: { data: DecodedData }) {
  const output = {
    expiry: data.expiry,
    isExpired: data.isExpired,
    items: data.items.map(([url, title]) => ({ url, title })),
  };

  return (
    <pre className="whitespace-pre-wrap break-words p-4 text-sm text-foreground">
      {JSON.stringify(output, null, 2)}
    </pre>
  );
}

function MdOutput({ data }: { data: DecodedData }) {
  const lines = data.items.map(([url, title]) => {
    const escaped = title.replace(/]/g, "\\]").replace(/\[/g, "\\[");
    return `[${escaped}](${url})`;
  });

  return (
    <pre className="whitespace-pre-wrap break-words p-4 text-sm text-foreground">
      {lines.join("\n")}
    </pre>
  );
}

export default function TabViewer() {
  const state = useDecodeShareUrl();
  const [qrOpen, setQrOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleNew = useCallback(() => {
    window.location.href = "/s/new";
  }, []);

  const handleShareQr = useCallback(() => {
    setQrOpen(true);
  }, []);

  const handleOpenDrawer = useCallback(() => {
    setQrOpen(false);
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  if (state.type === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center p-3">
        <p className="text-lg font-medium text-foreground">Loading...</p>
      </div>
    );
  }

  if (state.type === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center p-3">
        <p className="text-lg font-medium text-foreground">{state.message}</p>
      </div>
    );
  }

  const { data, format } = state;
  const count = data.items.length;

  if (format === "json") {
    return (
      <div className="min-h-screen p-0">
        <JsonOutput data={data} />
      </div>
    );
  }

  if (format === "md") {
    return (
      <div className="min-h-screen p-0">
        <MdOutput data={data} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center p-3 pt-6 sm:pt-8">
      <SharedCard className="sm:max-h-[75vh]">
        <SharedCardHeader
          title={data.title ?? "Shared Tabs"}
          caption={buildCaption(count, data.expiry)}
        />

        <SharedCardContent className="overflow-hidden px-3 pb-3 sm:px-5 sm:pb-5">
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="custom-scrollbar overflow-y-auto" style={{ maxHeight: "400px" }}>
              {data.items.map(([url, title], index) => (
                <React.Fragment key={url + index}>
                  {index > 0 && <div className="h-px bg-border" />}
                  <TabListItem url={url} title={title} />
                </React.Fragment>
              ))}
            </div>
          </div>
          <ThemeSwitcher />
        </SharedCardContent>
      </SharedCard>

      <SharedButtonArea>
        <SplitButtonGroup
          mainLabel="Share as QR"
          onMainClick={handleShareQr}
          onDropdownClick={handleOpenDrawer}
        />
        <OutlineButton onClick={handleNew}>New</OutlineButton>
      </SharedButtonArea>

      <Dialog
        open={qrOpen}
        onOpenChange={(open) => {
          setQrOpen(open);
          if (open) setDrawerOpen(false);
        }}
      >
        <QrDialogContent
          tabs={data.items.map(([url, title]) => ({ url, title }))}
          title={data.title}
          onClose={() => setQrOpen(false)}
        />
      </Dialog>

      <ShareDrawer
        open={drawerOpen}
        onClose={handleDrawerClose}
        data={{
          expiry: data.expiry,
          isExpired: data.isExpired,
          items: data.items,
          title: data.title,
        }}
      />
    </div>
  );
}
