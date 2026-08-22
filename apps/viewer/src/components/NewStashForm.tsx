import * as React from "react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/LocaleProvider";
import { t } from "@/i18n";
import {
  SharedCard,
  SharedCardHeader,
  SharedCardContent,
  SharedButtonArea,
  PrimaryButton,
  OutlineButton,
} from "@/components/shared";
import { useStashForm } from "@/hooks/useStashForm";
import { useBudgetMeter } from "@/hooks/useBudgetMeter";
import { EXPIRY_OPTIONS } from "@stash/shared";
import { FaCircleCheck, FaTriangleExclamation } from "react-icons/fa6";

export default function NewStashForm() {
  const { lang } = useLocale();
  const {
    urls,
    stashTitle,
    expiry,
    resultUrl,
    saveState,
    copyState,
    localSaveState,
    shortenState,
    isShortUrl,
    lineErrors,
    setUrls,
    setStashTitle,
    setExpiry,
    handleSave,
    handleCopy,
    handleClear,
    handleSaveLocally,
    handleGetShortLink,
  } = useStashForm();
  const meter = useBudgetMeter(urls, stashTitle);

  const urlRatio = meter.itemCount > 0 ? meter.urlChars / meter.budgetChars : 0;
  const urlFits = meter.urlChars <= meter.budgetChars;

  const saveLabel =
    saveState === "generating"
      ? t("stash.generating", undefined, lang)
      : saveState === "error"
        ? t("stash.error", undefined, lang)
        : t("stash.save", undefined, lang);

  const localSaveLabel =
    localSaveState === "saving"
      ? t("stash.generating", undefined, lang)
      : localSaveState === "saved"
        ? t("stash.saveLocal.done", undefined, lang)
        : localSaveState === "error"
          ? t("stash.error", undefined, lang)
          : t("stash.saveLocal.idle", undefined, lang);

  return (
    <div className="flex min-h-screen flex-col items-center p-3 pt-6 sm:pt-8">
      <AppHeader />

      <SharedCard>
        <SharedCardHeader title={t("stash.create.title", undefined, lang)} />

        <SharedCardContent>
          <input
            type="text"
            value={stashTitle}
            onChange={(e) => setStashTitle(e.target.value)}
            placeholder={t("stash.title.placeholder", undefined, lang)}
            className="w-full rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />

          <textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder={t("stash.urls.placeholder", undefined, lang)}
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
                {t(`stash.expiry.${opt.value}`, undefined, lang)}
              </option>
            ))}
          </select>

          {Object.keys(lineErrors).length > 0 && (
            <ul
              className="space-y-1 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              data-testid="line-errors"
            >
              {Object.entries(lineErrors).map(([line, error]) => (
                <li key={line} className="flex gap-2">
                  <span className="font-mono font-semibold">L{Number(line) + 1}</span>
                  <span>{error}</span>
                </li>
              ))}
            </ul>
          )}

          {meter.itemCount > 0 && (
            <div
              className="rounded-xl border border-border bg-muted p-3"
              data-testid="budget-meter"
              aria-live="polite"
            >
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">
                  {meter.itemCount} {t("stash.meter.items", undefined, lang)}
                </span>
                <span className={urlFits ? "text-muted-foreground" : "font-semibold text-red-600"}>
                  {meter.urlChars} / {meter.budgetChars} {t("stash.meter.chars", undefined, lang)}
                </span>
              </div>
              <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className={`h-full rounded-full transition-all ${
                    urlRatio > 1 ? "bg-red-600" : urlRatio > 0.8 ? "bg-amber-500" : "bg-primary"
                  }`}
                  style={{ width: `${Math.min(100, urlRatio * 100)}%` }}
                />
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                {meter.qrPossible ? (
                  <>
                    <FaCircleCheck className="size-3.5 text-primary" />
                    <span className="text-muted-foreground">
                      {t("stash.meter.qrOk", undefined, lang)}
                    </span>
                  </>
                ) : (
                  <>
                    <FaTriangleExclamation className="size-3.5 text-amber-500" />
                    <span className="text-muted-foreground">
                      {t("stash.meter.qrTooBig", undefined, lang)}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

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
              <p className="mb-3 text-xs text-muted-foreground">
                {t(isShortUrl ? "stash.link.shortHint" : "stash.link.payloadHint", undefined, lang)}
              </p>
              <Button
                variant="outline"
                onClick={handleCopy}
                className="h-12 w-full rounded-xl border-border bg-card text-sm font-semibold text-foreground hover:bg-secondary"
              >
                {copyState === "copied"
                  ? t("stash.copy.done", undefined, lang)
                  : t("stash.copy.idle", undefined, lang)}
              </Button>
              <Button
                variant="outline"
                onClick={handleSaveLocally}
                disabled={localSaveState === "saving"}
                className="mt-2 h-12 w-full rounded-xl border-border bg-card text-sm font-semibold text-foreground hover:bg-secondary"
              >
                {localSaveLabel}
              </Button>
              {!isShortUrl && (
                <>
                  <Button
                    variant="outline"
                    onClick={handleGetShortLink}
                    disabled={shortenState === "shortening"}
                    className="mt-2 h-12 w-full rounded-xl border-border bg-card text-sm font-semibold text-foreground hover:bg-secondary"
                  >
                    {shortenState === "shortening"
                      ? t("stash.shorten.generating", undefined, lang)
                      : shortenState === "error"
                        ? t("stash.shorten.error", undefined, lang)
                        : t("stash.shorten.idle", undefined, lang)}
                  </Button>
                  {shortenState === "error" && (
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      {t("stash.link.shortenFailed", undefined, lang)}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </SharedCardContent>
      </SharedCard>

      <SharedButtonArea>
        <PrimaryButton onClick={handleSave} disabled={saveState === "generating"}>
          {saveLabel}
        </PrimaryButton>
        <OutlineButton onClick={handleClear}>{t("stash.clear", undefined, lang)}</OutlineButton>
      </SharedButtonArea>
    </div>
  );
}
