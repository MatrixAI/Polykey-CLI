{ npmDepsHash ? ""
, commitHash ? null
, callPackage
, buildNpmPackage
}:

let
  utils = callPackage ./utils.nix {};
in
  if npmDepsHash == "" then
    throw "You must provide an `npmDepsHash` using `prefetch-npm-deps` and pass it in as `--argstr npmDepsHash \"...\"`"
  else
    buildNpmPackage {
      # Show full compilation flags
      # NIX_DEBUG = 1;
      inherit npmDepsHash;
      pname = utils.packageName;
      version = utils.packageVersion;
      src = utils.src;
      COMMIT_HASH = commitHash;
      GIT_DIR = utils.dotGit;
      # Filter out things kept by `src`, these were needed for building
      # but not needed for subsequent usage of the store path
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
    }
