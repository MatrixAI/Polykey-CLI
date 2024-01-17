#!/usr/bin/env node
const process = require('process');
const childProcess = require('child_process');
const { default: config } = require('polykey/dist/config');
const versionTarget = config.version;
async function main(argv = process.argv) {
  // Test getting the hash
  const cliAgentCommitHashCurrentTarget =
    process.env.CI_COMMIT_SHA ??
    childProcess.execSync('git rev-parse HEAD').toString();
  const network = argv[2];
  if (network !== 'testnet' && network !== 'mainnet') {
    throw Error('network must be "testnet" or "mainnet"');
  }
  const poll = async () => {
    const result = await fetch(
      `https://${network}.polykey.com/api/seednodes/status`,
    );
    const statuses = await result.json();

    let total = 0;
    let updated = 0;
    for (const [, status] of Object.entries(statuses)) {
      const versionCurrent = status.version;
      const cliAgentCommitHashCurrent =
        status.versionMetadata.cliAgentCommitHash;
      total++;
      // If the Polykey lib version and CLI commit hash match then it is updated
      if (
        versionCurrent != null &&
        versionCurrent === versionTarget &&
        cliAgentCommitHashCurrent != null &&
        cliAgentCommitHashCurrent === cliAgentCommitHashCurrentTarget
      ) {
        updated++;
      }
    }
    process.stdout.write(`polled ${updated}/${total} updated\n`);
    return updated === total;
  };
  // 10 min worth of attempts
  let attempts = 60;
  process.stdout.write('starting polling loop\n');
  while (true) {
    attempts--;
    if (await poll()) {
      process.stdout.write('all nodes updated\n');
      process.exit(0);
    }
    if (attempts === 0) break;
    process.stdout.write(`${attempts} attempts left\n`);
    await new Promise((resolve) => {
      setTimeout(resolve, 10000);
    });
  }
  process.stderr.write('timed out waiting for nodes to update\n');
  process.exit(1);
}

void main();
