import { chromium } from 'playwright';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

const VIEWER_URL = 'http://localhost:4321/s/#p=eJyrVipTsjLUUUoFkubmxkZmFgZGRjpKmUpW0dFKGSUlBcVW-vopqWV6Jfn6SjpKLq5hCs75ubmleZkllUqxOgg15eXlejmJZYl56aWJRSmZiXrJ-bkgHYdn5ZRk5iYWK-Tll2QmZyYW6ygkJpeUJuZkpiSmKGCakZ6fn56TCtPtDuYpxcbWAgB-4je3';
const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots');
const SCREENSHOT_PATH = path.join(SCREENSHOT_DIR, 'store-screenshot.png');
const VIEWPORT = { width: 1280, height: 800 };

function waitForServer(url: string, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else {
          retry();
        }
      }).on('error', () => {
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - start > timeout) {
        reject(new Error(`Server not ready at ${url} after ${timeout}ms`));
      } else {
        setTimeout(check, 500);
      }
    };
    check();
  });
}

async function generateScreenshot(): Promise<void> {
  // Create screenshots directory
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  console.log('Starting viewer dev server...');
  const devServer = spawn('pnpm', ['dev:view'], {
    detached: false,
    stdio: 'pipe',
    shell: true
  });

  devServer.stdout?.on('data', (data: Buffer) => {
    process.stdout.write(`[server] ${data}`);
  });
  devServer.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(`[server] ${data}`);
  });

  try {
    console.log('Waiting for server to be ready...');
    await waitForServer('http://localhost:4321', 30000);
    console.log('Server ready. Launching browser...');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: VIEWPORT
    });
    const page = await context.newPage();

    console.log('Navigating to viewer URL...');
    await page.goto(VIEWER_URL, { waitUntil: 'networkidle' });

    // Wait for tab cards to render
    console.log('Waiting for tab cards...');
    await page.waitForSelector('.tab-item', { timeout: 15000 });
    console.log('Tab cards visible. Taking screenshot...');

    await page.screenshot({
      path: SCREENSHOT_PATH,
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height }
    });

    console.log(`Screenshot saved to: ${SCREENSHOT_PATH}`);
    await browser.close();
  } finally {
    console.log('Stopping dev server...');
    devServer.kill('SIGTERM');
    // Give it a moment to clean up
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

generateScreenshot().catch((err) => {
  console.error('Screenshot generation failed:', err);
  process.exit(1);
});
