#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

async function main(_argv = process.argv) {
  const projectRoot = path.join(__dirname, '..');
  try {
    const hash = childProcess.execFileSync(
      'prefetch-npm-deps',
      ['./package-lock.json'],
      {
        windowsHide: true,
        encoding: 'utf-8',
      },
    );
    await fs.promises.writeFile(path.join(projectRoot, 'npmDepsHash'), hash);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      `Failed to run \`prefetch-npm-deps\` failed with (${e.message}) - this can cause builds to fail in Nix!`,
    );
  }
}

void main();
