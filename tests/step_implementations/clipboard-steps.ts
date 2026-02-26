import { step } from '@getgauge/cli';
import { getCurrentPage } from './common-steps';
import { 
  decodeShareUrl, 
  extractPayloadFromUrl,
  PayloadDecodeError 
} from '../helpers/decoder-helper';
import { isValidBase64url } from '../helpers/encoder-helper';

/**
 * Read clipboard content
 * Note: Playwright cannot directly read clipboard content for security reasons
 * This step simulates clipboard operations for testing purposes
 */
step('Read clipboard content', async () => {
  // In a real scenario, we would read from the clipboard
  // For testing purposes, we'll use a global variable
  const clipboardContent = (global as any)['shareLink'];
  if (!clipboardContent) {
    throw new Error('No clipboard content available');
  }
  (global as any)['clipboardContent'] = clipboardContent;
});

/**
 * Verify URL format and structure
 */
step('Verify URL format and structure', async () => {
  const clipboardContent = (global as any)['clipboardContent'];
  
  if (!clipboardContent) {
    throw new Error('No clipboard content available');
  }
  
  // Verify URL structure
  if (!clipboardContent.startsWith('http://localhost:4321/s/#p=')) {
    throw new Error('URL does not start with expected prefix');
  }
  
  // Verify fragment parameter exists
  if (!clipboardContent.includes('#p=')) {
    throw new Error('URL does not contain fragment parameter');
  }
});

/**
 * Decode URL fragment
 */
step('Decode URL fragment', async () => {
  const clipboardContent = (global as any)['clipboardContent'];
  
  if (!clipboardContent) {
    throw new Error('No clipboard content available');
  }
  
  try {
    const payload = decodeShareUrl(clipboardContent);
    (global as any)['decodedPayload'] = payload;
  } catch (e) {
    throw new Error(`Failed to decode URL fragment: ${e}`);
  }
});

/**
 * Store decoded payload for assertions
 */
step('Store decoded payload for assertions', async () => {
  const decodedPayload = (global as any)['decodedPayload'];
  
  if (!decodedPayload) {
    throw new Error('No decoded payload available');
  }
  
  // Payload is already stored in global variable
});

/**
 * Verify base64url encoding validity
 */
step('Verify base64url encoding validity', async () => {
  const clipboardContent = (global as any)['clipboardContent'];
  
  if (!clipboardContent) {
    throw new Error('No clipboard content available');
  }
  
  // Extract payload from URL
  const match = clipboardContent.match(/#p=([A-Za-z0-9_-]+)$/);
  if (!match) {
    throw new Error('Invalid URL format');
  }
  
  const payload = match[1];
  
  if (!isValidBase64url(payload)) {
    throw new Error('Invalid base64url encoding');
  }
});

/**
 * Assert clipboard content is a valid URL
 */
step('The clipboard content should be a valid URL', async () => {
  const clipboardContent = (global as any)['clipboardContent'];
  
  if (!clipboardContent) {
    throw new Error('No clipboard content available');
  }
  
  try {
    new URL(clipboardContent);
  } catch (e) {
    throw new Error('Clipboard content is not a valid URL');
  }
});

/**
 * Assert clipboard content contains only base64url characters
 */
step('The clipboard content should contain only base64url characters <chars>', async (chars: string) => {
  const clipboardContent = (global as any)['clipboardContent'];
  
  if (!clipboardContent) {
    throw new Error('No clipboard content available');
  }
  
  // Extract payload from URL
  const match = clipboardContent.match(/#p=([A-Za-z0-9_-]+)$/);
  if (!match) {
    throw new Error('Invalid URL format');
  }
  
  const payload = match[1];
  const validChars = new Set(chars.split(''));
  
  for (const char of payload) {
    if (!validChars.has(char)) {
      throw new Error(`Invalid character "${char}" in base64url encoding`);
    }
  }
});

/**
 * Assert clipboard content does not contain padding characters
 */
step('The clipboard content should not contain padding characters <padding>', async (padding: string) => {
  const clipboardContent = (global as any)['clipboardContent'];
  
  if (!clipboardContent) {
    throw new Error('No clipboard content available');
  }
  
  if (clipboardContent.includes(padding)) {
    throw new Error(`Clipboard content should not contain "${padding}"`);
  }
});

/**
 * Assert decoded payload has specified version
 */
step('The decoded payload should have version "v": <version>', async (versionStr: string) => {
  const version = parseInt(versionStr, 10);
  const decodedPayload = (global as any)['decodedPayload'];
  
  if (!decodedPayload) {
    throw new Error('No decoded payload available');
  }
  
  if (decodedPayload.version !== version) {
    throw new Error(`Expected version ${version}, but got ${decodedPayload.version}`);
  }
});

/**
 * Assert decoded payload has future expiry
 */
step('The decoded payload should have an expiry timestamp in the future', async () => {
  const decodedPayload = (global as any)['decodedPayload'];
  
  if (!decodedPayload) {
    throw new Error('No decoded payload available');
  }
  
  const now = Math.floor(Date.now() / 1000);
  
  if (decodedPayload.expiry < now) {
    throw new Error('Expiry timestamp is in the past');
  }
});

/**
 * Assert expiry is approximately specified hours from now
 */
step('The expiry should be approximately <hours> hours from now', async (hoursStr: string) => {
  const hours = parseInt(hoursStr, 10);
  const decodedPayload = (global as any)['decodedPayload'];
  
  if (!decodedPayload) {
    throw new Error('No decoded payload available');
  }
  
  const now = Math.floor(Date.now() / 1000);
  const expectedExpiry = now + (hours * 3600);
  const tolerance = 60; // 1 minute tolerance
  
  const difference = Math.abs(decodedPayload.expiry - expectedExpiry);
  
  if (difference > tolerance) {
    throw new Error(`Expiry timestamp is not approximately ${hours} hours from now`);
  }
});

/**
 * Assert decoded URL preserves special characters
 */
step('The decoded URL should preserve special characters', async () => {
  const decodedPayload = (global as any)['decodedPayload'];
  
  if (!decodedPayload) {
    throw new Error('No decoded payload available');
  }
  
  // Check if any URL contains special characters
  const hasSpecialChars = decodedPayload.items.some((item: [string, string]) => {
    const url = item[0];
    return url.includes('&') || url.includes('#') || url.includes('?');
  });
  
  if (!hasSpecialChars) {
    throw new Error('No special characters found in decoded URLs');
  }
});

/**
 * Assert decoded title preserves special characters
 */
step('The decoded title should preserve special characters', async () => {
  const decodedPayload = (global as any)['decodedPayload'];
  
  if (!decodedPayload) {
    throw new Error('No decoded payload available');
  }
  
  // Check if any title contains special characters
  const hasSpecialChars = decodedPayload.items.some((item: [string, string]) => {
    const title = item[1];
    return title.includes('&') || title.includes('#') || title.includes('?');
  });
  
  if (!hasSpecialChars) {
    throw new Error('No special characters found in decoded titles');
  }
});

/**
 * Assert decoded URL preserves Unicode characters
 */
step('The decoded URL should preserve Unicode characters', async () => {
  const decodedPayload = (global as any)['decodedPayload'];
  
  if (!decodedPayload) {
    throw new Error('No decoded payload available');
  }
  
  // Check if any URL contains Unicode characters
  const hasUnicode = decodedPayload.items.some((item: [string, string]) => {
    const url = item[0];
    for (const char of url) {
      if (char.charCodeAt(0) > 127) {
        return true;
      }
    }
    return false;
  });
  
  if (!hasUnicode) {
    throw new Error('No Unicode characters found in decoded URLs');
  }
});

/**
 * Assert decoded title preserves Unicode characters
 */
step('The decoded title should preserve Unicode characters', async () => {
  const decodedPayload = (global as any)['decodedPayload'];
  
  if (!decodedPayload) {
    throw new Error('No decoded payload available');
  }
  
  // Check if any title contains Unicode characters
  const hasUnicode = decodedPayload.items.some((item: [string, string]) => {
    const title = item[1];
    for (const char of title) {
      if (char.charCodeAt(0) > 127) {
        return true;
      }
    }
    return false;
  });
  
  if (!hasUnicode) {
    throw new Error('No Unicode characters found in decoded titles');
  }
});

/**
 * Assert decoded title is truncated to 30 characters or less
 */
step('The decoded title should be truncated to <maxChars> characters or less', async (maxCharsStr: string) => {
  const maxChars = parseInt(maxCharsStr, 10);
  const decodedPayload = (global as any)['decodedPayload'];
  
  if (!decodedPayload) {
    throw new Error('No decoded payload available');
  }
  
  // Check if all titles are within the character limit
  for (const item of decodedPayload.items) {
    const title = item[1];
    if (title.length > maxChars) {
      throw new Error(`Title "${title}" exceeds ${maxChars} characters`);
    }
  }
});

/**
 * Assert decoded payload contains specified number of items
 */
step('The decoded payload should contain <count> items', async (countStr: string) => {
  const count = parseInt(countStr, 10);
  const decodedPayload = (global as any)['decodedPayload'];
  
  if (!decodedPayload) {
    throw new Error('No decoded payload available');
  }
  
  if (decodedPayload.items.length !== count) {
    throw new Error(`Expected ${count} items, but got ${decodedPayload.items.length}`);
  }
});

/**
 * Assert decoded payload contains specified URL
 */
step('The decoded payload should contain URL <url>', async (url: string) => {
  const decodedPayload = (global as any)['decodedPayload'];
  
  if (!decodedPayload) {
    throw new Error('No decoded payload available');
  }
  
  const hasUrl = decodedPayload.items.some((item: [string, string]) => {
    return item[0] === url;
  });
  
  if (!hasUrl) {
    throw new Error(`URL "${url}" not found in decoded payload`);
  }
});

/**
 * Assert decoded payload contains specified title
 */
step('The decoded payload should contain title <title>', async (title: string) => {
  const decodedPayload = (global as any)['decodedPayload'];
  
  if (!decodedPayload) {
    throw new Error('No decoded payload available');
  }
  
  const hasTitle = decodedPayload.items.some((item: [string, string]) => {
    return item[1] === title;
  });
  
  if (!hasTitle) {
    throw new Error(`Title "${title}" not found in decoded payload`);
  }
});

/**
 * Assert decoded payload items are [url, title] tuples
 */
step('The decoded payload items should be [url, title] tuples', async () => {
  const decodedPayload = (global as any)['decodedPayload'];
  
  if (!decodedPayload) {
    throw new Error('No decoded payload available');
  }
  
  for (const item of decodedPayload.items) {
    if (!Array.isArray(item) || item.length !== 2) {
      throw new Error('Item is not a [url, title] tuple');
    }
    if (typeof item[0] !== 'string' || typeof item[1] !== 'string') {
      throw new Error('Item does not contain string url and title');
    }
  }
});

/**
 * Assert clipboard content starts with expected prefix
 */
step('The clipboard content should start with <prefix>', async (prefix: string) => {
  const clipboardContent = (global as any)['clipboardContent'];
  
  if (!clipboardContent) {
    throw new Error('No clipboard content available');
  }
  
  if (!clipboardContent.startsWith(prefix)) {
    throw new Error(`Clipboard content should start with "${prefix}"`);
  }
});

/**
 * Assert clipboard content contains fragment parameter
 */
step('The clipboard content should contain the fragment parameter <param>', async (param: string) => {
  const clipboardContent = (global as any)['clipboardContent'];
  
  if (!clipboardContent) {
    throw new Error('No clipboard content available');
  }
  
  if (!clipboardContent.includes(param)) {
    throw new Error(`Clipboard content should contain "${param}"`);
  }
});

/**
 * Assert clipboard content contains encoded data
 */
step('The clipboard content should contain encoded data', async () => {
  const clipboardContent = (global as any)['clipboardContent'];
  
  if (!clipboardContent) {
    throw new Error('No clipboard content available');
  }
  
  // Check if URL contains encoded payload
  const match = clipboardContent.match(/#p=[A-Za-z0-9_-]+$/);
  if (!match) {
    throw new Error('Clipboard content does not contain encoded data');
  }
});

/**
 * Assert clipboard content contains encoded data for specified number of tabs
 */
step('The clipboard content should contain encoded data for <count> tabs', async (countStr: string) => {
  const count = parseInt(countStr, 10);
  
  // Decode the payload to verify the number of tabs
  const clipboardContent = (global as any)['clipboardContent'];
  
  if (!clipboardContent) {
    throw new Error('No clipboard content available');
  }
  
  try {
    const decoded = decodeShareUrl(clipboardContent);
    
    if (decoded.items.length !== count) {
      throw new Error(`Expected encoded data for ${count} tabs, but got ${decoded.items.length}`);
    }
  } catch (e) {
    throw new Error(`Failed to decode clipboard content: ${e}`);
  }
});

/**
 * Store clipboard content as variable
 */
step('Store clipboard content as <variableName>', async (variableName: string) => {
  const clipboardContent = (global as any)['clipboardContent'];
  
  if (!clipboardContent) {
    throw new Error('No clipboard content available');
  }
  
  (global as any)[variableName] = clipboardContent;
});

/**
 * Assert variable equals clipboard content
 */
step('Variable <variableName> should equal clipboard content', async (variableName: string) => {
  const variableValue = (global as any)[variableName];
  const clipboardContent = (global as any)['clipboardContent'];
  
  if (variableValue !== clipboardContent) {
    throw new Error(`Variable "${variableName}" should equal clipboard content`);
  }
});

/**
 * Extract payload from URL
 */
step('Extract payload from URL', async () => {
  const clipboardContent = (global as any)['clipboardContent'];
  
  if (!clipboardContent) {
    throw new Error('No clipboard content available');
  }
  
  try {
    const payload = extractPayloadFromUrl(clipboardContent);
    (global as any)['extractedPayload'] = payload;
  } catch (e) {
    throw new Error(`Failed to extract payload from URL: ${e}`);
  }
});

/**
 * Assert extracted payload is valid base64url
 */
step('The extracted payload should be valid base64url', async () => {
  const extractedPayload = (global as any)['extractedPayload'];
  
  if (!extractedPayload) {
    throw new Error('No extracted payload available');
  }
  
  if (!isValidBase64url(extractedPayload)) {
    throw new Error('Extracted payload is not valid base64url');
  }
});

/**
 * Assert clipboard content length is less than or equal to budget
 */
step('The clipboard content length should be less than or equal to <budget>', async (budgetStr: string) => {
  const budget = parseInt(budgetStr, 10);
  const clipboardContent = (global as any)['clipboardContent'];
  
  if (!clipboardContent) {
    throw new Error('No clipboard content available');
  }
  
  if (clipboardContent.length > budget) {
    throw new Error(`Clipboard content length ${clipboardContent.length} exceeds budget ${budget}`);
  }
});

/**
 * Assert clipboard content is a valid viewer URL
 */
step('The clipboard content should be a valid viewer URL', async () => {
  const clipboardContent = (global as any)['clipboardContent'];
  
  if (!clipboardContent) {
    throw new Error('No clipboard content available');
  }
  
  // Verify URL structure
  if (!clipboardContent.startsWith('http://localhost:4321/s/#p=')) {
    throw new Error('Clipboard content is not a valid viewer URL');
  }
});

/**
 * Assert clipboard content contains no chrome:// URLs
 */
step('The clipboard content should contain no chrome:// URLs', async () => {
  const clipboardContent = (global as any)['clipboardContent'];
  
  if (!clipboardContent) {
    throw new Error('No clipboard content available');
  }
  
  try {
    const decoded = decodeShareUrl(clipboardContent);
    
    const hasChromeUrl = decoded.items.some((item: [string, string]) => {
      return item[0].startsWith('chrome://');
    });
    
    if (hasChromeUrl) {
      throw new Error('Clipboard content contains chrome:// URLs');
    }
  } catch (e) {
    throw new Error(`Failed to decode clipboard content: ${e}`);
  }
});

/**
 * Assert decoded payload has valid structure
 */
step('The decoded payload should have valid structure', async () => {
  const decodedPayload = (global as any)['decodedPayload'];
  
  if (!decodedPayload) {
    throw new Error('No decoded payload available');
  }
  
  // Verify required fields
  if (typeof decodedPayload.version !== 'number') {
    throw new Error('Payload missing version field');
  }
  
  if (typeof decodedPayload.expiry !== 'number') {
    throw new Error('Payload missing expiry field');
  }
  
  if (!Array.isArray(decodedPayload.items)) {
    throw new Error('Payload missing items array');
  }
});

/**
 * Assert decoded payload is not expired
 */
step('The decoded payload should not be expired', async () => {
  const decodedPayload = (global as any)['decodedPayload'];
  
  if (!decodedPayload) {
    throw new Error('No decoded payload available');
  }
  
  if (decodedPayload.isExpired) {
    throw new Error('Payload is expired');
  }
});

/**
 * Assert decoded payload is expired
 */
step('The decoded payload should be expired', async () => {
  const decodedPayload = (global as any)['decodedPayload'];
  
  if (!decodedPayload) {
    throw new Error('No decoded payload available');
  }
  
  if (!decodedPayload.isExpired) {
    throw new Error('Payload is not expired');
  }
});
