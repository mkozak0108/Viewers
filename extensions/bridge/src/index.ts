import { Types } from '@ohif/core';

import { id } from './id';

// Accepts commands from apps/scoring-form and publishes viewer events back
// out, over window.postMessage. Message contract: ./messages.ts.
const bridgeExtension: Types.Extensions.Extension = {
  id,

  preRegistration: (_params: Types.Extensions.ExtensionParams) => {},
};

export default bridgeExtension;
