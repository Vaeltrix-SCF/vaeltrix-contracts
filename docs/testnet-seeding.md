# Demo seeding (VX-503)

After deployment, run `pnpm seed:testnet` from the repository root. It uses the
isolated aliases in ignored `.stellar/` and `DEPLOYMENTS_FILE` (default
`deployments/testnet.json`). Accounts, test-USDC SAC, trustlines and initial balances
are prerequisites provisioned by VX-501 and the deploy command.

The script resumes a recorded observer proposal, logs its ledger-time wait, and
activates it. It proposes/activates template 901, registers the mock provider,
manually verifies it as the deployment admin, and funds a 1,000 test-USDC commitment.
Every demo economic field and template version is checked before funds move.
The demo provider uses its test account's public key as its receipt signer. This is
manual testnet domain verification, not proof of ownership of the mock hostname.
The verifier remains the deployment admin, as allowed by guide §10.1.

A rerun reads existing state and reuses the same proposal, provider and funded
commitment. It does not top up previously spent balances. The public manifest's
`seed` section checkpoints progress. If a transaction result is uncertain, inspect
its on-chain status before rerunning; do not create another proposal blindly.
Optional templates 1–3 are omitted. The observer is not implemented yet, so a
signed delegation command is printed for later execution (VX-609 / #45).
No delegation is silently claimed to exist.
