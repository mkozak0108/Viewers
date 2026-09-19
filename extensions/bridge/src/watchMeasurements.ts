import { log } from '@ohif/core';

import { buildEvent } from './buildMessages';
import {
  BridgeCommand,
  type BridgeCommandMessage,
  BridgeEvent,
  BridgeMessageType,
  BridgeSource,
  BridgeTool,
  BridgeVersion,
  STUDY_UIDS_PARAM,
} from './messages';
import { HostOrigin, postToHost } from './postToHost';

// OHIF's own identifiers: they must match the fork's cornerstone `commandsModule.ts` and the
// module ids its extension registers.
enum OhifCommand {
  SetToolActiveToolbar = 'setToolActiveToolbar',
}

enum OhifCommandContext {
  Cornerstone = 'CORNERSTONE',
}

enum OhifModule {
  CornerstoneTools = '@ohif/extension-cornerstone.utilityModule.tools',
}

const MAX_ROW_ID_LENGTH = 64;
const HOST_ORIGINS: readonly string[] = Object.values(HostOrigin);
const BRIDGE_TOOLS: readonly unknown[] = Object.values(BridgeTool);
const BRIDGE_COMMANDS: readonly unknown[] = Object.values(BridgeCommand);

type ToolNames = Record<string, string>;

type MeasurementAddedEvent = {
  measurement: { toolName: string; data: Record<string, { area?: unknown; areaUnit?: unknown }> };
};

export type WatchMeasurementsParams = {
  servicesManager: AppTypes.ServicesManager;
  commandsManager: AppTypes.CommandsManager;
  extensionManager: AppTypes.ExtensionManager;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/** Message data is untrusted input: this is the runtime check, the types are not. */
function isBridgeCommandMessage(data: unknown): data is BridgeCommandMessage {
  if (
    !isRecord(data) ||
    data.source !== BridgeSource.Host ||
    data.type !== BridgeMessageType.Command ||
    !BRIDGE_COMMANDS.includes(data.command)
  ) {
    return false;
  }
  const { payload } = data;
  if (
    !isRecord(payload) ||
    !isNonEmptyString(payload.rowId) ||
    payload.rowId.length > MAX_ROW_ID_LENGTH
  ) {
    return false;
  }
  return data.command === BridgeCommand.ActivateTool ? BRIDGE_TOOLS.includes(payload.tool) : true;
}

// Exhaustive on purpose: a new BridgeTool without an OHIF tool name is a compile error.
function ohifToolName(tool: BridgeTool, toolNames: ToolNames): string {
  const names: Record<BridgeTool, string> = {
    [BridgeTool.EllipticalROI]: toolNames.EllipticalROI,
  };
  return names[tool];
}

function firstArea(
  data: MeasurementAddedEvent['measurement']['data']
): { area: number; unit: string } | undefined {
  for (const stats of Object.values(data ?? {})) {
    if (
      typeof stats?.area === 'number' &&
      Number.isFinite(stats.area) &&
      typeof stats.areaUnit === 'string' &&
      stats.areaUnit !== ''
    ) {
      return { area: stats.area, unit: stats.areaUnit };
    }
  }
  return undefined;
}

/**
 * Turns the host's ACTIVATE_TOOL into an enabled Ellipse tool and, when that ellipse is
 * finished, posts its area back with the row it was activated for and returns to Pan.
 *
 * `MEASUREMENT_ADDED` comes from OHIF's measurement service rather than cornerstone's own
 * annotation events because the service is where the stats are already mapped to an area.
 */
export function watchMeasurements({
  servicesManager,
  commandsManager,
  extensionManager,
}: WatchMeasurementsParams): () => void {
  const { measurementService } = servicesManager.services;
  let pendingRowId: string | undefined;

  // OHIF types module entries as `unknown`, so the one field read here is named.
  const getToolNames = (): ToolNames | undefined =>
    (
      extensionManager.getModuleEntry(OhifModule.CornerstoneTools) as
        | { exports: { toolNames: ToolNames } }
        | undefined
    )?.exports.toolNames;

  const setActiveTool = (toolName: string) =>
    commandsManager.runCommand(
      OhifCommand.SetToolActiveToolbar,
      { toolName },
      OhifCommandContext.Cornerstone
    );

  const onMessage = (event: MessageEvent) => {
    // Other pages and browser extensions post to this window too, so these are debug only.
    if (!HOST_ORIGINS.includes(event.origin) || event.source !== window.parent) {
      log.debug('[bridge] ignored a message from another origin or window');
      return;
    }
    if (!isRecord(event.data) || event.data.version !== BridgeVersion.V1) {
      log.warn('[bridge] ignored a host message: unsupported version');
      return;
    }
    if (!isBridgeCommandMessage(event.data)) {
      log.warn('[bridge] ignored a host message: unexpected shape');
      return;
    }

    const { command, payload } = event.data;
    if (command === BridgeCommand.DeactivateTool) {
      // Ignored unless it names the pending row: a late cancel for a row the host has already
      // replaced must not switch off the newer activation (research R7).
      if (payload.rowId !== pendingRowId) {
        log.debug('[bridge] ignored a cancel for a row that is not pending');
        return;
      }
      pendingRowId = undefined;
      const toolNames = getToolNames();
      if (toolNames) {
        setActiveTool(toolNames.Pan);
      }
      return;
    }
    // The newest activation replaces an earlier one, which the host has already demoted.
    pendingRowId = payload.rowId;
    const toolNames = getToolNames();
    if (!toolNames) {
      // The host's Cancel is the recovery: the row stays "Drawing…" and pendingRowId is kept.
      log.warn('[bridge] cannot activate a tool: the cornerstone tools module is missing');
      return;
    }
    setActiveTool(ohifToolName(payload.tool, toolNames));
  };

  const subscription = measurementService.subscribe(
    measurementService.EVENTS.MEASUREMENT_ADDED,
    ({ measurement }) => {
      const toolNames = getToolNames();
      // With nothing pending this is a drawing from the viewer's own toolbar.
      if (pendingRowId === undefined || !toolNames) {
        return;
      }
      if (measurement.toolName !== toolNames.EllipticalROI) {
        return;
      }
      const result = firstArea(measurement.data);
      if (!result) {
        // Left "Drawing…" on purpose: visible to the doctor, who can cancel it.
        log.error('[bridge] the finished ellipse has no area; nothing was sent');
        return;
      }
      const studyInstanceUid = new URLSearchParams(window.location.search).get(STUDY_UIDS_PARAM);
      if (!studyInstanceUid) {
        log.error('[bridge] no study in the page address; the measurement was not sent');
        return;
      }
      postToHost(
        buildEvent(BridgeEvent.MeasurementAdded, {
          StudyInstanceUID: studyInstanceUid,
          rowId: pendingRowId,
          area: result.area,
          unit: result.unit,
        })
      );
      pendingRowId = undefined;
      setActiveTool(toolNames.Pan);
    }
  );

  window.addEventListener('message', onMessage);

  return () => {
    window.removeEventListener('message', onMessage);
    subscription.unsubscribe();
    pendingRowId = undefined;
  };
}
