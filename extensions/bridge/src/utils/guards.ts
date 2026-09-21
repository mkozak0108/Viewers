import type { EllipseGeometry, Point3 } from '../messages';

// Message data is untrusted input, and TypeScript types are not validation: these narrow it
// before the bridge uses it.

const MAX_IMAGE_ID_LENGTH = 512;
const MAX_UID_LENGTH = 64;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

export function isPoint3(value: unknown): value is Point3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(n => typeof n === 'number' && Number.isFinite(n))
  );
}

export function isEllipseGeometry(value: unknown): value is EllipseGeometry {
  return (
    isRecord(value) &&
    isNonEmptyString(value.referencedImageId) &&
    value.referencedImageId.length <= MAX_IMAGE_ID_LENGTH &&
    isNonEmptyString(value.FrameOfReferenceUID) &&
    value.FrameOfReferenceUID.length <= MAX_UID_LENGTH &&
    isPoint3(value.viewPlaneNormal) &&
    isPoint3(value.viewUp) &&
    Array.isArray(value.points) &&
    value.points.length === 4 &&
    value.points.every(isPoint3)
  );
}
