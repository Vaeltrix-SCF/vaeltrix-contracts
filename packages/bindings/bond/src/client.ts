import {Claim, Commitment, PaymentRef, CompletionReceipt, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  admin(options?: MethodOptions): Promise<AssembledTransaction<Result<string, Error>>>;
  claim(args: { id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<Claim, Error>>>;
  pause(args: { id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  attest(args: { observer: string | Address; claim_id: bigint; uphold: boolean; attestation_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  commit(args: { provider_id: Uint8Array; template_id: number; stake_asset: string | Address; amount: bigint; max_volume_per_period: bigint; period_secs: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
  resume(args: { id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  resolve(args: { claim_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  registry(options?: MethodOptions): Promise<AssembledTransaction<Result<string, Error>>>;
  add_stake(args: { id: bigint; amount: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  challenge(args: { claim_id: bigint; counter_evidence_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  commitment(args: { id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<Commitment, Error>>>;
  file_claim(args: { claimant: string | Address; beneficiary: string | Address; payment: PaymentRef; observer: string | Address | null; receipt: CompletionReceipt | null }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
  is_covered(args: { commitment_id: bigint; t0_ms: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<boolean, Error>>>;
  scoreboard(options?: MethodOptions): Promise<AssembledTransaction<Result<string, Error>>>;
  claim_votes(args: { id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Array<[string, boolean]>>>;
  max_penalty(args: { id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
  request_exit(args: { id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  finalize_exit(args: { id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  cancel_upgrade(options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  available_stake(args: { id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
  execute_upgrade(options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  propose_upgrade(args: { wasm_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  withdraw_excess(args: { id: bigint; amount: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  claim_by_payment(args: { payment_id: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<bigint | null>>;
  commitments_by_provider(args: { provider_id: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Array<bigint>>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAAAAAAAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAA+kAAAATAAAAAw==", "AAAAAAAAAAAAAAAFY2xhaW0AAAAAAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAPpAAAH0AAAAAVDbGFpbQAAAAAAAAM=", "AAAAAAAAAAAAAAAFcGF1c2UAAAAAAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAAAAAAAGYXR0ZXN0AAAAAAAEAAAAAAAAAAhvYnNlcnZlcgAAABMAAAAAAAAACGNsYWltX2lkAAAABgAAAAAAAAAGdXBob2xkAAAAAAABAAAAAAAAABBhdHRlc3RhdGlvbl9oYXNoAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAAAAAAAGY29tbWl0AAAAAAAGAAAAAAAAAAtwcm92aWRlcl9pZAAAAAPuAAAAIAAAAAAAAAALdGVtcGxhdGVfaWQAAAAABAAAAAAAAAALc3Rha2VfYXNzZXQAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAABVtYXhfdm9sdW1lX3Blcl9wZXJpb2QAAAAAAAALAAAAAAAAAAtwZXJpb2Rfc2VjcwAAAAAGAAAAAQAAA+kAAAAGAAAAAw==", "AAAAAAAAAAAAAAAGcmVzdW1lAAAAAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAAAAAAAHcmVzb2x2ZQAAAAABAAAAAAAAAAhjbGFpbV9pZAAAAAYAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAAAAAAAIcmVnaXN0cnkAAAAAAAAAAQAAA+kAAAATAAAAAw==", "AAAAAAAAAAAAAAAJYWRkX3N0YWtlAAAAAAAAAgAAAAAAAAACaWQAAAAAAAYAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAAAAAAAJY2hhbGxlbmdlAAAAAAAAAgAAAAAAAAAIY2xhaW1faWQAAAAGAAAAAAAAABVjb3VudGVyX2V2aWRlbmNlX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAAAAAAAKY29tbWl0bWVudAAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6QAAB9AAAAAKQ29tbWl0bWVudAAAAAAAAw==", "AAAAAAAAAAAAAAAKZmlsZV9jbGFpbQAAAAAABQAAAAAAAAAIY2xhaW1hbnQAAAATAAAAAAAAAAtiZW5lZmljaWFyeQAAAAATAAAAAAAAAAdwYXltZW50AAAAB9AAAAAKUGF5bWVudFJlZgAAAAAAAAAAAAhvYnNlcnZlcgAAA+gAAAATAAAAAAAAAAdyZWNlaXB0AAAAA+gAAAfQAAAAEUNvbXBsZXRpb25SZWNlaXB0AAAAAAAAAQAAA+kAAAAGAAAAAw==", "AAAAAAAAAAAAAAAKaXNfY292ZXJlZAAAAAAAAgAAAAAAAAANY29tbWl0bWVudF9pZAAAAAAAAAYAAAAAAAAABXQwX21zAAAAAAAABgAAAAEAAAPpAAAAAQAAAAM=", "AAAAAAAAAAAAAAAKc2NvcmVib2FyZAAAAAAAAAAAAAEAAAPpAAAAEwAAAAM=", "AAAAAAAAAAAAAAALY2xhaW1fdm90ZXMAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6gAAA+0AAAACAAAAEwAAAAE=", "AAAAAAAAAAAAAAALbWF4X3BlbmFsdHkAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6QAAAAsAAAAD", "AAAAAAAAAAAAAAAMcmVxdWVzdF9leGl0AAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIcmVnaXN0cnkAAAATAAAAAAAAAApzY29yZWJvYXJkAAAAAAATAAAAAA==", "AAAAAAAAAAAAAAANZmluYWxpemVfZXhpdAAAAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAAAAAAAOY2FuY2VsX3VwZ3JhZGUAAAAAAAAAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAAAAAAAPYXZhaWxhYmxlX3N0YWtlAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAA+kAAAALAAAAAw==", "AAAAAAAAAAAAAAAPZXhlY3V0ZV91cGdyYWRlAAAAAAAAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAAAAAAAPcHJvcG9zZV91cGdyYWRlAAAAAAEAAAAAAAAACXdhc21faGFzaAAAAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAAAw==", "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", "AAAABQAAAAAAAAAAAAAAD1VwZ3JhZGVFeGVjdXRlZAAAAAABAAAACHVwZ19leGVjAAAAAQAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAD1VwZ3JhZGVQcm9wb3NlZAAAAAABAAAACHVwZ19wcm9wAAAAAQAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAAg==", "AAAAAgAAAAAAAAAAAAAACkJyZWFjaEtpbmQAAAAAAAIAAAAAAAAAAAAAAA5MYXRlQ29tcGxldGlvbgAAAAAAAAAAAAAAAAAMTm9Db21wbGV0aW9u", "AAAAAgAAAAAAAAAAAAAAC0NsYWltU3RhdHVzAAAAAAUAAAAAAAAAAAAAAAVGaWxlZAAAAAAAAAAAAAAAAAAACkNoYWxsZW5nZWQAAAAAAAAAAAAAAAAABFBhaWQAAAAAAAAAAAAAAAhSZWplY3RlZAAAAAAAAAAAAAAAB0V4cGlyZWQA", "AAAAAgAAAAAAAAAAAAAADENsYWltT3V0Y29tZQAAAAMAAAAAAAAAAAAAAAZVcGhlbGQAAAAAAAAAAAAAAAAACFJlamVjdGVkAAAAAAAAAAAAAAAHRXhwaXJlZAA=", "AAAAAgAAAAAAAAAAAAAAEENvbW1pdG1lbnRTdGF0dXMAAAAEAAAAAAAAAAAAAAAGQWN0aXZlAAAAAAAAAAAAAAAAAAZQYXVzZWQAAAAAAAAAAAAAAAAAB0V4aXRpbmcAAAAAAAAAAAAAAAAGRXhpdGVkAAA=", "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAALAAAAAAAAAANTm90QXV0aG9yaXplZAAAAAAAAAEAAAAAAAAAEVByb3ZpZGVyTm90QWN0aXZlAAAAAAAAAgAAAAAAAAARVGVtcGxhdGVOb3RBY3RpdmUAAAAAAAADAAAAAAAAABFJbnN1ZmZpY2llbnRTdGFrZQAAAAAAAAQAAAAAAAAACk91dE9mU2NvcGUAAAAAAAUAAAAAAAAAEUNsYWltV2luZG93Q2xvc2VkAAAAAAAABgAAAAAAAAAORHVwbGljYXRlQ2xhaW0AAAAAAAcAAAAAAAAAD0ludmFsaWRFdmlkZW5jZQAAAAAIAAAAAAAAAAtOb3RJbkJyZWFjaAAAAAAJAAAAAAAAABNDaGFsbGVuZ2VXaW5kb3dPcGVuAAAAAAoAAAAAAAAAD09wZW5DbGFpbXNFeGlzdAAAAAALAAAAAAAAAA5Db29sZG93bkFjdGl2ZQAAAAAADAAAAAAAAAAPVW5rbm93bk9ic2VydmVyAAAAAA0AAAAAAAAAD0FscmVhZHlBdHRlc3RlZAAAAAAOAAAAAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAA8AAAAAAAAADk5vdEluaXRpYWxpemVkAAAAAAAQAAAAAAAAAA1JbnZhbGlkUGFyYW1zAAAAAAAAEQAAAAAAAAAPVW5rbm93blByb3ZpZGVyAAAAABIAAAAAAAAAD1Vua25vd25UZW1wbGF0ZQAAAAATAAAAAAAAABFVbmtub3duQ29tbWl0bWVudAAAAAAAABQAAAAAAAAADFVua25vd25DbGFpbQAAABUAAAAAAAAAE1Byb3ZpZGVyTm90VmVyaWZpZWQAAAAAFgAAAAAAAAAOUHJvdmlkZXJFeGlzdHMAAAAAABcAAAAAAAAADlRlbXBsYXRlRXhpc3RzAAAAAAAYAAAAAAAAAA5UaW1lbG9ja0FjdGl2ZQAAAAAAGQAAAAAAAAAPQXNzZXROb3RBbGxvd2VkAAAAABoAAAAAAAAADUFzc2V0TWlzbWF0Y2gAAAAAAAAbAAAAAAAAABBBbW91bnRPdXRPZlJhbmdlAAAAHAAAAAAAAAAKTm90Q292ZXJlZAAAAAAAHQAAAAAAAAATQ29tbWl0bWVudE5vdEFjdGl2ZQAAAAAeAAAAAAAAAAxDbGFpbU5vdE9wZW4AAAAfAAAAAAAAABdBdHRlc3RhdGlvbldpbmRvd0Nsb3NlZAAAAAAgAAAAAAAAABBRdW9ydW1Ob3RSZWFjaGVkAAAAIQAAAAAAAAANQmVsb3dNaW5TdGFrZQAAAAAAACIAAAAAAAAAEFN0YWtlQ2FwRXhjZWVkZWQAAAAjAAAAAAAAABFQYXltZW50SWRNaXNtYXRjaAAAAAAAACQAAAAAAAAADVVua25vd25TaWduZXIAAAAAAAAlAAAAAAAAAA5Ub29NYW55U2lnbmVycwAAAAAAJgAAAAAAAAAXVW5zdXBwb3J0ZWRQZW5hbHR5TW9kZWwAAAAAJwAAAAAAAAASQXJpdGhtZXRpY092ZXJmbG93AAAAAAAoAAAAAAAAAA5Cb25kQWxyZWFkeVNldAAAAAAAKQAAAAAAAAALQmF0Y2hFeGlzdHMAAAAAKgAAAAAAAAANSW52YWxpZFBlcmlvZAAAAAAAACsAAAAAAAAADk5vdGhpbmdQZW5kaW5nAAAAAAAs", "AAAAAQAAAAAAAAAAAAAABUNsYWltAAAAAAAAFAAAAAAAAAAUYXR0ZXN0YXRpb25fZGVhZGxpbmUAAAAGAAAAAAAAAAtiZW5lZmljaWFyeQAAAAATAAAAAAAAAApib25kX3BheWVyAAAAAAATAAAAAAAAAAZicmVhY2gAAAAAB9AAAAAKQnJlYWNoS2luZAAAAAAAAAAAABJjaGFsbGVuZ2VfZGVhZGxpbmUAAAAAAAYAAAAAAAAACmNsYWltX2JvbmQAAAAAAAsAAAAAAAAACGNsYWltYW50AAAAEwAAAAAAAAANY29tbWl0bWVudF9pZAAAAAAAAAYAAAAAAAAAFWNvdW50ZXJfZXZpZGVuY2VfaGFzaAAAAAAAA+gAAAPuAAAAIAAAAAAAAAAIZmlsZWRfYXQAAAAGAAAAAAAAABFmaWxlZF9ieV9vYnNlcnZlcgAAAAAAA+gAAAATAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAHcGF5bWVudAAAAAfQAAAAClBheW1lbnRSZWYAAAAAAAAAAAAOcGVuYWx0eV9hbW91bnQAAAAAAAsAAAAAAAAAC3Byb3ZpZGVyX2lkAAAAA+4AAAAgAAAAAAAAAA9yZXNlcnZlZF9hbW91bnQAAAAACwAAAAAAAAAJc2hvcnRmYWxsAAAAAAAACwAAAAAAAAAGc3RhdHVzAAAAAAfQAAAAC0NsYWltU3RhdHVzAAAAAAAAAAANdm90ZXNfYWdhaW5zdAAAAAAAAAQAAAAAAAAACXZvdGVzX2ZvcgAAAAAAAAQ=", "AAAAAQAAAAAAAAAAAAAACkNvbW1pdG1lbnQAAAAAABIAAAAAAAAADmVmZmVjdGl2ZV9mcm9tAAAAAAAGAAAAAAAAAAxlZmZlY3RpdmVfdG8AAAPoAAAABgAAAAAAAAASZXhpdF9jb29sZG93bl9zZWNzAAAAAAAGAAAAAAAAABFleGl0X3JlcXVlc3RlZF9hdAAAAAAAA+gAAAAGAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAVbWF4X3ZvbHVtZV9wZXJfcGVyaW9kAAAAAAAACwAAAAAAAAAJbWluX3N0YWtlAAAAAAAACwAAAAAAAAALb3Blbl9jbGFpbXMAAAAABAAAAAAAAAAJcGF1c2VkX2F0AAAAAAAD6AAAAAYAAAAAAAAAC3BlcmlvZF9zZWNzAAAAAAYAAAAAAAAAC3Byb3ZpZGVyX2lkAAAAA+4AAAAgAAAAAAAAAApyZXN1bWVkX2F0AAAAAAPoAAAABgAAAAAAAAALc3Rha2VfYXNzZXQAAAAAEwAAAAAAAAAOc3Rha2VfcmVzZXJ2ZWQAAAAAAAsAAAAAAAAAC3N0YWtlX3RvdGFsAAAAAAsAAAAAAAAABnN0YXR1cwAAAAAH0AAAABBDb21taXRtZW50U3RhdHVzAAAAAAAAAAt0ZW1wbGF0ZV9pZAAAAAAEAAAAAAAAABB0ZW1wbGF0ZV92ZXJzaW9uAAAABA==", "AAAAAQAAAAAAAAAAAAAAClBheW1lbnRSZWYAAAAAAAgAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAANY29tbWl0bWVudF9pZAAAAAAAAAYAAAAAAAAADWV2aWRlbmNlX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAIcGF1c2VfbXMAAAAGAAAAAAAAAApwYXltZW50X2lkAAAAAAPuAAAAIAAAAAAAAAALc2VwMzFfdHhfaWQAAAAAEAAAAAAAAAAFdDBfbXMAAAAAAAAGAAAAAAAAAAV0MV9tcwAAAAAAA+gAAAAG", "AAAAAQAAAAAAAAAAAAAAEUNvbXBsZXRpb25SZWNlaXB0AAAAAAAAAgAAAAAAAAAJc2lnbmF0dXJlAAAAAAAD7gAAAEAAAAAAAAAABnNpZ25lcgAAAAAD7gAAACA="]),
      options
    );
  }

   static deploy<T = Client>(args: { admin: string | Address; registry: string | Address; scoreboard: string | Address }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(args, options);
  }
  public readonly fromJson = {
    admin : this.txFromJson<Result<string, Error>>,  claim : this.txFromJson<Result<Claim, Error>>,  pause : this.txFromJson<Result<null, Error>>,  attest : this.txFromJson<Result<null, Error>>,  commit : this.txFromJson<Result<bigint, Error>>,  resume : this.txFromJson<Result<null, Error>>,  resolve : this.txFromJson<Result<null, Error>>,  registry : this.txFromJson<Result<string, Error>>,  add_stake : this.txFromJson<Result<null, Error>>,  challenge : this.txFromJson<Result<null, Error>>,  commitment : this.txFromJson<Result<Commitment, Error>>,  file_claim : this.txFromJson<Result<bigint, Error>>,  is_covered : this.txFromJson<Result<boolean, Error>>,  scoreboard : this.txFromJson<Result<string, Error>>,  claim_votes : this.txFromJson<Array<[string, boolean]>>,  max_penalty : this.txFromJson<Result<bigint, Error>>,  request_exit : this.txFromJson<Result<null, Error>>,  finalize_exit : this.txFromJson<Result<null, Error>>,  cancel_upgrade : this.txFromJson<Result<null, Error>>,  available_stake : this.txFromJson<Result<bigint, Error>>,  execute_upgrade : this.txFromJson<Result<null, Error>>,  propose_upgrade : this.txFromJson<Result<null, Error>>,  withdraw_excess : this.txFromJson<Result<null, Error>>,  claim_by_payment : this.txFromJson<bigint | null>,  commitments_by_provider : this.txFromJson<Array<bigint>>
  };

  /** @deprecated Use fromJson instead. */
  public readonly fromJSON = this.fromJson;

  /**
   * Parse a raw contract event (topics + data) into a typed {@link ContractEvent}.
   */
  parseEvent(topics: xdr.ScVal[] | string[], data: xdr.ScVal | string): ContractEvent | undefined {
    return this.spec.parseEvent(topics, data) as ContractEvent | undefined;
  }
  /**
   * Build a topics filter row for the "Paused" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  pausedEventFilter(topicValues?: { commitment_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("Paused", topicValues);
  }
  /**
   * Build a topics filter row for the "Resumed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  resumedEventFilter(topicValues?: { commitment_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("Resumed", topicValues);
  }
  /**
   * Build a topics filter row for the "Committed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  committedEventFilter(topicValues?: { commitment_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("Committed", topicValues);
  }
  /**
   * Build a topics filter row for the "ClaimFiled" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  claimFiledEventFilter(topicValues?: { claim_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("ClaimFiled", topicValues);
  }
  /**
   * Build a topics filter row for the "StakeChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  stakeChangedEventFilter(topicValues?: { commitment_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("StakeChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "ClaimAttested" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  claimAttestedEventFilter(topicValues?: { claim_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("ClaimAttested", topicValues);
  }
  /**
   * Build a topics filter row for the "ClaimResolved" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  claimResolvedEventFilter(topicValues?: { claim_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("ClaimResolved", topicValues);
  }
  /**
   * Build a topics filter row for the "ExitFinalized" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  exitFinalizedEventFilter(topicValues?: { commitment_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("ExitFinalized", topicValues);
  }
  /**
   * Build a topics filter row for the "ExitRequested" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  exitRequestedEventFilter(topicValues?: { commitment_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("ExitRequested", topicValues);
  }
  /**
   * Build a topics filter row for the "ClaimChallenged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  claimChallengedEventFilter(topicValues?: { claim_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("ClaimChallenged", topicValues);
  }
  /**
   * Build a topics filter row for the "UpgradeExecuted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  upgradeExecutedEventFilter(): string[] {
    return this.spec.eventTopicFilter("UpgradeExecuted");
  }
  /**
   * Build a topics filter row for the "UpgradeProposed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  upgradeProposedEventFilter(): string[] {
    return this.spec.eventTopicFilter("UpgradeProposed");
  }
}