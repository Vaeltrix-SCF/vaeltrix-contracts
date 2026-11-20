package events

import (
	"encoding/hex"
	"math/big"
	"testing"

	"github.com/stellar-go-cli/stellar-go-cli/pkg/soroban"
	"github.com/stellar/go-stellar-sdk/xdr"
)

func ev(topics []xdr.ScVal, data xdr.ScVal) soroban.ContractEvent {
	return soroban.ContractEvent{
		Type: "contract", Ledger: 5310000, ID: "0001-1", TxHash: "deadbeef",
		ContractID: "CCYLDMTA4CTFF2VHULUCCBNCBMN3G7MA33EZ2OFYMIRSIKX3PYUHCUAI",
		Topics:     topics, Value: data,
	}
}

func TestDecodeCommit(t *testing.T) {
	usdcAddr, err := soroban.ParseContractID("CB2CFWENJ2M5JXWBGUOKO75QVIFJ2EY5WOIOHR6FFYTXAKGS2S3XOIM4")
	if err != nil {
		t.Fatal(err)
	}
	provider, _ := hex32("6e25c94ba9c8b56d37622018e3d748adc3733a96aa90e46dcd6a794044da16e9")
	got, err := Decode(ev(
		[]xdr.ScVal{soroban.ScvSymbol("commit"), soroban.ScvU64(1)},
		soroban.ScvMap(
			soroban.ScvPair(soroban.ScvSymbol("provider_id"), soroban.ScvBytes(provider)),
			soroban.ScvPair(soroban.ScvSymbol("template_id"), soroban.ScvU32(901)),
			soroban.ScvPair(soroban.ScvSymbol("version"), soroban.ScvU32(1)),
			soroban.ScvPair(soroban.ScvSymbol("stake_asset"), soroban.ScvAddress(usdcAddr)),
			soroban.ScvPair(soroban.ScvSymbol("amount"), soroban.ScvI128(big.NewInt(10_000_000_000))),
		),
	))
	if err != nil {
		t.Fatal(err)
	}
	if got.Kind != KindCommit || got.CommitmentID != 1 ||
		got.TemplateID != 901 || got.Amount != "10000000000" ||
		got.StakeAsset != "CB2CFWENJ2M5JXWBGUOKO75QVIFJ2EY5WOIOHR6FFYTXAKGS2S3XOIM4" {
		t.Fatalf("bad decode: %+v", got)
	}
}

func TestDecodeStakeChg(t *testing.T) {
	got, err := Decode(ev(
		[]xdr.ScVal{soroban.ScvSymbol("stake_chg"), soroban.ScvU64(1)},
		soroban.ScvMap(
			soroban.ScvPair(soroban.ScvSymbol("delta"), soroban.ScvI128(big.NewInt(-5))),
			soroban.ScvPair(soroban.ScvSymbol("new_total"), soroban.ScvI128(big.NewInt(995))),
		),
	))
	if err != nil || got.Delta != "-5" || got.NewTotal != "995" {
		t.Fatalf("got %+v err %v", got, err)
	}
}

func TestDecodeExitFin(t *testing.T) {
	got, err := Decode(ev(
		[]xdr.ScVal{soroban.ScvSymbol("exit_fin"), soroban.ScvU64(7)},
		soroban.ScvMap(
			soroban.ScvPair(soroban.ScvSymbol("at"), soroban.ScvU64(1790000000)),
			soroban.ScvPair(soroban.ScvSymbol("amount"), soroban.ScvI128(big.NewInt(42))),
		),
	))
	if err != nil || got.At != 1790000000 || got.Amount != "42" {
		t.Fatalf("got %+v err %v", got, err)
	}
}

func TestDecodeRejects(t *testing.T) {
	if _, err := Decode(ev([]xdr.ScVal{soroban.ScvSymbol("commit")}, soroban.ScvMap())); err == nil {
		t.Fatal("want topic-count error")
	}
	if _, err := Decode(ev(
		[]xdr.ScVal{soroban.ScvSymbol("commit"), soroban.ScvU64(1)},
		soroban.ScvMap(), // missing all fields
	)); err == nil {
		t.Fatal("want missing-field error")
	}
}

func hex32(s string) ([]byte, error) {
	b := make([]byte, 32)
	_, err := hex.Decode(b, []byte(s))
	return b, err
}

// TestDecodeRealWire decodes topic/value ScVal XDR lifted verbatim from the
// Oct-21 testnet seed transactions (commit f96066ef…, add_stake fbcb2e54…,
// withdraw_excess 1d107a80…, pause c609d16a…, resume 83bb2eb1…), so the
// decoder is checked against what the deployed contract actually emits.
func TestDecodeRealWire(t *testing.T) {
	for _, tt := range []struct {
		name      string
		topicsB64 []string
		valueB64  string
		want      Event
	}{
		{
			name:      "commit f96066ef",
			topicsB64: []string{"AAAADwAAAAZjb21taXQAAA==", "AAAABQAAAAAAAAAB"},
			valueB64:  "AAAAEQAAAAEAAAAFAAAADwAAAAZhbW91bnQAAAAAAAoAAAAAAAAAAAAAAAJUC+QAAAAADwAAAAtwcm92aWRlcl9pZAAAAAANAAAAIG4lyUupyLVtN2IgGOPXSK3DczqWqpDkbc1qeUBE2hbpAAAADwAAAAtzdGFrZV9hc3NldAAAAAASAAAAAXQi2I1OmdTewTUcp3+wqgqdEx2zkOPHxS4ncCjS1Ld3AAAADwAAAAt0ZW1wbGF0ZV9pZAAAAAADAAADhQAAAA8AAAAHdmVyc2lvbgAAAAADAAAAAQ==",
			want: Event{
				Kind: KindCommit, CommitmentID: 1,
				ProviderID: "6e25c94ba9c8b56d37622018e3d748adc3733a96aa90e46dcd6a794044da16e9",
				TemplateID: 901, Version: 1,
				StakeAsset: "CB2CFWENJ2M5JXWBGUOKO75QVIFJ2EY5WOIOHR6FFYTXAKGS2S3XOIM4",
				Amount:     "10000000000",
			},
		},
		{
			name:      "stake_chg add fbcb2e54",
			topicsB64: []string{"AAAADwAAAAlzdGFrZV9jaGcAAAA=", "AAAABQAAAAAAAAAB"},
			valueB64:  "AAAAEQAAAAEAAAACAAAADwAAAAVkZWx0YQAAAAAAAAoAAAAAAAAAAAAAAAAAmJaAAAAADwAAAAluZXdfdG90YWwAAAAAAAAKAAAAAAAAAAAAAAACVKR6gA==",
			want:      Event{Kind: KindStakeChg, CommitmentID: 1, Delta: "10000000", NewTotal: "10010000000"},
		},
		{
			name:      "stake_chg withdraw 1d107a80",
			topicsB64: []string{"AAAADwAAAAlzdGFrZV9jaGcAAAA=", "AAAABQAAAAAAAAAB"},
			valueB64:  "AAAAEQAAAAEAAAACAAAADwAAAAVkZWx0YQAAAAAAAAr/////////////////Z2mAAAAADwAAAAluZXdfdG90YWwAAAAAAAAKAAAAAAAAAAAAAAACVAvkAA==",
			want:      Event{Kind: KindStakeChg, CommitmentID: 1, Delta: "-10000000", NewTotal: "10000000000"},
		},
		{
			name:      "cmt_pause c609d16a",
			topicsB64: []string{"AAAADwAAAAljbXRfcGF1c2UAAAA=", "AAAABQAAAAAAAAAB"},
			valueB64:  "AAAAEQAAAAEAAAABAAAADwAAAAJhdAAAAAAABQAAAABq2I4m",
			want:      Event{Kind: KindPaused, CommitmentID: 1, At: 1792577062},
		},
		{
			name:      "cmt_resum 83bb2eb1",
			topicsB64: []string{"AAAADwAAAAljbXRfcmVzdW0AAAA=", "AAAABQAAAAAAAAAB"},
			valueB64:  "AAAAEQAAAAEAAAABAAAADwAAAAJhdAAAAAAABQAAAABq2I4/",
			want:      Event{Kind: KindResumed, CommitmentID: 1, At: 1792577087},
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			topics := make([]xdr.ScVal, 0, len(tt.topicsB64))
			for _, tb := range tt.topicsB64 {
				var v xdr.ScVal
				if err := xdr.SafeUnmarshalBase64(tb, &v); err != nil {
					t.Fatalf("topic XDR: %v", err)
				}
				topics = append(topics, v)
			}
			var value xdr.ScVal
			if err := xdr.SafeUnmarshalBase64(tt.valueB64, &value); err != nil {
				t.Fatalf("value XDR: %v", err)
			}
			got, err := Decode(soroban.ContractEvent{Topics: topics, Value: value})
			if err != nil {
				t.Fatal(err)
			}
			if *got != tt.want {
				t.Fatalf("got %+v, want %+v", got, tt.want)
			}
		})
	}
}
