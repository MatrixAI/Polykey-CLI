{ nix-gitignore, linkFarm, nodejs_20, lib, fetchurl }:

rec {
  nodeVersion = builtins.elemAt (lib.versions.splitVersion nodejs_20.version) 0;
  # Filter source to only what's necessary for building
  src = nix-gitignore.gitignoreSource [
    # The `.git` itself should be ignored
    ".git"
    # Non-build files
    "/nodemon.json"
    # Hidden files
    "/.*"
    # Nix files
    "/*.nix"
    # Benchmarks
    "/benches"
    # Docs
    "/docs"
    # Tests
    "/tests"
    "/jest.config.js"
  ] ./.;
  dotGit = ./.git;
  packageJSON = builtins.fromJSON (builtins.readFile "${src}/package.json");
  # This removes the org scoping
  packageName = builtins.baseNameOf packageJSON.name;
  packageVersion = packageJSON.version;
  pkgBuilds = {
    "3.5" = {
      "linux-x64" = fetchurl {
        url =
          "https://github.com/yao-pkg/pkg-fetch/releases/download/v3.5/node-v20.11.1-linux-x64";
        sha256 =
          "0f065bb2ccfdedaa7889e04604516604c2d0c0a0d9d13869578a6b3916b9a93e";
      };
      "win32-x64" = fetchurl {
        url =
          "https://github.com/yao-pkg/pkg-fetch/releases/download/v3.5/node-v20.11.1-win-x64";
        sha256 =
          "140c377c2c91751832e673cb488724cbd003f01aa237615142cd2907f34fa1a2";
      };
      "macos-x64" = fetchurl {
        url =
          "https://github.com/yao-pkg/pkg-fetch/releases/download/v3.5/node-v20.11.1-macos-x64";
        sha256 =
          "1558a49dfea01ae42702a71eaa1c7a6479abde8b2778bc7cb4f9a65d65a0afa6";
      };
      "macos-arm64" = fetchurl {
        url =
          "https://github.com/yao-pkg/pkg-fetch/releases/download/v3.5/node-v20.11.1-macos-arm64";
        sha256 =
          "1fa7f9e233820cfc5668ba21b70c463214f981fc69f1b8175b25dfa871451e26";
      };
    };
  };
  pkgCachePath = let
    pkgBuild = pkgBuilds."3.5";
    fetchedName = n: builtins.replaceStrings [ "node" ] [ "fetched" ] n;
  in linkFarm "pkg-cache" [
    {
      name = fetchedName pkgBuild.linux-x64.name;
      path = pkgBuild.linux-x64;
    }
    {
      name = fetchedName pkgBuild.win32-x64.name;
      path = pkgBuild.win32-x64;
    }
    {
      name = fetchedName pkgBuild.macos-x64.name;
      path = pkgBuild.macos-x64;
    }
    {
      name = fetchedName pkgBuild.macos-arm64.name;
      path = pkgBuild.macos-arm64;
    }
  ];
}
