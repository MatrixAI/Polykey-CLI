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
          "https://github.com/yao-pkg/pkg-fetch/releases/download/v3.5/node-v20.18.2-linux-x64";
        sha256 =
          "c811a87d18fbbd3893848360b4ad0c8e48bf265146c7f1881f4dae5220866b88";
      };
      "win32-x64" = fetchurl {
        url =
          "https://github.com/yao-pkg/pkg-fetch/releases/download/v3.5/node-v20.18.2-win-x64";
        sha256 =
          "fe7ea820ac3ef081bc97efeb67fc746272bb6d1eeca1690886356effbbd31350";
      };
      "macos-x64" = fetchurl {
        url =
          "https://github.com/yao-pkg/pkg-fetch/releases/download/v3.5/node-v20.18.2-macos-x64";
        sha256 =
          "68f69f407965a15adc3bf58fdb052f455c0ab7c836883372e00d15f70cbc5c1b";
      };
      "macos-arm64" = fetchurl {
        url =
          "https://github.com/yao-pkg/pkg-fetch/releases/download/v3.5/node-v20.18.2-macos-arm64";
        sha256 =
          "92faed49ad7c38c6374f1f421266ea4a09ed8d9830baebc1a5bcf2f3d90f107b";
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
