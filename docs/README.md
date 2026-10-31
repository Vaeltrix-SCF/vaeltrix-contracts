# Development documentation

This page is the entry point to all Vaeltrix development documentation.

## Overview

[Project overview and current implementation status](../README.md).

## Planning

[Authoritative implementation guide (PDF)](implementation-guide.pdf), [searchable export](implementation-guide.md), and [VX issue tracker](https://github.com/Vaeltrix-SCF/vaeltrix-contracts/issues).

## Overall roadmap

[Technical specification §18: roadmap](../TECHNICAL_SPECIFICATION.md#18-roadmap). Planned deliverables are distinct from the deployed foundation.

## Architecture and diagrams

[§4: system architecture](../TECHNICAL_SPECIFICATION.md#4-system-architecture), [§9.2: payment and breach sequence](../TECHNICAL_SPECIFICATION.md#92-payment-under-sla-and-breach-claim), and [§10: claim lifecycle](../TECHNICAL_SPECIFICATION.md#10-claims-and-dispute-resolution--planned).

## Contracts

[§8: contract specifications](../TECHNICAL_SPECIFICATION.md#8-contract-specifications), [registry source](../contracts/registry/), [bond source](../contracts/bond/), and [scoreboard source](../contracts/scoreboard/).

## Dev artifacts

- [Deployment manifest and Wasm hashes](../deployments/testnet.json)
- [Contract and transaction explorer links](../test-net-deployment.md)
- [Shared vectors](../test-vectors/)
- [CI workflow](../.github/workflows/ci.yml)
- [Pinned toolchain](toolchain.md)
- [Deployment procedure](testnet-deployment.md)
- [Seeding procedure](testnet-seeding.md)
- [Testnet account setup](testnet-accounts.md)
- [Database migrations](../db/migrations/)

## Test plan

[Scope, current coverage, commands and future work](test-plan.md).

## UI/UX prototypes

[Playground screenshots and tester flows](ui-prototypes.md).

## Security

[§14: security and threat model](../TECHNICAL_SPECIFICATION.md#14-security-and-threat-model). A formal STRIDE threat model and monitoring plan are planned for Tranche 2; they are not completed audits.

## Maintaining the guide

The PDF remains authoritative. Regenerate its Markdown export with `pnpm guide:export` after installing Poppler. The export records the PDF SHA-256; tests detect stale exports. Toolchain corrections are recorded in [toolchain.md](toolchain.md).

`pnpm issues:import --dry-run` previews issue definitions offline. Live imports require authenticated `gh` and repository labels; see [the importer](../scripts/issues.ts). Existing issues are not edited or reopened.
