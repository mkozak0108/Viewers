import { Types } from '@ohif/core';

import { id } from './id';
import { watchMeasurements } from './watchMeasurements';
import { watchStudy } from './watchStudy';

let stopWatching: (() => void) | undefined;
let stopWatchingMeasurements: (() => void) | undefined;

const bridgeExtension: Types.Extensions.Extension = {
  id,

  preRegistration: (_params: Types.Extensions.ExtensionParams) => {},

  onModeEnter: ({ servicesManager, commandsManager, extensionManager }) => {
    stopWatching?.();
    stopWatching = watchStudy({ extensionManager });
    stopWatchingMeasurements?.();
    stopWatchingMeasurements = watchMeasurements({
      servicesManager,
      commandsManager,
      extensionManager,
    });
  },

  onModeExit: () => {
    stopWatching?.();
    stopWatching = undefined;
    stopWatchingMeasurements?.();
    stopWatchingMeasurements = undefined;
  },
};

export default bridgeExtension;
