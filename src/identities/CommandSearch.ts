import type PolykeyClient from 'polykey/dist/PolykeyClient';
import type { IdentityInfoMessage } from 'polykey/dist/client/types';
import type { ReadableStream } from 'stream/web';
import type { ClientRPCResponseResult } from 'polykey/dist/client/types';
import { TransformStream } from 'stream/web';
import CommandPolykey from '../CommandPolykey';
import * as binOptions from '../utils/options';
import * as binUtils from '../utils';
import * as binParsers from '../utils/parsers';
import * as binProcessors from '../utils/processors';

class CommandSearch extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('search');
    this.description('Searches a Provider for any Connected Identities');
    this.argument(
      '[searchTerms...]',
      'Search parameters to apply to connected identities',
    );
    this.option(
      '-pi, --provider-id [providerId...]',
      'Digital identity provider(s) to search on',
    );
    this.option(
      '-aii, --auth-identity-id [authIdentityId]',
      'Name of your own authenticated identity to find connected identities of',
      binParsers.parseIdentityId,
    );
    this.option(
      '-ii, --identity-id [identityId]',
      'Name of the digital identity to search for',
      binParsers.parseIdentityId,
    );
    this.option(
      '-d, --disconnected',
      'Include disconnected identities in search',
    );
    this.option(
      '-l, --limit [number]',
      'Limit the number of search results to display to a specific number',
      binParsers.parseInteger,
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (searchTerms, options) => {
      const { default: PolykeyClient } = await import(
        'polykey/dist/PolykeyClient'
      );
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
        await binUtils.retryAuthentication(async (auth) => {
          let readableStream: ReadableStream<
            ClientRPCResponseResult<IdentityInfoMessage>
          >;
          if (options.identityId) {
            readableStream = await pkClient.rpcClient.methods.identitiesInfoGet(
              {
                metadata: auth,
                identityId: options.identityId,
                authIdentityId: options.authIdentityId,
                disconnected: options.disconnected,
                providerIdList: options.providerId ?? [],
                searchTermList: searchTerms,
                limit: options.limit,
              },
            );
          } else {
            readableStream =
              await pkClient.rpcClient.methods.identitiesInfoConnectedGet({
                metadata: auth,
                identityId: options.identityId,
                authIdentityId: options.authIdentityId,
                disconnected: options.disconnected,
                providerIdList: options.providerId ?? [],
                searchTermList: searchTerms,
                limit: options.limit,
              });
          }
          readableStream = readableStream.pipeThrough(
            new TransformStream({
              transform: (chunk, controller) => {
                controller.enqueue({
                  providerId: chunk.providerId,
                  identityId: chunk.identityId,
                  name: chunk.name,
                  email: chunk.email,
                  url: chunk.url,
                });
              },
            }),
          );
          if (options.format === 'json') {
            for await (const output of readableStream) {
              process.stdout.write(
                binUtils.outputFormatter({
                  type: options.format === 'json' ? 'json' : 'dict',
                  data: output,
                }),
              );
            }
          } else {
            let firstElement = true;
            for await (const output of readableStream) {
              if (!firstElement) {
                process.stdout.write('\n');
              }
              process.stdout.write(
                binUtils.outputFormatter({
                  type: 'dict',
                  data: output,
                }),
              );
              if (firstElement) {
                firstElement = false;
              }
            }
          }
        }, auth);
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandSearch;
