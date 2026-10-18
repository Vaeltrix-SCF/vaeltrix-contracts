#!/usr/bin/env bash
# Regenerate packages/bindings/{registry,bond,scoreboard} from deployed contracts.
# Spec: guide §10.5. Implemented by VX-504.
#
# Note for VX-504: `stellar contract bindings typescript` is deprecated as of
# stellar-cli 28. Use the generator shipped in @stellar/stellar-sdk instead:
#
#   pnpm --filter @vaeltrix/scripts exec stellar-js generate \
#     --contract-id "$(jq -r .contracts.registry deployments/$NETWORK.json)" \
#     --network "$NETWORK" --contract-name registry \
#     --output-dir packages/bindings/registry --overwrite
#
# See docs/toolchain.md.
set -euo pipefail
NETWORK="${1:-testnet}"
echo "scripts/bindings.sh ($NETWORK) is not implemented yet (VX-504)." >&2
exit 1
