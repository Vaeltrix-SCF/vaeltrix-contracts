Integration and property tests live here. `properties.rs` (proptest over random action sequences, guide §9.3) is VX-312.

VX-310 provides `crate::testutils::World` under `cfg(test)`. Add unit-test modules
(or include a file from this directory using `#[path]` in the library's test
module) to reuse it; it is not a production export. The World deploys real
registry, bond, scoreboard and SAC implementations and checks I1, I2, I7 and I8
from storage, including all commitments, open claims, claim bonds and assets.
Setup uses mocked authorization; authorization matrix tests must explicitly set
`mock_auths` rather than treating the World as authorization coverage.
