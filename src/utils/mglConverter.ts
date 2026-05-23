export interface Point {
  x: number;
  y: number;
}

export interface MGLSettings {
  speed?: number;
  pressure?: number;
  offset?: number;
  tool?: string;
  includeConditionCommands?: boolean;
}

const DEFAULT_TRAILER_X = 1585.33;
const DEFAULT_TRAILER_Y = 0;
const DEFAULT_ZX = 29.63;

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

  constructor(private readonly dpi = 300) {
    void this.dpi;
  }

  init(settings: MGLSettings = {}): void {
    this.commands = ['IN;', 'IP0,0,1,1;', `ZX${this.format(DEFAULT_ZX)};`];

    if (settings.includeConditionCommands) {
      if (typeof settings.speed === 'number' && settings.speed > 0) {
        this.commands.push(`VS${this.formatInteger(settings.speed)};`);
      }
      if (typeof settings.pressure === 'number' && settings.pressure > 0) {
        this.commands.push(`FS${this.formatInteger(settings.pressure)};`);
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

  finish(trailerX = DEFAULT_TRAILER_X, trailerY = DEFAULT_TRAILER_Y): void {
    this.penUp();
    this.commands.push(`;PU${this.format(trailerX)},${this.format(trailerY)};`);
  }

  getOutput(): string {
    return this.commands.join('\n');
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
    return value.toFixed(2);
  }

  private formatInteger(value: number): string {
    return Math.round(value).toString();
  }
}
