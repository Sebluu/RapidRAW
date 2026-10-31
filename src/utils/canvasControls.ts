import { AppSettings } from '../components/ui/AppProperties';

const WHEEL_ZOOM_SENSITIVITY = 0.002;
const TRACKPAD_ZOOM_BOOST = 5;
const MIN_CLICK_ZOOM = 1.05;
const CLICK_SLOP_PX = 5;

export type WheelGesture = { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number };

export const interpretWheel = (
  event: WheelEvent,
  zoomSpeedMultiplier: number | undefined,
  canvasInputMode: AppSettings['canvasInputMode'],
): WheelGesture => {
  const isTrackpad = canvasInputMode === 'trackpad';
  const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
  if (event.ctrlKey || (!isTrackpad && !event.shiftKey && !event.altKey)) {
    const inputBoost = isTrackpad ? TRACKPAD_ZOOM_BOOST : 1;
    return {
      kind: 'zoom',
      factor: Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY * (zoomSpeedMultiplier ?? 1) * inputBoost),
    };
  }
  if (isTrackpad) {
    return { kind: 'pan', dx: event.deltaX, dy: event.deltaY };
  }
  return { kind: 'pan', dx: event.shiftKey ? delta : 0, dy: event.altKey ? delta : 0 };
};

export const clickZoomTarget = (
  currentScale: number,
  maxScale: number,
  actualPixelsScale: number,
  savedScale: number | null,
  zoomToActualPixels: boolean | undefined,
) =>
  zoomToActualPixels
    ? Math.max(MIN_CLICK_ZOOM, Math.min(actualPixelsScale, maxScale))
    : (savedScale ?? Math.min(currentScale * 2, maxScale));

export const movedBeyondClick = (start: { x: number; y: number }, x: number, y: number) =>
  Math.abs(x - start.x) > CLICK_SLOP_PX || Math.abs(y - start.y) > CLICK_SLOP_PX;

// A compositor-native cursor is preferable to a React-rendered cursor: it
// stays responsive even if a large RAW preview is being processed.
// Same Lucide Pipette geometry as the curve-panel button. Keep it as a
// native SVG cursor so pointer movement never waits for React or Konva.
const PIPETTE_PATHS = [
  'm12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12',
  'm18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z',
  'm2 22 .414-.414',
];
const CURVE_PIPETTE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <g stroke="#0e1116" stroke-width="4">${PIPETTE_PATHS.map((d) => `<path d="${d}"/>`).join('')}</g>
  <g stroke="#f8fafc" stroke-width="2">${PIPETTE_PATHS.map((d) => `<path d="${d}"/>`).join('')}</g>
</svg>`;

export const CURVE_PIPETTE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(CURVE_PIPETTE_SVG)}") 4 28, crosshair`;
