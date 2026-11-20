// vaeltrix-iso tails vaeltrix_bond events and writes them as JSONL on stdout.
// ISO 20022 emission (camt.054/053) lands on top of this in the next PR.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/stellar-go-cli/stellar-go-cli/pkg/soroban"
	rpcclient "github.com/stellar/go-stellar-sdk/clients/rpcclient"

	"github.com/Vaeltrix-SCF/vaeltrix-contracts/services/vaeltrix-iso/internal/deployment"
	"github.com/Vaeltrix-SCF/vaeltrix-contracts/services/vaeltrix-iso/internal/events"
	"github.com/Vaeltrix-SCF/vaeltrix-contracts/services/vaeltrix-iso/internal/poller"
)

func main() {
	if err := run(); err != nil {
		slog.Error("vaeltrix-iso failed", "err", err)
		os.Exit(1)
	}
}

func run() error {
	manifestPath := flag.String("manifest", "deployments/testnet.json",
		"path to deployments/<network>.json (relative to repo root)")
	rpcURL := flag.String("rpc-url", "", "Soroban RPC URL; default: manifest rpcUrl")
	statePath := flag.String("state", ".vaeltrix-iso/cursor",
		"file holding the last getEvents cursor")
	follow := flag.Bool("follow", false, "keep polling instead of exiting when caught up")
	interval := flag.Duration("poll-interval", 5*time.Second, "delay between polls in -follow mode")
	commitmentID := flag.Uint64("commitment-id", 0, "only emit events for this commitment (0 = all)")
	flag.Parse()

	m, err := deployment.Load(*manifestPath)
	if err != nil {
		return err
	}
	rpc := *rpcURL
	if rpc == "" {
		rpc = m.RPCURL
	}
	slog.Info("vaeltrix-iso starting",
		"network", m.Network, "bond", m.Contracts.Bond, "start_ledger", m.StartLedger)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// getEvents only serves the RPC's retention window (~7 days stock). A
	// manifest startLedger below oldestLedger errors out; clamp and warn so a
	// fresh run drains what the node still has rather than failing.
	start := m.StartLedger
	if health, err := rpcclient.NewClient(rpc, http.DefaultClient).GetHealth(ctx); err != nil {
		slog.Warn("getHealth failed; continuing without retention clamp", "err", err)
	} else if health.OldestLedger > start {
		slog.Warn("manifest start ledger is outside the RPC retention window; clamping",
			"manifest_start", start, "oldest_ledger", health.OldestLedger)
		start = health.OldestLedger
	}

	enc := json.NewEncoder(os.Stdout)
	handle := func(_ context.Context, ev events.Event) error {
		if *commitmentID != 0 && ev.CommitmentID != *commitmentID {
			return nil
		}
		return enc.Encode(ev)
	}

	p := &poller.Poller{
		RPC:         soroban.NewClient(rpc, soroban.NetworkPassphrase(m.Network)),
		ContractID:  m.Contracts.Bond,
		StartLedger: start,
		Store:       poller.FileStore{Path: *statePath},
		Handle:      handle,
	}

	if !*follow {
		n, err := p.Once(ctx)
		if err != nil {
			return err
		}
		slog.Info("drained bond events", "events", n)
		return nil
	}
	return p.Follow(ctx, *interval)
}
