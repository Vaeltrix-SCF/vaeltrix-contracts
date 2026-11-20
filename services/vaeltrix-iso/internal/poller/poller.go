// Package poller tails vaeltrix_bond contract events over Soroban RPC,
// resuming from a persisted getEvents cursor.
package poller

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/stellar-go-cli/stellar-go-cli/pkg/soroban"

	"github.com/Vaeltrix-SCF/vaeltrix-contracts/services/vaeltrix-iso/internal/events"
)

// Store persists the RPC cursor between restarts.
type Store interface {
	Load() (string, error) // "" means start from StartLedger
	Save(cursor string) error
}

// FileStore keeps the cursor in a single-line file, written atomically.
type FileStore struct{ Path string }

func (s FileStore) Load() (string, error) {
	b, err := os.ReadFile(s.Path)
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	return strings.TrimSpace(string(b)), err
}

func (s FileStore) Save(cursor string) error {
	if err := os.MkdirAll(filepath.Dir(s.Path), 0o755); err != nil {
		return err
	}
	tmp := s.Path + ".tmp"
	if err := os.WriteFile(tmp, []byte(cursor+"\n"), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.Path)
}

type Handler func(ctx context.Context, ev events.Event) error

type Poller struct {
	RPC         *soroban.Client
	ContractID  string
	StartLedger uint32
	Store       Store
	Handle      Handler
	PageLimit   uint // 0 → 200
}

func (p *Poller) pageLimit() uint {
	if p.PageLimit == 0 {
		return 200
	}
	return p.PageLimit
}

// filters returns one EventFilter per ≤5 topic patterns (the getEvents
// limit). Each bond event's topics are [name_symbol, commitment_id].
func filters(contractID string) []soroban.EventFilter {
	patterns := func(names ...string) [][]soroban.EventTopicSegment {
		out := make([][]soroban.EventTopicSegment, 0, len(names))
		for _, n := range names {
			out = append(out, []soroban.EventTopicSegment{
				soroban.TopicSymbol(n),
				soroban.TopicAny(), // commitment_id
			})
		}
		return out
	}
	return []soroban.EventFilter{
		{
			Types:       []string{"contract"},
			ContractIDs: []string{contractID},
			Topics:      patterns("commit", "stake_chg", "cmt_pause", "cmt_resum", "exit_req"),
		},
		{
			Types:       []string{"contract"},
			ContractIDs: []string{contractID},
			Topics:      patterns("exit_fin"),
		},
	}
}

// Once drains every pending page and returns the number of events handled.
func (p *Poller) Once(ctx context.Context) (int, error) {
	cursor, err := p.Store.Load()
	if err != nil {
		return 0, fmt.Errorf("load cursor: %w", err)
	}
	req := soroban.EventsRequest{Limit: p.pageLimit(), Filters: filters(p.ContractID)}
	if cursor != "" {
		req.Cursor = cursor
	} else {
		req.StartLedger = p.StartLedger
	}
	seen := 0
	for {
		res, err := p.RPC.GetEvents(ctx, req)
		if err != nil {
			return seen, err
		}
		for _, raw := range res.Events {
			ev, err := events.Decode(raw)
			if err != nil {
				// The RPC filter already excludes other topics (upg_* etc.), so
				// a decode failure means the contract shape changed — surface,
				// don't skip.
				return seen, fmt.Errorf("decode: %w", err)
			}
			seen++
			if err := p.Handle(ctx, *ev); err != nil {
				return seen, err
			}
		}
		if len(res.Events) == 0 || res.Cursor == "" || res.Cursor == req.Cursor {
			return seen, nil
		}
		if err := p.Store.Save(res.Cursor); err != nil {
			return seen, fmt.Errorf("save cursor: %w", err)
		}
		req.Cursor, req.StartLedger = res.Cursor, 0
	}
}

// Follow drains, waits interval, and repeats until ctx is cancelled.
func (p *Poller) Follow(ctx context.Context, interval time.Duration) error {
	for {
		if _, err := p.Once(ctx); err != nil {
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(interval):
		}
	}
}
