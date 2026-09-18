import { Enums, eventTarget } from '@cornerstonejs/core';
import { log } from '@ohif/core';

import type { BridgeEventMessage, StudyLoadFailureReason } from './messages';
import { postToHost } from './postToHost';

type StudySearch = (params: { studyInstanceUid: string }) => Promise<unknown[]>;

export type WatchStudyParams = {
  extensionManager: {
    getActiveDataSource: () => Array<{ query: { studies: { search: StudySearch } } }>;
  };
};

/**
 * Tells the host app what happened to the study named by the page's
 * `StudyInstanceUIDs` parameter, with at most one message per call:
 *
 * - `studyLoaded` on the first `IMAGE_RENDERED` on any viewport element that
 *   isn't a `preRender`. Render listeners are attached as each element is
 *   enabled, before anything can be drawn on it, the same way OHIF times its
 *   first image (extensions/cornerstone/src/utils/initViewTiming.ts).
 * - `studyLoadFailed` when the bridge's own search for the study finds nothing
 *   (`notFound`) or fails (`sourceUnreachable`). OHIF runs the same search in
 *   `validateStudies` (platform/app/src/routes/Mode/Mode.tsx) but only
 *   redirects to /notfoundstudy, without saying why.
 *
 * Returns a function that removes every listener. It doesn't cancel the
 * search: OHIF's redirect on a missing study is what exits the mode.
 */
export function watchStudy({ extensionManager }: WatchStudyParams): () => void {
  const studyInstanceUid = new URLSearchParams(window.location.search).get('StudyInstanceUIDs');
  if (!studyInstanceUid) {
    log.info('[bridge] no StudyInstanceUIDs in the page address; not watching the study');
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
    const { viewportStatus } = (event as CustomEvent<{ viewportStatus: string }>).detail;
    if (posted || viewportStatus === Enums.ViewportStatus.PRE_RENDER) {
      return;
    }
    log.info('[bridge] study is on screen');
    post({
      source: 'spsoft-mvp-viewer',
      type: 'event',
      event: 'studyLoaded',
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

  // The executor runs synchronously, so a throw becomes a rejection.
  new Promise<unknown[]>(resolve =>
    resolve(extensionManager.getActiveDataSource()[0].query.studies.search({ studyInstanceUid }))
  )
    .then(
      (studies): StudyLoadFailureReason | null => (studies?.length ? null : 'notFound'),
      (error: unknown): StudyLoadFailureReason => {
        log.warn('[bridge] study search failed', error);
        return 'sourceUnreachable';
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
        source: 'spsoft-mvp-viewer',
        type: 'event',
        event: 'studyLoadFailed',
        payload: { StudyInstanceUID: studyInstanceUid, reason },
      });
    });

  return removeListeners;
}
