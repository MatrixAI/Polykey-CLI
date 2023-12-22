#!/usr/bin/env node
const { default: config } = require('polykey/dist/config');
const version = config.version;
async function main() {
  // Dummy for now, only checking that all listed nodes are live
  const poll = async () => {
    const result = await fetch(
      'http://testnet.polykey.com/api/seednodes/status',
    );
    const statuses = await result.json();

    let total = 0;
    let updated = 0;
    for (const [, status] of Object.entries(statuses)) {
      total++;
      if (status.version != null && status.version === version) updated++;
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
