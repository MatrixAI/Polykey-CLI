{ runCommandNoCC
, linkFarm
, nix-gitignore
, nodejs
, node2nix
, pkgs
, lib
, fetchurl
, fetchFromGitHub
}:

rec {
  # This removes the org scoping
  basename = builtins.baseNameOf node2nixDev.packageName;
  # Filter source to only what's necessary for building
  src = nix-gitignore.gitignoreSource [
    # The `.git` itself should be ignored
    ".git"
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
  nodeVersion = builtins.elemAt (lib.versions.splitVersion nodejs.version) 0;
  node2nixDrv = dev: runCommandNoCC "node2nix" {} ''
    mkdir $out
    ${node2nix}/bin/node2nix \
      ${lib.optionalString dev "--development"} \
      --input ${src}/package.json \
      --lock ${src}/package-lock.json \
      --node-env $out/node-env.nix \
      --output $out/node-packages.nix \
      --composition $out/default.nix \
      --nodejs-${nodeVersion}
  '';
  node2nixProd = (import (node2nixDrv false) { inherit pkgs nodejs; }).nodeDependencies.override (attrs: {
    # Use filtered source
    src = src;
    # Do not run build scripts during npm rebuild and npm install
    npmFlags = "--ignore-scripts";
    # Do not run npm install, dependencies are installed by nix
    dontNpmInstall = true;
  });
  node2nixDev = (import (node2nixDrv true) { inherit pkgs nodejs; }).package.override (attrs: {
    # Use filtered source
    src = src;
    # Do not run build scripts during npm rebuild and npm install
    # They will be executed in the postInstall hook
    npmFlags = "--ignore-scripts";
    # Show full compilation flags
    NIX_DEBUG = 1;
    # Don't set rpath for native addons
    # Native addons do not require their own runtime search path
    # because they dynamically loaded by the nodejs runtime
    NIX_DONT_SET_RPATH = true;
    NIX_NO_SELF_RPATH = true;
    postInstall = ''
      # Path to headers used by node-gyp for native addons
      export npm_config_nodedir="${nodejs}"
      # This will setup the typescript build
      npm run build
    '';
  });
  pkgBuilds = {
    "3.4" = {
      "linux-x64" = fetchurl {
        url = "https://github.com/vercel/pkg-fetch/releases/download/v3.4/node-v18.5.0-linux-x64";
        sha256 = "0b7iimvh2gldvbqfjpx0qvzg8d59miv1ca03vwv6rb7c2bi5isi5";
      };
      "win32-x64" = fetchurl {
        url = "https://github.com/vercel/pkg-fetch/releases/download/v3.4/node-v18.5.0-win-x64";
        sha256 = "0jxrxgcggpzzx54gaai24zfywhq6fr0nm75iihpn248hv13sdsg0";
      };
      "macos-x64" = fetchurl {
        url = "https://github.com/vercel/pkg-fetch/releases/download/v3.4/node-v18.5.0-macos-x64";
        sha256 = "0dg46fw3ik2wxmhymcj3ih0wx5789f2fhfq39m6c1m52kvssgib3";
      };
      # No build for v18.15.0 macos-arm64 build
      # "macos-arm64" = fetchurl {
      #   url = "https://github.com/vercel/pkg-fetch/releases/download/v3.4/node-v18.5.0-macos-arm64";
      #   sha256 = "1znxssrwcg8nxfr03x1dfz49qq70ik33nj42dxr566vanayifa94";
      # };
    };
  };
  pkgCachePath =
    let
      pkgBuild = pkgBuilds."3.4";
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
