import type { BridgeEventMessage } from './messages';

export enum HostOrigin {
  ScoringAppDev = 'http://localhost:5173',
  ScoringAppPreview = 'http://localhost:4173',
}

// The browser drops a delivery whose target origin doesn't match the parent, so posting to
// every host origin reaches only the real one. '*' would leak events to any page that frames
// the viewer.
export function postToHost(message: BridgeEventMessage): void {
  if (window.parent === window) {
    return;
  }
  for (const origin of Object.values(HostOrigin)) {
    window.parent.postMessage(message, origin);
  }
}
