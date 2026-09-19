# @spsoft-mvp/extension-bridge

The viewer's half of the postMessage bridge to `apps/scoring-form`. The message contract is
`src/messages.ts`, the only copy: the message types plus the enums both apps use for their values
(event names, failure reasons, the source and type markers). It has no imports. The scoring app
imports it through the `apps/viewer` submodule, so change it here through a fork PR, then bump the
submodule in the parent repo.

## What it posts

On each mode entry (`onModeEnter`), the bridge watches the study named by the viewer page's
`StudyInstanceUIDs` parameter and posts at most one event to the host window:

- `studyLoaded` when the study's first image is drawn: the first cornerstone `IMAGE_RENDERED` on any
  viewport element that isn't a `preRender`, the same signal OHIF uses to time its first image
  (`src/watchStudy.ts`).
- `studyLoadFailed` with `reason: 'notFound'` when the active data source has no such study, or
  `reason: 'sourceUnreachable'` when the search fails.

To tell those two failures apart, the bridge runs its own study search on mode entry, the same
`query.studies.search` call as OHIF's `validateStudies`. So opening a study costs one extra QIDO
request. OHIF itself only redirects to `/notfoundstudy`, without saying why. The search isn't
cancelled on mode exit, because that redirect is what exits the mode.

A study that never renders an image (a slow or hanging image source, or no displayable series)
produces no event. The host decides what to show then.

## Where it posts

Only when the viewer is framed, and only to the host origins in the `HostOrigin` enum
(`src/postToHost.ts`): `http://localhost:5173` (the scoring app's dev server) and
`http://localhost:4173` (`vite preview`). It posts to each one, and the browser drops deliveries
whose origin doesn't match the parent, logging a "target origin … does not match" warning in the
console. It never posts to `'*'`. To embed the viewer somewhere else, add that origin to
`HostOrigin`.

## Tests

From `apps/viewer`:

```bash
pnpm --filter @spsoft-mvp/extension-bridge run test:unit:ci
```
