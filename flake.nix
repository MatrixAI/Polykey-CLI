{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs?rev=ea5234e7073d5f44728c499192544a84244bf35a";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    let
      # The system being used to build the outputs
      buildSystem = "x86_64-linux";

      # The target systems and their vercel/pkg mapping
      systems = {
        "x86_64-linux" = [ "linux" "x64" ];
        "x86_64-windows" = [ "win32" "x64" ];
        "x86_64-darwin" = [ "darwin" "x64" ];
        "aarch64-darwin" = [ "darwin" "arm64" ];
      };
    in
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

        polykey-cli-app = pkgs.buildNpmPackage {
          inherit npmDepsHash;
          pname = utils.packageName;
          meta = {
            # Other meta attributes like description, homepage, license, etc.
            mainProgram = "polykey";
          };
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

        polykey-cli-pkg = pkgs.buildNpmPackage {
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

        buildJSON = builtins.fromJSON (builtins.readFile "${polykey-cli-app}/build.json");

        dockerImage = pkgs.dockerTools.buildImage {
          name = polykey-cli-app.name;
          copyToRoot = [ polykey-cli-app ];
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
            nodejs
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
            program = "${self.packages.${targetSystem}.application}/bin/polykey";
          };
          polykey-cli = {
            type = "app";
            program = "${self.packages.${targetSystem}.polykey-cli}";
          };
        };

        packages = {
          polykey-cli = polykey-cli-pkg;
          application = polykey-cli-app;
          docker = dockerImage;
        };

        devShells = {
          default = shell { ci = false; };
          ci = shell { ci = true; };
        };
      }
    );
}
