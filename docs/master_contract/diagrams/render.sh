#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MMD_CLI="${MMD_CLI:-npx -y @mermaid-js/mermaid-cli}"

render() {
  local input="$1"
  local output="$2"
  eval "$MMD_CLI -i \"$DIR/$input\" -o \"$DIR/$output\" -b white -t default"
}

render "c4-context.mmd" "c4-context.png"
render "c4-container.mmd" "c4-container.png"
render "c4-component-backend.mmd" "c4-component-backend.png"
render "erd.mmd" "erd.png"

echo "Rendered diagrams into $DIR"
