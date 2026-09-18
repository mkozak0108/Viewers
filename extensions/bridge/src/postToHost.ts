import type { BridgeEventMessage } from './messages';

/**
 * The scoring app's origins: its dev server and `vite preview`. The browser
 * drops a delivery whose target origin doesn't match the parent, so posting
 * to each is safe; posting to '*' would leak events to any page embedding
 * the viewer.
 */
export const HOST_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'] as const;

/** Posts a bridge event to the host app. Does nothing when not framed. */
export function postToHost(message: BridgeEventMessage): void {
  if (window.parent === window) {
    return;
  }
  for (const origin of HOST_ORIGINS) {
    window.parent.postMessage(message, origin);
  }
}
