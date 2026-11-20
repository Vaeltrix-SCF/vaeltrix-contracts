// Package events decodes vaeltrix_bond contract events
// (contracts/bond/src/events.rs) from getEvents payloads.
package events

import (
	"encoding/hex"
	"fmt"
	"math/big"

	"github.com/stellar-go-cli/stellar-go-cli/pkg/soroban"
	"github.com/stellar/go-stellar-sdk/xdr"
)

type Kind string

const (
	KindCommit   Kind = "commit"
	KindStakeChg Kind = "stake_chg"
	KindPaused   Kind = "cmt_pause"
	KindResumed  Kind = "cmt_resum"
	KindExitReq  Kind = "exit_req"
	KindExitFin  Kind = "exit_fin"
)

// Event is a decoded bond event. i128 amounts stay decimal strings, matching
// the repo convention that money is an integer (i128 in Rust, bigint in TS).
type Event struct {
	Kind           Kind   `json:"kind"`
	EventID        string `json:"event_id"`
	Ledger         uint32 `json:"ledger"`
	LedgerClosedAt string `json:"ledger_closed_at"`
	TxHash         string `json:"tx_hash"`
	CommitmentID   uint64 `json:"commitment_id"`

	ProviderID string `json:"provider_id,omitempty"` // commit: hex BytesN<32>
	TemplateID uint32 `json:"template_id,omitempty"`
	Version    uint32 `json:"version,omitempty"`
	StakeAsset string `json:"stake_asset,omitempty"` // commit: strkey address
	Amount     string `json:"amount,omitempty"`      // commit / exit_fin i128
	Delta      string `json:"delta,omitempty"`       // stake_chg i128 (signed)
	NewTotal   string `json:"new_total,omitempty"`   // stake_chg i128
	At         uint64 `json:"at,omitempty"`          // pause/resume/exit timestamps
}

// Decode maps one contract event to an Event. The six bond topics all share
// the [symbol, commitment_id] topic shape.
func Decode(ev soroban.ContractEvent) (*Event, error) {
	if len(ev.Topics) != 2 {
		return nil, fmt.Errorf("event %s: want 2 topics, got %d", ev.ID, len(ev.Topics))
	}
	sym, ok := ev.Topics[0].GetSym()
	if !ok {
		return nil, fmt.Errorf("event %s: topic[0] is not a symbol", ev.ID)
	}
	cid, ok := ev.Topics[1].GetU64()
	if !ok {
		return nil, fmt.Errorf("event %s: topic[1] is not a u64 commitment id", ev.ID)
	}
	data, ok := ev.Value.GetMap()
	if !ok || data == nil {
		return nil, fmt.Errorf("event %s: data is not a map", ev.ID)
	}
	out := &Event{
		Kind:           Kind(sym),
		EventID:        ev.ID,
		Ledger:         ev.Ledger,
		LedgerClosedAt: ev.LedgerClosedAt,
		TxHash:         ev.TxHash,
		CommitmentID:   uint64(cid),
	}
	var err error
	switch out.Kind {
	case KindCommit:
		err = decodeAll(out, *data,
			field("provider_id", bytesHex, &out.ProviderID),
			field("template_id", u32Of, &out.TemplateID),
			field("version", u32Of, &out.Version),
			field("stake_asset", addressStr, &out.StakeAsset),
			field("amount", i128Str, &out.Amount),
		)
	case KindStakeChg:
		err = decodeAll(out, *data,
			field("delta", i128Str, &out.Delta),
			field("new_total", i128Str, &out.NewTotal),
		)
	case KindPaused, KindResumed, KindExitReq:
		err = decodeAll(out, *data, field("at", u64Of, &out.At))
	case KindExitFin:
		err = decodeAll(out, *data,
			field("at", u64Of, &out.At),
			field("amount", i128Str, &out.Amount),
		)
	default:
		err = fmt.Errorf("event %s: unknown bond topic %q", ev.ID, sym)
	}
	if err != nil {
		return nil, err
	}
	return out, nil
}

// field binds one map entry to a typed destination.
type binder func(xdr.ScMap) error

func field[T any](name string, get func(xdr.ScVal) (T, error), dst *T) binder {
	return func(m xdr.ScMap) error {
		v, ok := lookup(m, name)
		if !ok {
			return fmt.Errorf("missing field %q", name)
		}
		got, err := get(v)
		if err != nil {
			return fmt.Errorf("field %q: %w", name, err)
		}
		*dst = got
		return nil
	}
}

func decodeAll(e *Event, m xdr.ScMap, fs ...binder) error {
	for _, f := range fs {
		if err := f(m); err != nil {
			return fmt.Errorf("event %s (%s): %w", e.EventID, e.Kind, err)
		}
	}
	return nil
}

func lookup(m xdr.ScMap, name string) (xdr.ScVal, bool) {
	for _, e := range m {
		if s, ok := e.Key.GetSym(); ok && string(s) == name {
			return e.Val, true
		}
	}
	return xdr.ScVal{}, false
}

func u64Of(v xdr.ScVal) (uint64, error) {
	n, ok := v.GetU64()
	if !ok {
		return 0, fmt.Errorf("not a u64")
	}
	return uint64(n), nil
}

func u32Of(v xdr.ScVal) (uint32, error) {
	n, ok := v.GetU32()
	if !ok {
		return 0, fmt.Errorf("not a u32")
	}
	return uint32(n), nil
}

func i128Str(v xdr.ScVal) (string, error) {
	p, ok := v.GetI128()
	if !ok {
		return "", fmt.Errorf("not an i128")
	}
	n := new(big.Int).Lsh(big.NewInt(int64(p.Hi)), 64)
	n.Add(n, new(big.Int).SetUint64(uint64(p.Lo)))
	return n.String(), nil
}

func bytesHex(v xdr.ScVal) (string, error) {
	b, ok := v.GetBytes()
	if !ok {
		return "", fmt.Errorf("not bytes")
	}
	return hex.EncodeToString(b), nil
}

func addressStr(v xdr.ScVal) (string, error) {
	return soroban.DecodeScAddress(v)
}
