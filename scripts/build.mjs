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

/**
 * This plugin intercepts loading of certain imports and replaces their contents.
 * It overrides the import paths for native imports for rocksdb, fd-lock and sodium-native
 */
const nativeNodeModulesPlugin = {
  name: 'native-node-modules',
  setup(build) {
    build.onLoad({ filter: /\.*/, namespace: 'file' }, (args) => {
      const filename = path.basename(args.path);
      if (filename === 'rocksdb.js') {
        return {
          contents: `
            import path from 'node:path';
            import url from 'node:url';
            import nodeGypBuild from 'node-gyp-build';
            const projectPath = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'node_modules', '@matrixai', 'db');
            const rocksdb = nodeGypBuild(projectPath);
            export default rocksdb;
            //# sourceMappingURL=rocksdb.js.map
         `,
          loader: 'js',
        };
      }
      if (args.path.endsWith('fd-lock/index.js')) {
        return {
          contents: `
            const path = require('path');
            const binding = require('node-gyp-build')(path.join(__dirname, '..', 'node_modules', 'fd-lock'))
            
            lock.unlock = unlock
            module.exports = lock
            
            function lock (fd) {
              return !!binding.fd_lock(fd)
            }
            
            function unlock (fd) {
              return !!binding.fd_unlock(fd)
            }
          `,
          loader: 'js',
        };
      }
      if (args.path.endsWith('sodium-native/index.js')) {
        return {
          contents: `
            const path = require('path');
            module.exports = require('node-gyp-build')(path.join(__dirname, '..', 'node_modules', 'sodium-native'))
          `,
          loader: 'js',
        };
      }
      return;
    });
  },
};

/* eslint-disable no-console */
async function main(argv = process.argv) {
  argv = argv.slice(2);
  const pkgIndex = argv.findIndex((v) => v === '--pkg');
  if (pkgIndex >= 0) argv.splice(pkgIndex, 1);
  const isPkg = pkgIndex >= 0;
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
  /** @type { import('esbuild').BuildOptions } */
  const isPkgSwitchedOptions = isPkg
    ? {
        external: [],
        format: 'cjs',
        inject: [path.join(projectPath, './shims/import-meta-url-shim.mjs')],
        // Fix import.meta.url in CJS output
        define: {
          'import.meta.url': '__import_meta_url',
        },
        outExtension: { '.js': '.cjs' },
      }
    : {
        // External: externalDependencies,
        format: 'esm',
        inject: [path.join(projectPath, './shims/require-shim.mjs')],
        outExtension: { '.js': '.mjs' },
      };

  /** @type { import('esbuild').BuildOptions } */
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
    treeShaking: true,
    // External source map for debugging
    sourcemap: true,
    // Minify and keep the original names
    minify: false,
    keepNames: true,
    plugins: [nativeNodeModulesPlugin],
    ...isPkgSwitchedOptions,
  };
  console.error('Running esbuild:');
  console.error(esbuildOptions);
  await esbuild.build(esbuildOptions);
  // Rename worker script
  console.error('Renaming worker script');
  childProcess.execFileSync(
    'mv',
    [
      `dist/polykeyWorkerManifest.${isPkg ? 'cjs' : 'mjs'}`,
      'dist/polykeyWorkerManifest.js',
    ],
    // ['dist/polykeyWorkerManifest.mjs', 'dist/polykeyWorkerManifest.js'],
    {
      stdio: ['inherit', 'inherit', 'inherit'],
      windowsHide: true,
      encoding: 'utf-8',
      shell: platform === 'win32' ? true : false,
    },
  );
  childProcess.execFileSync(
    'mv',
    [
      `dist/polykeyWorkerManifest.${isPkg ? 'cjs' : 'mjs'}.map`,
      'dist/polykeyWorkerManifest.js.map',
    ],
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
