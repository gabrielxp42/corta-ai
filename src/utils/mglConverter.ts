import { snapMimakiPressure, snapMimakiSpeed } from './mimakiCutSettings';

export interface Point {
  x: number;
  y: number;
}

export interface MGLSettings {
  speed?: number;
  pressure?: number;
  offset?: number;
  overcutMm?: number;
  tool?: string;
  includeConditionCommands?: boolean;
}

export type MGLDocumentUnit = 'px' | 'cm' | 'mm';

const DEFAULT_TRAILER_X_MM = 1585.33;
const DEFAULT_TRAILER_Y_MM = 0;
const DEFAULT_ZX_MM = 29.63;
const PLOTTER_UNITS_PER_MM = 40;

const rotatePoint = (point: Point, center: Point, angleDeg: number): Point => {
  if (!angleDeg) {
    return point;
  }

  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos
  };
};

export class MGLConverter {
  private commands: string[] = [];
  private overcutMm = 0;

  constructor(
    private readonly dpi = 300,
    private readonly unit: MGLDocumentUnit = 'px'
  ) {
    void this.dpi;
  }

  init(settings: MGLSettings = {}): void {
    this.commands = ['IN;', 'IP0,0,1,1;', `ZX${this.formatMillimeters(DEFAULT_ZX_MM)};`];
    this.overcutMm = typeof settings.overcutMm === 'number' && settings.overcutMm > 0 ? settings.overcutMm : 0;

    if (settings.includeConditionCommands) {
      if (typeof settings.tool === 'string' && settings.tool.trim().length > 0) {
        this.commands.push(`${settings.tool.trim()};`);
      }
      if (typeof settings.speed === 'number' && settings.speed > 0) {
        this.commands.push(`VS${this.formatInteger(snapMimakiSpeed(settings.speed))};`);
      }
      if (typeof settings.pressure === 'number' && settings.pressure > 0) {
        this.commands.push(`FS${this.formatInteger(snapMimakiPressure(settings.pressure, settings.tool))};`);
      }
    }
  }

  penUp(x?: number, y?: number): void {
    if (typeof x === 'number' && typeof y === 'number') {
      this.commands.push(`PU${this.format(x)},${this.format(y)};`);
      return;
    }

    this.commands.push('PU;');
  }

  penDown(x: number, y: number): void {
    this.commands.push(`PD${this.format(x)},${this.format(y)};`);
  }

  addPolyline(points: Point[], closePath = false): void {
    if (points.length === 0) {
      return;
    }

    const normalized = this.compactPoints(points);
    if (normalized.length === 0) {
      return;
    }

    this.penUp(normalized[0].x, normalized[0].y);
    for (let index = 1; index < normalized.length; index += 1) {
      this.penDown(normalized[index].x, normalized[index].y);
    }

    if (closePath && normalized.length > 1) {
      const first = normalized[0];
      const last = normalized[normalized.length - 1];
      if (!this.samePoint(first, last)) {
        this.penDown(first.x, first.y);
      }
      this.applyOvercut(normalized);
    }
  }

  addRectangle(x: number, y: number, width: number, height: number, rotation = 0): void {
    const center = { x: x + width / 2, y: y + height / 2 };
    const corners: Point[] = [
      { x, y },
      { x, y: y + height },
      { x: x + width, y: y + height },
      { x: x + width, y }
    ].map((point) => rotatePoint(point, center, rotation));

    this.addPolyline(corners, true);
  }

  addCircle(centerX: number, centerY: number, radius: number, segments = 48): void {
    if (radius <= 0) {
      return;
    }

    const points: Point[] = [];
    for (let index = 0; index < segments; index += 1) {
      const angle = (Math.PI * 2 * index) / segments;
      points.push({
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      });
    }

    this.addPolyline(points, true);
  }

  finish(trailerX?: number, trailerY?: number): void {
    this.penUp();
    const formattedTrailerX =
      typeof trailerX === 'number'
        ? this.format(trailerX)
        : this.formatMillimeters(DEFAULT_TRAILER_X_MM);
    const formattedTrailerY =
      typeof trailerY === 'number'
        ? this.format(trailerY)
        : this.formatMillimeters(DEFAULT_TRAILER_Y_MM);

    this.commands.push(`;PU${formattedTrailerX},${formattedTrailerY};`);
  }

  getOutput(): string {
    return this.commands.join('\n');
  }

  private applyOvercut(points: Point[]): void {
    if (this.overcutMm <= 0 || points.length < 2) {
      return;
    }

    const first = points[0];
    const second = points[1];
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const length = Math.hypot(dx, dy);

    if (length <= 0) {
      return;
    }

    const overcutPoint = {
      x: first.x + (dx / length) * this.overcutMm,
      y: first.y + (dy / length) * this.overcutMm
    };

    if (!this.samePoint(first, overcutPoint)) {
      this.penDown(overcutPoint.x, overcutPoint.y);
    }
  }

  private compactPoints(points: Point[]): Point[] {
    return points.reduce<Point[]>((accumulator, point) => {
      if (accumulator.length === 0 || !this.samePoint(accumulator[accumulator.length - 1], point)) {
        accumulator.push(point);
      }
      return accumulator;
    }, []);
  }

  private samePoint(a: Point, b: Point): boolean {
    return this.format(a.x) === this.format(b.x) && this.format(a.y) === this.format(b.y);
  }

  private format(value: number): string {
    return this.toPlotterUnits(value).toFixed(2);
  }

  private formatInteger(value: number): string {
    return Math.round(value).toString();
  }

  private formatMillimeters(value: number): string {
    return this.toPlotterUnitsFromMillimeters(value).toFixed(2);
  }

  private toPlotterUnits(value: number): number {
    if (this.unit === 'mm') {
      return this.toPlotterUnitsFromMillimeters(value);
    }

    if (this.unit === 'cm') {
      return this.toPlotterUnitsFromMillimeters(value * 10);
    }

    const safeDpi = this.dpi > 0 ? this.dpi : 300;
    return this.toPlotterUnitsFromMillimeters((value * 25.4) / safeDpi);
  }

  private toPlotterUnitsFromMillimeters(value: number): number {
    return value * PLOTTER_UNITS_PER_MM;
  }
}
