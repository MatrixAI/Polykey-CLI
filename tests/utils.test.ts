import type { Host, Port } from 'polykey/dist/network/types';
import path from 'path';
import ErrorPolykey from 'polykey/dist/ErrorPolykey';
import { test } from '@fast-check/jest';
import * as ids from 'polykey/dist/ids';
import * as nodesUtils from 'polykey/dist/nodes/utils';
import * as polykeyErrors from 'polykey/dist/errors';
import * as fc from 'fast-check';
import * as binUtils from '@/utils/utils';
import * as binParsers from '@/utils/parsers';

describe('outputFormatters', () => {
  const nonPrintableCharArb = fc
    .oneof(
      fc.integer({ min: 0, max: 0x1f }),
      fc.integer({ min: 0x7f, max: 0x9f }),
    )
    .map((code) => String.fromCharCode(code));

  const stringWithNonPrintableCharsArb = fc.stringOf(
    fc.oneof(fc.char(), nonPrintableCharArb),
  );

  test('list in human and json format', () => {
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
  });
  test('table in human and in json format', async () => {
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
  });
  test('table in human format for streaming usage', async () => {
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
  });
  test('dict in human and in json format', () => {
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
    ).toBe('key1\tnull\nkey2\tnull\n');
    // JSON
    expect(
      binUtils.outputFormatter({
        type: 'json',
        data: { key1: 'value1', key2: 'value2' },
      }),
    ).toBe('{"key1":"value1","key2":"value2"}\n');
  });
  test('dict nesting in human format', () => {
    // Dict
    expect(
      binUtils.outputFormatter({
        type: 'dict',
        data: { key1: {}, key2: {} },
      }),
    ).toBe('key1\t\nkey2\t\n');
    expect(
      binUtils.outputFormatter({
        type: 'dict',
        data: { key1: ['value1', 'value2', 'value3'] },
      }),
    ).toBe('key1\t\n  value1\t\n  value2\t\n  value3\t\n');
    expect(
      binUtils.outputFormatter({
        type: 'dict',
        data: {
          key1: {
            key2: null,
            key3: undefined,
            key4: 'value',
          },
          key5: 'value',
          key6: {
            key7: {
              key8: {
                key9: 'value',
              },
            },
          },
        },
      }),
    ).toBe(
      'key1\t\n' +
        '  key2\tnull\n' +
        '  key3\tnull\n' +
        '  key4\tvalue\n' +
        'key5\tvalue\n' +
        'key6\t\n' +
        '  key7\t\n' +
        '    key8\t\n' +
        '      key9\tvalue\n',
    );
  });
  test.prop([stringWithNonPrintableCharsArb, stringWithNonPrintableCharsArb], {
    numRuns: 100,
  })('should encode non-printable characters within a dict', (key, value) => {
    const formattedOutput = binUtils.outputFormatter({
      type: 'dict',
      data: { [key]: value },
    });
    const expectedKey = binUtils.encodeEscapedWrapped(key);
    // Construct the expected output
    let expectedValue = value;
    expectedValue = binUtils.encodeEscapedWrapped(expectedValue);
    expectedValue = expectedValue.replace(/(?:\r\n|\n)$/, '');
    expectedValue = expectedValue.replace(/(\r\n|\n)/g, '$1\t');
    const maxKeyLength = Math.max(
      ...Object.keys({ [key]: value }).map((k) => k.length),
    );
    const padding = ' '.repeat(maxKeyLength - key.length);
    const expectedOutput = `${expectedKey}${padding}\t${expectedValue}\n`;
    // Assert that the formatted output matches the expected output
    expect(formattedOutput).toBe(expectedOutput);
  });
  test('errors in human and json format', () => {
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
    expect(binUtils.outputFormatter({ type: 'error', data: remoteError })).toBe(
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
    expect(binUtils.outputFormatter({ type: 'json', data: remoteError })).toBe(
      JSON.stringify(remoteError.toJSON()) + '\n',
    );
    expect(
      binUtils.outputFormatter({ type: 'json', data: twoRemoteErrors }),
    ).toBe(
      JSON.stringify(twoRemoteErrors.toJSON(), binUtils.standardErrorReplacer) +
        '\n',
    );
  });
  test.prop([stringWithNonPrintableCharsArb], { numRuns: 100 })(
    'encodeEscaped should encode all escapable characters',
    (value) => {
      expect(binUtils.decodeEscaped(binUtils.encodeEscaped(value))).toBe(value);
    },
  );
  test.prop([stringWithNonPrintableCharsArb, stringWithNonPrintableCharsArb], {
    numRuns: 100,
  })(
    'encodeEscapedReplacer should encode all escapable characters',
    (key, value) => {
      const encodedKey = binUtils.encodeEscaped(key);
      const encodedValue = binUtils.encodeEscaped(value);
      const object = {
        [key]: value,
        [key]: {
          [key]: value,
        },
        [key]: [value],
      };
      const encodedObject = {
        [encodedKey]: encodedValue,
        [encodedKey]: {
          [encodedKey]: encodedValue,
        },
        [encodedKey]: [encodedValue],
      };
      const output = JSON.stringify(object, binUtils.encodeEscapedReplacer);
      expect(JSON.parse(output)).toEqual(encodedObject);
    },
  );
});

describe('parsers', () => {
  const vaultNameArb = fc.stringOf(
    fc.char().filter((c) => binParsers.vaultNameRegex.test(c)),
    { minLength: 1, maxLength: 100 },
  );
  const singleSecretPathArb = fc.stringOf(
    fc.char().filter((c) => binParsers.secretPathRegex.test(c)),
    { minLength: 1, maxLength: 25 },
  );
  const secretPathArb = fc
    .array(singleSecretPathArb, { minLength: 1, maxLength: 5 })
    .map((segments) => path.join(...segments));
  const valueFirstCharArb = fc.char().filter((c) => /^[a-zA-Z_]$/.test(c));
  const valueRestCharArb = fc.stringOf(
    fc.char().filter((c) => /^[\w]$/.test(c)),
    { minLength: 1, maxLength: 100 },
  );
  const valueDataArb = fc
    .tuple(valueFirstCharArb, valueRestCharArb)
    .map((components) => components.join(''));

  test.prop([vaultNameArb], { numRuns: 100 })(
    'should parse vault name',
    async (vaultName) => {
      expect(binParsers.parseVaultName(vaultName)).toEqual(vaultName);
    },
  );
  test.prop([vaultNameArb], { numRuns: 10 })(
    'should parse secret path with only vault name',
    async (vaultName) => {
      const result = [vaultName, undefined, undefined];
      expect(binParsers.parseSecretPath(vaultName)).toEqual(result);
    },
  );
  test.prop([vaultNameArb, secretPathArb], { numRuns: 100 })(
    'should parse full secret path with vault name',
    async (vaultName, secretPath) => {
      const query = `${vaultName}:${secretPath}`;
      const result = [vaultName, secretPath, undefined];
      expect(binParsers.parseSecretPath(query)).toEqual(result);
    },
  );
  test.prop([vaultNameArb, secretPathArb, valueDataArb], { numRuns: 100 })(
    'should parse full secret path with vault name and value',
    async (vaultName, secretPath, valueData) => {
      const query = `${vaultName}:${secretPath}=${valueData}`;
      const result = [vaultName, secretPath, valueData];
      expect(binParsers.parseSecretPathValue(query)).toEqual(result);
    },
  );
});
