{ pkgs ? import ./pkgs.nix {} }:

# This derivation just simply gets the commit hash from the current git repo
with pkgs;
stdenv.mkDerivation {
  name = "commitHash";
  src = ./.;
  buildInputs = [ gitAndTools.git ];
  buildPhase = ''
    echo -n "$(git rev-parse HEAD)" > $out
  '';
}
