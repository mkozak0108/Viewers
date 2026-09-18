import { Types } from '@ohif/core';

import { id } from './id';
import { watchStudy, type WatchStudyParams } from './watchStudy';

// Tells apps/scoring-form, over window.postMessage, when the study named in
// the viewer's address is on screen (studyLoaded). Message contract:
// ./messages.ts.
let stopWatching: (() => void) | undefined;

const bridgeExtension: Types.Extensions.Extension = {
  id,

  preRegistration: (_params: Types.Extensions.ExtensionParams) => {},

  onModeEnter: ({ extensionManager }: WatchStudyParams) => {
    stopWatching?.();
    stopWatching = watchStudy({ extensionManager });
  },

  onModeExit: () => {
    stopWatching?.();
    stopWatching = undefined;
  },
};

export default bridgeExtension;
