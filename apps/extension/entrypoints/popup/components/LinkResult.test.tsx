import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LinkResult } from "./LinkResult";

vi.mock("../../../lib/telemetry", () => ({
  recordEvent: vi.fn(),
}));

const createShortLinkMock = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/shortener", () => ({
  createShortLink: createShortLinkMock,
  shortenShareUrl: vi.fn(async (url: string) => {
    const result = await createShortLinkMock(url);
    return result ?? { fallback: true };
  }),
}));

// lean-qr sync component renders an <img>; stub the module pieces we need.
vi.mock("lean-qr", () => ({
  generate: () => ({}),
}));
vi.mock("lean-qr/extras/svg", () => ({
  toSvgDataURL: () => "data:image/svg+xml,",
}));
vi.mock("lean-qr/extras/react", () => ({
  makeSyncComponent: () => () => null,
}));

const PAYLOAD_URL = "https://stash.illo.fyi/#p=abc123";
const SHORT_URL = "https://s.illo.fyi/x1y2";

function renderLink(props: Partial<Parameters<typeof LinkResult>[0]> = {}) {
  return render(
    <LinkResult
      url={PAYLOAD_URL}
      onCopy={vi.fn()}
      isCopied={false}
      itemCount={12}
      tabs={[{ url: "https://example.com", title: "Example" }]}
      {...props}
    />,
  );
}

describe("LinkResult shorten state", () => {
  beforeEach(() => {
    createShortLinkMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides the shorten button when shortenerEnabled is off", () => {
    renderLink({ shortenerEnabled: false });
    expect(screen.queryByText("Shorten link")).toBeNull();
    expect(screen.getByText(/Self-contained link/)).toBeTruthy();
  });

  it("shows payload hint and count line", () => {
    renderLink({ shortenerEnabled: false, expiresLabel: "7 days" });
    expect(screen.getByText("12 items · expires in 7 days")).toBeTruthy();
    expect(screen.getByText(/Self-contained link\./)).toBeTruthy();
  });

  it("shortens and replaces the URL with the short hint", async () => {
    createShortLinkMock.mockResolvedValue({ url: SHORT_URL });
    renderLink({
      shortenerEnabled: true,
      shortenerOrigin: "https://s.illo.fyi",
    });

    fireEvent.click(screen.getByText("Shorten link"));

    await waitFor(() => {
      expect(screen.getByDisplayValue(SHORT_URL)).toBeTruthy();
    });
    expect(
      screen.getByText(
        "Encrypted short link. Only the key in the link can read it; a copy is stored on the shortener for up to 7 days.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Shortened")).toBeTruthy();
    expect(screen.queryByText("Shorten link")).toBeNull();
  });

  it("fails open and keeps the payload link with the failure hint", async () => {
    createShortLinkMock.mockResolvedValue(undefined);
    renderLink({
      shortenerEnabled: true,
      shortenerOrigin: "https://s.illo.fyi",
    });

    fireEvent.click(screen.getByText("Shorten link"));

    await waitFor(() => {
      expect(screen.getByText("Couldn't shorten, using self-contained link.")).toBeTruthy();
    });
    expect(screen.getByDisplayValue(PAYLOAD_URL)).toBeTruthy();
  });

  it("opens the Copy as menu and copies JSON", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderLink({ shortenerEnabled: false });

    fireEvent.click(screen.getByText("Copy as..."));
    const jsonBtn = screen.getByText("JSON");
    fireEvent.click(jsonBtn);

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("https://example.com");
  });
});
