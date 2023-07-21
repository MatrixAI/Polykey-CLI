import fs from 'fs';
import os from 'os';
import path from 'path';
import { mockProcessStdout } from 'jest-mock-process';
import main from '@/bin/typescript-demo-lib';

const uuidRegex = new RegExp(
  '[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}',
);

let dataDir: string;

describe('main', () => {
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'test-'));
  });
  afterEach(async () => {
    await fs.promises.rm(dataDir, {
      recursive: true,
    });
  });
  test('main takes synthetic parameters', async () => {
    // Jest can also "spy on" the console object
    // and then you can test on stdout
    const mockLog = mockProcessStdout();
    expect(await main(['', '', '1', '2', dataDir])).toEqual(0);
    mockLog.mockRestore();
  });
  test('no input', async () => {
    const mockLog = mockProcessStdout();
    await main([]);
    const tmpMockLog = mockLog.mock.calls.join('');
    expect(tmpMockLog).toContain('[]\n');
    expect(tmpMockLog).toContain('new library\n');
    expect(tmpMockLog).toMatch(uuidRegex);
    expect(tmpMockLog).toContain('0 + 0 = 0\n');
    mockLog.mockRestore();
  });
  test('adds 0 + 0', async () => {
    const mockLog = mockProcessStdout();
    await main(['', '', '0', '0', dataDir]);
    const tmpMockLog = mockLog.mock.calls.join('');
    expect(tmpMockLog).toContain('[0,0]\n');
    expect(tmpMockLog).toContain('new library\n');
    expect(tmpMockLog).toMatch(uuidRegex);
    expect(tmpMockLog).toContain('0 + 0 = 0\n');
    mockLog.mockRestore();
  });
  test('adds 0 + 1', async () => {
    const mockLog = mockProcessStdout();
    await main(['', '', '0', '1', dataDir]);
    const tmpMockLog = mockLog.mock.calls.join('');
    expect(tmpMockLog).toContain('[0,1]\n');
    expect(tmpMockLog).toContain('new library\n');
    expect(tmpMockLog).toMatch(uuidRegex);
    expect(tmpMockLog).toContain('0 + 1 = 1\n');
    mockLog.mockRestore();
  });
  test('adds 1 + 0', async () => {
    const mockLog = mockProcessStdout();
    await main(['', '', '1', '0', dataDir]);
    const tmpMockLog = mockLog.mock.calls.join('');
    expect(tmpMockLog).toContain('[1,0]\n');
    expect(tmpMockLog).toContain('new library\n');
    expect(tmpMockLog).toMatch(uuidRegex);
    expect(tmpMockLog).toContain('1 + 0 = 1\n');
    mockLog.mockRestore();
  });
  test('adds 7657 + 238947', async () => {
    const mockLog = mockProcessStdout();
    await main(['', '', '7657', '238947', dataDir]);
    const tmpMockLog = mockLog.mock.calls.join('');
    expect(tmpMockLog).toContain('[7657,238947]\n');
    expect(tmpMockLog).toContain('new library\n');
    expect(tmpMockLog).toMatch(uuidRegex);
    expect(tmpMockLog).toContain('7657 + 238947 = 246604\n');
    mockLog.mockRestore();
  });
});
