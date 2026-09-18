import { Enums, eventTarget } from '@cornerstonejs/core';
import { log } from '@ohif/core';

import type { BridgeEventMessage } from './messages';
import { postToHost } from './postToHost';

type StudySearch = (params: { studyInstanceUid: string }) => Promise<unknown[]>;

export type WatchStudyParams = {
  extensionManager: {
    getActiveDataSource: () => Array<{ query: { studies: { search: StudySearch } } }>;
  };
};

/**
 * Tells the host app when the study named by the page's `StudyInstanceUIDs`
 * parameter is on screen: the first `IMAGE_RENDERED` on any viewport element
 * that isn't a `preRender`. Render listeners are attached as each element is
 * enabled, before anything can be drawn on it, the same way OHIF times its
 * first image (extensions/cornerstone/src/utils/initViewTiming.ts).
 *
 * Returns a function that removes every listener.
 */
export function watchStudy(_params: WatchStudyParams): () => void {
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

  return removeListeners;
}
