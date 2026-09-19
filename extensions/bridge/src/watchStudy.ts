import { Enums, eventTarget } from '@cornerstonejs/core';
import { log } from '@ohif/core';

import {
  BridgeEvent,
  type BridgeEventMessage,
  BridgeMessageType,
  BridgeSource,
  BridgeVersion,
  STUDY_UIDS_PARAM,
  StudyLoadFailureReason,
} from './messages';
import { postToHost } from './postToHost';

// OHIF types data sources as `any`, so only the one call used here is named.
type DataSource = {
  query: { studies: { search: (params: { studyInstanceUid: string }) => Promise<unknown[]> } };
};

export type WatchStudyParams = {
  extensionManager: AppTypes.ExtensionManager;
};

/**
 * Posts at most one of `STUDY_LOADED` / `STUDY_LOAD_FAILED` per call, and `VIEWER_READY` only
 * right after the former.
 *
 * "Loaded" is the first non-preRender `IMAGE_RENDERED`, the signal OHIF itself uses to time the
 * first image (extensions/cornerstone/src/utils/initViewTiming.ts). Listening from
 * `ELEMENT_ENABLED` attaches it before anything can be drawn.
 *
 * Failures come from repeating OHIF's own study search (`validateStudies` in
 * platform/app/src/routes/Mode/Mode.tsx), because OHIF only redirects to /notfoundstudy without
 * saying why. The returned stop function doesn't cancel that search: the redirect is what exits
 * the mode, and its result still has to reach the host.
 */
export function watchStudy({ extensionManager }: WatchStudyParams): () => void {
  const studyInstanceUid = new URLSearchParams(window.location.search).get(STUDY_UIDS_PARAM);
  if (!studyInstanceUid) {
    log.info('[bridge] no study in the page address; not watching');
    return () => {};
  }

  let posted = false;
  const elements = new Set<HTMLElement>();

  const post = (message: BridgeEventMessage) => {
    posted = true;
    removeListeners();
    postToHost(message);
  };

  const onImageRendered = (event: Event) => {
    const { viewportStatus } = (event as CustomEvent<{ viewportStatus: Enums.ViewportStatus }>)
      .detail;
    if (posted || viewportStatus === Enums.ViewportStatus.PRE_RENDER) {
      return;
    }
    log.info('[bridge] study is on screen');
    post({
      source: BridgeSource.Viewer,
      type: BridgeMessageType.Event,
      version: BridgeVersion.V1,
      event: BridgeEvent.StudyLoaded,
      payload: { StudyInstanceUID: studyInstanceUid },
    });
    // Tool groups are created after the bridge starts, so the first rendered image is the
    // earliest moment the host's commands can work.
    postToHost({
      source: BridgeSource.Viewer,
      type: BridgeMessageType.Event,
      version: BridgeVersion.V1,
      event: BridgeEvent.ViewerReady,
      payload: { StudyInstanceUID: studyInstanceUid },
    });
  };

  const onElementEnabled = (event: Event) => {
    const { element } = (event as CustomEvent<{ element: HTMLElement }>).detail;
    if (elements.has(element)) {
      return;
    }
    elements.add(element);
    element.addEventListener(Enums.Events.IMAGE_RENDERED, onImageRendered);
  };

  function removeListeners() {
    eventTarget.removeEventListener(Enums.Events.ELEMENT_ENABLED, onElementEnabled);
    for (const element of elements) {
      element.removeEventListener(Enums.Events.IMAGE_RENDERED, onImageRendered);
    }
    elements.clear();
  }

  eventTarget.addEventListener(Enums.Events.ELEMENT_ENABLED, onElementEnabled);

  // The executor runs synchronously, so a throw from the data source becomes a rejection.
  new Promise<unknown[]>(resolve => {
    const [dataSource]: DataSource[] = extensionManager.getActiveDataSource();
    resolve(dataSource.query.studies.search({ studyInstanceUid }));
  })
    .then(
      (studies): StudyLoadFailureReason | null =>
        studies?.length ? null : StudyLoadFailureReason.NotFound,
      (error: unknown): StudyLoadFailureReason => {
        log.warn('[bridge] study search failed', error);
        return StudyLoadFailureReason.SourceUnreachable;
      }
    )
    .then(reason => {
      if (reason === null) {
        log.info('[bridge] study found in the image source');
        return;
      }
      if (posted) {
        return;
      }
      log.warn(`[bridge] study failed to load: ${reason}`);
      post({
        source: BridgeSource.Viewer,
        type: BridgeMessageType.Event,
        version: BridgeVersion.V1,
        event: BridgeEvent.StudyLoadFailed,
        payload: { StudyInstanceUID: studyInstanceUid, reason },
      });
    });

  return removeListeners;
}
