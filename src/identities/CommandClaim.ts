import type PolykeyClient from 'polykey/dist/PolykeyClient';
import type { ProviderIdentityId } from 'polykey/dist/ids';
import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../utils/options';
import * as binParsers from '../utils/parsers';
import * as binProcessors from '../utils/processors';

class CommandClaim extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('claim');
    this.description('Claim a Digital Identity for this Keynode');
    this.argument(
      '<providerIdentityId>',
      'Name of the digital identity provider',
      binParsers.parseGestaltIdentityId,
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(
      async (providerIdentityId: ['identity', ProviderIdentityId], options) => {
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
          const [providerId, identityId] = providerIdentityId[1];
          const claimMessage = await binUtils.retryAuthentication(
            (auth) =>
              pkClient.rpcClient.methods.identitiesClaim({
                metadata: auth,
                providerId: providerId,
                identityId: identityId,
              }),
            auth,
          );
          const output = [`Claim Id: ${claimMessage.claimId}`];
          if (claimMessage.url) {
            output.push(`Url: ${claimMessage.url}`);
          }
          process.stdout.write(
            binUtils.outputFormatter({
              type: options.format === 'json' ? 'json' : 'list',
              data: output,
            }),
          );
        } finally {
          if (pkClient! != null) await pkClient.stop();
        }
      },
    );
  }
}

export default CommandClaim;
