export function formatRemainingTime(expiryTimestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remainingSeconds = expiryTimestamp - now;

  if (remainingSeconds <= 0) {
    return "Expired";
  }

  const TEN_YEARS_SECONDS = 10 * 365 * 24 * 60 * 60;
  if (remainingSeconds > TEN_YEARS_SECONDS) {
    return "Never expires";
  }

  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);

  if (hours > 0) {
    return `Expires in ${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `Expires in ${minutes}m`;
  } else {
    return "Expires in < 1m";
  }
}

export function formatDateLabel(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function estimateCreatedAt(expiryTimestamp: number): number {
  const now = Math.floor(Date.now() / 1000);
  const DEFAULT_EXPIRY_HOURS = 24;
  const estimated = expiryTimestamp - DEFAULT_EXPIRY_HOURS * 3600;
  return Math.min(estimated, now);
}

export function buildCaption(count: number, expiry: number): string {
  const createdAt = estimateCreatedAt(expiry);
  const parts = [
    `${count} tab${count !== 1 ? "s" : ""}`,
    `Created ${formatDateLabel(createdAt)}`,
    formatRemainingTime(expiry),
  ];
  return parts.join(" · ");
}
