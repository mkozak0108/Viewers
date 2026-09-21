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
  type CommandPayloads,
  type EllipseGeometry,
  MeasurementChange,
  type Point3,
  STUDY_UIDS_PARAM,
} from './messages';
import { HostOrigin, postToHost } from './postToHost';
import { isNonEmptyString, isRecord } from './utils/guards';

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

// Must match the fork's extensions/cornerstone/src/enums.ts.
enum OhifMeasurementSource {
  Name = 'Cornerstone3DTools',
  Version = '0.1',
}

const MAX_ROW_ID_LENGTH = 64;
const MAX_IMAGE_ID_LENGTH = 512;
// DICOM caps a UID at 64 characters.
const MAX_UID_LENGTH = 64;
const MAX_RESTORED_MEASUREMENTS = 100;
const HOST_ORIGINS: readonly string[] = Object.values(HostOrigin);
const BRIDGE_TOOLS: readonly unknown[] = Object.values(BridgeTool);
const BRIDGE_COMMANDS: readonly unknown[] = Object.values(BridgeCommand);

type RestorePayload = CommandPayloads[BridgeCommand.RestoreMeasurements];

// OHIF leaves its measurement mappings untyped, so the two fields read here are named.
type OhifMeasurementMapping = { annotationType: string; toMeasurementSchema: unknown };

type ToolNames = Record<string, string>;

type MeasurementStats = Record<string, { area?: unknown; areaUnit?: unknown }>;

// OHIF's measurement uid is the annotation's uid, the same in ADDED, UPDATED and REMOVED. The
// EllipticalROI mapping also copies the annotation's handle points and metadata onto it.
type MeasurementEvent = {
  measurement: {
    uid: string;
    toolName: string;
    data: MeasurementStats;
    points?: unknown;
    metadata?: unknown;
  };
};

type Area = { area: number; unit: string };

/**
 * `last` and `lastEllipse` are what the host was last told; `last` is `undefined` while the area
 * is unavailable.
 */
type Link = { rowId: string; last: Area | undefined; lastEllipse: EllipseGeometry };

export type WatchMeasurementsParams = {
  servicesManager: AppTypes.ServicesManager;
  commandsManager: AppTypes.CommandsManager;
  extensionManager: AppTypes.ExtensionManager;
};

function isRowId(value: unknown): value is string {
  return isNonEmptyString(value) && value.length <= MAX_ROW_ID_LENGTH;
}

// The same limits as the host's check, so the viewer never sends what the host would refuse.
function isEllipseGeometry(value: unknown): value is EllipseGeometry {
  return (
    isRecord(value) &&
    isNonEmptyString(value.referencedImageId) &&
    value.referencedImageId.length <= MAX_IMAGE_ID_LENGTH &&
    isNonEmptyString(value.FrameOfReferenceUID) &&
    value.FrameOfReferenceUID.length <= MAX_UID_LENGTH &&
    toPoint3(value.viewPlaneNormal) !== undefined &&
    toPoint3(value.viewUp) !== undefined &&
    Array.isArray(value.points) &&
    value.points.length === 4 &&
    value.points.every(point => toPoint3(point) !== undefined)
  );
}

/** Message data is untrusted input: this is the runtime check, the types are not. */
function isBridgeCommandMessage(data: unknown): data is BridgeCommandMessage {
  if (
    !isRecord(data) ||
    data.source !== BridgeSource.Host ||
    data.type !== BridgeMessageType.Command ||
    !BRIDGE_COMMANDS.includes(data.command) ||
    !isRecord(data.payload)
  ) {
    return false;
  }
  const { payload } = data;
  switch (data.command) {
    case BridgeCommand.ActivateTool:
      return isRowId(payload.rowId) && BRIDGE_TOOLS.includes(payload.tool);
    case BridgeCommand.DeactivateTool:
      return isRowId(payload.rowId);
    case BridgeCommand.RestoreMeasurements:
      return (
        isNonEmptyString(payload.StudyInstanceUID) &&
        Array.isArray(payload.measurements) &&
        payload.measurements.length <= MAX_RESTORED_MEASUREMENTS &&
        payload.measurements.every(
          entry => isRecord(entry) && isRowId(entry.rowId) && isEllipseGeometry(entry.ellipse)
        )
      );
    default:
      return false;
  }
}

// Exhaustive on purpose: a new BridgeTool without an OHIF tool name is a compile error.
function ohifToolName(tool: BridgeTool, toolNames: ToolNames): string {
  const names: Record<BridgeTool, string> = {
    [BridgeTool.EllipticalROI]: toolNames.EllipticalROI,
  };
  return names[tool];
}

function firstArea(data: MeasurementStats): Area | undefined {
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

function isSameArea(a: Area | undefined, b: Area | undefined): boolean {
  return a === b || (a !== undefined && b !== undefined && a.area === b.area && a.unit === b.unit);
}

// Copies as well as checks: cornerstone moves an ellipse by changing its point arrays in place, so
// a kept reference would always equal the current points and a move would never be reported.
function toPoint3(value: unknown): Point3 | undefined {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(n => typeof n === 'number' && Number.isFinite(n))
  ) {
    return undefined;
  }
  return [value[0], value[1], value[2]];
}

function ellipseOf(measurement: MeasurementEvent['measurement']): EllipseGeometry | undefined {
  const { metadata, points } = measurement;
  if (!isRecord(metadata) || !Array.isArray(points) || points.length !== 4) {
    return undefined;
  }
  const { referencedImageId, FrameOfReferenceUID } = metadata;
  const viewPlaneNormal = toPoint3(metadata.viewPlaneNormal);
  const viewUp = toPoint3(metadata.viewUp);
  const [bottom, top, left, right] = points.map(toPoint3);
  const ellipse = {
    referencedImageId,
    FrameOfReferenceUID,
    viewPlaneNormal,
    viewUp,
    points: [bottom, top, left, right],
  };
  return isEllipseGeometry(ellipse) ? ellipse : undefined;
}

function isSamePoint(a: Point3, b: Point3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function isSameEllipse(a: EllipseGeometry, b: EllipseGeometry): boolean {
  return (
    a.referencedImageId === b.referencedImageId &&
    a.FrameOfReferenceUID === b.FrameOfReferenceUID &&
    isSamePoint(a.viewPlaneNormal, b.viewPlaneNormal) &&
    isSamePoint(a.viewUp, b.viewUp) &&
    a.points.every((point, i) => isSamePoint(point, b.points[i]))
  );
}

function studyInstanceUidFromAddress(): string | undefined {
  const studyInstanceUid = new URLSearchParams(window.location.search).get(STUDY_UIDS_PARAM);
  if (!studyInstanceUid) {
    log.error('[bridge] no study in the page address; the measurement was not sent');
    return undefined;
  }
  return studyInstanceUid;
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
  // Measurement uid → the row its ellipse was drawn for. The uid never goes on the wire, so the
  // host keeps knowing rows only by the ids it made.
  const links = new Map<string, Link>();

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
    if (command === BridgeCommand.RestoreMeasurements) {
      restore(payload);
      return;
    }
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

  // Puts saved ellipses back after a reload and links each to its row, so from then on it is
  // exactly an ellipse drawn in this session. OHIF's own path for serialized measurements, the
  // one its SR viewer hydrates with (005 research R5).
  const restore = ({ StudyInstanceUID, measurements }: RestorePayload) => {
    const studyInstanceUid = studyInstanceUidFromAddress();
    // The one command checked against the study: it puts marks on a patient's images.
    if (!studyInstanceUid || StudyInstanceUID !== studyInstanceUid) {
      log.warn('[bridge] ignored a restore for another study');
      return;
    }
    const toolNames = getToolNames();
    const source = measurementService.getSource(
      OhifMeasurementSource.Name,
      OhifMeasurementSource.Version
    );
    const mapping = (
      measurementService.getSourceMappings(
        OhifMeasurementSource.Name,
        OhifMeasurementSource.Version
      ) as OhifMeasurementMapping[] | undefined
    )?.find(candidate => candidate.annotationType === toolNames?.EllipticalROI);
    if (!toolNames || !source || !mapping) {
      log.warn(
        '[bridge] cannot restore measurements: the cornerstone measurement source is missing'
      );
      return;
    }
    for (const { rowId, ellipse } of measurements) {
      // Fresh arrays: OHIF keeps the ones it is given and cornerstone moves an ellipse by changing
      // them in place, which would also change lastEllipse and hide every move from the host.
      const annotation = {
        metadata: {
          toolName: toolNames.EllipticalROI,
          referencedImageId: ellipse.referencedImageId,
          FrameOfReferenceUID: ellipse.FrameOfReferenceUID,
          viewPlaneNormal: [...ellipse.viewPlaneNormal],
          viewUp: [...ellipse.viewUp],
        },
        data: {
          // A new annotation starts with no active handle. The renderer reads anything but null
          // as a handle index, so leaving it undefined makes it throw on the first draw.
          handles: { points: ellipse.points.map(point => [...point]), activeHandleIndex: null },
          cachedStats: {},
          label: '',
        },
      };
      const uid: unknown = measurementService.addRawMeasurement(
        source,
        toolNames.EllipticalROI,
        { annotation },
        mapping.toMeasurementSchema
      );
      if (typeof uid !== 'string') {
        // In practice its image is not in this study, so OHIF's mapping fails (005 research R13).
        log.warn('[bridge] a saved ellipse could not be put back');
        postToHost(
          buildEvent(BridgeEvent.MeasurementRestoreFailed, {
            StudyInstanceUID: studyInstanceUid,
            rowId,
          })
        );
        continue;
      }
      // No area yet: cornerstone computes it at the next render and reports it as an update.
      links.set(uid, { rowId, last: undefined, lastEllipse: ellipse });
    }
    // OHIF's raw-measurement path adds the annotation without drawing it.
    servicesManager.services.cornerstoneViewportService.getRenderingEngine()?.render();
  };

  const addedSubscription = measurementService.subscribe(
    measurementService.EVENTS.MEASUREMENT_ADDED,
    ({ measurement }: MeasurementEvent) => {
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
      const ellipse = ellipseOf(measurement);
      if (!ellipse) {
        // The form saves where each ellipse is; a value it could never restore is worse than none.
        log.warn('[bridge] the finished ellipse has no usable geometry; nothing was sent');
        return;
      }
      const studyInstanceUid = studyInstanceUidFromAddress();
      if (!studyInstanceUid) {
        return;
      }
      const rowId = pendingRowId;
      postToHost(
        buildEvent(BridgeEvent.MeasurementAdded, {
          StudyInstanceUID: studyInstanceUid,
          rowId,
          area: result.area,
          unit: result.unit,
          ellipse,
        })
      );
      links.set(measurement.uid, { rowId, last: result, lastEllipse: ellipse });
      pendingRowId = undefined;
      setActiveTool(toolNames.Pan);
    }
  );

  // No throttle of our own: cornerstone recomputes the area at most every 100 ms during a drag,
  // and once more after it stops, which is both the live pace and the final value (004 research
  // R1). The shape changes with every mouse move; the host throttles its saving instead (005 R10).
  const updatedSubscription = measurementService.subscribe(
    measurementService.EVENTS.MEASUREMENT_UPDATED,
    ({ measurement }: MeasurementEvent) => {
      // Also fired from mouse-down and throughout the first drawing of a new ellipse, and for
      // ellipses drawn from the viewer's own toolbar: none of those belongs to a row yet.
      const link = links.get(measurement.uid);
      if (!link) {
        return;
      }
      const result = firstArea(measurement.data);
      const ellipse = ellipseOf(measurement);
      if (!ellipse) {
        log.warn('[bridge] an ellipse changed but has no usable geometry; nothing was sent');
        return;
      }
      // The message means "the area, the unit or the shape changed". Selection, lock and
      // visibility repeat all three, so they are dropped here. A move with no resize is a real
      // change: the form saves where the ellipse is, to draw it there again after a reload.
      if (isSameArea(result, link.last) && isSameEllipse(ellipse, link.lastEllipse)) {
        return;
      }
      const studyInstanceUid = studyInstanceUidFromAddress();
      if (!studyInstanceUid) {
        return;
      }
      postToHost(
        buildEvent(
          BridgeEvent.MeasurementUpdated,
          result
            ? {
                StudyInstanceUID: studyInstanceUid,
                rowId: link.rowId,
                change: MeasurementChange.AreaChanged,
                area: result.area,
                unit: result.unit,
                ellipse,
              }
            : {
                StudyInstanceUID: studyInstanceUid,
                rowId: link.rowId,
                change: MeasurementChange.AreaUnavailable,
                ellipse,
              }
        )
      );
      link.last = result;
      link.lastEllipse = ellipse;
    }
  );

  const reportRemoved = (uid: string) => {
    const link = links.get(uid);
    if (!link) {
      return;
    }
    links.delete(uid);
    const studyInstanceUid = studyInstanceUidFromAddress();
    if (!studyInstanceUid) {
      return;
    }
    postToHost(
      buildEvent(BridgeEvent.MeasurementRemoved, {
        StudyInstanceUID: studyInstanceUid,
        rowId: link.rowId,
      })
    );
  };

  // OHIF's own clear at mode enter and exit never reaches the form: on exit the extensions'
  // onModeExit, which unsubscribes these, runs before the services'; on enter there are no links.
  const removedSubscription = measurementService.subscribe(
    measurementService.EVENTS.MEASUREMENT_REMOVED,
    ({ measurement: uid }: { measurement: unknown }) => {
      if (typeof uid !== 'string') {
        log.warn('[bridge] a removed measurement came without its uid; nothing was sent');
        return;
      }
      reportRemoved(uid);
    }
  );

  // A bulk delete fires only this, with no MEASUREMENT_REMOVED per measurement.
  const clearedSubscription = measurementService.subscribe(
    measurementService.EVENTS.MEASUREMENTS_CLEARED,
    ({ measurements }: { measurements: unknown }) => {
      if (!Array.isArray(measurements)) {
        log.warn('[bridge] cleared measurements came without a list; nothing was sent');
        return;
      }
      for (const measurement of measurements) {
        if (isRecord(measurement) && typeof measurement.uid === 'string') {
          reportRemoved(measurement.uid);
        }
      }
    }
  );

  window.addEventListener('message', onMessage);

  return () => {
    window.removeEventListener('message', onMessage);
    addedSubscription.unsubscribe();
    updatedSubscription.unsubscribe();
    removedSubscription.unsubscribe();
    clearedSubscription.unsubscribe();
    pendingRowId = undefined;
    links.clear();
  };
}
