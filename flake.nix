{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };

        utils = pkgs.callPackage ./utils.nix {};

        # This isn't supposed to be set from flakes;
        # parameters in flakes reduce reproducability,
        # lockfiles should be used instead.
        commitHash = "";
        npmDepsHash = "";

        polykey_cli = { commitHash, npmDepsHash, utils }: pkgs.buildNpmPackage {
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
      in
      {
        packages = {
          polykey-cli = polykey_cli { commitHash = commitHash; npmDepsHash = npmDepsHash; utils = utils; }; 
        };
      }
    );
}
