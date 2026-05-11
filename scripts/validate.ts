import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * * Runs all validation steps and just shows a simple ✅ (OK), ⚠️ (WARN), or ❌ (FAIL) for each validation check.
 */
import { $ } from "zx";
import task from "tasuku";

interface TaskError {
  errors?: string;
  warnings?: string;
}

interface Task {
  display: string;
  cmd: string;
  filter?: string;
  onError?: (_: { stdout: string; stderr: string }) => TaskError;
  runAtRoot?: boolean;
}

const defaultOnError = ({ stderr }: { stderr: string }): TaskError => {
  return { errors: stderr };
};

const getLintErrors = ({ stdout, stderr }: { stdout: string; stderr: string }): TaskError => {
  const output = stdout + stderr;
  const lintResults = [...output.matchAll(/Found (\d+) warnings? and (\d+) errors?/g)];

  if (lintResults.length > 0) {
    const totalErrors = lintResults.reduce((sum, match) => sum + parseInt(match[2]!, 10), 0);
    const totalWarnings = lintResults.reduce((sum, match) => sum + parseInt(match[1]!, 10), 0);

    if (totalErrors === 0 && totalWarnings > 0) {
      return { warnings: `⚠️  (${totalWarnings} linter warning${totalWarnings === 1 ? "" : "s"})` };
    }
  }

  return {};
};

const TASKS: Task[] = [
  { display: "TypeScript", cmd: "tscheck" },
  { display: "Lint", cmd: "lint", onError: getLintErrors },
  { display: "Format", cmd: "format" },
];

const quietTaskRunner = async ({ cmd, filter, onError = defaultOnError, runAtRoot }: Task) => {
  try {
    let turboCmd;
    if (runAtRoot) {
      turboCmd = $`pnpm run ${cmd}`.quiet();
    } else {
      turboCmd = filter
        ? $`pnpm turbo ${cmd} --filter=${filter}`.quiet()
        : $`pnpm turbo ${cmd}`.quiet();
    }

    await turboCmd;
  } catch (error) {
    if (error instanceof Error && "stdout" in error && "stderr" in error) {
      return onError(error as Error & { stdout: string; stderr: string });
    }
    throw error;
  }
};

const getPackageName = async (cwd: string) => {
  const cwdPath = resolve(cwd);
  const pkgJson = JSON.parse(await readFile(`${cwdPath}/package.json`, "utf-8"));
  return pkgJson.name as string;
};

const getInput = async () => {
  const {
    values: { cwd },
  } = parseArgs({
    args: process.argv.slice(2),
    options: {
      cwd: { type: "string" },
    },
  });

  return cwd ? await getPackageName(cwd) : undefined;
};

const main = async () => {
  const filter = await getInput();

  try {
    await task.group(
      (runner) =>
        TASKS.map((_) =>
          runner(_.display, async ({ setWarning }) => {
            const result = await quietTaskRunner({ ..._, filter });

            if (result?.warnings) {
              setWarning(result.warnings);
              return;
            }

            if (result?.errors) {
              throw new Error(`Failed with exit code 1`);
            }
          }),
        ),
      { concurrency: 1, stopOnError: false },
    );
  } catch {
    // Allow tasuku to finish rendering before exiting
    await new Promise((resolve) => setTimeout(resolve, 100));
    process.exit(1);
  }
};

main().catch(() => {
  process.exit(1);
});
