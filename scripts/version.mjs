#!/usr/bin/env node

/**
 * This runs after `npm version` command updates the version but before changes are commited.
 * This will call `npmDepsHash.js` to make sure it's correct after updating the version.
 */

import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import url from 'node:url';

const projectPath = path.dirname(
  path.dirname(url.fileURLToPath(import.meta.url)),
);

const platform = os.platform();

/* eslint-disable no-console */
async function main() {
  const npmDepsHashPath = path.join(projectPath, 'npmDepsHash');

  console.error('Updating the npmDepsHash after version change');
  childProcess.execFileSync(
    path.join(projectPath, 'scripts/npmDepsHash.js'),
    [],
    {
      stdio: ['inherit', 'inherit', 'inherit'],
      windowsHide: true,
      encoding: 'utf-8',
      shell: platform === 'win32' ? true : false,
    },
  );

  console.error('Staging npmDepsHash');
  childProcess.execFileSync('git', ['add', npmDepsHashPath], {
    stdio: ['inherit', 'inherit', 'inherit'],
    windowsHide: true,
    encoding: 'utf-8',
    shell: platform === 'win32' ? true : false,
  });
}
/* eslint-enable no-console */

void main();
