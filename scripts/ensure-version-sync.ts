import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WORKSPACE_DIRS = ["apps", "packages"];

async function getVersion(path: string): Promise<string | undefined> {
  try {
    const pkg = JSON.parse(await readFile(path, "utf-8"));
    return pkg.version;
  } catch {
    return undefined;
  }
}

async function main() {
  const rootPkgPath = resolve(ROOT, "package.json");
  const rootVersion = await getVersion(rootPkgPath);

  if (!rootVersion) {
    console.error("❌ Root package.json has no version field");
    process.exit(1);
  }

  const mismatches: string[] = [];

  for (const dir of WORKSPACE_DIRS) {
    const dirPath = resolve(ROOT, dir);
    let entries: string[];
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgPath = resolve(dirPath, entry.name, "package.json");
      const version = await getVersion(pkgPath);
      if (version === undefined) continue;
      if (version !== rootVersion) {
        mismatches.push(`  ${dir}/${entry.name}: ${version} (expected ${rootVersion})`);
      }
    }
  }

  if (mismatches.length > 0) {
    console.error("❌ Version mismatch detected:");
    mismatches.forEach((m) => console.error(m));
    console.error("\nRun: pnpm run ensure-version-sync --fix  (not yet implemented)");
    process.exit(1);
  }

  console.log(`✅ All workspace packages are synced to v${rootVersion}`);
}

main().catch(() => process.exit(1));
