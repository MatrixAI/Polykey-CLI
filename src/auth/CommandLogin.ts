import type PolykeyClient from 'polykey/PolykeyClient.js';
import CommandPolykey from '../CommandPolykey.js';
import * as binProcessors from '../utils/processors.js';
import * as binUtils from '../utils/index.js';
import * as binOptions from '../utils/options.js';

class CommandLogin extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('login');
    this.description('Login to a platform with Polykey identity');
    this.argument('<token>', 'Token provided by platform for logging in');
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (token, options) => {
      const { default: PolykeyClient } = await import(
        'polykey/PolykeyClient.js'
      );
      const { default: Token } = await import('polykey/tokens/Token.js');
      const keysUtils = await import('polykey/keys/utils/index.js');
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
        const keyPair = keysUtils.generateKeyPair();
        const inTok = Token.fromPayload({
          returnUrl: 'localhost:8000',
          publicKey: keyPair.publicKey.toString('base64url'),
        });
        inTok.signWithPrivateKey(keyPair);
        console.log(`tok: ${inTok.toEncoded()}`);
        // token = inTok.toEncoded();

        // // Compact JWTs are in xxxx.yyyy.zzzz format where x is the protected
        // // header, y is the payload, and z is the binary signature.
        // const [protectedHeader, payload, signature] = token.split('.');
        // const tokenProtectedHeader =
        //   tokensUtils.parseTokenProtectedHeader(protectedHeader);
        // const tokenPayload = tokensUtils.parseTokenPayload(payload);
        // const tokenSignature = tokensUtils.parseTokenSignature(signature);
        // const parsedToken = {
        //   payload: tokenPayload,
        //   signatures: [
        //     {
        //       protected: tokenProtectedHeader,
        //       signature: tokenSignature,
        //     }
        //   ]
        // };
        const parsedToken = inTok;
        console.log(`parsed: ${JSON.stringify(parsedToken)}\n`);
        // const incomingToken = Token.fromSigned(parsedToken);
        // const tokenJson = incomingToken.toJSON();
        const response = await binUtils.retryAuthentication(
          (auth) =>
            pkClient.rpcClient.methods.authSignToken({
              metadata: auth,
              payload: inTok.toEncoded().payload,
              signatures: inTok.toEncoded().signatures,
              // signatures: [{protectees.protecHeaderteok.signature}],
            }),
          meta,
        );
        const tokenOut = {
          payload: response.payload,
          signatures: response.signatures,
        };
        console.log(`received: ${JSON.stringify(tokenOut)}\n`);
        console.log(`payload: ${JSON.stringify(tokensUtils.parseTokenPayload(tokenOut.payload))}\n`);
        console.log(`inc payload: ${JSON.stringify(tokensUtils.parseTokenPayload((tokensUtils.parseTokenPayload(tokenOut.payload).requestToken! as any).payload!))}\n`);
        // await fetch(parsedToken.payload.returnUrl, {
        //   method: 'POST',
        //   body: JSON.stringify(tokenOut),
        // });
        // console.log(`sent payload`);
      } finally {
        if (pkClient! != null) await pkClient.stop();
      }
    });
  }
}

export default CommandLogin;
