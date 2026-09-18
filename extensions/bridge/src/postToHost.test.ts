import { BridgeEvent, type BridgeEventMessage, BridgeMessageType, BridgeSource } from './messages';
import { HostOrigin, postToHost } from './postToHost';

const message: BridgeEventMessage = {
  source: BridgeSource.Viewer,
  type: BridgeMessageType.Event,
  event: BridgeEvent.StudyLoaded,
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
    expect(parent.postMessage).toHaveBeenCalledWith(message, HostOrigin.ScoringAppDev);
    expect(parent.postMessage).toHaveBeenCalledWith(message, HostOrigin.ScoringAppPreview);
  });

  it('never posts to the wildcard origin', () => {
    const parent = { postMessage: jest.fn() };
    frameIn(parent);

    postToHost(message);

    const targetOrigins = parent.postMessage.mock.calls.map(([, origin]) => origin);
    expect(targetOrigins).not.toContain('*');
  });
});
