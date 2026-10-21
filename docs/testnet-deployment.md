# Testnet deployment (VX-502)

Use the repository's pinned Stellar CLI 28.1.0 (`STELLAR_BIN` may point to it).
Run commands from a clean, committed checkout of the reviewed contract revision.
The deployed revision must contain Registry, Bond and Scoreboard implementations;
empty scaffolds are not a usable deployment.

1. Run `node --import tsx scripts/lib/usdc.ts` to provision isolated accounts and self-issued test USDC.
2. Run `pnpm deploy:testnet` (or `node --import tsx scripts/deploy.ts --network testnet`).
3. Run seeding and smoke verification once the corresponding issues are implemented.

Only official testnet endpoints and passphrase are accepted. The script checks
network TTL limits, builds optimized WASM, deploys Registry → Scoreboard → Bond,
sets Scoreboard's Bond once, verifies on-chain hashes and writes the public manifest.
`DEPLOYMENTS_FILE` selects a throwaway manifest for validation.

An existing manifest requires `--fresh`. Its previous contents are backed up before
replacement. During deployment, `<manifest>.pending.json` records salts, returned
contract IDs and confirmed transactions after each step. An interrupted deployment
blocks another run: inspect and reconcile it rather than blindly resubmitting.
A successful deployment removes the pending file. Ignore a pending manifest as a
service configuration; only the completed manifest has verified wiring.

`startLedger` comes from the successful Registry creation transaction, matched by
its returned contract ID via RPC. Horizon's latest transaction alone is not used
as evidence. WASM hashes are independently checked against on-chain instances.
No private key is written to deployment manifests. Keep ignored `.stellar/` private.
