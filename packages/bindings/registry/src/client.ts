import {PendingAction, Params, ActionKind, Observer, Provider, SlaTemplate, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  admin(options?: MethodOptions): Promise<AssembledTransaction<Result<string, Error>>>;
  action(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<PendingAction, Error>>>;
  cancel(args: { action_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  params(options?: MethodOptions): Promise<AssembledTransaction<Result<Params, Error>>>;
  execute(args: { action_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  propose(args: { kind: ActionKind }, options?: MethodOptions): Promise<AssembledTransaction<Result<number, Error>>>;
  observers(options?: MethodOptions): Promise<AssembledTransaction<Array<Observer>>>;
  accept_admin(options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  get_provider(args: { id: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<Provider, Error>>>;
  get_template(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<SlaTemplate, Error>>>;
  template_ids(options?: MethodOptions): Promise<AssembledTransaction<Array<number>>>;
  propose_admin(args: { new_admin: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  verify_domain(args: { provider_id: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  update_signers(args: { provider_id: Uint8Array; signers: Array<Uint8Array> }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  cancel_template(args: { id: number; version: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  provider_id_for(args: { home_domain: string; admin: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  unverify_domain(args: { provider_id: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  update_metadata(args: { provider_id: Uint8Array; metadata_uri: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  propose_template(args: { template: SlaTemplate }, options?: MethodOptions): Promise<AssembledTransaction<Result<number, Error>>>;
  suspend_provider(args: { provider_id: Uint8Array; reason: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  activate_template(args: { id: number; version: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  register_provider(args: { admin: string | Address; home_domain: string; signers: Array<Uint8Array>; metadata_uri: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<Uint8Array, Error>>>;
  deprecate_template(args: { id: number; version: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  is_active_observer(args: { observer: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  providers_by_admin(args: { admin: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Array<Uint8Array>>>;
  reinstate_provider(args: { provider_id: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  get_template_version(args: { id: number; version: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<SlaTemplate, Error>>>;
  active_observer_count(options?: MethodOptions): Promise<AssembledTransaction<Result<number, Error>>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAAAAAAAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAA+kAAAATAAAAAw==", "AAAAAAAAAAAAAAAGYWN0aW9uAAAAAAABAAAAAAAAAAJpZAAAAAAABAAAAAEAAAPpAAAH0AAAAA1QZW5kaW5nQWN0aW9uAAAAAAAAAw==", "AAAAAAAAAAAAAAAGY2FuY2VsAAAAAAABAAAAAAAAAAlhY3Rpb25faWQAAAAAAAAEAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAAAAAAAGcGFyYW1zAAAAAAAAAAAAAQAAA+kAAAfQAAAABlBhcmFtcwAAAAAAAw==", "AAAAAAAAAAAAAAAHZXhlY3V0ZQAAAAABAAAAAAAAAAlhY3Rpb25faWQAAAAAAAAEAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAAAAAAAHcHJvcG9zZQAAAAABAAAAAAAAAARraW5kAAAH0AAAAApBY3Rpb25LaW5kAAAAAAABAAAD6QAAAAQAAAAD", "AAAAAAAAAAAAAAAJb2JzZXJ2ZXJzAAAAAAAAAAAAAAEAAAPqAAAH0AAAAAhPYnNlcnZlcg==", "AAAAAAAAAAAAAAAMYWNjZXB0X2FkbWluAAAAAAAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAAAAAAAMZ2V0X3Byb3ZpZGVyAAAAAQAAAAAAAAACaWQAAAAAA+4AAAAgAAAAAQAAA+kAAAfQAAAACFByb3ZpZGVyAAAAAw==", "AAAAAAAAAAAAAAAMZ2V0X3RlbXBsYXRlAAAAAQAAAAAAAAACaWQAAAAAAAQAAAABAAAD6QAAB9AAAAALU2xhVGVtcGxhdGUAAAAAAw==", "AAAAAAAAAAAAAAAMdGVtcGxhdGVfaWRzAAAAAAAAAAEAAAPqAAAABA==", "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAGcGFyYW1zAAAAAAfQAAAABlBhcmFtcwAAAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAAAAAAANcHJvcG9zZV9hZG1pbgAAAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAAAAAAANdmVyaWZ5X2RvbWFpbgAAAAAAAAEAAAAAAAAAC3Byb3ZpZGVyX2lkAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAAAAAAAOdXBkYXRlX3NpZ25lcnMAAAAAAAIAAAAAAAAAC3Byb3ZpZGVyX2lkAAAAA+4AAAAgAAAAAAAAAAdzaWduZXJzAAAAA+oAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAAAAAAAPY2FuY2VsX3RlbXBsYXRlAAAAAAIAAAAAAAAAAmlkAAAAAAAEAAAAAAAAAAd2ZXJzaW9uAAAAAAQAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAAAAAAAPcHJvdmlkZXJfaWRfZm9yAAAAAAIAAAAAAAAAC2hvbWVfZG9tYWluAAAAABAAAAAAAAAABWFkbWluAAAAAAAAEwAAAAEAAAPuAAAAIA==", "AAAAAAAAAAAAAAAPdW52ZXJpZnlfZG9tYWluAAAAAAEAAAAAAAAAC3Byb3ZpZGVyX2lkAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAAAAAAAPdXBkYXRlX21ldGFkYXRhAAAAAAIAAAAAAAAAC3Byb3ZpZGVyX2lkAAAAA+4AAAAgAAAAAAAAAAxtZXRhZGF0YV91cmkAAAAQAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAAAAAAAQcHJvcG9zZV90ZW1wbGF0ZQAAAAEAAAAAAAAACHRlbXBsYXRlAAAH0AAAAAtTbGFUZW1wbGF0ZQAAAAABAAAD6QAAAAQAAAAD", "AAAAAAAAAAAAAAAQc3VzcGVuZF9wcm92aWRlcgAAAAIAAAAAAAAAC3Byb3ZpZGVyX2lkAAAAA+4AAAAgAAAAAAAAAAZyZWFzb24AAAAAABEAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAAAAAAARYWN0aXZhdGVfdGVtcGxhdGUAAAAAAAACAAAAAAAAAAJpZAAAAAAABAAAAAAAAAAHdmVyc2lvbgAAAAAEAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAAAAAAARcmVnaXN0ZXJfcHJvdmlkZXIAAAAAAAAEAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAC2hvbWVfZG9tYWluAAAAABAAAAAAAAAAB3NpZ25lcnMAAAAD6gAAA+4AAAAgAAAAAAAAAAxtZXRhZGF0YV91cmkAAAAQAAAAAQAAA+kAAAPuAAAAIAAAAAM=", "AAAAAAAAAAAAAAASZGVwcmVjYXRlX3RlbXBsYXRlAAAAAAACAAAAAAAAAAJpZAAAAAAABAAAAAAAAAAHdmVyc2lvbgAAAAAEAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAAAAAAASaXNfYWN0aXZlX29ic2VydmVyAAAAAAABAAAAAAAAAAhvYnNlcnZlcgAAABMAAAABAAAAAQ==", "AAAAAAAAAAAAAAAScHJvdmlkZXJzX2J5X2FkbWluAAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAD6gAAA+4AAAAg", "AAAAAAAAAAAAAAAScmVpbnN0YXRlX3Byb3ZpZGVyAAAAAAABAAAAAAAAAAtwcm92aWRlcl9pZAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAAAAAAAUZ2V0X3RlbXBsYXRlX3ZlcnNpb24AAAACAAAAAAAAAAJpZAAAAAAABAAAAAAAAAAHdmVyc2lvbgAAAAAEAAAAAQAAA+kAAAfQAAAAC1NsYVRlbXBsYXRlAAAAAAM=", "AAAAAAAAAAAAAAAVYWN0aXZlX29ic2VydmVyX2NvdW50AAAAAAAAAAAAAAEAAAPpAAAABAAAAAM=", "AAAABQAAAAAAAAAAAAAABEluaXQAAAABAAAABGluaXQAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAACEFkbWluU2V0AAAAAQAAAAdhZG1fc2V0AAAAAAEAAAAAAAAAB2FkZHJlc3MAAAAAEwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAADUFkbWluUHJvcG9zZWQAAAAAAAABAAAACGFkbV9wcm9wAAAAAQAAAAAAAAAHYWRkcmVzcwAAAAATAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAADU9ic2VydmVyQWRkZWQAAAAAAAABAAAAB29ic19hZGQAAAAAAgAAAAAAAAAIb2JzZXJ2ZXIAAAATAAAAAQAAAAAAAAADa2V5AAAAA+4AAAAgAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAADkFjdGlvbkV4ZWN1dGVkAAAAAAABAAAACGFjdF9leGVjAAAAAQAAAAAAAAAJYWN0aW9uX2lkAAAAAAAABAAAAAEAAAAC", "AAAABQAAAAAAAAAAAAAADkFjdGlvblByb3Bvc2VkAAAAAAABAAAACGFjdF9wcm9wAAAAAwAAAAAAAAAJYWN0aW9uX2lkAAAAAAAABAAAAAEAAAAAAAAABGtpbmQAAAAEAAAAAAAAAAAAAAADZXRhAAAAAAYAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAD0FjdGlvbkNhbmNlbGxlZAAAAAABAAAACGFjdF9jYW5jAAAAAQAAAAAAAAAJYWN0aW9uX2lkAAAAAAAABAAAAAEAAAAC", "AAAABQAAAAAAAAAAAAAAD09ic2VydmVyUmVtb3ZlZAAAAAABAAAABm9ic19ybQAAAAAAAQAAAAAAAAAIb2JzZXJ2ZXIAAAATAAAAAQAAAAI=", "AAAABQAAAAAAAAAAAAAAD1Byb3ZpZGVyU2lnbmVycwAAAAABAAAACHByb3Zfc2lnAAAAAgAAAAAAAAALcHJvdmlkZXJfaWQAAAAD7gAAACAAAAABAAAAAAAAAAluZXdfdmFsdWUAAAAAAAPqAAAD7gAAACAAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAEFByb3ZpZGVyTWV0YWRhdGEAAAABAAAACXByb3ZfbWV0YQAAAAAAAAIAAAAAAAAAC3Byb3ZpZGVyX2lkAAAAA+4AAAAgAAAAAQAAAAAAAAAJbmV3X3ZhbHVlAAAAAAAAEAAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAEFByb3ZpZGVyVmVyaWZpZWQAAAABAAAACHByb3ZfdmVyAAAAAQAAAAAAAAALcHJvdmlkZXJfaWQAAAAD7gAAACAAAAABAAAAAg==", "AAAABQAAAAAAAAAAAAAAEFRlbXBsYXRlUHJvcG9zZWQAAAABAAAACXRtcGxfcHJvcAAAAAAAAAMAAAAAAAAAC3RlbXBsYXRlX2lkAAAAAAQAAAABAAAAAAAAAAd2ZXJzaW9uAAAAAAQAAAAAAAAAAAAAAAxhY3RpdmF0ZXNfYXQAAAAGAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAEVByb3ZpZGVyU3VzcGVuZGVkAAAAAAAAAQAAAAhwcm92X3N1cwAAAAIAAAAAAAAAC3Byb3ZpZGVyX2lkAAAAA+4AAAAgAAAAAQAAAAAAAAAGcmVhc29uAAAAAAARAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAEVRlbXBsYXRlQWN0aXZhdGVkAAAAAAAAAQAAAAh0bXBsX2FjdAAAAAIAAAAAAAAAC3RlbXBsYXRlX2lkAAAAAAQAAAABAAAAAAAAAAd2ZXJzaW9uAAAAAAQAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAEVRlbXBsYXRlQ2FuY2VsbGVkAAAAAAAAAQAAAAl0bXBsX2NhbmMAAAAAAAACAAAAAAAAAAt0ZW1wbGF0ZV9pZAAAAAAEAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAEAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAElByb3ZpZGVyUmVnaXN0ZXJlZAAAAAAAAQAAAAhwcm92X3JlZwAAAAMAAAAAAAAAC3Byb3ZpZGVyX2lkAAAAA+4AAAAgAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAAAAAALaG9tZV9kb21haW4AAAAAEAAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAElByb3ZpZGVyUmVpbnN0YXRlZAAAAAAAAQAAAAlwcm92X3JlaW4AAAAAAAABAAAAAAAAAAtwcm92aWRlcl9pZAAAAAPuAAAAIAAAAAEAAAAC", "AAAABQAAAAAAAAAAAAAAElByb3ZpZGVyVW52ZXJpZmllZAAAAAAAAQAAAAhwcm92X3VudgAAAAEAAAAAAAAAC3Byb3ZpZGVyX2lkAAAAA+4AAAAgAAAAAQAAAAI=", "AAAABQAAAAAAAAAAAAAAElRlbXBsYXRlRGVwcmVjYXRlZAAAAAAAAQAAAAh0bXBsX2RlcAAAAAIAAAAAAAAAC3RlbXBsYXRlX2lkAAAAAAQAAAABAAAAAAAAAAd2ZXJzaW9uAAAAAAQAAAAAAAAAAg==", "AAAAAgAAAAAAAAAAAAAACkFjdGlvbktpbmQAAAAAAAUAAAABAAAAAAAAAAlTZXRQYXJhbXMAAAAAAAABAAAH0AAAAAZQYXJhbXMAAAAAAAEAAAAAAAAAC0FkZE9ic2VydmVyAAAAAAIAAAATAAAD7gAAACAAAAABAAAAAAAAAA5SZW1vdmVPYnNlcnZlcgAAAAAAAQAAABMAAAABAAAAAAAAAAtTZXRWZXJpZmllcgAAAAABAAAAEwAAAAEAAAAAAAAAB1VwZ3JhZGUAAAAAAQAAA+4AAAAg", "AAAAAQAAAAAAAAAAAAAADVBlbmRpbmdBY3Rpb24AAAAAAAAFAAAAAAAAAAljYW5jZWxsZWQAAAAAAAABAAAAAAAAAANldGEAAAAABgAAAAAAAAAIZXhlY3V0ZWQAAAABAAAAAAAAAAJpZAAAAAAABAAAAAAAAAAEa2luZAAAB9AAAAAKQWN0aW9uS2luZAAA", "AAAAAgAAAAAAAAAAAAAABk1ldHJpYwAAAAAAAQAAAAAAAAAAAAAAEFRpbWVUb0NvbXBsZXRpb24=", "AAAAAgAAAAAAAAAAAAAACENhcnZlT3V0AAAABAAAAAAAAAAAAAAAE1JlY2VpdmVyQmFua0hvbGlkYXkAAAAAAAAAAAAAAAAWQ29tcGxpYW5jZUhvbGREZWNsYXJlZAAAAAAAAAAAAAAAAAASSW52YWxpZEJlbmVmaWNpYXJ5AAAAAAAAAAAAAAAAABRTZW5kZXJJbmZvSW5jb21wbGV0ZQ==", "AAAAAgAAAAAAAAAAAAAACURpcmVjdGlvbgAAAAAAAAIAAAAAAAAAAAAAAAdJbmJvdW5kAAAAAAAAAAAAAAAACE91dGJvdW5k", "AAAAAgAAAAAAAAAAAAAACUV2ZW50S2luZAAAAAAAAAUAAAAAAAAAAAAAABRTZW5kZXJEZWJpdENvbmZpcm1lZAAAAAAAAAAAAAAADk9uQ2hhaW5TZXR0bGVkAAAAAAAAAAAAAAAAABBSZWNlaXZlckFjY2VwdGVkAAAAAAAAAAAAAAAXUmVjZWl2ZXJDcmVkaXRDb25maXJtZWQAAAAAAAAAAAAAAAAVUmVjaXBpZW50QWNrbm93bGVkZ2VkAAAA", "AAAAAgAAAAAAAAAAAAAADEV2aWRlbmNlTW9kZQAAAAMAAAAAAAAAAAAAAApEdWFsU2lnbmVkAAAAAAAAAAAAAAAAAA5Qcm92aWRlclNpZ25lZAAAAAAAAAAAAAAAAAAMT2JzZXJ2ZXJPbmx5", "AAAAAgAAAAAAAAAAAAAADFBlbmFsdHlNb2RlbAAAAAEAAAABAAAAAAAAAAxQZXJCcmVhY2hCcHMAAAABAAAH0AAAAAxQZXJCcmVhY2hCcHM=", "AAAAAQAAAAAAAAAAAAAADFBlckJyZWFjaEJwcwAAAAIAAAAAAAAAA2JwcwAAAAAEAAAAAAAAAANjYXAAAAAACw==", "AAAAAgAAAAAAAAAAAAAADlByb3ZpZGVyU3RhdHVzAAAAAAADAAAAAAAAAAAAAAAGQWN0aXZlAAAAAAAAAAAAAAAAAAlTdXNwZW5kZWQAAAAAAAAAAAAAAAAAAAZFeGl0ZWQAAA==", "AAAAAgAAAAAAAAAAAAAADlRlbXBsYXRlU3RhdHVzAAAAAAADAAAAAAAAAAAAAAAIUHJvcG9zZWQAAAAAAAAAAAAAAAZBY3RpdmUAAAAAAAAAAAAAAAAACkRlcHJlY2F0ZWQAAA==", "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAALAAAAAAAAAANTm90QXV0aG9yaXplZAAAAAAAAAEAAAAAAAAAEVByb3ZpZGVyTm90QWN0aXZlAAAAAAAAAgAAAAAAAAARVGVtcGxhdGVOb3RBY3RpdmUAAAAAAAADAAAAAAAAABFJbnN1ZmZpY2llbnRTdGFrZQAAAAAAAAQAAAAAAAAACk91dE9mU2NvcGUAAAAAAAUAAAAAAAAAEUNsYWltV2luZG93Q2xvc2VkAAAAAAAABgAAAAAAAAAORHVwbGljYXRlQ2xhaW0AAAAAAAcAAAAAAAAAD0ludmFsaWRFdmlkZW5jZQAAAAAIAAAAAAAAAAtOb3RJbkJyZWFjaAAAAAAJAAAAAAAAABNDaGFsbGVuZ2VXaW5kb3dPcGVuAAAAAAoAAAAAAAAAD09wZW5DbGFpbXNFeGlzdAAAAAALAAAAAAAAAA5Db29sZG93bkFjdGl2ZQAAAAAADAAAAAAAAAAPVW5rbm93bk9ic2VydmVyAAAAAA0AAAAAAAAAD0FscmVhZHlBdHRlc3RlZAAAAAAOAAAAAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAA8AAAAAAAAADk5vdEluaXRpYWxpemVkAAAAAAAQAAAAAAAAAA1JbnZhbGlkUGFyYW1zAAAAAAAAEQAAAAAAAAAPVW5rbm93blByb3ZpZGVyAAAAABIAAAAAAAAAD1Vua25vd25UZW1wbGF0ZQAAAAATAAAAAAAAABFVbmtub3duQ29tbWl0bWVudAAAAAAAABQAAAAAAAAADFVua25vd25DbGFpbQAAABUAAAAAAAAAE1Byb3ZpZGVyTm90VmVyaWZpZWQAAAAAFgAAAAAAAAAOUHJvdmlkZXJFeGlzdHMAAAAAABcAAAAAAAAADlRlbXBsYXRlRXhpc3RzAAAAAAAYAAAAAAAAAA5UaW1lbG9ja0FjdGl2ZQAAAAAAGQAAAAAAAAAPQXNzZXROb3RBbGxvd2VkAAAAABoAAAAAAAAADUFzc2V0TWlzbWF0Y2gAAAAAAAAbAAAAAAAAABBBbW91bnRPdXRPZlJhbmdlAAAAHAAAAAAAAAAKTm90Q292ZXJlZAAAAAAAHQAAAAAAAAATQ29tbWl0bWVudE5vdEFjdGl2ZQAAAAAeAAAAAAAAAAxDbGFpbU5vdE9wZW4AAAAfAAAAAAAAABdBdHRlc3RhdGlvbldpbmRvd0Nsb3NlZAAAAAAgAAAAAAAAABBRdW9ydW1Ob3RSZWFjaGVkAAAAIQAAAAAAAAANQmVsb3dNaW5TdGFrZQAAAAAAACIAAAAAAAAAEFN0YWtlQ2FwRXhjZWVkZWQAAAAjAAAAAAAAABFQYXltZW50SWRNaXNtYXRjaAAAAAAAACQAAAAAAAAADVVua25vd25TaWduZXIAAAAAAAAlAAAAAAAAAA5Ub29NYW55U2lnbmVycwAAAAAAJgAAAAAAAAAXVW5zdXBwb3J0ZWRQZW5hbHR5TW9kZWwAAAAAJwAAAAAAAAASQXJpdGhtZXRpY092ZXJmbG93AAAAAAAoAAAAAAAAAA5Cb25kQWxyZWFkeVNldAAAAAAAKQAAAAAAAAALQmF0Y2hFeGlzdHMAAAAAKgAAAAAAAAANSW52YWxpZFBlcmlvZAAAAAAAACsAAAAAAAAADk5vdGhpbmdQZW5kaW5nAAAAAAAs", "AAAAAQAAAAAAAAAAAAAABVNjb3BlAAAAAAAABwAAAAAAAAAFYXNzZXQAAAAAAAATAAAAAAAAAAlkaXJlY3Rpb24AAAAAAAfQAAAACURpcmVjdGlvbgAAAAAAAAAAAAAKbWF4X2Ftb3VudAAAAAAACwAAAAAAAAAKbWluX2Ftb3VudAAAAAAACwAAAAAAAAALcGF5b3V0X3JhaWwAAAAD6AAAABEAAAAAAAAAEHJlY2VpdmVyX2NvdW50cnkAAAPoAAAAEQAAAAAAAAAOc2VuZGVyX2NvdW50cnkAAAAAA+gAAAAR", "AAAAAQAAAAAAAAAAAAAABlBhcmFtcwAAAAAADAAAAAAAAAAUYWxsb3dlZF9zdGFrZV9hc3NldHMAAAPqAAAAEwAAAAAAAAAXYXR0ZXN0YXRpb25fd2luZG93X3NlY3MAAAAABgAAAAAAAAAVY2hhbGxlbmdlX3dpbmRvd19zZWNzAAAAAAAABgAAAAAAAAAOY2xhaW1fYm9uZF9icHMAAAAAAAQAAAAAAAAAD2V4aXRfZXh0cmFfc2VjcwAAAAAGAAAAAAAAABhtYXhfc3Rha2VfcGVyX2NvbW1pdG1lbnQAAAALAAAAAAAAAA5taW5fY2xhaW1fYm9uZAAAAAAACwAAAAAAAAAGcXVvcnVtAAAAAAAEAAAAAAAAABpyZWplY3RlZF9ib25kX3Byb3ZpZGVyX2JwcwAAAAAABAAAAAAAAAALc3Rha2VfZmxvb3IAAAAACwAAAAAAAAAHc3Rha2VfawAAAAAEAAAAAAAAAA10aW1lbG9ja19zZWNzAAAAAAAABg==", "AAAAAQAAAAAAAAAAAAAACE9ic2VydmVyAAAABAAAAAAAAAAGYWN0aXZlAAAAAAABAAAAAAAAAAhhZGRlZF9hdAAAAAYAAAAAAAAAB2FkZHJlc3MAAAAAEwAAAAAAAAADa2V5AAAAA+4AAAAg", "AAAAAQAAAAAAAAAAAAAACFByb3ZpZGVyAAAACAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAtob21lX2RvbWFpbgAAAAAQAAAAAAAAAAJpZAAAAAAD7gAAACAAAAAAAAAADG1ldGFkYXRhX3VyaQAAABAAAAAAAAAADXJlZ2lzdGVyZWRfYXQAAAAAAAAGAAAAAAAAAAdzaWduZXJzAAAAA+oAAAPuAAAAIAAAAAAAAAAGc3RhdHVzAAAAAAfQAAAADlByb3ZpZGVyU3RhdHVzAAAAAAAAAAAACHZlcmlmaWVkAAAAAQ==", "AAAAAQAAAAAAAAAAAAAAC1NsYVRlbXBsYXRlAAAAAA8AAAAAAAAADGFjdGl2YXRlc19hdAAAAAYAAAAAAAAACmNhcnZlX291dHMAAAAAA+oAAAfQAAAACENhcnZlT3V0AAAAAAAAABFjbGFpbV93aW5kb3dfc2VjcwAAAAAAAAYAAAAAAAAACWVuZF9ldmVudAAAAAAAB9AAAAAJRXZlbnRLaW5kAAAAAAAAAAAAAA1ldmlkZW5jZV9tb2RlAAAAAAAH0AAAAAxFdmlkZW5jZU1vZGUAAAAAAAAACGdyYWNlX21zAAAABgAAAAAAAAACaWQAAAAAAAQAAAAAAAAAC21heF9ob2xkX21zAAAAAAYAAAAAAAAABm1ldHJpYwAAAAAH0AAAAAZNZXRyaWMAAAAAAAAAAAAHcGVuYWx0eQAAAAfQAAAADFBlbmFsdHlNb2RlbAAAAAAAAAAFc2NvcGUAAAAAAAfQAAAABVNjb3BlAAAAAAAAAAAAAAtzdGFydF9ldmVudAAAAAfQAAAACUV2ZW50S2luZAAAAAAAAAAAAAAGc3RhdHVzAAAAAAfQAAAADlRlbXBsYXRlU3RhdHVzAAAAAAAAAAAACXRhcmdldF9tcwAAAAAAAAYAAAAAAAAAB3ZlcnNpb24AAAAABA=="]),
      options
    );
  }

   static async deploy<T = Client>(args: { admin: string | Address; params: Params }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    const tx = await ContractClient.deploy<T & ContractClient>(args, options);
    const parse = tx.options.parseResultXdr;
    tx.options.parseResultXdr = (result) => new Client(parse(result).options) as T & Client;
    return tx;
  }
  public readonly fromJson = {
    admin : this.txFromJson<Result<string, Error>>,  action : this.txFromJson<Result<PendingAction, Error>>,  cancel : this.txFromJson<Result<null, Error>>,  params : this.txFromJson<Result<Params, Error>>,  execute : this.txFromJson<Result<null, Error>>,  propose : this.txFromJson<Result<number, Error>>,  observers : this.txFromJson<Array<Observer>>,  accept_admin : this.txFromJson<Result<null, Error>>,  get_provider : this.txFromJson<Result<Provider, Error>>,  get_template : this.txFromJson<Result<SlaTemplate, Error>>,  template_ids : this.txFromJson<Array<number>>,  propose_admin : this.txFromJson<Result<null, Error>>,  verify_domain : this.txFromJson<Result<null, Error>>,  update_signers : this.txFromJson<Result<null, Error>>,  cancel_template : this.txFromJson<Result<null, Error>>,  provider_id_for : this.txFromJson<Uint8Array>,  unverify_domain : this.txFromJson<Result<null, Error>>,  update_metadata : this.txFromJson<Result<null, Error>>,  propose_template : this.txFromJson<Result<number, Error>>,  suspend_provider : this.txFromJson<Result<null, Error>>,  activate_template : this.txFromJson<Result<null, Error>>,  register_provider : this.txFromJson<Result<Uint8Array, Error>>,  deprecate_template : this.txFromJson<Result<null, Error>>,  is_active_observer : this.txFromJson<boolean>,  providers_by_admin : this.txFromJson<Array<Uint8Array>>,  reinstate_provider : this.txFromJson<Result<null, Error>>,  get_template_version : this.txFromJson<Result<SlaTemplate, Error>>,  active_observer_count : this.txFromJson<Result<number, Error>>
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
   * Build a topics filter row for the "Init" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  initEventFilter(): string[] {
    return this.spec.eventTopicFilter("Init");
  }
  /**
   * Build a topics filter row for the "AdminSet" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  adminSetEventFilter(): string[] {
    return this.spec.eventTopicFilter("AdminSet");
  }
  /**
   * Build a topics filter row for the "AdminProposed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  adminProposedEventFilter(): string[] {
    return this.spec.eventTopicFilter("AdminProposed");
  }
  /**
   * Build a topics filter row for the "ObserverAdded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  observerAddedEventFilter(topicValues?: { observer?: string | Address }): string[] {
    return this.spec.eventTopicFilter("ObserverAdded", topicValues);
  }
  /**
   * Build a topics filter row for the "ActionExecuted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  actionExecutedEventFilter(topicValues?: { action_id?: number }): string[] {
    return this.spec.eventTopicFilter("ActionExecuted", topicValues);
  }
  /**
   * Build a topics filter row for the "ActionProposed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  actionProposedEventFilter(topicValues?: { action_id?: number }): string[] {
    return this.spec.eventTopicFilter("ActionProposed", topicValues);
  }
  /**
   * Build a topics filter row for the "ActionCancelled" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  actionCancelledEventFilter(topicValues?: { action_id?: number }): string[] {
    return this.spec.eventTopicFilter("ActionCancelled", topicValues);
  }
  /**
   * Build a topics filter row for the "ObserverRemoved" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  observerRemovedEventFilter(topicValues?: { observer?: string | Address }): string[] {
    return this.spec.eventTopicFilter("ObserverRemoved", topicValues);
  }
  /**
   * Build a topics filter row for the "ProviderSigners" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  providerSignersEventFilter(topicValues?: { provider_id?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("ProviderSigners", topicValues);
  }
  /**
   * Build a topics filter row for the "ProviderMetadata" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  providerMetadataEventFilter(topicValues?: { provider_id?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("ProviderMetadata", topicValues);
  }
  /**
   * Build a topics filter row for the "ProviderVerified" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  providerVerifiedEventFilter(topicValues?: { provider_id?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("ProviderVerified", topicValues);
  }
  /**
   * Build a topics filter row for the "TemplateProposed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  templateProposedEventFilter(topicValues?: { template_id?: number }): string[] {
    return this.spec.eventTopicFilter("TemplateProposed", topicValues);
  }
  /**
   * Build a topics filter row for the "ProviderSuspended" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  providerSuspendedEventFilter(topicValues?: { provider_id?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("ProviderSuspended", topicValues);
  }
  /**
   * Build a topics filter row for the "TemplateActivated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  templateActivatedEventFilter(topicValues?: { template_id?: number }): string[] {
    return this.spec.eventTopicFilter("TemplateActivated", topicValues);
  }
  /**
   * Build a topics filter row for the "TemplateCancelled" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  templateCancelledEventFilter(topicValues?: { template_id?: number }): string[] {
    return this.spec.eventTopicFilter("TemplateCancelled", topicValues);
  }
  /**
   * Build a topics filter row for the "ProviderRegistered" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  providerRegisteredEventFilter(topicValues?: { provider_id?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("ProviderRegistered", topicValues);
  }
  /**
   * Build a topics filter row for the "ProviderReinstated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  providerReinstatedEventFilter(topicValues?: { provider_id?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("ProviderReinstated", topicValues);
  }
  /**
   * Build a topics filter row for the "ProviderUnverified" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  providerUnverifiedEventFilter(topicValues?: { provider_id?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("ProviderUnverified", topicValues);
  }
  /**
   * Build a topics filter row for the "TemplateDeprecated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  templateDeprecatedEventFilter(topicValues?: { template_id?: number }): string[] {
    return this.spec.eventTopicFilter("TemplateDeprecated", topicValues);
  }
}