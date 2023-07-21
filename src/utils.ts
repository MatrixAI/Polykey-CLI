import { test } from './test.json';
// @ts-ignore package.json is outside rootDir
import { version } from '../package.json';

async function sleep(ms: number) {
  return await new Promise((r) => setTimeout(r, ms));
}

export { sleep, version, test };
