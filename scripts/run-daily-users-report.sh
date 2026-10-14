#!/bin/zsh
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "/Users/sebaserritella/Repositories/Personal/Nido/nido-lactancia"
exec /opt/homebrew/bin/npm run report:users
