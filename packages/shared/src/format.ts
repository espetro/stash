const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

export function formatRemainingTime(remainingMs: number): string {
  if (remainingMs <= 0) {
    return "Expired";
  }

  if (remainingMs > TEN_YEARS_MS) {
    return "Never expires";
  }

  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days >= 1) {
    if (remainingHours > 0) {
      return `Expires in ${days}d ${remainingHours}h`;
    }
    return `Expires in ${days}d`;
  }

  if (hours > 0) {
    return `Expires in ${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `Expires in ${minutes}m`;
  }

  return "Expires in < 1m";
}

export function formatRemainingTimeSeconds(remainingSeconds: number): string {
  return formatRemainingTime(remainingSeconds * 1000);
}

export function formatDateLabel(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const entryDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor(
    (today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (diffDays === 0) {
    return `Today, ${timeStr}`;
  } else if (diffDays === 1) {
    return `Yesterday, ${timeStr}`;
  } else {
    const dateStr = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `${dateStr}, ${timeStr}`;
  }
}

export function estimateCreatedAt(expiryTimestampSeconds: number): number {
  const now = Math.floor(Date.now() / 1000);
  const DEFAULT_EXPIRY_HOURS = 24;
  const estimated = expiryTimestampSeconds - DEFAULT_EXPIRY_HOURS * 3600;
  return Math.min(estimated, now);
}

export function buildCaption(
  count: number,
  expiryTimestampSeconds: number
): string {
  const createdAt = estimateCreatedAt(expiryTimestampSeconds);
  const parts = [
    `${count} tab${count !== 1 ? "s" : ""}`,
    `Created ${formatDateLabel(createdAt)}`,
    formatRemainingTimeSeconds(expiryTimestampSeconds - Math.floor(Date.now() / 1000)),
  ];
  return parts.join(" · ");
}
