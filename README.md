# Polykey-CLI

staging:[![pipeline status](https://gitlab.com/MatrixAI/open-source/Polykey-CLI/badges/staging/pipeline.svg)](https://gitlab.com/MatrixAI/open-source/Polykey-CLI/commits/staging)
master:[![pipeline status](https://gitlab.com/MatrixAI/open-source/Polykey-CLI/badges/master/pipeline.svg)](https://gitlab.com/MatrixAI/open-source/Polykey-CLI/commits/master)

Polykey is an open-source, peer-to-peer system that addresses the critical challenge in cybersecurity: the secure sharing and delegation of authority, in the form of secrets like keys, tokens, certificates, and passwords.

It allows users including developers, organizations, and machines—to store these secrets in encrypted vaults on their own devices, and share them directly with trusted parties.

All data is end-to-end encrypted, both in transit and at rest, eliminating the risk associated with third-party storage.

Polykey provides a command line interface, desktop and mobile GUI, and a web-based control plane for organizational management.

By treating secrets as tokenized authority, it offers a fresh approach to managing and delegating authority in zero-trust architectures without adding burdensome policy complexity - a pervasive issue in existing zero-trust systems.

Unlike complex self-hosted secrets management systems that require specialized skills and infrastructure, Polykey is installed and running directly from the end-user device.

It is built to automatically navigate network complexities like NAT traversal, connecting securely to other nodes without manual configuration.

Key features:

* Decentralized Encrypted Storage - No storage of secrets on third parties, secrets are stored on your device and synchronised point-to-point between Polykey nodes.
* Secure Peer-to-Peer Communication - Polykey bootstraps TLS keys by federating trusted social identities (e.g. GitHub).
* Secure Computational Workflows - Share static secrets (passwords, keys, tokens and certificates) with people, between teams, and across machine infrastructure. Create dynamic (short-lived) smart-tokens with embedded policy for more sophisticated zero-trust authority verification.
* With Polykey Enterprise, you can create private networks of Polykey nodes and apply mandatory policy governing node behaviour.

https://github.com/MatrixAI/Polykey-CLI/assets/640797/7e0b2bd8-9d87-4c9a-8102-750c39579de4

This repository is the CLI for Polykey.

The Polykey project is split up into these main repositories:

* [Polykey](https://github.com/MatrixAI/Polykey) - Polykey Core Library
* [Polykey-CLI](https://github.com/MatrixAI/Polykey-CLI) - CLI of Polykey
* [Polykey-Desktop](https://github.com/MatrixAI/Polykey-Desktop) - Polykey Desktop (Windows, Mac, Linux) application
* [Polykey-Mobile](https://github.com/MatrixAI/Polykey-Mobile) - Polykey Mobile (iOS & Android) Application
* [Polykey Enterprise](https://polykey.com) - Web Control Plane SaaS

Have a bug or a feature-request? Please submit it the issues of the relevant subproject above.

For tutorials, how-to guides, reference and theory, see the [docs](https://polykey.com/docs).

Have a question? Join our [discussion board](https://github.com/MatrixAI/Polykey/discussions).

Have a security issue you want to let us know? You can contact us on our website.

Our main website is https://polykey.com

## Installation

Note that JavaScript libraries are not packaged in Nix. Only JavaScript applications are.

Building the package:

```sh
npmDepsHash="$(prefetch-npm-deps ./package-lock.json)"
nix-build -E "(import ./pkgs.nix {}).callPackage ./default.nix { npmDepsHash = \"$npmDepsHash\"; }"
```

### Nix/NixOS

Building the releases:

```sh
nix-build ./release.nix --attr application --argstr npmDepsHash "$(prefetch-npm-deps ./package-lock.json)"
nix-build ./release.nix --attr docker --argstr npmDepsHash "$(prefetch-npm-deps ./package-lock.json)"
nix-build ./release.nix --attr package.linux.x64.elf --argstr npmDepsHash "$(prefetch-npm-deps ./package-lock.json)"
nix-build ./release.nix --attr package.windows.x64.exe --argstr npmDepsHash "$(prefetch-npm-deps ./package-lock.json)"
nix-build ./release.nix --attr package.macos.x64.macho --argstr npmDepsHash "$(prefetch-npm-deps ./package-lock.json)"
```

Install into Nix user profile:

```sh
nix-env -f ./release.nix --install --attr application --argstr npmDepsHash "$(prefetch-npm-deps ./package-lock.json)"
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

### Docs Generation

```sh
npm run docs
```

See the docs at: https://matrixai.github.io/TypeScript-Demo-Lib/

### Publishing

```sh
# npm login
npm version patch # major/minor/patch
npm run build
npm publish --access public
git push
git push --tags
```

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

