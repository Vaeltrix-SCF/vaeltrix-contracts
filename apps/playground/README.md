# Testnet playground

Issue #86. A separate React/Vite app for the deployed Vaeltrix foundation; it does not change contract interfaces or the marketing site.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @vaeltrix/playground dev
pnpm --filter @vaeltrix/playground build
pnpm test
```

Open the printed local URL in a browser with Freighter installed. Public reads need no wallet. The app imports `deployments/testnet.json` and reads the deployed Wasm specifications; generated binding scaffolds are not used. Update the tracked deployment manifest after any testnet reset.

## Tester walkthrough

1. Explore commitment **1**. Compare stake, provider, template and batches with the explorer links. The seeded empty batch is not evidence of completed payments.
2. Select **Stellar Testnet** in Freighter, connect, get test XLM from Friendbot, and review/sign the test USDC trustline.
3. Copy the funding request from the app and ask the deployment operator for this issuer's test USDC. Public keys only; never send anyone a wallet seed. This asset is a deployment-specific test token.
4. Register a lowercase home domain you control. The connected wallet public key is used as the receipt signer. Publish the matching `/.well-known/stellar.toml` and ask the operator/verifier to verify the provider. Verification is deliberately not a public UI action. See [testnet account setup](../../docs/testnet-accounts.md) and the guide's provider verification interface.
5. Refresh your wallet. Select the verified provider, enter stake, simulate, inspect the signer/amount/fee, and sign. Contract rejection leaves the transaction unsigned. The uncapped declared volume setting does not promise unlimited collateral.
6. After confirmation, open the new commitment under **Your commitments**. Test stake additions, excess withdrawals, pause and resume. Each requires a fresh simulation and review. The seeded provider belongs to its existing admin; a different wallet cannot operate it.
7. Check the saved transaction hash after a timeout or reload. Pending results lock further actions until confirmed. The app never automatically signs or resubmits. If a transaction remains unknown, ask the operator to reconcile its hash and expiry before clearing browser storage or repeating it elsewhere.

Exit transactions are outside this first UI. The explorer shows the real frozen exit cooldown in seconds; it is not shortened for the playground. Claims, challenges, payouts, payment tagging and observer automation are not implemented by this UI or the currently deployed foundation.

## Optional API diagnostics

Start the existing API with its dedicated read-only database login as described in the service docs, then enter its HTTP(S) origin. `/healthz` checks the process and `/v1/openapi.json` exposes implemented routes. Neither proves database readiness or business-flow availability. CORS must permit the playground origin; hosted HTTPS pages generally cannot call an insecure remote HTTP API. No hosted API is assumed.

## Hosting

The app is static. Build output is `apps/playground/dist`; deploy it on an HTTPS static host to use a wallet extension. The tracked `.openai/hosting.json` retains the private Sites identity. Registration alone is not publication.

For Sites, run `node apps/playground/export-site.mjs /absolute/new/source-directory`, then use the Sites setup helper with that directory as the retained template. This exports only the app, public testnet manifest and compiler settings. It excludes `.stellar`, environment files, repository metadata and service state. Persist the existing Site identity into the hosting checkout, install dependencies with the Sites helper, then build/package/publish with that workflow. Do not register a second Site for this app or upload the full monorepo.

## Verification limits

Automated tests cover integer boundaries, wallet/RPC network mismatches, account changes, absent/unresponsive extensions, expired or altered transactions, simulation rejection and confirmation polling. Live read checks and browser QA exercise the deployed public state. Real Freighter approvals remain a manual test in an extension-enabled browser; tests never import operator keys or move seeded stake.
