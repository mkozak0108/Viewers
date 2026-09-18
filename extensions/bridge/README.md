# @spsoft-mvp/extension-bridge

The viewer's half of the postMessage bridge to `apps/scoring-form`. Message contract:
`shared/bridge-messages.ts` at the repo root (this extension has its own package manager —
pnpm, via the `apps/viewer` submodule — and can't import that file directly, so keep the two in
sync by hand).

Not implemented yet — see `src/index.ts`.
