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
