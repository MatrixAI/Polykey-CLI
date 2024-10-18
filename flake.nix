{
  inputs = {
    nixpkgs-matrix = {
      type = "indirect";
      id = "nixpkgs-matrix";
    };

    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs-matrix, flake-utils, ... }:
    let
      # The target systems and their vercel/pkg mapping
      systems = { "x86_64-linux" = [ "linux" "x64" ]; };
    in flake-utils.lib.eachSystem (builtins.attrNames systems) (system:
      let
        pkgs = nixpkgs-matrix.legacyPackages.${system};

        platform = builtins.elemAt systems.${system} 0;
        arch = builtins.elemAt systems.${system} 1;

        utils = pkgs.callPackage ./utils.nix { };

        commitHash = builtins.replaceStrings [ "-dirty" ] [ "" ]
          (toString (self.rev or self.dirtyRev));
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
          name =
            "${utils.packageName}-${utils.packageVersion}-${platform}-${arch}";
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

        buildJSON =
          builtins.fromJSON (builtins.readFile "${polykey-cli}/build.json");

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

        shell = { ci ? false }:
          with pkgs;
          pkgs.mkShell {
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
              . <(pk secrets env Polykey-CLI:.)
              set +o allexport
              set -v
              ${lib.optionalString ci ''
                set -o errexit
                set -o nounset
                set -o pipefail
                shopt -s inherit_errexit
              ''}
              mkdir --parents "$(pwd)/tmp"

              export PATH="$(pwd)/dist/bin:$(npm root)/.bin:$PATH"

              npm install --ignore-scripts

              set +v
            '';
          };
      in {
        apps = {
          default = {
            type = "app";
            program = "${polykey-cli}/bin/polykey";
          };
          executable = {
            type = "app";
            program = polykey-cli-executable;
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
      }) // (let
        modules = import ./modules.nix {
          inherit nixpkgs-matrix;
          outputs = self.outputs;
          system = "x86_64-linux";
        };
      in {
        nixosModules.default = modules.polykey;
        homeModules.default = modules.polykey-home;
      });
}
