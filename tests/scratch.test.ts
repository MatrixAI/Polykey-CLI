import fs from 'fs';
import path from 'path';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';

// This is a 'scratch paper' test file for quickly running tests in the CI
describe('scratch', () => {
  const logger = new Logger(`scratch test`, LogLevel.WARN, [
    new StreamHandler(),
  ]);

  let dataDir: string;
  let nodePath: string;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    nodePath = path.join(dataDir, 'node');
  });
  afterEach(async () => {
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });

  test('can create an agent', async () => {
    const pk = await PolykeyAgent.createPolykeyAgent({
      password: 'password',
      nodePath,
      fresh: true,
      logger,
    });
    await pk.stop();
  });
});

// We can't have empty test files so here is a sanity test
test('Should avoid empty test suite', async () => {
  expect(1 + 1).toBe(2);
});
