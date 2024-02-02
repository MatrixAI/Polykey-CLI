{ npmDepsHash ? ""
, commitHash ? null
, pkgs ? import ./pkgs.nix {}
}:

with pkgs;
let
  utils = callPackage ./utils.nix {};
  buildPkg = platform: arch:
    if npmDepsHash == "" then
      throw "You must provide an `npmDepsHash` using `prefetch-npm-deps` and pass it in as `--argstr npmDepsHash \"...\"`"
    else
      buildNpmPackage {
        # Show full compilation flags
        # NIX_DEBUG = 1;
        inherit npmDepsHash;
        name = "${utils.packageName}-${utils.packageVersion}-${platform}-${arch}";
        src = utils.src;
        PKG_CACHE_PATH = utils.pkgCachePath;
        PKG_IGNORE_TAG = 1;
        GIT_DIR = utils.dotGit;
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
in
  rec {
    application = callPackage ./default.nix { inherit npmDepsHash; inherit commitHash; };
    buildJSON = builtins.fromJSON (builtins.readFile "${application}/build.json");
    docker = dockerTools.buildImage {
      name = application.name;
      copyToRoot = [ application ];
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
    package = {
      linux = {
        x64 = {
          elf = buildPkg "linux" "x64";
        };
      };
      windows = {
        x64 = {
          exe = buildPkg "win32" "x64";
        };
      };
      macos = {
        x64 = {
          macho = buildPkg "darwin" "x64";
        };
        arm64 = {
          macho = buildPkg "darwin" "arm64";
        };
      };
    };
  }
