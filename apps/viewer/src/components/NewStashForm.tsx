import * as React from "react";
import { Button } from "@/components/ui/button";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import {
  SharedCard,
  SharedCardHeader,
  SharedCardContent,
  SharedButtonArea,
  PrimaryButton,
  OutlineButton,
} from "@/components/shared";
import { useStashForm } from "@/hooks/useStashForm";
import { EXPIRY_OPTIONS } from "@stash/shared";

export default function NewStashForm() {
  const {
    urls,
    stashTitle,
    expiry,
    resultUrl,
    saveState,
    copyState,
    setUrls,
    setStashTitle,
    setExpiry,
    handleSave,
    handleCopy,
    handleClear,
  } = useStashForm();

  const saveLabel =
    saveState === "generating" ? "Generating..." : saveState === "error" ? "Error" : "Save";

  return (
    <div className="flex min-h-screen flex-col items-center p-3 pt-6 sm:pt-8">
      <SharedCard>
        <SharedCardHeader title="Create Stash" />

        <SharedCardContent>
          <input
            type="text"
            value={stashTitle}
            onChange={(e) => setStashTitle(e.target.value)}
            placeholder="Stash title"
            className="w-full rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />

          <textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder="Paste URLs (one per line)..."
            className="min-h-[200px] w-full resize-y rounded-xl border border-border bg-muted p-3 font-mono text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />

          <select
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="w-full appearance-none rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236c727e' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 12px center",
              paddingRight: "36px",
            }}
          >
            {EXPIRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {resultUrl && (
            <div className="mt-2 rounded-xl border border-border bg-muted p-4">
              <a
                href={resultUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-3 block break-all font-mono text-xs text-primary underline"
              >
                {resultUrl}
              </a>
              <Button
                variant="outline"
                onClick={handleCopy}
                className="h-12 w-full rounded-xl border-border bg-card text-sm font-semibold text-foreground hover:bg-secondary"
              >
                {copyState === "copied" ? "Copied!" : "Copy to clipboard"}
              </Button>
            </div>
          )}
          <ThemeSwitcher />
        </SharedCardContent>
      </SharedCard>

      <SharedButtonArea>
        <PrimaryButton onClick={handleSave} disabled={saveState === "generating"}>
          {saveLabel}
        </PrimaryButton>
        <OutlineButton onClick={handleClear}>Clear</OutlineButton>
      </SharedButtonArea>
    </div>
  );
}
