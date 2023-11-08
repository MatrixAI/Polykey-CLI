import type { Host, Port } from 'polykey/dist/network/types';
import ErrorPolykey from 'polykey/dist/ErrorPolykey';
import * as ids from 'polykey/dist/ids';
import * as nodesUtils from 'polykey/dist/nodes/utils';
import * as polykeyErrors from 'polykey/dist/errors';
import * as fc from 'fast-check';
import * as binUtils from '@/utils/utils';
import * as testUtils from './utils';

const nonPrintableCharArb = fc
  .oneof(
    fc.integer({ min: 0, max: 0x1f }),
    fc.integer({ min: 0x7f, max: 0x9f }),
  )
  .map((code) => String.fromCharCode(code));

const stringWithNonPrintableCharsArb = fc.stringOf(
  fc.oneof(fc.char(), nonPrintableCharArb),
);

describe('bin/utils', () => {
  testUtils.testIf(testUtils.isTestPlatformEmpty)(
    'list in human and json format',
    () => {
      // List
      expect(
        binUtils.outputFormatter({
          type: 'list',
          data: ['Testing', 'the', 'list', 'output'],
        }),
      ).toBe('Testing\nthe\nlist\noutput\n');
      // JSON
      expect(
        binUtils.outputFormatter({
          type: 'json',
          data: ['Testing', 'the', 'list', 'output'],
        }),
      ).toBe('["Testing","the","list","output"]\n');
    },
  );
  testUtils.testIf(testUtils.isTestPlatformEmpty)(
    'table in human and in json format',
    async () => {
      const tableOutput = binUtils.outputFormatter({
        type: 'table',
        data: [
          { key1: 'value1', key2: 'value2' },
          { key1: 'data1', key2: 'data2' },
          { key1: null, key2: undefined },
        ],
        options: {
          includeHeaders: true,
        },
      });
      expect(tableOutput).toBe('value1\tvalue2\ndata1 \tdata2\nN/A   \tN/A\n');

      // JSON
      const jsonOutput = binUtils.outputFormatter({
        type: 'json',
        data: [
          { key1: 'value1', key2: 'value2' },
          { key1: 'data1', key2: 'data2' },
        ],
      });
      expect(jsonOutput).toBe(
        '[{"key1":"value1","key2":"value2"},{"key1":"data1","key2":"data2"}]\n',
      );
    },
  );
  testUtils.testIf(testUtils.isTestPlatformEmpty)(
    'table in human format for streaming usage',
    async () => {
      let tableOutput = '';
      const keys = {
        key1: 10,
        key2: 4,
      };
      const generator = function* () {
        yield [{ key1: 'value1', key2: 'value2' }];
        yield [{ key1: 'data1', key2: 'data2' }];
        yield [{ key1: null, key2: undefined }];
      };
      let i = 0;
      for (const data of generator()) {
        tableOutput += binUtils.outputFormatter({
          type: 'table',
          data: data,
          options: {
            columns: keys,
            includeHeaders: i === 0,
          },
        });
        i++;
      }
      expect(keys).toStrictEqual({
        key1: 10,
        key2: 6,
      });
      expect(tableOutput).toBe(
        'key1      \tkey2  \nvalue1    \tvalue2\ndata1     \tdata2\nN/A       \tN/A\n',
      );
    },
  );
  testUtils.testIf(testUtils.isTestPlatformEmpty)(
    'dict in human and in json format',
    () => {
      // Dict
      expect(
        binUtils.outputFormatter({
          type: 'dict',
          data: { key1: 'value1', key2: 'value2' },
        }),
      ).toBe('key1\tvalue1\nkey2\tvalue2\n');
      expect(
        binUtils.outputFormatter({
          type: 'dict',
          data: { key1: 'first\nsecond', key2: 'first\nsecond\n' },
        }),
      ).toBe('key1\t"first\\nsecond"\nkey2\t"first\\nsecond\\n"\n');
      expect(
        binUtils.outputFormatter({
          type: 'dict',
          data: { key1: null, key2: undefined },
        }),
      ).toBe('key1\t\nkey2\t\n');
      // JSON
      expect(
        binUtils.outputFormatter({
          type: 'json',
          data: { key1: 'value1', key2: 'value2' },
        }),
      ).toBe('{"key1":"value1","key2":"value2"}\n');
    },
  );
  testUtils.testIf(testUtils.isTestPlatformEmpty)(
    'outputFormatter should encode non-printable characters within a dict',
    () => {
      fc.assert(
        fc.property(
          stringWithNonPrintableCharsArb,
          stringWithNonPrintableCharsArb,
          (key, value) => {
            const formattedOutput = binUtils.outputFormatter({
              type: 'dict',
              data: { [key]: value },
            });

            // Construct the expected output
            let expectedValue = value;
            expectedValue = binUtils.encodeEscapedWrapped(expectedValue);
            expectedValue = expectedValue.replace(/(?:\r\n|\n)$/, '');
            expectedValue = expectedValue.replace(/(\r\n|\n)/g, '$1\t');

            const maxKeyLength = Math.max(
              ...Object.keys({ [key]: value }).map((k) => k.length),
            );
            const padding = ' '.repeat(maxKeyLength - key.length);
            const expectedOutput = `${key}${padding}\t${expectedValue}\n`;
            // Assert that the formatted output matches the expected output
            expect(formattedOutput).toBe(expectedOutput);
          },
        ),
        { numRuns: 100 }, // Number of times to run the test
      );
    },
  );
  testUtils.testIf(testUtils.isTestPlatformEmpty)(
    'errors in human and json format',
    () => {
      const nodeIdGenerator = ids.createNodeIdGenerator();
      const timestamp = new Date();
      const data = { string: 'one', number: 1 };
      const host = '127.0.0.1' as Host;
      const port = 55555 as Port;
      const nodeId = nodeIdGenerator();
      const standardError = new TypeError('some error');
      const pkError = new ErrorPolykey<undefined>('some pk error', {
        timestamp,
        data,
      });
      const remoteError = new polykeyErrors.ErrorPolykeyRemote<any>(
        {
          nodeId: nodesUtils.encodeNodeId(nodeId),
          host,
          port,
          command: 'some command',
        },
        'some remote error',
        { timestamp, cause: pkError },
      );
      const twoRemoteErrors = new polykeyErrors.ErrorPolykeyRemote<any>(
        {
          nodeId: nodesUtils.encodeNodeId(nodeId),
          host,
          port,
          command: 'command 2',
        },
        'remote error',
        {
          timestamp,
          cause: new polykeyErrors.ErrorPolykeyRemote(
            {
              nodeId: nodesUtils.encodeNodeId(nodeId),
              host,
              port,
              command: 'command 1',
            },
            undefined,
            {
              timestamp,
              cause: new ErrorPolykey('pk error', {
                timestamp,
                cause: standardError,
              }),
            },
          ),
        },
      );
      // Human
      expect(
        binUtils.outputFormatter({ type: 'error', data: standardError }),
      ).toBe(`${standardError.name}: ${standardError.message}\n`);
      expect(binUtils.outputFormatter({ type: 'error', data: pkError })).toBe(
        `${pkError.name}: ${pkError.description} - ${pkError.message}\n` +
          `  data\t${JSON.stringify(data)}\n`,
      );
      expect(
        binUtils.outputFormatter({ type: 'error', data: remoteError }),
      ).toBe(
        `${remoteError.name}: ${remoteError.description} - ${remoteError.message}\n` +
          `  nodeId\t${nodesUtils.encodeNodeId(nodeId)}\n` +
          `  host\t${host}\n` +
          `  port\t${port}\n` +
          `  command\tsome command\n` +
          `  timestamp\t${timestamp.toString()}\n` +
          `  cause: ${remoteError.cause.name}: ${remoteError.cause.description} - ${remoteError.cause.message}\n` +
          `    data\t${JSON.stringify(data)}\n`,
      );
      expect(
        binUtils.outputFormatter({ type: 'error', data: twoRemoteErrors }),
      ).toBe(
        `${twoRemoteErrors.name}: ${twoRemoteErrors.description} - ${twoRemoteErrors.message}\n` +
          `  nodeId\t${nodesUtils.encodeNodeId(nodeId)}\n` +
          `  host\t${host}\n` +
          `  port\t${port}\n` +
          `  command\tcommand 2\n` +
          `  timestamp\t${timestamp.toString()}\n` +
          `  cause: ${twoRemoteErrors.cause.name}: ${twoRemoteErrors.cause.description}\n` +
          `    nodeId\t${nodesUtils.encodeNodeId(nodeId)}\n` +
          `    host\t${host}\n` +
          `    port\t${port}\n` +
          `    command\t${twoRemoteErrors.cause.metadata.command}\n` +
          `    timestamp\t${timestamp.toString()}\n` +
          `    cause: ${twoRemoteErrors.cause.cause.name}: ${twoRemoteErrors.cause.cause.description} - ${twoRemoteErrors.cause.cause.message}\n` +
          `      cause: ${standardError.name}: ${standardError.message}\n`,
      );
      // JSON
      expect(
        binUtils.outputFormatter({ type: 'json', data: standardError }),
      ).toBe(
        `{"type":"${standardError.name}","data":{"message":"${
          standardError.message
        }","stack":"${standardError.stack?.replaceAll('\n', '\\n')}"}}\n`,
      );
      expect(binUtils.outputFormatter({ type: 'json', data: pkError })).toBe(
        JSON.stringify(pkError.toJSON()) + '\n',
      );
      expect(
        binUtils.outputFormatter({ type: 'json', data: remoteError }),
      ).toBe(JSON.stringify(remoteError.toJSON()) + '\n');
      expect(
        binUtils.outputFormatter({ type: 'json', data: twoRemoteErrors }),
      ).toBe(
        JSON.stringify(
          twoRemoteErrors.toJSON(),
          binUtils.standardErrorReplacer,
        ) + '\n',
      );
    },
  );
  testUtils.testIf(testUtils.isTestPlatformEmpty)(
    'encodeEscaped should encode all escapable characters',
    () => {
      fc.assert(
        fc.property(stringWithNonPrintableCharsArb, (value) => {
          expect(binUtils.decodeEscaped(binUtils.encodeEscaped(value))).toBe(
            value,
          );
        }),
        { numRuns: 100 }, // Number of times to run the test
      );
    },
  );
});
