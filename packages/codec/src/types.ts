export interface SharePayload {
  v: number; // Schema version
  e: number; // Expiry timestamp (Unix seconds)
  i: [string, string][]; // Items: [url, title][]
}

export interface TabInfo {
  url: string;
  title: string;
}

export interface EncodingResult {
  url: string;
  itemCount: number;
  truncated: boolean;
}

export interface DecodedPayload {
  version: number;
  expiry: number;
  items: [string, string][];
  isExpired: boolean;
}

export class PayloadDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadDecodeError";
  }
}
