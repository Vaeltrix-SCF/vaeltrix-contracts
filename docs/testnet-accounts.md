# Testnet accounts and test USDC (VX-501)

Run `node --import tsx scripts/lib/usdc.ts` from the repository root with Stellar CLI
28.1.0 on PATH (or set STELLAR_BIN). This creates six isolated CLI aliases under
ignored `.stellar/`, funds missing accounts with Friendbot, deploys deterministic
self-issued test USDC, adds missing trustlines, and tops balances up to 100,000,
10,000, and 1,000 USDC for provider, client, and observer respectively.
A repeat before funds are spent makes no transactions. After funds are spent, it
restores those minimum balances. Classic transaction timeouts report the hash;
inspect its status before rerunning. Public addresses are logged; secrets are not.
Keep `.stellar/` private and backed up if the deployment must be retained.

`USDC_SOURCE=self` is the default. `USDC_SOURCE=circle` is an explicitly unsupported
alternative until issuer/faucet configuration is implemented; it fails before
creating accounts or transactions. No public Circle faucet dependency is required.
Only official testnet endpoints and the testnet passphrase are accepted.
