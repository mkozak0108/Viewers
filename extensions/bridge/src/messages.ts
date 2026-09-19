/**
 * The only copy of the postMessage contract between this viewer (in an iframe) and the scoring
 * app (its parent window), in both directions. The scoring app imports it as `@bridge-contract`
 * through the submodule, so change it through a fork PR, then bump the submodule in the parent
 * repo. Every message carries `version`: the two apps ship separately, and a receiver that
 * can't tell versions apart would misread a changed payload without any error. The rules are in
 * specs/003-add-area-measurements/contracts/bridge-messages.md and, for MEASUREMENT_UPDATED,
 * specs/004-live-measurement-update/contracts/bridge-messages.md. Deletions travel in
 * MEASUREMENT_UPDATED because the event names are fixed and none means "removed"; its `change`
 * field is what tells a removal from a new area.
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

export enum MeasurementChange {
  AreaChanged = 'areaChanged',
  AreaUnavailable = 'areaUnavailable',
  Removed = 'removed',
}

type ForStudy<Fields = unknown> = { StudyInstanceUID: string } & Fields;

type MeasurementUpdate =
  | { change: MeasurementChange.AreaChanged; area: number; unit: string }
  | { change: MeasurementChange.AreaUnavailable }
  | { change: MeasurementChange.Removed };

// One line per message: the envelope below is written once per direction.
export type EventPayloads = {
  [BridgeEvent.StudyLoaded]: ForStudy;
  [BridgeEvent.StudyLoadFailed]: ForStudy<{ reason: StudyLoadFailureReason }>;
  [BridgeEvent.ViewerReady]: ForStudy;
  [BridgeEvent.MeasurementAdded]: ForStudy<{ rowId: string; area: number; unit: string }>;
  [BridgeEvent.MeasurementUpdated]: ForStudy<{ rowId: string } & MeasurementUpdate>;
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
