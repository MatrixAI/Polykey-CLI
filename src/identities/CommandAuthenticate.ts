import type PolykeyClient from 'polykey/PolykeyClient.js';
import type { ClientRPCResponseResult } from 'polykey/client/types.js';
import type { AuthProcessMessage } from 'polykey/client/types.js';
import type { ReadableStream } from 'stream/web';
import CommandPolykey from '../CommandPolykey.js';
import * as binUtils from '../utils/index.js';
import * as binOptions from '../utils/options.js';
import * as binParsers from '../utils/parsers.js';
import * as binProcessors from '../utils/processors.js';

class CommandAuthenticate extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('authenticate');
    this.description('Authenticate a Digital Identity Provider');
    this.argument(
      '<providerId>',
      'Name of the digital identity provider',
      binParsers.parseProviderId,
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (providerId, options) => {
      const { default: PolykeyClient } = await import(
        'polykey/PolykeyClient.js'
      );
      const { never } = await import('polykey/utils/index.js');
      const identitiesUtils = await import('polykey/identities/utils.js');
      const clientOptions = await binProcessors.processClientOptions(
        options.nodePath,
        options.nodeId,
        options.clientHost,
        options.clientPort,
        this.fs,
        this.logger.getChild(binProcessors.processClientOptions.name),
      );
      const auth = await binProcessors.processAuthentication(
        options.passwordFile,
        this.fs,
      );
      let pkClient: PolykeyClient;
      this.exitHandlers.handlers.push(async () => {
        if (pkClient != null) await pkClient.stop();
      });
      try {
        pkClient = await PolykeyClient.createPolykeyClient({
          nodeId: clientOptions.nodeId,
          host: clientOptions.clientHost,
          port: clientOptions.clientPort,
          options: {
            nodePath: options.nodePath,
          },
          logger: this.logger.getChild(PolykeyClient.name),
        });
        let genReadable: ReadableStream<
          ClientRPCResponseResult<AuthProcessMessage>
        >;
        await binUtils.retryAuthentication(async (auth) => {
          genReadable = await pkClient.rpcClient.methods.identitiesAuthenticate(
            {
              metadata: auth,
              providerId: providerId,
            },
            {
              timer: 120000,
            },
          );
          for await (const message of genReadable) {
            if (message.request != null) {
              process.stderr.write(
                `Navigate to the URL in order to authenticate\n`,
              );
              process.stderr.write(
                'Use any additional additional properties to complete authentication\n',
              );
              try {
                await identitiesUtils.browser(message.request.url);
              } catch (e) {
                if (e.code !== 'ENOENT') throw e;
                // Otherwise we ignore `ENOENT` as a failure to spawn a browser
              }
              if (options.format === 'json') {
                process.stdout.write(
                  binUtils.outputFormatter({
                    type: 'json',
                    data: {
                      url: message.request.url,
                      dataMap: message.request.dataMap,
                    },
                  }),
                );
              } else {
                process.stdout.write(
                  binUtils.outputFormatter({
                    type: 'dict',
                    data: {
                      url: message.request.url,
                      ...message.request.dataMap,
                    },
                  }),
                );
              }
            } else if (message.response != null) {
              process.stderr.write(
                `Authenticated digital identity provider ${providerId}\n`,
              );
              process.stdout.write(
                binUtils.outputFormatter({
                  type: options.format === 'json' ? 'json' : 'dict',
                  data: { identityId: message.response.identityId },
                }),
              );
            } else {
              never(`either message request or response must be defined`);
            }
          }
        }, auth);
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandAuthenticate;
