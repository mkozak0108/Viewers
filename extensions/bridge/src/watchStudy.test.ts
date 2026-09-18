import { Enums, eventTarget } from '@cornerstonejs/core';

import { postToHost } from './postToHost';
import { watchStudy } from './watchStudy';

jest.mock('./postToHost');

const mockedPostToHost = postToHost as jest.MockedFunction<typeof postToHost>;

const STUDY_UID = '1.2.3.4';

const studyLoaded = {
  source: 'spsoft-mvp-viewer',
  type: 'event',
  event: 'studyLoaded',
  payload: { StudyInstanceUID: STUDY_UID },
};

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

function render(element: HTMLElement, viewportStatus: string) {
  element.dispatchEvent(
    new CustomEvent(Enums.Events.IMAGE_RENDERED, { detail: { element, viewportStatus } })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState({}, '', `/viewer?StudyInstanceUIDs=${STUDY_UID}`);
  // A match: the existence check finds the study and posts nothing itself.
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

    render(element, 'preRender');

    expect(mockedPostToHost).not.toHaveBeenCalled();
  });

  it('posts studyLoaded once on the first real render', () => {
    start();
    const element = document.createElement('div');
    enable(element);

    render(element, 'preRender');
    render(element, 'rendered');

    expect(mockedPostToHost).toHaveBeenCalledTimes(1);
    expect(mockedPostToHost).toHaveBeenCalledWith(studyLoaded);
  });

  it('posts nothing more for later renders on the same or another element', () => {
    start();
    const first = document.createElement('div');
    const second = document.createElement('div');
    enable(first);
    enable(second);

    render(first, 'rendered');
    render(first, 'rendered');
    render(second, 'rendered');

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

    render(element, 'rendered');

    expect(mockedPostToHost).not.toHaveBeenCalled();
  });

  it('posts nothing after stop()', () => {
    start();
    const enabledBefore = document.createElement('div');
    enable(enabledBefore);

    stop();
    const enabledAfter = document.createElement('div');
    enable(enabledAfter);
    render(enabledBefore, 'rendered');
    render(enabledAfter, 'rendered');

    expect(mockedPostToHost).not.toHaveBeenCalled();
  });

  it('posts nothing when the page has no StudyInstanceUIDs', () => {
    window.history.replaceState({}, '', '/viewer');
    start();
    const element = document.createElement('div');
    enable(element);

    render(element, 'rendered');

    expect(mockedPostToHost).not.toHaveBeenCalled();
  });
});
