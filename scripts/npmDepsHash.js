#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

async function main(_argv = process.argv) {
  const projectRoot = path.join(__dirname, '..');
  try {
    const output = childProcess.execSync(
      'prefetch-npm-deps ./package-lock.json',
    );
    const hash = output.toString();
    await fs.promises.writeFile(path.join(projectRoot, 'npmDepsHash'), hash);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      `Warning: prefetch failed with (${e.message}). if npmDepsHash was not updated`,
    );
  }
}

void main();
