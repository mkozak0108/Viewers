import {
  BridgeMessageType,
  BridgeSource,
  BridgeVersion,
  type BridgeCommand,
  type BridgeEvent,
  type CommandMessage,
  type CommandPayloads,
  type EventMessage,
  type EventPayloads,
} from './messages';

// Both apps build their messages here, so the envelope is written once and neither side can send
// one with a missing or mistyped field. Imported by the bridge as `./buildMessages` and by the
// scoring app as `@bridge-builders`, like `messages.ts`.

export function buildEvent<E extends BridgeEvent & keyof EventPayloads>(
  event: E,
  payload: EventPayloads[E]
): EventMessage<E> {
  return {
    source: BridgeSource.Viewer,
    type: BridgeMessageType.Event,
    version: BridgeVersion.V1,
    event,
    payload,
  };
}

export function buildCommand<C extends BridgeCommand & keyof CommandPayloads>(
  command: C,
  payload: CommandPayloads[C]
): CommandMessage<C> {
  return {
    source: BridgeSource.Host,
    type: BridgeMessageType.Command,
    version: BridgeVersion.V1,
    command,
    payload,
  };
}
