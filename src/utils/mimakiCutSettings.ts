import { CutSettings } from '../types/canvas-elements';

const SPEED_VALUES = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70,
  73
];

const buildPressureValues = (max: number): number[] => {
  const values = new Set<number>();

  for (let value = 10; value <= Math.min(20, max); value += 2) {
    values.add(value);
  }

  for (let value = 25; value <= Math.min(100, max); value += 5) {
    values.add(value);
  }

  for (let value = 110; value <= max; value += 10) {
    values.add(value);
  }

  return [...values].sort((left, right) => left - right);
};

const CUTTER_PRESSURE_VALUES = buildPressureValues(550);
const PEN_PRESSURE_VALUES = buildPressureValues(150);

const snapToNearest = (value: number, allowedValues: number[]): number =>
  allowedValues.reduce((best, candidate) => (
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best
  ), allowedValues[0]);

const stepThroughAllowed = (current: number, allowedValues: number[], direction: -1 | 1): number => {
  const snapped = snapToNearest(current, allowedValues);
  const index = allowedValues.indexOf(snapped);
  const nextIndex = Math.min(allowedValues.length - 1, Math.max(0, index + direction));

  return allowedValues[nextIndex];
};

export const isPenTool = (tool?: string) => (tool ?? '').trim().toUpperCase() === 'PEN';

export const snapMimakiSpeed = (value: number): number =>
  snapToNearest(Number.isFinite(value) ? value : 20, SPEED_VALUES);

export const stepMimakiSpeed = (current: number, direction: -1 | 1): number =>
  stepThroughAllowed(current, SPEED_VALUES, direction);

export const snapMimakiPressure = (value: number, tool?: string): number =>
  snapToNearest(Number.isFinite(value) ? value : 50, isPenTool(tool) ? PEN_PRESSURE_VALUES : CUTTER_PRESSURE_VALUES);

export const stepMimakiPressure = (current: number, tool: string | undefined, direction: -1 | 1): number =>
  stepThroughAllowed(current, isPenTool(tool) ? PEN_PRESSURE_VALUES : CUTTER_PRESSURE_VALUES, direction);

export const snapMimakiOffset = (value: number): number =>
  Math.min(2.5, Math.max(0, Number((Math.round(value / 0.05) * 0.05).toFixed(2))));

export const stepMimakiOffset = (current: number, direction: -1 | 1): number =>
  snapMimakiOffset(current + 0.05 * direction);

export const getCutSettingsSummary = (settings: CutSettings): string => {
  const speedLabel = settings.speed > 0 ? `${settings.speed} cm/s` : 'painel';
  const pressureLabel = settings.pressure > 0 ? `${settings.pressure} g` : 'painel';
  const offsetLabel = settings.offset >= 0 ? `${settings.offset.toFixed(2)} mm` : 'painel';
  const overcutLabel = settings.overcutMm > 0 ? `${settings.overcutMm.toFixed(2)} mm` : 'off';

  return `${settings.tool} | ${speedLabel} | ${pressureLabel} | offset ${offsetLabel} | sobrecorte ${overcutLabel}`;
};
