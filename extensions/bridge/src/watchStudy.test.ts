import { Enums, eventTarget } from '@cornerstonejs/core';

import {
  BridgeEvent,
  type BridgeEventMessage,
  BridgeMessageType,
  BridgeSource,
  STUDY_UIDS_PARAM,
  StudyLoadFailureReason,
} from './messages';
import { postToHost } from './postToHost';
import { watchStudy } from './watchStudy';

jest.mock('./postToHost');
// Keeps test output quiet and avoids loading all of @ohif/core for one logger.
jest.mock('@ohif/core', () => ({ log: { info: jest.fn(), warn: jest.fn() } }));

const mockedPostToHost = postToHost as jest.MockedFunction<typeof postToHost>;

const STUDY_UID = '1.2.3.4';

const studyLoaded: BridgeEventMessage = {
  source: BridgeSource.Viewer,
  type: BridgeMessageType.Event,
  event: BridgeEvent.StudyLoaded,
  payload: { StudyInstanceUID: STUDY_UID },
};

function studyLoadFailed(reason: StudyLoadFailureReason): BridgeEventMessage {
  return {
    source: BridgeSource.Viewer,
    type: BridgeMessageType.Event,
    event: BridgeEvent.StudyLoadFailed,
    payload: { StudyInstanceUID: STUDY_UID, reason },
  };
}

// A macrotask runs after every queued microtask, so the whole search promise chain has settled.
function settle() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function fakeExtensionManager(search: jest.Mock) {
  return {
    getActiveDataSource: () => [{ query: { studies: { search } } }],
  };
}

let search: jest.Mock;
let stop: () => void;

function start() {
  stop = watchStudy({ extensionManager: fakeExtensionManager(search) });
}

function enable(element: HTMLElement) {
  eventTarget.dispatchEvent(new CustomEvent(Enums.Events.ELEMENT_ENABLED, { detail: { element } }));
}

function render(element: HTMLElement, viewportStatus: Enums.ViewportStatus) {
  element.dispatchEvent(
    new CustomEvent(Enums.Events.IMAGE_RENDERED, { detail: { element, viewportStatus } })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState({}, '', `/viewer?${STUDY_UIDS_PARAM}=${STUDY_UID}`);
  // By default the study exists, so the existence check stays silent.
  search = jest.fn().mockResolvedValue([{}]);
  stop = () => {};
});

afterEach(() => {
  stop();
});

describe('watchStudy: first rendered image', () => {
  it('posts nothing for a preRender render', () => {
    start();
    const element = document.createElement('div');
    enable(element);

    render(element, Enums.ViewportStatus.PRE_RENDER);

    expect(mockedPostToHost).not.toHaveBeenCalled();
  });

  it('posts studyLoaded once on the first real render', () => {
    start();
    const element = document.createElement('div');
    enable(element);

    render(element, Enums.ViewportStatus.PRE_RENDER);
    render(element, Enums.ViewportStatus.RENDERED);

    expect(mockedPostToHost).toHaveBeenCalledTimes(1);
    expect(mockedPostToHost).toHaveBeenCalledWith(studyLoaded);
  });

  it('posts nothing more for later renders on the same or another element', () => {
    start();
    const first = document.createElement('div');
    const second = document.createElement('div');
    enable(first);
    enable(second);

    render(first, Enums.ViewportStatus.RENDERED);
    render(first, Enums.ViewportStatus.RENDERED);
    render(second, Enums.ViewportStatus.RENDERED);

    expect(mockedPostToHost).toHaveBeenCalledTimes(1);
  });

  it('adds one render listener per element, even when it is enabled twice', () => {
    start();
    const element = document.createElement('div');
    const addEventListener = jest.spyOn(element, 'addEventListener');

    enable(element);
    enable(element);

    const renderListeners = addEventListener.mock.calls.filter(
      ([type]) => type === Enums.Events.IMAGE_RENDERED
    );
    expect(renderListeners).toHaveLength(1);
  });

  it('ignores renders on an element that was never enabled', () => {
    start();
    const element = document.createElement('div');

    render(element, Enums.ViewportStatus.RENDERED);

    expect(mockedPostToHost).not.toHaveBeenCalled();
  });

  it('posts nothing after stop()', () => {
    start();
    const enabledBefore = document.createElement('div');
    enable(enabledBefore);

    stop();
    const enabledAfter = document.createElement('div');
    enable(enabledAfter);
    render(enabledBefore, Enums.ViewportStatus.RENDERED);
    render(enabledAfter, Enums.ViewportStatus.RENDERED);

    expect(mockedPostToHost).not.toHaveBeenCalled();
  });

  it('posts nothing when the page has no StudyInstanceUIDs', async () => {
    window.history.replaceState({}, '', '/viewer');
    start();
    const element = document.createElement('div');
    enable(element);

    render(element, Enums.ViewportStatus.RENDERED);
    await settle();

    expect(mockedPostToHost).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });
});

describe('watchStudy: existence check', () => {
  it('searches the active data source for the study, once', () => {
    start();

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith({ studyInstanceUid: STUDY_UID });
  });

  it('posts notFound when the search finds no study', async () => {
    search.mockResolvedValue([]);
    start();

    await settle();

    expect(mockedPostToHost).toHaveBeenCalledTimes(1);
    expect(mockedPostToHost).toHaveBeenCalledWith(studyLoadFailed(StudyLoadFailureReason.NotFound));
  });

  it('posts sourceUnreachable when the search rejects', async () => {
    search.mockRejectedValue(new Error('Network Error'));
    start();

    await settle();

    expect(mockedPostToHost).toHaveBeenCalledTimes(1);
    expect(mockedPostToHost).toHaveBeenCalledWith(
      studyLoadFailed(StudyLoadFailureReason.SourceUnreachable)
    );
  });

  it('posts sourceUnreachable when the search throws', async () => {
    search.mockImplementation(() => {
      throw new Error('no data source');
    });
    start();

    await settle();

    expect(mockedPostToHost).toHaveBeenCalledWith(
      studyLoadFailed(StudyLoadFailureReason.SourceUnreachable)
    );
  });

  it('posts nothing by itself when the study exists', async () => {
    start();

    await settle();

    expect(mockedPostToHost).not.toHaveBeenCalled();
  });

  it('still posts the failure after stop(), since OHIF leaves the mode on a missing study', async () => {
    search.mockResolvedValue([]);
    start();

    stop();
    await settle();

    expect(mockedPostToHost).toHaveBeenCalledWith(studyLoadFailed(StudyLoadFailureReason.NotFound));
  });

  it('posts no failure after studyLoaded was posted', async () => {
    let rejectSearch: (error: Error) => void = () => {};
    search.mockReturnValue(new Promise((_resolve, reject) => (rejectSearch = reject)));
    start();
    const element = document.createElement('div');
    enable(element);

    render(element, Enums.ViewportStatus.RENDERED);
    rejectSearch(new Error('Network Error'));
    await settle();

    expect(mockedPostToHost).toHaveBeenCalledTimes(1);
    expect(mockedPostToHost).toHaveBeenCalledWith(studyLoaded);
  });

  it('posts no studyLoaded after a failure was posted', async () => {
    search.mockResolvedValue([]);
    start();
    const element = document.createElement('div');
    enable(element);

    await settle();
    render(element, Enums.ViewportStatus.RENDERED);

    expect(mockedPostToHost).toHaveBeenCalledTimes(1);
    expect(mockedPostToHost).toHaveBeenCalledWith(studyLoadFailed(StudyLoadFailureReason.NotFound));
  });
});
