# Polykey-CLI

staging:[![pipeline status](https://gitlab.com/MatrixAI/open-source/Polykey-CLI/badges/staging/pipeline.svg)](https://gitlab.com/MatrixAI/open-source/Polykey-CLI/commits/staging)
master:[![pipeline status](https://gitlab.com/MatrixAI/open-source/Polykey-CLI/badges/master/pipeline.svg)](https://gitlab.com/MatrixAI/open-source/Polykey-CLI/commits/master)

Polykey is an open-source decentralized secrets management and sharing system. It is made for today's decentralized world of people, services and devices.

* Decentralized Encrypted Storage - No storage of secrets on third parties, secrets are stored on your device and synchronised point-to-point between Polykey nodes.
* Secure Peer-to-Peer Communications - Polykey bootstraps TLS keys by federating trusted social identities (e.g. GitHub).
* Secure Computational Workflows - Share secrets (passwords, keys, tokens and certificates) with people, between teams, and across machine infrastructure.

<p align="center">
  <img src="./images/cli_demo.gif" alt="Polykey CLI Demo"/>
</p>

Polykey synthesizes a unified workflow between interactive password management and infrastructure key management.

You have complete end-to-end control and privacy over your secrets, with no third-party data collection.

Polykey runs on distributed keynodes referred to as "nodes". Any computing system can run multiple keynodes. Each node manages one or more vaults which are encrypted filesystems with automatic version history. Vaults can be shared between the nodes.

This repository is the core library for Polykey.

The Polykey project is split up into these main repositories:

* [Polykey](https://github.com/MatrixAI/Polykey) - Polykey Core Library
* [Polykey-CLI](https://github.com/MatrixAI/Polykey-CLI) - CLI of Polykey
* [Polykey-Desktop](https://github.com/MatrixAI/Polykey-Desktop) - Polykey Desktop (Windows, Mac, Linux) application
* [Polykey-Mobile](https://github.com/MatrixAI/Polykey-Mobile) - Polykey Mobile (iOS & Android) Application

Have a bug or a feature-request? Please submit it the issues of the relevant subproject above.

For tutorials, how-to guides, reference and theory, see the [docs](https://polykey.io/docs).

Have a question? Join our [discussion board](https://github.com/MatrixAI/Polykey/discussions).

Our main website is https://polykey.io

## Installation

Note that JavaScript libraries are not packaged in Nix. Only JavaScript applications are.

Building the package:

```sh
nix-build -E '(import ./pkgs.nix {}).callPackage ./default.nix {}'
```

### Nix/NixOS

Building the releases:

```sh
nix-build ./release.nix --attr application
nix-build ./release.nix --attr docker
nix-build ./release.nix --attr package.linux.x64.elf
nix-build ./release.nix --attr package.windows.x64.exe
nix-build ./release.nix --attr package.macos.x64.macho
```

Install into Nix user profile:

```sh
nix-env -f ./release.nix --install --attr application
```

### Docker

Install into Docker:

```sh
loaded="$(docker load --input "$(nix-build ./release.nix --attr docker)")"
image="$(cut -d' ' -f3 <<< "$loaded")"
docker run -it "$image"
```

## Development

Run `nix-shell`, and once you're inside, you can use:

```sh
# install (or reinstall packages from package.json)
npm install
# build the dist
npm run build
# run the repl (this allows you to import from ./src)
npm run ts-node
# run the tests
npm run test
# lint the source code
npm run lint
# automatically fix the source
npm run lintfix
```

### Calling Commands

When calling commands in development, use this style:

```sh
npm run polykey -- p1 p2 p3
```

The `--` is necessary to make `npm` understand that the parameters are for your own executable, and not parameters to `npm`.

### Using the REPL

```
$ npm run ts-node
> import fs from 'fs';
> fs
> import { Library } from '@';
> Library
> import Library as Library2 from './src/lib/Library';
```

You can also create test files in `./src`, and run them with `npm run ts-node ./src/test.ts`.

This allows you to test individual pieces of typescript code, and it makes it easier when doing large scale architecting of TypeScript code.

### Path Aliases

Due to https://github.com/microsoft/TypeScript/issues/10866, you cannot use path aliases without a bundler like Webpack to further transform the generated JavaScript code in order to resolve the path aliases. Because this is a simple library demonstration, there's no need to use a bundler. In fact, for such libraries, it is far more efficient to not bundle the code.

However, we have left the path alias configuration in `tsconfig.json`, `jest.config.js` and in the tests we are making use of the `@` alias.

### Local Package Linking

When developing on multiple NPM packages, it can be easier to use `npm link` so that changes are immediately reflected rather than repeatedly publishing packages. To do this, you need to use `npm link`. After linking a local directory, you need to provide `tsconfig.json` paths so TypeScript compiler can find the right files.

For example when linking `@matrixai/db` located in `../js-db`:

```sh
npm link ../js-db
```

You would need to add these paths to `tsconfig.json`:

```
  "paths": {
    "@": ["index"],
    "@/*": ["*"],
    "@matrixai/db": ["../node_modules/@matrixai/db/src"],
    "@matrixai/db/*": ["../node_modules/@matrixai/db/src/*"]
  },
```

### Native Module Toolchain

There are some nuances when packaging with native modules.
Included native modules are level witch include leveldown and utp-native.

If a module is not set to public then pkg defaults to including it as bytecode.
To avoid this breaking with the `--no-bytecode` flag we need to add `--public-packages "*"`

#### leveldown

To get leveldown to work with pkg we need to include the prebuilds with the executable.
after building with pkg you need to copy from `node_modules/leveldown/prebuilds` -> `path_to_executable/prebuilds`
You only need to include the prebuilds for the arch you are targeting. e.g. for linux-x64 you need `prebuild/linux-x64`.

The folder structure for the executable should look like this.
- linux_executable_elf
- prebuilds
    - linux-x64
        - (node files)

#### threads.js

To make sure that the worker threads work properly you need to include the compiled worker scripts as an asset.
This can be fixed by adding the following to `package.json`

```json
"pkg": {
    "assets": "dist/bin/worker.js"
  }
```

If you need to include multiple assets then add them as an array.

```json
"pkg": {
    "assets": [
      "node_modules/utp-native/**/*",
      "dist/bin/worker.js"
    ]
  }
```

### Docs Generation

```sh
npm run docs
```

See the docs at: https://matrixai.github.io/TypeScript-Demo-Lib/

### Publishing

Publishing is handled automatically by the staging pipeline.

Prerelease:

```sh
# npm login
npm version prepatch --preid alpha # premajor/preminor/prepatch
git push --follow-tags
```

Release:

```sh
# npm login
npm version patch # major/minor/patch
git push --follow-tags
```

Manually:

```sh
# npm login
npm version patch # major/minor/patch
npm run build
npm publish --access public
git push
git push --tags
```
### Packaging Cross-Platform Executables

We use `pkg` to package the source code into executables.

This requires a specific version of `pkg` and also `node-gyp-build`.

Configuration for `pkg` is done in:

* `package.json` - Pins `pkg` and `node-gyp-build`, and configures assets and scripts.
* `utils.nix` - Pins `pkg` for Nix usage
* `release.nix` - Build expressions for executables

## Deployment

Image deployments are done automatically through the CI/CD. However manual scripts are available below for deployment.

### Deploying to AWS ECR:

#### Using skopeo

```sh
tag='manual'
registry_image='015248367786.dkr.ecr.ap-southeast-2.amazonaws.com/polykey'

# Authenticates skopeo
aws ecr get-login-password \
  | skopeo login \
  --username AWS \
  --password-stdin \
  "$registry_image"

build="$(nix-build ./release.nix --attr docker)"
# This will push both the default image tag and the latest tag
./scripts/deploy-image.sh "$build" "$tag" "$registry_image"
```

#### Using docker

```sh
tag='manual'
registry_image='015248367786.dkr.ecr.ap-southeast-2.amazonaws.com/polykey'

aws ecr get-login-password \
  | docker login \
  --username AWS \
  --password-stdin \
  "$registry_image"

build="$(nix-build ./release.nix --attr docker)"
loaded="$(docker load --input "$build")"
image_name="$(cut -d':' -f2 <<< "$loaded" | tr -d ' ')"
default_tag="$(cut -d':' -f3 <<< "$loaded")"

docker tag "${image_name}:${default_tag}" "${registry_image}:${default_tag}"
docker tag "${image_name}:${default_tag}" "${registry_image}:${tag}"
docker tag "${image_name}:${default_tag}" "${registry_image}:latest"

docker push "${registry_image}:${default_tag}"
docker push "${registry_image}:${tag}"
docker push "${registry_image}:latest"
```

