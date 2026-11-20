# Approved implementation-guide clarifications

## VX-306: bounded claim votes (§6.7, §17.5)

Approved by the repository owner on 2026-11-03.

A claim stores at most 32 observer votes. After duplicate-vote validation,
`attest` returns `InvalidParams` if `ClaimVotes` already contains 32 entries.
Votes from removed observers remain stored and count toward resolution.

This bounds storage even when registry membership changes during a dispute;
the registry's limit of 32 active observers alone does not bound historical voters.
