#!/usr/bin/env node

/**
 * This runs after `npm version` command updates the version but before changes are commited.
 * This will call `npmDepsHash.js` to make sure it's correct after updating the version.
 */

const path = require('path');
const os = require('os');
const childProcess = require('child_process');

const platform = os.platform();

/* eslint-disable no-console */
async function main() {
  const projectRoot = path.join(__dirname, '..');
  const npmDepsHashPath = path.join(projectRoot, 'npmDepsHash');

  console.error('Updating the npmDepsHash after version change');
  childProcess.execFileSync(path.join(__dirname, 'npmDepsHash.js'), [], {
    stdio: ['inherit', 'inherit', 'inherit'],
    windowsHide: true,
    encoding: 'utf-8',
    shell: platform === 'win32' ? true : false,
  });

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
