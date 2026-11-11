/** VX-504: compile SDK integration points against all generated clients. */
import type { Client as RegistryClient } from "@vaeltrix/bindings-registry";
import type { Client as BondClient } from "@vaeltrix/bindings-bond";
import type { Client as ScoreboardClient } from "@vaeltrix/bindings-scoreboard";
export function contractViews(
  registry: RegistryClient,
  bond: BondClient,
  scoreboard: ScoreboardClient,
) {
  return [
    registry.get_provider({ id: new Uint8Array(32) }),
    bond.commitment({ id: 1n }),
    scoreboard.lifetime({ provider_id: new Uint8Array(32) }),
  ];
}

/** Keep the newly implemented claim entry points in the SDK's compile contract. */
export function claimLifecycle(bond: BondClient, observer: string) {
  return [
    bond.challenge({ claim_id: 1n, counter_evidence_hash: new Uint8Array(32) }),
    bond.attest({ observer, claim_id: 1n, uphold: true, attestation_hash: new Uint8Array(32) }),
    bond.resolve({ claim_id: 1n }),
    bond.claim_votes({ id: 1n }),
  ];
}
