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
import "@fontsource-variable/space-grotesk";
import "@fontsource/ibm-plex-mono/400.css";
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
function short(value: string) {
  return `${value.slice(0, 7)}…${value.slice(-6)}`;
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
    <div className="shell">
      <a className="skip" href="#main">
        Skip to playground
      </a>
      <aside className="sidebar">
        <a className="wordmark" href="#overview">
          <span className="brand" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          vaeltrix
        </a>
        <div className="environment">
          <span className="dot" /> Stellar testnet <small>NO REAL FUNDS</small>
        </div>
        <nav aria-label="Playground">
          <a href="#overview">
            <span>01</span> Overview
          </a>
          <a href="#wallet">
            <span>02</span> Your workspace
          </a>
          <a href="#contracts">
            <span>03</span> Contracts
          </a>
          <a href="#api">
            <span>04</span> Backend API
          </a>
        </nav>
        <div className="sidebar-bottom">
          <External href="https://vaeltrix.vercel.app/docs">Docs</External>
          <External href="https://github.com/Vaeltrix-SCF/vaeltrix-contracts">
            Source & issues
          </External>
          <small>Testnet foundation · V0</small>
        </div>
      </aside>
      <main id="main">
        <header className="topbar">
          <span className="eyebrow">DEVELOPER PLAYGROUND</span>
          <button
            disabled={locked}
            onClick={() => {
              void task(async () => {
                const address = await chain.connect();
                setWallet(address);
                await walletRefresh(address);
              });
            }}
          >
            {wallet ? short(wallet) : "Connect Freighter"} <span aria-hidden="true">↗</span>
          </button>
        </header>
        {notice && (
          <div className="error global-notice" role="alert">
            {notice}
          </div>
        )}
        <section id="overview" className="overview">
          <div className="heading compact-heading">
            <h1>Testnet playground</h1>
          </div>
          <div className="section-line">
            <h2>Commitment</h2>
            <span className="eyebrow">READ ONLY</span>
          </div>
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
            <label htmlFor="commitment">Commitment ID</label>
            <input
              id="commitment"
              inputMode="numeric"
              value={lookup}
              onChange={(event) => setLookup(event.target.value)}
            />
            <button className="primary" disabled={loading || locked}>
              Explore <span aria-hidden="true">→</span>
            </button>
            <span className="lookup-note">Demo: #1</span>
          </form>
          <div role="status" className="read-status">
            {loading
              ? "Reading live contract state…"
              : data
                ? `Ledger ${data.ledger.toLocaleString()} · fetched ${data.fetchedAt} · simulation reads`
                : "Contract data unavailable"}
            <button
              disabled={loading}
              onClick={() => {
                void refresh();
              }}
            >
              Refresh ↻
            </button>
          </div>
          {readError && (
            <div className="error" role="alert">
              {readError}
            </div>
          )}
          <div className="metrics" aria-busy={loading}>
            <article>
              <span className="eyebrow">TOTAL STAKE</span>
              <strong>{data ? units(data.commitment.stake_total) : "—"}</strong>
              <small>test USDC</small>
            </article>
            <article>
              <span className="eyebrow">AVAILABLE STAKE</span>
              <strong>{data ? units(data.available) : "—"}</strong>
              <small>
                {data ? `${units(data.commitment.stake_reserved)} reserved` : "Awaiting chain data"}
              </small>
            </article>
            <article>
              <span className="eyebrow">COMMITMENT STATUS</span>
              <strong className="state">{data?.commitment.status.tag ?? "—"}</strong>
              <small>
                {data
                  ? `Template ${data.commitment.template_id} · v${data.commitment.template_version}`
                  : "Awaiting chain data"}
              </small>
            </article>
          </div>
          {data && (
            <div className="detail-grid">
              <article className="panel">
                <div className="panel-title">
                  <h3>Provider</h3>
                  <span className="badge">
                    {data.provider.verified ? "Domain verified" : "Needs verification"}
                  </span>
                </div>
                <p className="provider-domain">{data.provider.home_domain}</p>
                <dl>
                  <dt>Provider status</dt>
                  <dd>{data.provider.status.tag}</dd>
                  <dt>Admin</dt>
                  <dd>
                    <External href={`${explorer}/account/${data.provider.admin}`}>
                      {short(data.provider.admin)}
                    </External>
                  </dd>
                  <dt>Minimum stake</dt>
                  <dd>{units(data.commitment.min_stake)} test USDC</dd>
                  <dt>Open claims</dt>
                  <dd>{data.commitment.open_claims}</dd>
                  <dt>Frozen exit cooldown</dt>
                  <dd>{data.commitment.exit_cooldown_secs.toLocaleString()} seconds</dd>
                </dl>
                <Raw
                  title="Inspect commitment & provider"
                  value={{ commitment: data.commitment, provider: data.provider }}
                />
              </article>
              <article className="panel template">
                <div className="panel-title">
                  <h3>Delivery promise</h3>
                  <span className="eyebrow">SLA / {data.template.id}</span>
                </div>
                <p className="target">
                  {(data.template.target_ms / 1000n).toString()}
                  <span>seconds</span>
                </p>
                <p className="muted">Settlement → credit</p>
                <dl>
                  <dt>Grace period</dt>
                  <dd>{(data.template.grace_ms / 1000n).toString()} seconds</dd>
                  <dt>Payment range</dt>
                  <dd>
                    {units(data.template.scope.min_amount)}–{units(data.template.scope.max_amount)}{" "}
                    test USDC
                  </dd>
                  <dt>Penalty</dt>
                  <dd>
                    {data.template.penalty.values[0].bps} basis points · capped at{" "}
                    {units(data.template.penalty.values[0].cap)}
                  </dd>
                  <dt>Claim window</dt>
                  <dd>{data.template.claim_window_secs.toString()} seconds</dd>
                </dl>
                <Raw title="Inspect frozen template version" value={data.template} />
              </article>
            </div>
          )}
          <article className="panel batches">
            <div className="panel-title">
              <h3>Daily batches</h3>
              <span className="eyebrow">LATEST SEVEN · UTC DAYS</span>
            </div>
            {data?.batches.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Payments</th>
                      <th>On time</th>
                      <th>Breaches</th>
                      <th>Volume · test USDC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.batches.map(({ period, batch }) => (
                      <tr key={period.toString()}>
                        <td>{period.toString()}</td>
                        <td>{batch.stats.payments}</td>
                        <td>{batch.stats.on_time}</td>
                        <td>{batch.stats.breaches}</td>
                        <td>{units(batch.stats.volume)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Raw title="Inspect batch proofs & observers" value={data.batches} />
              </div>
            ) : (
              <p className="muted">
                {loading
                  ? "Reading anchored periods…"
                  : data
                    ? "No batches anchored for this commitment yet."
                    : "Load a commitment to inspect its batches."}
              </p>
            )}
          </article>
        </section>
        <section id="wallet" className="workspace">
          <div className="section-line">
            <div>
              <h2>Wallet</h2>
            </div>
          </div>
          {!wallet && (
            <div className="connect-callout">
              <span className="step">↗</span>
              <div>
                <h3>Connect your wallet</h3>
                <External href="https://www.freighter.app/">Get Freighter</External>
              </div>
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
                Connect wallet →
              </button>
            </div>
          )}
          {wallet && (
            <div className="wallet-summary">
              <div>
                <span className="eyebrow">CONNECTED ACCOUNT</span>
                <p className="address">{wallet}</p>
                <p>
                  {walletBalance === null
                    ? "Balance unavailable"
                    : `${units(walletBalance)} test USDC`}
                </p>
              </div>
              <button
                disabled={locked}
                onClick={() => {
                  void walletRefresh(wallet);
                }}
              >
                Refresh wallet ↻
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
                  <span className="eyebrow">01 / FUND YOUR ACCOUNT</span>
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
                  <span className="eyebrow">02 / REGISTER A PROVIDER</span>
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
                  <span className="eyebrow">03 / CREATE A COMMITMENT</span>
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
                        locked ||
                        !chosenProvider?.verified ||
                        chosenProvider.status.tag !== "Active"
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
                            globalThis.location.hash = "overview";
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
                    Keep the minimum stake plus reserves. Pausing stops new coverage; existing
                    covered payments remain eligible.
                  </p>
                </details>
              </article>
            </>
          )}
          {preview && (
            <div
              className="review panel"
              ref={review}
              tabIndex={-1}
              aria-labelledby="review-heading"
            >
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
          <p className="muted not-ready">
            Claims, payouts & observer automation · not available yet.
          </p>
        </section>
        <section id="contracts">
          <div className="section-line">
            <h2>Contracts</h2>
            <span className="eyebrow">STELLAR TESTNET</span>
          </div>
          <div className="contract-list">
            {Object.entries(chain.deployment.contracts).map(([name, address]) => (
              <div className="contract-row" key={name}>
                <span className="contract-name">{name === "usdc" ? "Test USDC" : name}</span>
                <code>{address}</code>
                <External href={`${explorer}/contract/${address}`}>Explorer</External>
              </div>
            ))}
          </div>
          <Raw title="Full public deployment manifest" value={chain.deployment} />
        </section>
        <section id="api">
          <div className="section-line">
            <h2>API</h2>
            <span className="badge">OPTIONAL</span>
          </div>
          <p className="muted section-intro">
            No API connected. Enter your server URL to check health and available routes.
          </p>
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
        </section>
        <footer>
          <span className="wordmark">
            vaeltrix<span className="eyebrow">TESTNET PLAYGROUND</span>
          </span>
          <span>Test funds only.</span>
        </footer>
      </main>
    </div>
  );
}

const root = globalThis.document.getElementById("root");
if (root) createRoot(root).render(<App />);
