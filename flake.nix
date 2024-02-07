{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachSystem flake-utils.lib.allSystems (system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };

        utils = pkgs.callPackage ./utils.nix {};

        commitHash = toString (self.rev or self.dirtyRev);
        npmDepsHash = import ./npmDepsHash.nix;

        polykey_cli = pkgs.buildNpmPackage {
          inherit (npmDepsHash) npmDepsHash;
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

        buildJSON = builtins.fromJSON (builtins.readFile "${polykey_cli}/build.json");

        dockerImage = pkgs.dockerTools.buildImage {
          name = polykey_cli.name;
          copyToRoot = [ polykey_cli ];
          # This ensures symlinks to directories are preserved in the image
          keepContentsDirlinks = true;
          # This adds a correct timestamp, however breaks binary reproducibility
          created = "now";
          extraCommands = ''
            mkdir -m 1777 tmp
          '';
          config = {
            Entrypoint = [ "polykey" ];
            Labels = {
              "version" = buildJSON.versionMetadata.cliAgentVersion;
              "commitHash" = buildJSON.versionMetadata.cliAgentCommitHash;
              "libVersion" = buildJSON.versionMetadata.libVersion;
              "libSourceVersion" = buildJSON.versionMetadata.libSourceVersion;
              "libStateVersion" = toString buildJSON.versionMetadata.libStateVersion;
              "libNetworkVersion" = toString buildJSON.versionMetadata.libNetworkVersion;
            };
          };
        };
      in
      {
        apps = {
          polykey-cli = {
            type = "app";
            program = "${self.packages.${system}.polykey-cli}/bin/polykey";
          };
        };

        packages = {
          polykey-cli = polykey_cli;
          docker = dockerImage;
        };

        devShells = {
          default = import ./shell.nix { inherit pkgs; };
          ci = import ./shell.nix { inherit pkgs; ci = true; };
        };
      }
    );
}
