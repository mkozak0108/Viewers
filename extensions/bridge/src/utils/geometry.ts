import type { EllipseGeometry, Point3 } from '../messages';
import { isEllipseGeometry, isRecord } from './guards';

type MeasurementGeometry = { points?: unknown; metadata?: unknown };

export function ellipseOf({ metadata, points }: MeasurementGeometry): EllipseGeometry | undefined {
  if (!isRecord(metadata)) {
    return undefined;
  }
  const ellipse = {
    referencedImageId: metadata.referencedImageId,
    FrameOfReferenceUID: metadata.FrameOfReferenceUID,
    viewPlaneNormal: metadata.viewPlaneNormal,
    viewUp: metadata.viewUp,
    points,
  };
  // A copy: cornerstone moves an ellipse by changing these arrays in place.
  return isEllipseGeometry(ellipse) ? structuredClone(ellipse) : undefined;
}

function isSamePoint(a: Point3, b: Point3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function isSameEllipse(a: EllipseGeometry, b: EllipseGeometry): boolean {
  return (
    a.referencedImageId === b.referencedImageId &&
    a.FrameOfReferenceUID === b.FrameOfReferenceUID &&
    isSamePoint(a.viewPlaneNormal, b.viewPlaneNormal) &&
    isSamePoint(a.viewUp, b.viewUp) &&
    a.points.every((point, i) => isSamePoint(point, b.points[i]))
  );
}
