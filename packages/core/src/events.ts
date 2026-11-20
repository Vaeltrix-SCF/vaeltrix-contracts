import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { canonicalize } from "./jcs.js";
export interface SignedEvent {
  signer: string;
  sig: string;
  [field: string]: unknown;
}
export function signEvent(event: Record<string, unknown>, keypair: Keypair): SignedEvent {
  const { sig: ignored, ...body } = event;
  void ignored;
  const unsigned = { ...body, signer: Buffer.from(keypair.rawPublicKey()).toString("hex") };
  return {
    ...unsigned,
    sig: `ed25519:${Buffer.from(keypair.sign(Buffer.from(canonicalize(unsigned)))).toString("base64")}`,
  };
}
export function verifyEvent(event: SignedEvent, pubkeys: readonly string[]): boolean {
  try {
    const { sig, ...unsigned } = event;
    if (
      !/^[a-f0-9]{64}$/.test(event.signer) ||
      !pubkeys.includes(event.signer) ||
      !/^ed25519:[A-Za-z0-9+/]{86}==$/.test(sig)
    )
      return false;
    return Keypair.fromPublicKey(
      StrKey.encodeEd25519PublicKey(Buffer.from(event.signer, "hex")),
    ).verify(Buffer.from(canonicalize(unsigned)), Buffer.from(sig.slice(8), "base64"));
  } catch {
    return false;
  }
}
