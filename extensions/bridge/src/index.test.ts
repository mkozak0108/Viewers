import type { Types } from '@ohif/core';

import bridgeExtension from './index';
import { watchStudy } from './watchStudy';

jest.mock('./watchStudy');

const mockedWatchStudy = watchStudy as jest.MockedFunction<typeof watchStudy>;

type ModeHookParams = Parameters<NonNullable<Types.Extensions.Extension['onModeEnter']>>[0];
type PreRegistrationParams = Parameters<
  NonNullable<Types.Extensions.Extension['preRegistration']>
>[0];

const extensionManager = { getActiveDataSource: jest.fn() };
const hookParams = { extensionManager } as unknown as ModeHookParams;

function stopFunction(call: number): jest.Mock {
  return mockedWatchStudy.mock.results[call].value;
}

beforeEach(() => {
  mockedWatchStudy.mockReset();
  mockedWatchStudy.mockImplementation(() => jest.fn());
});

afterEach(() => {
  // Leave no watch running into the next test.
  bridgeExtension.onModeExit?.(hookParams);
});

describe('bridge extension lifecycle', () => {
  it('starts watching the study on mode entry', () => {
    bridgeExtension.onModeEnter?.(hookParams);

    expect(mockedWatchStudy).toHaveBeenCalledTimes(1);
    expect(mockedWatchStudy).toHaveBeenCalledWith({ extensionManager });
  });

  it('stops the previous watch before starting a new one', () => {
    bridgeExtension.onModeEnter?.(hookParams);
    bridgeExtension.onModeEnter?.(hookParams);

    expect(stopFunction(0)).toHaveBeenCalledTimes(1);
    expect(mockedWatchStudy).toHaveBeenCalledTimes(2);
    expect(stopFunction(1)).not.toHaveBeenCalled();
  });

  it('stops watching on mode exit, once', () => {
    bridgeExtension.onModeEnter?.(hookParams);

    bridgeExtension.onModeExit?.(hookParams);
    bridgeExtension.onModeExit?.(hookParams);

    expect(stopFunction(0)).toHaveBeenCalledTimes(1);
  });

  it('does not watch anything at registration', () => {
    bridgeExtension.preRegistration?.({} as unknown as PreRegistrationParams);

    expect(mockedWatchStudy).not.toHaveBeenCalled();
  });
});
