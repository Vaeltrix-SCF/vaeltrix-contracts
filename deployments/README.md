# Deployments

`deployments/<network>.json` is written by `pnpm deploy:testnet` (VX-502) and holds contract IDs, wasm hashes, accounts and `startLedger` (guide §10.3). Every script takes `--network` and reads contract IDs from here. Commit `testnet.json` once it exists so services build without network access.
