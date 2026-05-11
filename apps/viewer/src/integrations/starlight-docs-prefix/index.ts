import { mkdir, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { join, relative, dirname, basename } from 'node:path';
import type { AstroIntegration } from 'astro';

export interface StarlightDocsPrefixOptions {
  prefix?: string;
  docsSlugs?: string[];
  siteOrigin?: string;
}

function isStarlightPage(html: string): boolean {
  return /<meta[^>]*name="generator"[^>]*content="Starlight/i.test(html);
}

function rewriteLinksInHtml(
  html: string,
  prefix: string,
  docsSlugs: string[],
  siteOrigin?: string
): string {
  const docsSlugPattern = docsSlugs.join('|');

  const hrefPattern = new RegExp(`href="\\/(?<path>${docsSlugPattern})(?:\\/)?(?<quote>")`, 'g');
  let result = html.replace(hrefPattern, `href="${prefix}/$<path>/$<quote>`);

  if (siteOrigin) {
    const originEscaped = siteOrigin.replace(/\//g, '\\/');
    const absUrlPattern = new RegExp(
      `(?<attribute>(?:content|href)=")${originEscaped}/(?<path>${docsSlugPattern})(?:/)?(?<suffix>")`,
      'g'
    );
    result = result.replace(
      absUrlPattern,
      `$<attribute>${siteOrigin}${prefix}/$<path>/$<suffix>`
    );

    const originOnlyPattern = new RegExp(`(?<attribute>content=")${siteOrigin}/(?<suffix>")`, 'g');
    result = result.replace(originOnlyPattern, `$<attribute>${siteOrigin}${prefix}/$<suffix>`);
  }

  return result;
}

async function readFileIfExists(path: string): Promise<string | null> {
  return readFile(path, 'utf-8').catch(() => null);
}

async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getAllFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

export default function starlightDocsPrefix(options: StarlightDocsPrefixOptions = {}): AstroIntegration {
  const { prefix = '/docs', docsSlugs = [], siteOrigin } = options;

  const defaultSlugs = [
    'getting-started',
    'using-extension',
    'customization',
    'sharing-tabs',
    'faq',
    'privacy-and-data',
  ];

  const finalDocsSlugs = docsSlugs.length > 0 ? docsSlugs : defaultSlugs;

  console.log(`\n🔗 Starlight Docs Prefix Integration`);
  console.log(`   Prefix: ${prefix}`);
  console.log(`   Doc slugs: ${finalDocsSlugs.join(', ')}`);

  return {
    name: 'starlight-docs-prefix',
    hooks: {
      'astro:config:setup': ({ injectScript }) => {
        const script = `
(function() {
  const prefix = '${prefix}';
  const docsSlugs = [${finalDocsSlugs.map(s => `'${s}'`).join(', ')}];
  
  function isDocsUrl(url) {
    return docsSlugs.some(slug => url === '/' + slug + '/' || url === '/' + slug);
  }
  
  function rewriteLinks() {
    document.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:')) return;
      if (href.startsWith(prefix + '/')) return;
      if (href === '/') return;
      
      if (isDocsUrl(href)) {
        link.setAttribute('href', prefix + href);
      }
    });
  }
  
  if (window.location.pathname.startsWith(prefix + '/')) {
    rewriteLinks();
    new MutationObserver(rewriteLinks).observe(document.body, { childList: true, subtree: true });
  }
})();
        `;
        injectScript('page', script);
      },

      'astro:server:setup': ({ server }) => {
        console.log(`   Mode: dev`);

        server.middlewares.use((req, res, next) => {
          const url = req.url || '';
          if (url === prefix || url === `${prefix}/`) {
            res.writeHead(302, { Location: `${prefix}/getting-started/` });
            res.end();
            return;
          }
          if (url.startsWith(`${prefix}/`)) {
            req.url = url.slice(prefix.length) || '/';
          }
          next();
        });
      },

      'astro:build:done': async ({ dir }) => {
        console.log(`   Mode: build`);

        const distDir = dir.toString().replace('file://', '');
        const docsDir = join(distDir, 'docs');

        console.log(`   Dist: ${distDir}`);
        console.log(`   Creating docs directory at: ${docsDir}`);

        await mkdir(docsDir, { recursive: true });

        const distFiles = await getAllFiles(distDir);
        const starlightPages: string[] = [];

        for (const filePath of distFiles) {
          if (!filePath.endsWith('.html')) continue;

          const content = await readFileIfExists(filePath);
          if (content && isStarlightPage(content)) {
            starlightPages.push(filePath);
          }
        }

        console.log(`   Found ${starlightPages.length} Starlight pages to move`);

        for (const pagePath of starlightPages) {
          const pageDir = dirname(pagePath);
          const pageRelDir = relative(distDir, pageDir);
          const destDir = join(docsDir, pageRelDir);
          const is404 = basename(pagePath) === '404.html';
          const destPath = join(destDir, is404 ? '404.html' : 'index.html');

          const content = await readFile(pagePath, 'utf-8');
          const rewritten = rewriteLinksInHtml(content, prefix, finalDocsSlugs, siteOrigin);

          await mkdir(destDir, { recursive: true });
          await writeFile(destPath, rewritten, 'utf-8');
          await rm(pagePath, { force: true });
        }

        const pagefindSrc = join(distDir, 'pagefind');
        const pagefindDest = join(docsDir, 'pagefind');

        const pagefindStat = await stat(pagefindSrc).catch(() => null);
        if (pagefindStat?.isDirectory()) {
          console.log(`   Moving pagefind/ -> docs/pagefind/`);

          const pagefindFiles = await getAllFiles(pagefindSrc);
          for (const file of pagefindFiles) {
            const fileDir = dirname(file);
            const fileRelDir = relative(pagefindSrc, fileDir);
            const destDir = join(pagefindDest, fileRelDir);
            const destPath = join(destDir, basename(file));

            await mkdir(destDir, { recursive: true });

            const content = await readFile(file);
            let fileContent = content.toString('utf-8');
            if (file.endsWith('.js') || file.endsWith('.css')) {
              fileContent = rewriteLinksInHtml(fileContent, prefix, finalDocsSlugs, siteOrigin);
            }
            await writeFile(destPath, fileContent);
          }

          await rm(pagefindSrc, { recursive: true, force: true });
        } else {
          console.log(`   No pagefind directory found, skipping`);
        }

        const redirectHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0; url=${prefix}/getting-started/" />
    <link rel="canonical" href="${prefix}/getting-started/" />
  </head>
  <body>
    <p>Redirecting to <a href="${prefix}/getting-started/">Getting Started</a>...</p>
  </body>
</html>`;
        await writeFile(join(docsDir, 'index.html'), redirectHtml, 'utf-8');
        console.log(`   Created docs/index.html redirect`);

        console.log(`   ✅ Starlight docs prefix integration complete`);
        console.log(`   Docs pages now served at: ${prefix}/*\n`);
      },
    },
  };
}
