{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs";
    flake-utils.url = "github:numtide/flake-utils";

    nixpkgs-matrix.url = "github:matrixai/nixpkgs-matrix";
    nixpkgs.follows = "nixpkgs-matrix/nixpkgs";
  };

  outputs = { self, nixpkgs, flake-utils, ... }:
    let
      # The system being used to build the outputs
      buildSystem = "x86_64-linux";

      # The target systems and their vercel/pkg mapping
      systems = {
        "x86_64-linux" = [ "linux" "x64" ];
      };
    in
    {
      nixosModules.default = { config, ... }: with nixpkgs; with lib;
      {
        options = {
          services.polykey = {
            enable = mkEnableOption "Enable the Polykey agent. Users with the `polykey` group or root permissions will be able to manage the agent.";

            passwordFilePath = mkOption {
              type = with types; uniq str;
              description = ''
              The path to the Polykey password file. This is required to be set for the module to work, otherwise this module will fail.
              '';
            };

            recoveryCodeFilePath = mkOption {
              type = with types; uniq str;
              default = "";
              description = ''
              The path to the Polykey recovery code file. This is not required, but if set will read a recovery code from the provided path to bootstrap a new state with.
              '';
            };

            recoveryCodeOutPath = mkOption {
              type = with types; uniq str;
              description = ''
              The path to the Polykey recovery code file output location.
              '';
            };

            statePath = mkOption {
              type = with types; uniq str;
              default = "/var/lib/polykey";
              description = "The path to the Polykey node state directory. Will default to `/var/lib/polykey`, but can be overwritten to a custom path.";
            };
          };
          programs.polykey = {
            enable = mkEnableOption "Enable the per-user Polykey agent.";

            passwordFilePath = mkOption {
              type = with types; uniq str;
              description = ''
              The path to the Polykey password file. This is required to be set for the module to work, otherwise this module will fail.
              '';
            };

            recoveryCodeFilePath = mkOption {
              type = with types; uniq str;
              default = "";
              description = ''
              The path to the Polykey recovery code file. This is not required, but if set will read a recovery code from the provided path to bootstrap a new state with.
              '';
            };

            recoveryCodeOutPath = mkOption {
              type = with types; uniq str;
              description = ''
              The path to the Polykey recovery code file output location.
              '';
            };

            statePath = mkOption {
              type = with types; uniq str;
              default = "%h/.local/share/polykey";
              description = "The path to the Polykey node state directory. Will default to `$HOME/.local/share/polykey`, but can be overwritten to a custom path.";
            };
          };
        };
        config = mkMerge [
          (mkIf config.services.polykey.enable {
            users.groups.polykey = {};

            environment.systemPackages = [
              self.outputs.packages.${buildSystem}.default
            ];

            system.activationScripts.makeAgentPaths = ''
              mkdir -p ${config.services.polykey.statePath}
              chgrp -R polykey ${config.services.polykey.statePath}
              chmod 770 ${config.services.polykey.statePath}
            '';

            systemd.services.polykey = {
              description = "Polykey Agent";
              wantedBy = [ "multi-user.target" ];
              after = [ "network.target" ];
              serviceConfig = {
                User = "root";
                Group = "polykey";
                PermissionsStartOnly = true;
                LoadCredential = [
                  "password:${config.services.polykey.passwordFilePath}"
                ];
                ExecStartPre = ''
                  -${self.outputs.packages.${buildSystem}.default}/bin/polykey \
                  --password-file ''${CREDENTIALS_DIRECTORY}/password \
                  --node-path ${config.services.polykey.statePath} \
                  bootstrap  ${lib.optionalString (config.services.polykey.recoveryCodeFilePath != "") '' -rcf ${config.services.polykey.recoveryCodeFilePath}''}\
                  --recovery-code-out-file ${config.services.polykey.recoveryCodeOutPath}
                '';
                ExecStart = ''
                  ${self.outputs.packages.${buildSystem}.default}/bin/polykey \
                  --password-file ''${CREDENTIALS_DIRECTORY}/password \
                  --node-path ${config.services.polykey.statePath} \
                  agent start \
                  --recovery-code-out-file ${config.services.polykey.recoveryCodeOutPath}
                '';
              };
            };
          })
          (mkIf config.programs.polykey.enable {
            environment.systemPackages = [
              self.outputs.packages.${buildSystem}.default
            ];

            system.activationScripts.makeUserAgentPaths = ''
              mkdir -p ${config.programs.polykey.statePath}
            '';

            systemd.user.services.polykey = {
              description = "Polykey Agent";
              wantedBy = [ "default.target" ];
              after = [ "network.target" ];
              serviceConfig = {
                ExecStartPre = ''
                  -${self.outputs.packages.${buildSystem}.default}/bin/polykey \
                  --password-file ${config.programs.polykey.passwordFilePath} \
                  --node-path ${config.programs.polykey.statePath} \
                  bootstrap  ${lib.optionalString (config.programs.polykey.recoveryCodeFilePath != "") '' -rcf ${config.programs.polykey.recoveryCodeFilePath}''}\
                  --recovery-code-out-file ${config.programs.polykey.recoveryCodeOutPath}
                '';
                ExecStart = ''
                  ${self.outputs.packages.${buildSystem}.default}/bin/polykey \
                  --password-file ${config.programs.polykey.passwordFilePath} \
                  --node-path ${config.programs.polykey.statePath} \
                  agent start \
                  --recovery-code-out-file ${config.programs.polykey.recoveryCodeOutPath}
                '';
              };
            };
          })
        ];
      };
    } //
    flake-utils.lib.eachSystem (builtins.attrNames systems) (targetSystem:
      let
        platform = builtins.elemAt systems.${targetSystem} 0;
        arch = builtins.elemAt systems.${targetSystem} 1;

        pkgs = import nixpkgs {
          system = buildSystem;
        };

        utils = pkgs.callPackage ./utils.nix {};

        commitHash = toString (self.rev or self.dirtyRev);
        npmDepsHash = builtins.readFile ./npmDepsHash;

        polykey-cli = pkgs.buildNpmPackage {
          inherit npmDepsHash;
          pname = utils.packageName;
          version = utils.packageVersion;
          src = utils.src;
          COMMIT_HASH = commitHash;
          GIT_DIR = if commitHash != null then null else utils.dotGit;
          postInstall = ''
            mv "$packageOut"/build/build.json "$out"/build.json;
            rm -rf \
              "$packageOut"/build \
              "$packageOut"/src \
              "$packageOut"/.env.example \
              "$packageOut"/images \
              "$packageOut"/scripts \
              "$packageOut"/tsconfig.build.json \
              "$packageOut"/tsconfig.json \
              "$packageOut"/LICENSE \
              "$packageOut"/ADDITIONAL_TERMS \
              "$packageOut"/README.md;
          '';
        };

        polykey-cli-executable = pkgs.buildNpmPackage {
          inherit npmDepsHash;
          name = "${utils.packageName}-${utils.packageVersion}-${platform}-${arch}";
          src = utils.src;
          PKG_CACHE_PATH = utils.pkgCachePath;
          PKG_IGNORE_TAG = 1;
          COMMIT_HASH = commitHash;
          GIT_DIR = if commitHash != null then null else utils.dotGit;
          postBuild = ''
            npm run pkg -- \
              --output=out \
              --bin=dist/polykey.js \
              --node-version=${utils.nodeVersion} \
              --platform=${platform} \
              --arch=${arch}
          '';
          installPhase = ''
            cp ${if platform == "win32" then "out.exe" else "out"} $out
          '';
          dontFixup = true;
        };

        buildJSON = builtins.fromJSON (builtins.readFile "${polykey-cli}/build.json");

        docker = pkgs.dockerTools.buildImage {
          name = polykey-cli.name;
          copyToRoot = [ polykey-cli ];
          keepContentsDirlinks = true;
          created = "now";
          extraCommands = ''
            mkdir -m 1777 tmp
          '';
          config = {
            Entrypoint = [ "polykey" ];
            Labels = buildJSON.versionMetadata;
          };
        };

        shell = { ci ? false }: with pkgs; pkgs.mkShell {
          nativeBuildInputs = [
            nodejs_20
            prefetch-npm-deps
            shellcheck
            gitAndTools.gh
            gitAndTools.git
            awscli2
            skopeo
            jq
          ];
          PKG_CACHE_PATH = utils.pkgCachePath;
          PKG_IGNORE_TAG = 1;
          shellHook = ''
            echo "Entering $(npm pkg get name)"
            set -o allexport
            . ./.env
            set +o allexport
            set -v
            ${
              lib.optionalString ci
              ''
              set -o errexit
              set -o nounset
              set -o pipefail
              shopt -s inherit_errexit
              ''
            }
            mkdir --parents "$(pwd)/tmp"

            export PATH="$(pwd)/dist/bin:$(npm root)/.bin:$PATH"

            npm install --ignore-scripts

            set +v
          '';
        };
      in
      {
        apps = {
          default ={
            type = "app";
            program = "${self.packages.${targetSystem}.default}/bin/polykey";
          };
          executable = {
            type = "app";
            program = "${self.packages.${targetSystem}.executable}";
          };
        };

        packages = {
          default = polykey-cli;
          executable = polykey-cli-executable;
          docker = docker;
        };

        devShells = {
          default = shell { ci = false; };
          ci = shell { ci = true; };
        };
      }
    );
}
