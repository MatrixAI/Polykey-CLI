#!/usr/bin/env node

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import process from 'node:process';
import childProcess from 'node:child_process';
import esbuild from 'esbuild';
import config from 'polykey/config.js';
import packageJSON from '../package.json' assert { type: 'json' };

const projectPath = path.dirname(
  path.dirname(url.fileURLToPath(import.meta.url)),
);

const platform = os.platform();

/* eslint-disable no-console */
async function main(argv = process.argv) {
  argv = argv.slice(2);
  const buildPath = path.join(projectPath, 'build');
  const distPath = path.join(projectPath, 'dist');
  const gitPath = process.env.GIT_DIR ?? path.join(projectPath, '.git');
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
  // This collects the build metadata and adds it to the build folder so that dynamic imports to it will resolve correctly.
  let gitHead = process.env.COMMIT_HASH;
  if (gitHead == null) {
    gitHead = await fs.promises.readFile(path.join(gitPath, 'HEAD'), 'utf-8');
    if (gitHead.startsWith('ref: ')) {
      const refPath = gitHead.slice(5).trim();
      gitHead = await fs.promises
        .readFile(path.join(gitPath, refPath), 'utf-8')
        .then((ref) => ref.trim());
    }
  }
  const buildJSON = {
    // All of the keys and values need to be strings!
    // This is because they are used for the labels on the docker image.
    versionMetadata: {
      version: packageJSON.version,
      commitHash: gitHead,
      libVersion: config.version,
      libSourceVersion: config.sourceVersion,
      libStateVersion: config.stateVersion.toString(),
      libNetworkVersion: config.networkVersion.toString(),
    },
  };
  console.error('Writing build metadata (build.json):');
  console.error(buildJSON);
  await fs.promises.writeFile(
    path.join(buildPath, 'build.json'),
    JSON.stringify(buildJSON, null, 2),
  );
  // This specifies import paths that is left as an external require
  // This is kept to packages that have a native binding
  const externalDependencies = Object.keys(packageJSON.optionalDependencies);
  const esbuildOptions = {
    // 2 entrypoints, the main script and the worker script
    entryPoints: [
      path.join(buildPath, 'polykey.js'),
      path.join(buildPath, 'polykeyWorkerManifest.js'),
    ],
    sourceRoot: buildPath,
    bundle: true,
    platform: 'node',
    outdir: distPath,
    external: externalDependencies,
    treeShaking: true,
    // External source map for debugging
    sourcemap: true,
    // Minify and keep the original names
    minify: false,
    keepNames: true,
    // Supporting ESM
    format: 'esm',
    inject: [path.join(projectPath, './shims/require-shim.mjs')],
    outExtension: { '.js': '.mjs' },
  };
  console.error('Running esbuild:');
  console.error(esbuildOptions);
  await esbuild.build(esbuildOptions);
  // Rename worker script
  console.error('Renaming worker script');
  childProcess.execFileSync(
    'mv',
    ['dist/polykeyWorkerManifest.mjs', 'dist/polykeyWorkerManifest.js'],
    {
      stdio: ['inherit', 'inherit', 'inherit'],
      windowsHide: true,
      encoding: 'utf-8',
      shell: platform === 'win32' ? true : false,
    },
  );
  childProcess.execFileSync(
    'mv',
    ['dist/polykeyWorkerManifest.mjs.map', 'dist/polykeyWorkerManifest.js.map'],
    {
      stdio: ['inherit', 'inherit', 'inherit'],
      windowsHide: true,
      encoding: 'utf-8',
      shell: platform === 'win32' ? true : false,
    },
  );
}
/* eslint-enable no-console */

void main();
