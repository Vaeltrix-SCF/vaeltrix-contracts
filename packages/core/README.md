# @vaeltrix/core

Shared off-chain protocol primitives (VX-106, guide §11.3).

- `providerId(homeDomain, adminG)` and `paymentId(sep31TxId, providerIdHex)` return lowercase SHA-256 hex IDs.
- `canonicalize(value)` and `jcsHash(value)` use RFC 8785 JSON. JSON does not accept bigint; encode monetary fields as decimal strings in signed documents.
- `receiptBytes(fields, networkPassphrase)` returns the exact 131-byte receipt. `signReceipt(fields, networkPassphrase, keypair)` signs those bytes directly; `verifyReceipt(fields, networkPassphrase, signature, signerHex)` checks them.
- `signEvent(event, keypair)` sets the signer and replaces any supplied signature. `verifyEvent(event, allowedSignerHexes)` checks membership and the canonical signed document. Endpoint authorization, network, freshness and event-kind checks belong to the observer.
- Verdict functions retain the Rust names and argument order. All integer arguments are bigint. Invalid or overflowing arithmetic returns `null`, matching Rust `None`.
- `toStroops(decimal)` and `fromStroops(bigint)` preserve signed i128 values with seven decimal places.
- `merkleRoot(records)` returns hex; `merkleProof(records, paymentId)` returns ordered `{ side, hash }` siblings, omitting promoted odd nodes. Records use bigint times and string amounts. Times outside JSON's exact integer range are rejected to prevent a verifier from hashing rounded timestamps. Duplicate payment IDs are rejected.
- `loadConfig(env?)` validates public testnet settings and the deployment manifest. Credentials are deliberately excluded; consumers validate their own required secrets and must not log them.

Run `pnpm test:vectors` from the repository root to compare production functions against the shared Rust/TypeScript fixtures.
