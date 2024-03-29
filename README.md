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
nix build
```

### Nix/NixOS

```sh
nix build
nix build '.#executable'
nix build '.#docker'
nix build '.#packages.x86_64-linux.executable'
nix build '.#packages.x86_64-windows.executable'
nix build '.#packages.x86_64-darwin.executable'
```

Install into Nix user profile:

```sh
nix profile install github:MatrixAI/Polykey-CLI
```

The program can be run directly without installing via `nix run`

```sh
nix run . -- agent start
```

### Docker

Install into Docker:

```sh
nix build '.#docker'
image="$(docker load < result | cut -d' ' -f3)"
docker run -it "$image"
```

## Development

Run `nix develop`, and once you're inside, you can use:

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

See the docs at: https://matrixai.github.io/Polykey-CLI/

### Publishing

```sh
# npm login
npm version patch # major/minor/patch
npm run build
npm publish --access public
git push
git push --tags
```
