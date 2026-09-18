import type { BridgeEventMessage } from './messages';
import { postToHost } from './postToHost';

const message: BridgeEventMessage = {
  source: 'spsoft-mvp-viewer',
  type: 'event',
  event: 'studyLoaded',
  payload: { StudyInstanceUID: '1.2.3.4' },
};

function frameIn(parent: { postMessage: jest.Mock }) {
  jest.spyOn(window, 'parent', 'get').mockReturnValue(parent as unknown as Window);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('postToHost', () => {
  it('posts nothing when the viewer is not framed', () => {
    // jsdom's top-level window is its own parent.
    expect(window.parent).toBe(window);
    const postMessage = jest.spyOn(window, 'postMessage');

    postToHost(message);

    expect(postMessage).not.toHaveBeenCalled();
  });

  it('posts the message once to each allowlisted host origin when framed', () => {
    const parent = { postMessage: jest.fn() };
    frameIn(parent);

    postToHost(message);

    expect(parent.postMessage).toHaveBeenCalledTimes(2);
    expect(parent.postMessage).toHaveBeenCalledWith(message, 'http://localhost:5173');
    expect(parent.postMessage).toHaveBeenCalledWith(message, 'http://localhost:4173');
  });

  it('never posts to the wildcard origin', () => {
    const parent = { postMessage: jest.fn() };
    frameIn(parent);

    postToHost(message);

    const targetOrigins = parent.postMessage.mock.calls.map(([, origin]) => origin);
    expect(targetOrigins).not.toContain('*');
  });
});
