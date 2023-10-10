#!/usr/bin/env node
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['tmp/build/polykey.js', 'tmp/build/polykeyWorker.js'],
  bundle: true,
  platform: 'node',
  outdir: 'dist',
  external: [
    '../Polykey/node_modules/@matrixai/db/*',
    '../Polykey/node_modules/@matrixai/quic/*',
    '../Polykey/node_modules/sodium-native/*',
    '../Polykey/node_modules/fd-lock/*',
  ],
  treeShaking: true,
  // Minify: true, // breaks the program, look into more.
  // sourcemap: 'inline', // Bloats the final size significanly
});
