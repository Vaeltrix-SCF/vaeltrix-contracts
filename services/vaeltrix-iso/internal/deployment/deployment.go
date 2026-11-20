// Package deployment loads the contract IDs written by the deploy scripts
// into deployments/<network>.json.
package deployment

import (
	"encoding/json"
	"fmt"
	"os"
)

// Manifest mirrors the shape of deployments/<network>.json. Fields the
// service does not need (wasm hashes, accounts, transactions) are ignored.
type Manifest struct {
	Network   string `json:"network"`
	RPCURL    string `json:"rpcUrl"`
	Contracts struct {
		Registry   string `json:"registry"`
		Scoreboard string `json:"scoreboard"`
		Bond       string `json:"bond"`
		USDC       string `json:"usdc"`
	} `json:"contracts"`
	StartLedger uint32 `json:"startLedger"`
}

func Load(path string) (*Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read deployment manifest: %w", err)
	}
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse deployment manifest %s: %w", path, err)
	}
	if m.RPCURL == "" || m.Contracts.Bond == "" || m.StartLedger == 0 {
		return nil, fmt.Errorf("manifest %s missing rpcUrl, contracts.bond or startLedger", path)
	}
	return &m, nil
}
