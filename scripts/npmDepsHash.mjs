#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import url from 'node:url';

const projectPath = path.dirname(
  path.dirname(url.fileURLToPath(import.meta.url)),
);

async function main(_argv = process.argv) {
  try {
    const hash = childProcess.execFileSync(
      'prefetch-npm-deps',
      ['./package-lock.json'],
      {
        windowsHide: true,
        encoding: 'utf-8',
      },
    );
    await fs.promises.writeFile(path.join(projectPath, 'npmDepsHash'), hash);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      `Failed to run \`prefetch-npm-deps\` failed with (${e.message}) - this can cause builds to fail in Nix!`,
    );
  }
}

void main();
