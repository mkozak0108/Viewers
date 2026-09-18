# @spsoft-mvp/extension-bridge

The viewer's half of the postMessage bridge to `apps/scoring-form`. The message contract is
`src/messages.ts`, the only copy: types only, no imports. The scoring app type-imports it
through the `apps/viewer` submodule, so change it here through a fork PR, then bump the
submodule in the parent repo.

Not implemented yet — see `src/index.ts`.
