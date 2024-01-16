#!/usr/bin/env node

const os = require('os');
const fs = require('fs');
const path = require('path');
const process = require('process');
const childProcess = require('child_process');
const esbuild = require('esbuild');
const packageJSON = require('../package.json');

const platform = os.platform();

/* eslint-disable no-console */
async function main(argv = process.argv) {
  argv = argv.slice(2);
  const projectRoot = path.join(__dirname, '..');
  const buildPath = path.join(projectRoot, 'build');
  const distPath = path.join(projectRoot, 'dist');
  await fs.promises.rm(distPath, {
    recursive: true,
    force: true,
  });
  const buildArgs = ['-p', './tsconfig.build.json', ...argv];
  console.error('Running tsc:');
  console.error(['tsc', ...buildArgs].join(' '));
  childProcess.execFileSync('tsc', buildArgs, {
    stdio: ['inherit', 'inherit', 'inherit'],
    windowsHide: true,
    encoding: 'utf-8',
    shell: platform === 'win32' ? true : false,
  });
  // This specifies import paths that is left as an external require
  // This is kept to packages that have a native binding
  const externalDependencies = Object.keys(packageJSON.optionalDependencies);
  const esbuildOptions = {
    // 2 entrypoints, the main script and the worker script
    entryPoints: [
      path.join(buildPath, 'polykey.js'),
      path.join(buildPath, 'polykeyWorker.js'),
    ],
    bundle: true,
    platform: 'node',
    outdir: distPath,
    external: externalDependencies,
    treeShaking: true,
    // External source map for debugging
    sourcemap: true,
    // Minify and keep the original names
    minify: true,
    keepNames: true,
    define: {
      'process.env.COMMIT_HASH': `${JSON.stringify(process.env.COMMIT_HASH)}`,
    },
  };
  console.error('Running esbuild:');
  console.error(esbuildOptions);
  await esbuild.build(esbuildOptions);
}
/* eslint-enable no-console */

void main();
