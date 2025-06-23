import type PolykeyClient from 'polykey/PolykeyClient.js';
import CommandPolykey from '../CommandPolykey.js';
import * as binProcessors from '../utils/processors.js';
import * as binParsers from '../utils/parsers.js';
import * as binUtils from '../utils/index.js';
import * as binOptions from '../utils/options.js';
import * as errors from '../errors.js';

class CommandLogin extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('login');
    this.description('Login to a platform with Polykey identity');
    this.argument('<url>', 'The URL to login using Polykey');
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.addOption(binOptions.returnURLPath);
    this.action(async (url: string, options) => {
      const { default: PolykeyClient } = await import(
        'polykey/PolykeyClient.js'
      );
      const clientOptions = await binProcessors.processClientOptions(
        options.nodePath,
        options.nodeId,
        options.clientHost,
        options.clientPort,
        this.fs,
        this.logger.getChild(binProcessors.processClientOptions.name),
      );
      const meta = await binProcessors.processAuthentication(
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

        // Get a signed token by the agent
        const response = await binUtils.retryAuthentication(
          (auth) =>
            pkClient.rpcClient.methods.authSignToken({ metadata: auth }),
          meta,
        );

        // Send the returned JWT to the returnURL provided by the initial token
        const compactHeader = binUtils.jsonToCompactJWT(response);
        const targetURL = new URL(url.endsWith('/') ? url.slice(0, url.length) : url);
        const subPath: string = options.returnURLPath ?? '/api/oauth2/oidc'
        targetURL.pathname = subPath.startsWith('/') ? subPath : `/${subPath}`;
        targetURL.searchParams.append('token', compactHeader);

        // TEMPORARY: Print out the resulting URL
        process.stdout.write(`Open the following URL in your browser:\n\t${targetURL}`)
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandLogin;
