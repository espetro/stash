// Ambient declarations for the gauge-js runtime API. The runner injects
// these as globals / via "@getgauge/cli" at runtime (the npm package is
// only a binary wrapper without types).
declare module "@getgauge/cli" {
  export interface StepOptions {
    continueOnFailure?: boolean;
    tags?: string[];
  }
  export function step(
    text: string,
    impl: (...args: unknown[]) => unknown | Promise<unknown>,
    options?: StepOptions,
  ): void;
  export function beforeSuite(impl: () => unknown): void;
  export function beforeSpec(impl: () => unknown): void;
  export function beforeScenario(impl: () => unknown): void;
  export function beforeStep(impl: () => unknown): void;
  export function afterStep(impl: () => unknown): void;
  export function afterScenario(impl: () => unknown): void;
  export function afterSpec(impl: () => unknown): void;
  export function afterSuite(impl: () => unknown): void;
}
