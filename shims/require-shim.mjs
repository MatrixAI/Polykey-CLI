/**
 * This shim replaces the `require` in the global scope.
 * ESM does not provide a global `require` that is synchronous and can be used dynamically.
 * Some libraries that support ESM still use `require` which is causing problems in esbuild.
 */
import { createRequire } from 'node:module';
// eslint-disable-next-line no-global-assign
require = createRequire(import.meta.url);
