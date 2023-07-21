#!/usr/bin/env node

import process from 'process';
import { v4 as uuidv4 } from 'uuid';
import Library from '../lib/Library';
import NumPair from '../lib/NumPair';
import testWorkers from '../lib/workers/test-workers';
import { version, test } from '../utils';

async function main(argv = process.argv): Promise<number> {
  // Print out command-line arguments
  argv = argv.slice(2); // Removing prepended file paths
  process.stdout.write('[' + argv.slice(0, 2).toString() + ']\n');

  // Create a new Library with the value someParam = 'new library'
  // And print it out
  const l = new Library('new library');
  process.stdout.write(l.someParam + '\n');

  // Generate and print a uuid (universally unique identifier)
  process.stdout.write(uuidv4() + '\n');

  // Add the first two command-line args and print the result
  // default to using 0
  let num1 = parseInt(argv[0]);
  num1 = isNaN(num1) ? 0 : num1;
  let num2 = parseInt(argv[1]);
  num2 = isNaN(num2) ? 0 : num2;
  const nums = new NumPair(num1, num2);
  const sum = nums.num1 + nums.num2;
  process.stdout.write(nums.num1 + ' + ' + nums.num2 + ' = ' + sum + '\n');

  // Testing workers
  await testWorkers();

  process.stdout.write(version + '\n');
  process.stdout.write(test.toString() + '\n');

  process.exitCode = 0;
  return process.exitCode;
}

if (require.main === module) {
  void main();
}

export default main;
