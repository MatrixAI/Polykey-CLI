{ nix-gitignore
, linkFarm
, nodejs
, lib
, fetchurl
}:

rec {
  nodeVersion = builtins.elemAt (lib.versions.splitVersion nodejs.version) 0;
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
  packageJSON = builtins.fromJSON (builtins.readFile "${src}/package.json");
  # This removes the org scoping
  packageName = builtins.baseNameOf packageJSON.name;
  packageVersion = packageJSON.version;
  pkgBuilds = {
    "3.5" = {
      "linux-x64" = fetchurl {
        url = "https://github.com/yao-pkg/pkg-fetch/releases/download/v3.5/node-v18.15.0-linux-x64";
        sha256 = "0pwbh2wxvkhl57s1fb2rivfjay963f00hz98kh5nvs4r2brl2a2p";
      };
      "win32-x64" = fetchurl {
        url = "https://github.com/yao-pkg/pkg-fetch/releases/download/v3.5/node-v18.15.0-win-x64";
        sha256 = "04brqm5avx8crfg28w706r0hkm8jx5gyadq9knq67s7jwd8x9j50";
      };
      "macos-x64" = fetchurl {
        url = "https://github.com/yao-pkg/pkg-fetch/releases/download/v3.5/node-v18.15.0-macos-x64";
        sha256 = "0xbqbd6bdfd7qbf94575103n2awndlnfv013mc92scvshl015ffx";
      };
      # No build for v18.15.0 macos-arm64 build
      # "macos-arm64" = fetchurl {
      #   url = "";
      #   sha256 = "";
      # };
    };
  };
  pkgCachePath =
    let
      pkgBuild = pkgBuilds."3.5";
      fetchedName = n: builtins.replaceStrings ["node"] ["fetched"] n;
    in
      linkFarm "pkg-cache"
        [
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
          # No build for v18.15 macos-arm64 build
          # {
          #   name = fetchedName pkgBuild.macos-arm64.name;
          #   path = pkgBuild.macos-arm64;
          # }
        ];
}
