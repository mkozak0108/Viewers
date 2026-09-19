/**
 * The only copy of the postMessage contract between this viewer (in an iframe) and the scoring
 * app (its parent window), in both directions. The scoring app imports it as `@bridge-contract`
 * through the submodule, so change it through a fork PR, then bump the submodule in the parent
 * repo. Every message carries `version`: the two apps ship separately, and a receiver that
 * can't tell versions apart would misread a changed payload without any error. The rules are in
 * specs/003-add-area-measurements/contracts/bridge-messages.md.
 *
 * No imports: two toolchains compile this file, this fork's babel and the scoring app's Vite.
 */

/** Both apps put the study in their address under this name, as OHIF's viewer route expects. */
export const STUDY_UIDS_PARAM = 'StudyInstanceUIDs';

export enum BridgeSource {
  Viewer = 'spsoft-mvp-viewer',
  Host = 'spsoft-mvp-host',
}

export enum BridgeMessageType {
  Event = 'event',
  Command = 'command',
}

export enum BridgeVersion {
  V1 = 1,
}

export enum BridgeEvent {
  StudyLoaded = 'STUDY_LOADED',
  StudyLoadFailed = 'STUDY_LOAD_FAILED',
  ViewerReady = 'VIEWER_READY',
  MeasurementAdded = 'MEASUREMENT_ADDED',
  // Reserved for the starred task 5.1 (editing a finished measurement). No message in the
  // unions below carries it, so neither app can send or accept it yet.
  MeasurementUpdated = 'MEASUREMENT_UPDATED',
}

export enum BridgeCommand {
  ActivateTool = 'ACTIVATE_TOOL',
  DeactivateTool = 'DEACTIVATE_TOOL',
}

export enum BridgeTool {
  EllipticalROI = 'EllipticalROI',
}

export enum StudyLoadFailureReason {
  NotFound = 'notFound',
  SourceUnreachable = 'sourceUnreachable',
}

type ForStudy<Fields = unknown> = { StudyInstanceUID: string } & Fields;

// One line per message: the envelope below is written once per direction. MEASUREMENT_UPDATED
// is left out on purpose, so no message can carry it.
export type EventPayloads = {
  [BridgeEvent.StudyLoaded]: ForStudy;
  [BridgeEvent.StudyLoadFailed]: ForStudy<{ reason: StudyLoadFailureReason }>;
  [BridgeEvent.ViewerReady]: ForStudy;
  [BridgeEvent.MeasurementAdded]: ForStudy<{ rowId: string; area: number; unit: string }>;
};

export type CommandPayloads = {
  [BridgeCommand.ActivateTool]: { rowId: string; tool: BridgeTool };
  [BridgeCommand.DeactivateTool]: { rowId: string };
};

export type EventMessage<E extends keyof EventPayloads> = {
  source: BridgeSource.Viewer;
  type: BridgeMessageType.Event;
  version: BridgeVersion.V1;
  event: E;
  payload: EventPayloads[E];
};

export type CommandMessage<C extends keyof CommandPayloads> = {
  source: BridgeSource.Host;
  type: BridgeMessageType.Command;
  version: BridgeVersion.V1;
  command: C;
  payload: CommandPayloads[C];
};

export type BridgeEventMessage = {
  [E in keyof EventPayloads]: EventMessage<E>;
}[keyof EventPayloads];

export type BridgeCommandMessage = {
  [C in keyof CommandPayloads]: CommandMessage<C>;
}[keyof CommandPayloads];
