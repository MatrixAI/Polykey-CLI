#!/bin/sh

newHash=$(nix-shell -p prefetch-npm-deps --run "prefetch-npm-deps ./package-lock.json")

echo "{
  npmDepsHash = \"$newHash\";
}" > ./npmDepsHash.nix
