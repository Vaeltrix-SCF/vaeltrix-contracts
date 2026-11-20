import {BatchRecord, PeriodStats, LifetimeStats, Claim, ClaimOutcome, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  bond(options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  batch(args: { commitment_id: bigint; period: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<BatchRecord, Error>>>;
  stats(args: { commitment_id: bigint; period: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<PeriodStats, Error>>>;
  periods(args: { commitment_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Array<bigint>>>;
  lifetime(args: { provider_id: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<LifetimeStats>>;
  set_bond(args: { bond: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  anchor_batch(args: { observer: string | Address; commitment_id: bigint; provider_id: Uint8Array; period_start: bigint; period_end: bigint; merkle_root: Uint8Array; stats: PeriodStats; attestation_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  record_claim_outcome(args: { claim: Claim; outcome: ClaimOutcome }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAAAAAAAAAAAAAEYm9uZAAAAAAAAAABAAAD6AAAABM=", "AAAAAAAAAAAAAAAFYmF0Y2gAAAAAAAACAAAAAAAAAA1jb21taXRtZW50X2lkAAAAAAAABgAAAAAAAAAGcGVyaW9kAAAAAAAGAAAAAQAAA+kAAAfQAAAAC0JhdGNoUmVjb3JkAAAAAAM=", "AAAAAAAAAAAAAAAFc3RhdHMAAAAAAAACAAAAAAAAAA1jb21taXRtZW50X2lkAAAAAAAABgAAAAAAAAAGcGVyaW9kAAAAAAAGAAAAAQAAA+kAAAfQAAAAC1BlcmlvZFN0YXRzAAAAAAM=", "AAAAAAAAAAAAAAAHcGVyaW9kcwAAAAABAAAAAAAAAA1jb21taXRtZW50X2lkAAAAAAAABgAAAAEAAAPqAAAABg==", "AAAAAAAAAAAAAAAIbGlmZXRpbWUAAAABAAAAAAAAAAtwcm92aWRlcl9pZAAAAAPuAAAAIAAAAAEAAAfQAAAADUxpZmV0aW1lU3RhdHMAAAA=", "AAAAAAAAAAAAAAAIc2V0X2JvbmQAAAABAAAAAAAAAARib25kAAAAEwAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAAAAAAAMYW5jaG9yX2JhdGNoAAAACAAAAAAAAAAIb2JzZXJ2ZXIAAAATAAAAAAAAAA1jb21taXRtZW50X2lkAAAAAAAABgAAAAAAAAALcHJvdmlkZXJfaWQAAAAD7gAAACAAAAAAAAAADHBlcmlvZF9zdGFydAAAAAYAAAAAAAAACnBlcmlvZF9lbmQAAAAAAAYAAAAAAAAAC21lcmtsZV9yb290AAAAA+4AAAAgAAAAAAAAAAVzdGF0cwAAAAAAB9AAAAALUGVyaW9kU3RhdHMAAAAAAAAAABBhdHRlc3RhdGlvbl9oYXNoAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIcmVnaXN0cnkAAAATAAAAAA==", "AAAAAAAAAAAAAAAUcmVjb3JkX2NsYWltX291dGNvbWUAAAACAAAAAAAAAAVjbGFpbQAAAAAAB9AAAAAFQ2xhaW0AAAAAAAAAAAAAB291dGNvbWUAAAAH0AAAAAxDbGFpbU91dGNvbWUAAAABAAAD6QAAAAIAAAAD", "AAAABQAAAAAAAAAAAAAAB0JvbmRTZXQAAAAAAQAAAAhib25kX3NldAAAAAEAAAAAAAAABGJvbmQAAAATAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAADUJhdGNoQW5jaG9yZWQAAAAAAAABAAAABWJhdGNoAAAAAAAABQAAAAAAAAANY29tbWl0bWVudF9pZAAAAAAAAAYAAAABAAAAAAAAAAZwZXJpb2QAAAAAAAYAAAAAAAAAAAAAAAttZXJrbGVfcm9vdAAAAAPuAAAAIAAAAAAAAAAAAAAACG9ic2VydmVyAAAAEwAAAAAAAAAAAAAABXN0YXRzAAAAAAAH0AAAAAtQZXJpb2RTdGF0cwAAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAADUNsYWltUmVjb3JkZWQAAAAAAAABAAAACWNsYWltX291dAAAAAAAAAMAAAAAAAAACGNsYWltX2lkAAAABgAAAAEAAAAAAAAAC3Byb3ZpZGVyX2lkAAAAA+4AAAAgAAAAAAAAAAAAAAAHb3V0Y29tZQAAAAfQAAAADENsYWltT3V0Y29tZQAAAAAAAAAC", "AAAAAgAAAAAAAAAAAAAACkJyZWFjaEtpbmQAAAAAAAIAAAAAAAAAAAAAAA5MYXRlQ29tcGxldGlvbgAAAAAAAAAAAAAAAAAMTm9Db21wbGV0aW9u", "AAAAAgAAAAAAAAAAAAAAC0NsYWltU3RhdHVzAAAAAAUAAAAAAAAAAAAAAAVGaWxlZAAAAAAAAAAAAAAAAAAACkNoYWxsZW5nZWQAAAAAAAAAAAAAAAAABFBhaWQAAAAAAAAAAAAAAAhSZWplY3RlZAAAAAAAAAAAAAAAB0V4cGlyZWQA", "AAAAAgAAAAAAAAAAAAAADENsYWltT3V0Y29tZQAAAAMAAAAAAAAAAAAAAAZVcGhlbGQAAAAAAAAAAAAAAAAACFJlamVjdGVkAAAAAAAAAAAAAAAHRXhwaXJlZAA=", "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAALAAAAAAAAAANTm90QXV0aG9yaXplZAAAAAAAAAEAAAAAAAAAEVByb3ZpZGVyTm90QWN0aXZlAAAAAAAAAgAAAAAAAAARVGVtcGxhdGVOb3RBY3RpdmUAAAAAAAADAAAAAAAAABFJbnN1ZmZpY2llbnRTdGFrZQAAAAAAAAQAAAAAAAAACk91dE9mU2NvcGUAAAAAAAUAAAAAAAAAEUNsYWltV2luZG93Q2xvc2VkAAAAAAAABgAAAAAAAAAORHVwbGljYXRlQ2xhaW0AAAAAAAcAAAAAAAAAD0ludmFsaWRFdmlkZW5jZQAAAAAIAAAAAAAAAAtOb3RJbkJyZWFjaAAAAAAJAAAAAAAAABNDaGFsbGVuZ2VXaW5kb3dPcGVuAAAAAAoAAAAAAAAAD09wZW5DbGFpbXNFeGlzdAAAAAALAAAAAAAAAA5Db29sZG93bkFjdGl2ZQAAAAAADAAAAAAAAAAPVW5rbm93bk9ic2VydmVyAAAAAA0AAAAAAAAAD0FscmVhZHlBdHRlc3RlZAAAAAAOAAAAAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAA8AAAAAAAAADk5vdEluaXRpYWxpemVkAAAAAAAQAAAAAAAAAA1JbnZhbGlkUGFyYW1zAAAAAAAAEQAAAAAAAAAPVW5rbm93blByb3ZpZGVyAAAAABIAAAAAAAAAD1Vua25vd25UZW1wbGF0ZQAAAAATAAAAAAAAABFVbmtub3duQ29tbWl0bWVudAAAAAAAABQAAAAAAAAADFVua25vd25DbGFpbQAAABUAAAAAAAAAE1Byb3ZpZGVyTm90VmVyaWZpZWQAAAAAFgAAAAAAAAAOUHJvdmlkZXJFeGlzdHMAAAAAABcAAAAAAAAADlRlbXBsYXRlRXhpc3RzAAAAAAAYAAAAAAAAAA5UaW1lbG9ja0FjdGl2ZQAAAAAAGQAAAAAAAAAPQXNzZXROb3RBbGxvd2VkAAAAABoAAAAAAAAADUFzc2V0TWlzbWF0Y2gAAAAAAAAbAAAAAAAAABBBbW91bnRPdXRPZlJhbmdlAAAAHAAAAAAAAAAKTm90Q292ZXJlZAAAAAAAHQAAAAAAAAATQ29tbWl0bWVudE5vdEFjdGl2ZQAAAAAeAAAAAAAAAAxDbGFpbU5vdE9wZW4AAAAfAAAAAAAAABdBdHRlc3RhdGlvbldpbmRvd0Nsb3NlZAAAAAAgAAAAAAAAABBRdW9ydW1Ob3RSZWFjaGVkAAAAIQAAAAAAAAANQmVsb3dNaW5TdGFrZQAAAAAAACIAAAAAAAAAEFN0YWtlQ2FwRXhjZWVkZWQAAAAjAAAAAAAAABFQYXltZW50SWRNaXNtYXRjaAAAAAAAACQAAAAAAAAADVVua25vd25TaWduZXIAAAAAAAAlAAAAAAAAAA5Ub29NYW55U2lnbmVycwAAAAAAJgAAAAAAAAAXVW5zdXBwb3J0ZWRQZW5hbHR5TW9kZWwAAAAAJwAAAAAAAAASQXJpdGhtZXRpY092ZXJmbG93AAAAAAAoAAAAAAAAAA5Cb25kQWxyZWFkeVNldAAAAAAAKQAAAAAAAAALQmF0Y2hFeGlzdHMAAAAAKgAAAAAAAAANSW52YWxpZFBlcmlvZAAAAAAAACsAAAAAAAAADk5vdGhpbmdQZW5kaW5nAAAAAAAs", "AAAAAQAAAAAAAAAAAAAABUNsYWltAAAAAAAAFAAAAAAAAAAUYXR0ZXN0YXRpb25fZGVhZGxpbmUAAAAGAAAAAAAAAAtiZW5lZmljaWFyeQAAAAATAAAAAAAAAApib25kX3BheWVyAAAAAAATAAAAAAAAAAZicmVhY2gAAAAAB9AAAAAKQnJlYWNoS2luZAAAAAAAAAAAABJjaGFsbGVuZ2VfZGVhZGxpbmUAAAAAAAYAAAAAAAAACmNsYWltX2JvbmQAAAAAAAsAAAAAAAAACGNsYWltYW50AAAAEwAAAAAAAAANY29tbWl0bWVudF9pZAAAAAAAAAYAAAAAAAAAFWNvdW50ZXJfZXZpZGVuY2VfaGFzaAAAAAAAA+gAAAPuAAAAIAAAAAAAAAAIZmlsZWRfYXQAAAAGAAAAAAAAABFmaWxlZF9ieV9vYnNlcnZlcgAAAAAAA+gAAAATAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAHcGF5bWVudAAAAAfQAAAAClBheW1lbnRSZWYAAAAAAAAAAAAOcGVuYWx0eV9hbW91bnQAAAAAAAsAAAAAAAAAC3Byb3ZpZGVyX2lkAAAAA+4AAAAgAAAAAAAAAA9yZXNlcnZlZF9hbW91bnQAAAAACwAAAAAAAAAJc2hvcnRmYWxsAAAAAAAACwAAAAAAAAAGc3RhdHVzAAAAAAfQAAAAC0NsYWltU3RhdHVzAAAAAAAAAAANdm90ZXNfYWdhaW5zdAAAAAAAAAQAAAAAAAAACXZvdGVzX2ZvcgAAAAAAAAQ=", "AAAAAQAAAAAAAAAAAAAAClBheW1lbnRSZWYAAAAAAAgAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAANY29tbWl0bWVudF9pZAAAAAAAAAYAAAAAAAAADWV2aWRlbmNlX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAIcGF1c2VfbXMAAAAGAAAAAAAAAApwYXltZW50X2lkAAAAAAPuAAAAIAAAAAAAAAALc2VwMzFfdHhfaWQAAAAAEAAAAAAAAAAFdDBfbXMAAAAAAAAGAAAAAAAAAAV0MV9tcwAAAAAAA+gAAAAG", "AAAAAQAAAAAAAAAAAAAAC0JhdGNoUmVjb3JkAAAAAAUAAAAAAAAAC2FuY2hvcmVkX2F0AAAAAAYAAAAAAAAAEGF0dGVzdGF0aW9uX2hhc2gAAAPuAAAAIAAAAAAAAAALbWVya2xlX3Jvb3QAAAAD7gAAACAAAAAAAAAACG9ic2VydmVyAAAAEwAAAAAAAAAFc3RhdHMAAAAAAAfQAAAAC1BlcmlvZFN0YXRzAA==", "AAAAAQAAAAAAAAAAAAAAC1BlcmlvZFN0YXRzAAAAAAkAAAAAAAAACGJyZWFjaGVzAAAABAAAAAAAAAAKY2FydmVkX291dAAAAAAABAAAAAAAAAAHb25fdGltZQAAAAAEAAAAAAAAAAZwNTBfbXMAAAAAAAYAAAAAAAAABnA5NV9tcwAAAAAABgAAAAAAAAAGcDk5X21zAAAAAAAGAAAAAAAAAAhwYXltZW50cwAAAAQAAAAAAAAADnBlbmFsdGllc19wYWlkAAAAAAALAAAAAAAAAAZ2b2x1bWUAAAAAAAs=", "AAAAAQAAAAAAAAAAAAAADUxpZmV0aW1lU3RhdHMAAAAAAAAKAAAAAAAAAAhicmVhY2hlcwAAAAYAAAAAAAAACmNhcnZlZF9vdXQAAAAAAAYAAAAAAAAADmNsYWltc19leHBpcmVkAAAAAAAEAAAAAAAAAA9jbGFpbXNfcmVqZWN0ZWQAAAAABAAAAAAAAAANY2xhaW1zX3VwaGVsZAAAAAAAAAQAAAAAAAAAB29uX3RpbWUAAAAABgAAAAAAAAAIcGF5bWVudHMAAAAGAAAAAAAAAA5wZW5hbHRpZXNfcGFpZAAAAAAACwAAAAAAAAAPc2hvcnRmYWxsX3RvdGFsAAAAAAsAAAAAAAAABnZvbHVtZQAAAAAACw=="]),
      options
    );
  }

   static async deploy<T = Client>(args: { admin: string | Address; registry: string | Address }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    const tx = await ContractClient.deploy<T & ContractClient>(args, options);
    const parse = tx.options.parseResultXdr;
    tx.options.parseResultXdr = (result) => new Client(parse(result).options) as T & Client;
    return tx;
  }
  public readonly fromJson = {
    bond : this.txFromJson<string | null>,  batch : this.txFromJson<Result<BatchRecord, Error>>,  stats : this.txFromJson<Result<PeriodStats, Error>>,  periods : this.txFromJson<Array<bigint>>,  lifetime : this.txFromJson<LifetimeStats>,  set_bond : this.txFromJson<Result<null, Error>>,  anchor_batch : this.txFromJson<Result<null, Error>>,  record_claim_outcome : this.txFromJson<Result<null, Error>>
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
   * Build a topics filter row for the "BondSet" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  bondSetEventFilter(): string[] {
    return this.spec.eventTopicFilter("BondSet");
  }
  /**
   * Build a topics filter row for the "BatchAnchored" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  batchAnchoredEventFilter(topicValues?: { commitment_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("BatchAnchored", topicValues);
  }
  /**
   * Build a topics filter row for the "ClaimRecorded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  claimRecordedEventFilter(topicValues?: { claim_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("ClaimRecorded", topicValues);
  }
}