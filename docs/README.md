# Implementation guide

The [PDF](implementation-guide.pdf) remains authoritative. The
[Markdown export](implementation-guide.md) preserves its tables and code as source
text and includes an extracted §16 issue catalogue. Repository version corrections
are documented in [toolchain.md](toolchain.md).

Regenerate the export with `pnpm guide:export` after installing Poppler (`pdftotext`).
The export records the source PDF's SHA-256; tests detect a changed PDF with a stale export.

## Import issues

- `pnpm issues:import --dry-run` prints all 63 definitions, labels and bodies offline.
- `pnpm issues:import` imports missing issues into `Vaeltrix-SCF/vaeltrix-contracts`.
- `pnpm issues:import --repo owner/repo` selects a different repository explicitly.

Live runs require authenticated `gh` and the labels from `.github/labels.yml`
(`bash scripts/labels.sh`). All issue pages and states are read first; exact titles
and existing VX IDs are skipped, including closed issues and renamed titles.
Bodies go through standard input, preserving newlines and literal shell characters.
No issues are created by a dry run. Existing issues are not edited or reopened.
