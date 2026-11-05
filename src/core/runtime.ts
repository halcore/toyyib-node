// Runtime detection without Node types: `process`, `Deno` and `window` may not
// exist, so every lookup goes through `globalThis`.

interface RuntimeGlobals {
  process?: { env?: Record<string, string | undefined> };
  Deno?: { env?: { get?(name: string): string | undefined } };
  window?: { document?: unknown };
  navigator?: { product?: string };
}

const runtime = globalThis as RuntimeGlobals;

/**
 * Reads an environment variable from `process.env` or `Deno.env`. Never throws:
 * a runtime with no environment, or one that refuses access, gives `undefined`.
 */
export function readEnv(name: string): string | undefined {
  try {
    const value = runtime.process?.env?.[name];
    if (value !== undefined) return value;
  } catch {
    // Deno without --allow-env throws on process.env access.
  }
  try {
    return runtime.Deno?.env?.get?.(name);
  } catch {
    return undefined;
  }
}

/** True in a browser page or React Native, where a secret key would be exposed. */
export function isBrowserLike(): boolean {
  if (typeof runtime.window?.document !== 'undefined') return true;
  return runtime.navigator?.product === 'ReactNative';
}
