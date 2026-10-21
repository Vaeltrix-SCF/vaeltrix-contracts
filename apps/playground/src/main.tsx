import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as chain from "./chain";
import {
  amount,
  apiOrigin,
  hex,
  homeDomain,
  id,
  json,
  message,
  units,
  submissionRejected,
} from "./model";
import "./style.css";

const explorer = "https://stellar.expert/explorer/testnet";
const TX_KEY = "vaeltrix:testnet:transaction:v1";
type TransactionState = {
  hash: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "REJECTED";
  summary: string;
};
function savedTransaction(): TransactionState | null {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage.getItem(TX_KEY) ?? "null");
    if (
      value &&
      typeof value === "object" &&
      "hash" in value &&
      typeof value.hash === "string" &&
      /^[a-f0-9]{64}$/.test(value.hash) &&
      "status" in value &&
      ["PENDING", "SUCCESS", "FAILED", "REJECTED"].includes(String(value.status)) &&
      "summary" in value &&
      typeof value.summary === "string"
    )
      return value as TransactionState;
  } catch {
    /* Storage may be unavailable; signing still requires a successful write. */
  }
  return null;
}

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}
function Raw({ title, value }: { title: string; value: unknown }) {
  return (
    <details>
      <summary>{title}</summary>
      <pre>{json(value)}</pre>
    </details>
  );
}

function App() {
  const [data, setData] = useState<chain.Snapshot | null>(null);
  const [lookup, setLookup] = useState("1");
  const [selected, setSelected] = useState("1");
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState("");
  const [notice, setNotice] = useState("");
  const [wallet, setWallet] = useState("");
  const [providers, setProviders] = useState<Awaited<ReturnType<typeof chain.ownProviders>>>([]);
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const [walletError, setWalletError] = useState("");
  const [domain, setDomain] = useState("");
  const [providerId, setProviderId] = useState("");
  const [stake, setStake] = useState("1000");
  const [changeAmount, setChangeAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<chain.Preview | null>(null);
  const [transaction, setTransaction] = useState<TransactionState | null>(savedTransaction);
  const [apiUrl, setApiUrl] = useState("");
  const [apiResults, setApiResults] = useState<Awaited<ReturnType<typeof chain.apiCheck>> | null>(
    null,
  );
  const [apiBusy, setApiBusy] = useState(false);
  const [apiError, setApiError] = useState("");
  const generation = useRef(0);
  const walletGeneration = useRef(0);
  const review = useRef<HTMLDivElement>(null);
  const pending = transaction?.status === "PENDING";
  const locked = busy || pending;
  const own = !!wallet && data?.provider.admin === wallet;
  const currentStatus = data?.commitment.status.tag;
  const editable = own && (currentStatus === "Active" || currentStatus === "Paused");
  const chosenProvider = providers.find((entry) => hex(entry.provider.id) === providerId)?.provider;
  async function refresh(commitmentId = selected) {
    const current = ++generation.current;
    setLoading(true);
    setReadError("");
    setData(null);
    try {
      const result = await chain.snapshot(id(commitmentId));
      if (generation.current === current) setData(result);
    } catch (error) {
      if (generation.current === current) setReadError(message(error));
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }
  async function walletRefresh(address: string) {
    const current = ++walletGeneration.current;
    setWalletError("");
    setWalletBalance(null);
    setProviders([]);
    try {
      const [owned, funds] = await Promise.all([
        chain.ownProviders(address),
        chain.balance(address),
      ]);
      if (current !== walletGeneration.current) return;
      setProviders(owned);
      setWalletBalance(funds);
      setProviderId(owned[0] ? hex(owned[0].provider.id) : "");
    } catch (error) {
      if (current === walletGeneration.current) setWalletError(message(error));
    }
  }
  useEffect(() => {
    void refresh(selected);
  }, [selected]);
  useEffect(() => {
    if (preview) review.current?.focus();
  }, [preview]);
  async function task(work: () => Promise<void>) {
    if (locked) return;
    const existing = savedTransaction();
    if (existing?.status === "PENDING") {
      setTransaction(existing);
      setNotice(
        "A saved transaction needs confirmation. Check its status below before preparing another action.",
      );
      return;
    }
    setBusy(true);
    setNotice("");
    setPreview(null);
    try {
      await work();
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy(false);
    }
  }
  function record(value: TransactionState) {
    globalThis.localStorage.setItem(TX_KEY, JSON.stringify(value));
    setTransaction(value);
  }
  async function checkTransaction(hash: string, summary: string) {
    if (transaction?.hash === hash && transaction.status === "REJECTED") return;
    setBusy(true);
    setNotice("");
    try {
      const status = await chain.poll(hash);
      record({ hash, summary, status });
      if (status === "SUCCESS") {
        await refresh();
        if (wallet) await walletRefresh(wallet);
      }
      if (status === "FAILED")
        setNotice(
          "Transaction failed on chain. No successful action was recorded. Inspect the explorer before trying again.",
        );
      if (status === "PENDING")
        setNotice(
          "Confirmation is still unknown. Check status again; do not repeat the action in another tab.",
        );
    } catch (error) {
      setNotice(
        `Confirmation unavailable: ${message(error)}. The transaction hash is saved; check status again.`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!preview || locked) return;
    const existing = savedTransaction();
    if (existing?.status === "PENDING") {
      setTransaction(existing);
      setPreview(null);
      setNotice("Another transaction needs confirmation. Check its status before signing again.");
      return;
    }
    const approved = preview;
    setBusy(true);
    setNotice("");
    let recorded = false;
    try {
      const signed = await chain.sign(approved);
      const hash = hex(signed.hash());
      record({ hash, status: "PENDING", summary: approved.summary });
      recorded = true;
      setPreview(null);
      const response = await chain.server.sendTransaction(signed);
      if (submissionRejected(response.status)) {
        record({ hash, status: "REJECTED", summary: approved.summary });
        throw new Error(
          "The network did not queue the transaction. No automatic retry was made. Inspect the hash, then prepare a fresh transaction when the network is ready.",
        );
      }
      await checkTransaction(hash, approved.summary);
    } catch (error) {
      setNotice(
        `${message(error)}${recorded ? " The hash is saved below; check its status before taking another action." : " Nothing was submitted."}`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function prepareBond(method: string) {
    if (!data || !own) return;
    await task(async () => {
      const args: Record<string, unknown> = { id: data.commitment.id };
      let summary = `${method.replaceAll("_", " ")} · commitment #${data.commitment.id}`;
      if (method === "add_stake" || method === "withdraw_excess") {
        args.amount = amount(changeAmount);
        summary += ` · ${units(args.amount as bigint)} test USDC`;
      }
      setPreview(
        await chain.prepare(
          wallet,
          { contractId: chain.deployment.contracts.bond, method, args },
          summary,
        ),
      );
    });
  }
  return (
    <main id="main">
      <header>
        <h1>Vaeltrix testnet</h1>
        <span>Test funds only</span>
      </header>
      <section id="testnet">
        <h2>Deployed contracts</h2>
        <table className="contracts">
          <tbody>
            {Object.entries(chain.deployment.contracts).map(([name, address]) => (
              <tr key={name}>
                <th scope="row">{name === "usdc" ? "Test USDC" : name}</th>
                <td>
                  <External href={`${explorer}/contract/${address}`}>
                    <code>{address}</code>
                  </External>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="commitment-heading">
          <h2>Commitment</h2>
          <form
            className="lookup"
            onSubmit={(event) => {
              event.preventDefault();
              try {
                id(lookup);
                setNotice("");
                setPreview(null);
                if (lookup === selected) void refresh();
                else setSelected(lookup);
              } catch (error) {
                setNotice(message(error));
              }
            }}
          >
            <label htmlFor="commitment">ID</label>
            <input
              id="commitment"
              inputMode="numeric"
              value={lookup}
              onChange={(event) => setLookup(event.target.value)}
            />
            <button disabled={loading || locked}>Load</button>
          </form>
        </div>
        <div className="read-status" role="status">
          <span>{loading ? "Loading…" : data ? `Updated ${data.fetchedAt}` : "Unavailable"}</span>
          <button
            disabled={loading}
            onClick={() => {
              void refresh();
            }}
          >
            Refresh
          </button>
        </div>
        {readError && (
          <p className="error" role="alert">
            {readError}
          </p>
        )}
        {data && (
          <>
            <dl className="facts">
              <dt>Status</dt>
              <dd>{data.commitment.status.tag}</dd>
              <dt>Stake</dt>
              <dd>{units(data.commitment.stake_total)} test USDC</dd>
              <dt>Available</dt>
              <dd>{units(data.available)} test USDC</dd>
              <dt>Provider</dt>
              <dd>
                {data.provider.home_domain}
                {!data.provider.verified && " (unverified)"}
              </dd>
              <dt>Template</dt>
              <dd>
                {data.template.id} · {(data.template.target_ms / 1000n).toString()} seconds
              </dd>
            </dl>
            <Raw
              title="Contract state"
              value={{
                ledger: data.ledger,
                commitment: data.commitment,
                provider: data.provider,
                template: data.template,
                batches: data.batches,
              }}
            />
          </>
        )}
        <details className="optional">
          <summary>API check</summary>{" "}
          <form
            className="api-form"
            onSubmit={(event) => {
              event.preventDefault();
              setApiError("");
              setApiResults(null);
              let origin: string;
              try {
                origin = apiOrigin(apiUrl);
              } catch (error) {
                setApiError(message(error));
                return;
              }
              setApiBusy(true);
              void chain
                .apiCheck(origin)
                .then(setApiResults)
                .catch((error: unknown) => setApiError(message(error)))
                .finally(() => setApiBusy(false));
            }}
          >
            <label htmlFor="apiUrl">API origin</label>
            <div className="actions">
              <input
                id="apiUrl"
                type="url"
                placeholder="https://your-testnet-api.example"
                required
                value={apiUrl}
                aria-describedby="api-help"
                onChange={(event) => {
                  setApiUrl(event.target.value);
                  setApiResults(null);
                  setApiError("");
                }}
              />
              <button disabled={apiBusy}>{apiBusy ? "Checking…" : "Check API →"}</button>
            </div>
            <p id="api-help" className="muted">
              Server must allow this origin (CORS).
            </p>
          </form>
          {apiError && (
            <p role="alert" className="error">
              {apiError}
            </p>
          )}
          {apiResults && (
            <div aria-live="polite">
              {apiResults.map((result) => (
                <div className="panel" key={result.path}>
                  <h3>
                    {result.path} · {result.ok ? "Responding" : "Unavailable"}
                  </h3>
                  <Raw title="Inspect response" value={result.data} />
                </div>
              ))}
            </div>
          )}
        </details>
      </section>
      <section id="wallet">
        <h2>Connect & interact</h2>
        {!wallet && (
          <div className="connection">
            <p>Use Freighter on Stellar Testnet.</p>
            <button
              className="primary"
              disabled={locked}
              onClick={() => {
                void task(async () => {
                  const address = await chain.connect();
                  setWallet(address);
                  await walletRefresh(address);
                });
              }}
            >
              Connect wallet
            </button>
            <External href="https://www.freighter.app/">Install Freighter</External>
          </div>
        )}
        {notice && (
          <p className="error" role="alert">
            {notice}
          </p>
        )}
        {wallet && (
          <div className="wallet-summary">
            <p>
              <code>{wallet}</code>
              <br />
              {walletBalance === null ? "Balance unavailable" : `${units(walletBalance)} test USDC`}
            </p>
            <button
              disabled={locked}
              onClick={() => {
                void walletRefresh(wallet);
              }}
            >
              Refresh wallet
            </button>
          </div>
        )}
        {walletError && (
          <p className="error" role="alert">
            {walletError}
          </p>
        )}
        {wallet && (
          <>
            <div className="steps-grid">
              <article className="panel">
                <h3>Fund wallet</h3>
                <p>Get test XLM. Add a trustline. Ask the operator for test USDC.</p>
                <div className="actions">
                  {wallet ? (
                    <External
                      href={`https://friendbot.stellar.org/?addr=${encodeURIComponent(wallet)}`}
                    >
                      Get test XLM
                    </External>
                  ) : (
                    <span className="muted">Connect to get test XLM</span>
                  )}
                  <button
                    disabled={!wallet || locked}
                    onClick={() => {
                      void task(async () => setPreview(await chain.prepareTrustline(wallet)));
                    }}
                  >
                    Review trustline →
                  </button>
                </div>
                <Raw
                  title="Test asset & funding request"
                  value={{
                    asset: "USDC",
                    issuer: chain.deployment.accounts.usdcIssuer,
                    recipient: wallet || "Connect your wallet first",
                    network: "testnet",
                  }}
                />
              </article>
              <article className="panel">
                <h3>Register provider</h3>
                <p>Use your domain. Operator verification is required before staking.</p>
                <form
                  onChange={() => setPreview(null)}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void task(async () => {
                      const value = homeDomain(domain);
                      setPreview(
                        await chain.prepare(
                          wallet,
                          chain.registration(wallet, value),
                          `Register provider ${value} · admin ${wallet}`,
                        ),
                      );
                    });
                  }}
                >
                  <label htmlFor="domain">Home domain</label>
                  <input
                    id="domain"
                    required
                    placeholder="anchor.example.com"
                    value={domain}
                    onChange={(event) => setDomain(event.target.value)}
                    disabled={!wallet || locked}
                  />
                  <button disabled={!wallet || locked}>Simulate registration →</button>
                </form>
              </article>
              <article className="panel">
                <h3>Create commitment</h3>
                <p>Template 901 · no declared volume limit.</p>
                <form
                  onChange={() => setPreview(null)}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void task(async () => {
                      const value = amount(stake);
                      setPreview(
                        await chain.prepare(
                          wallet,
                          chain.commitCall(providerId, value),
                          `Commit ${units(value)} test USDC · template 901 · provider ${providerId} · uncapped declared volume`,
                        ),
                      );
                    });
                  }}
                >
                  <label htmlFor="provider">Your provider</label>
                  <select
                    id="provider"
                    value={providerId}
                    disabled={!wallet || locked}
                    onChange={(event) => setProviderId(event.target.value)}
                  >
                    <option value="">
                      {providers.length ? "Select a provider" : "Register a provider first"}
                    </option>
                    {providers.map(({ provider }) => (
                      <option key={hex(provider.id)} value={hex(provider.id)}>
                        {provider.home_domain}
                        {provider.verified ? " · verified" : " · verification pending"}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="stake">Stake · test USDC</label>
                  <input
                    id="stake"
                    inputMode="decimal"
                    required
                    value={stake}
                    disabled={!wallet || locked}
                    onChange={(event) => setStake(event.target.value)}
                  />
                  <button
                    disabled={
                      locked || !chosenProvider?.verified || chosenProvider.status.tag !== "Active"
                    }
                  >
                    Simulate commitment →
                  </button>
                </form>
                {chosenProvider && !chosenProvider.verified && (
                  <Raw
                    title="Operator verification request"
                    value={{
                      provider_id: providerId,
                      home_domain: chosenProvider.home_domain,
                      registry: chain.deployment.contracts.registry,
                      action:
                        "Publish matching .well-known/stellar.toml, then ask the verifier to verify_domain.",
                    }}
                  />
                )}
              </article>
            </div>
            {wallet && (
              <article className="panel owned">
                <h3>Your commitments</h3>
                <div className="actions">
                  {providers.flatMap(({ provider, commitments }) =>
                    commitments.map((commitmentId) => (
                      <button
                        key={commitmentId.toString()}
                        disabled={locked}
                        onClick={() => {
                          const value = commitmentId.toString();
                          setLookup(value);
                          setSelected(value);
                          setPreview(null);
                          globalThis.location.hash = "testnet";
                        }}
                      >
                        {provider.home_domain} · #{commitmentId.toString()} →
                      </button>
                    )),
                  )}
                  {providers.every((entry) => entry.commitments.length === 0) && (
                    <p className="muted">No commitments yet.</p>
                  )}
                </div>
              </article>
            )}
            <article className="panel manage">
              <div className="panel-title">
                <h3>Manage commitment #{selected}</h3>
                <span className="badge">{own ? "You are the admin" : "View only"}</span>
              </div>
              <p className="muted">
                {own
                  ? "Preview an action, then sign."
                  : "Only the provider admin can make changes."}
              </p>
              <form
                onChange={() => setPreview(null)}
                onSubmit={(event) => {
                  event.preventDefault();
                  void prepareBond("add_stake");
                }}
              >
                <label htmlFor="changeAmount">Stake change · test USDC</label>
                <div className="actions">
                  <input
                    id="changeAmount"
                    inputMode="decimal"
                    placeholder="0.0000000"
                    value={changeAmount}
                    disabled={!editable || locked}
                    onChange={(event) => setChangeAmount(event.target.value)}
                  />
                  <button disabled={!editable || locked}>Simulate add stake</button>
                  <button
                    type="button"
                    disabled={!editable || locked}
                    onClick={() => {
                      void prepareBond("withdraw_excess");
                    }}
                  >
                    Simulate withdrawal
                  </button>
                </div>
              </form>
              <div className="actions lifecycle">
                <button
                  disabled={!own || currentStatus !== "Active" || locked}
                  onClick={() => {
                    void prepareBond("pause");
                  }}
                >
                  Simulate pause
                </button>
                <button
                  disabled={!own || currentStatus !== "Paused" || locked}
                  onClick={() => {
                    void prepareBond("resume");
                  }}
                >
                  Simulate resume
                </button>
              </div>
              <details>
                <summary>Coverage rules</summary>
                <p className="muted">
                  Keep the minimum stake plus reserves. Pausing stops new coverage; existing covered
                  payments remain eligible.
                </p>
              </details>
            </article>
          </>
        )}

        {preview && (
          <div className="review panel" ref={review} tabIndex={-1} aria-labelledby="review-heading">
            <p className="eyebrow">REVIEW BEFORE SIGNING</p>
            <h3 id="review-heading">{preview.summary}</h3>
            <dl>
              <dt>Network</dt>
              <dd>Stellar testnet</dd>
              <dt>Signer</dt>
              <dd className="address">{preview.address}</dd>
              <dt>Maximum transaction fee</dt>
              <dd>{units(BigInt(preview.fee))} test XLM</dd>
              <dt>Expires</dt>
              <dd>Re-prepare after two minutes</dd>
            </dl>
            <p>Signing submits this transaction.</p>
            <Raw title="Inspect unsigned transaction XDR" value={preview.xdr} />
            <div className="actions">
              <button
                className="primary"
                disabled={locked}
                onClick={() => {
                  void submit();
                }}
              >
                Sign & submit with Freighter ↗
              </button>
              <button disabled={busy} onClick={() => setPreview(null)}>
                Cancel preview
              </button>
            </div>
          </div>
        )}
        {transaction && (
          <div className="panel transaction" role="status">
            <div className="panel-title">
              <h3>Last transaction</h3>
              <span className="badge">
                {transaction.status === "PENDING" ? "Awaiting confirmation" : transaction.status}
              </span>
            </div>
            <p>{transaction.summary}</p>
            <p className="address">
              <External href={`${explorer}/tx/${transaction.hash}`}>{transaction.hash}</External>
            </p>
            <button
              disabled={busy || transaction.status === "REJECTED"}
              onClick={() => {
                void checkTransaction(transaction.hash, transaction.summary);
              }}
            >
              Check transaction status ↻
            </button>
            <p className="muted">Hash saved. No automatic resubmission.</p>
          </div>
        )}

        <p className="muted availability">Claims and payouts are not deployed yet.</p>
      </section>
    </main>
  );
}
const root = globalThis.document.getElementById("root");
if (root) createRoot(root).render(<App />);
