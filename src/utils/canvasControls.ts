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
const CURVE_PIPETTE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <path d="M4 28 12 20 14.5 20 22.5 12 20 9.5 12 17.5 12 20 4 28Z" fill="#f8fafc" stroke="#111827" stroke-width="2" stroke-linejoin="round"/>
  <path d="M17.5 7.5 21.5 3.5a2 2 0 0 1 2.8 0l4.2 4.2a2 2 0 0 1 0 2.8l-4 4Z" fill="#f8fafc" stroke="#111827" stroke-width="2" stroke-linejoin="round"/>
  <path d="m12 20 8.5-8.5" fill="none" stroke="#111827" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;

export const CURVE_PIPETTE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(CURVE_PIPETTE_SVG)}") 4 28, crosshair`;
