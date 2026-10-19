# Upgrade fixture (VX-201)

`upgrade.wasm` is the 324-byte optimized empty Bond contract built from this
repository's initial scaffold with Stellar CLI 28.1.0. It has no exported
functions, no storage operations and no token logic. Its SHA-256 is
`e45111597f76ed24eff4b95af3536b210483f05c2b1982afba75852b3c256cc9`.

The governance test uploads this valid Wasm to the simulated ledger, proves early
execution fails, executes at eta, then reads the retained action record directly
from the simulated contract storage. No network or deployment is involved.

To reproduce, build the unchanged Bond scaffold from commit `e1a8fad` using
`stellar contract build` and copy its optimized Wasm artifact here.
