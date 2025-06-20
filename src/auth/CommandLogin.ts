import type PolykeyClient from 'polykey/PolykeyClient.js';
import type {
  TokenPayloadEncoded,
  TokenProtectedHeaderEncoded,
  TokenSignatureEncoded,
} from 'polykey/tokens/types.js';
import type { IdentityRequestData } from 'polykey/client/types.js';
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
    this.argument(
      '<token>',
      'Token provided by platform for logging in',
      binParsers.parseCompactJWT,
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (encodedToken, options) => {
      const { default: PolykeyClient } = await import(
        'polykey/PolykeyClient.js'
      );
      const tokensUtils = await import('polykey/tokens/utils.js');
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

        // Create a JSON representation of the encoded header
        const [protectedHeader, payload, signature] = encodedToken;
        const incomingTokenEncoded = {
          payload: payload as TokenPayloadEncoded,
          signatures: [
            {
              protected: protectedHeader as TokenProtectedHeaderEncoded,
              signature: signature as TokenSignatureEncoded,
            },
          ],
        };

        // Get it verified and signed by the agent
        const response = await binUtils.retryAuthentication(
          (auth) =>
            pkClient.rpcClient.methods.authSignToken({
              metadata: auth,
              ...incomingTokenEncoded,
            }),
          meta,
        );

        // Send the returned JWT to the returnURL provided by the initial token
        const compactHeader = binUtils.jsonToCompactJWT(response);
        const incomingPayload =
          tokensUtils.parseTokenPayload<IdentityRequestData>(payload);
        let result: Response;
        try {
          result = await fetch(incomingPayload.returnURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: compactHeader }),
          });
        } catch (e) {
          throw new errors.ErrorPolykeyCLILoginFailed(
            'Failed to send token to return url',
            { cause: e },
          );
        }

        // Handle non-200 response
        if (!result.ok) {
          throw new errors.ErrorPolykeyCLILoginFailed(
            `Return url returned failure with code ${result.status}`,
          );
        }
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandLogin;
