# Registry parameters

`params.testnet.json` and `params.mainnet.example.json` reproduce guide §5.7.
Money uses decimal strings in stroops; time windows use integer seconds.
The Rust integration test loads both files and constructs the real registry,
so the production §5.6 validator checks them on every CI run.

Both files use the all-zero contract address as an explicit asset placeholder.
Replace `allowed_stake_assets` with the USDC SAC address for the intended deployment
before use. No asset is deployed or identified by these files.

The pilot example uses `max_stake_per_commitment: "0"` (uncapped): §5.7 leaves
that value to governance. Its other pilot defaults match the guide. The example
contains no network credentials or endpoints; this repository's scripts target testnet.

Run `cargo test -p vaeltrix-registry --test params_config` to verify the files.
