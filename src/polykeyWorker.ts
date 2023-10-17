/**
 * This re-exports the `polykeyWorker` script.
 * When bundling, the loading for the worker script is relative to the main script directory.
 * This ensures that the worker script can be referenced by the bundler as an entry point.
 * @module
 */

export * from 'polykey/dist/workers/polykeyWorker';
