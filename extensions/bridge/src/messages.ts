/**
 * postMessage contract between this viewer (in the iframe) and the scoring
 * app (the host, in the parent window).
 *
 * This is the only copy of the bridge message contract. The scoring app
 * (parent repo) type-imports it as `@bridge-contract`. Change it through a
 * fork PR, then bump the submodule in the parent repo.
 *
 * Types only: no imports and no runtime code, because both this fork's babel
 * and the scoring app's `tsc` compile it.
 */

export type StudyLoadFailureReason = 'notFound' | 'sourceUnreachable';

/** Sent by the viewer iframe to the host app. */
export type BridgeEventMessage =
  | {
      source: 'spsoft-mvp-viewer';
      type: 'event';
      event: 'studyLoaded';
      payload: { StudyInstanceUID: string };
    }
  | {
      source: 'spsoft-mvp-viewer';
      type: 'event';
      event: 'studyLoadFailed';
      payload: { StudyInstanceUID: string; reason: StudyLoadFailureReason };
    };
