/**
 * The only copy of the postMessage contract between this viewer (in an iframe) and the scoring
 * app (its parent window). The scoring app imports it as `@bridge-contract` through the
 * submodule, so change it through a fork PR, then bump the submodule in the parent repo.
 *
 * No imports: two toolchains compile this file, this fork's babel and the scoring app's Vite.
 */

/** Both apps put the study in their address under this name, as OHIF's viewer route expects. */
export const STUDY_UIDS_PARAM = 'StudyInstanceUIDs';

export enum BridgeSource {
  Viewer = 'spsoft-mvp-viewer',
}

export enum BridgeMessageType {
  Event = 'event',
}

export enum BridgeEvent {
  StudyLoaded = 'studyLoaded',
  StudyLoadFailed = 'studyLoadFailed',
}

export enum StudyLoadFailureReason {
  NotFound = 'notFound',
  SourceUnreachable = 'sourceUnreachable',
}

export type BridgeEventMessage =
  | {
      source: BridgeSource.Viewer;
      type: BridgeMessageType.Event;
      event: BridgeEvent.StudyLoaded;
      payload: { StudyInstanceUID: string };
    }
  | {
      source: BridgeSource.Viewer;
      type: BridgeMessageType.Event;
      event: BridgeEvent.StudyLoadFailed;
      payload: { StudyInstanceUID: string; reason: StudyLoadFailureReason };
    };
