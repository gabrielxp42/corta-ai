import { CanvasElement, DocumentSettings, GroupElement, PathElement, ShapeElement } from '../../types/canvas-elements';
import { MGLConverter, Point } from '../../utils/mglConverter';

interface TransformContext {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

const DEFAULT_SEGMENTS = 48;

const IDENTITY_TRANSFORM: TransformContext = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0
};

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

const applyTransform = (point: Point, transform: TransformContext): Point => {
  if (
    transform.x === 0 &&
    transform.y === 0 &&
    transform.scaleX === 1 &&
    transform.scaleY === 1 &&
    transform.rotation === 0
  ) {
    return point;
  }

  const scaled = {
    x: point.x * transform.scaleX,
    y: point.y * transform.scaleY
  };

  return rotatePoint(
    {
      x: scaled.x + transform.x,
      y: scaled.y + transform.y
    },
    { x: transform.x, y: transform.y },
    transform.rotation
  );
};

const transformPoints = (points: Point[], transform: TransformContext): Point[] =>
  points.map((point) => applyTransform(point, transform));

const addPolyline = (
  converter: MGLConverter,
  points: Point[],
  closePath = false,
  transform: TransformContext = IDENTITY_TRANSFORM
) => {
  if (points.length < 2) {
    return;
  }

  converter.addPolyline(transformPoints(points, transform), closePath);
};

const buildRectanglePoints = (element: ShapeElement): Point[] => {
  const width = element.width * element.scaleX;
  const height = element.height * element.scaleY;
  const center = { x: element.x + width / 2, y: element.y + height / 2 };

  return [
    { x: element.x, y: element.y },
    { x: element.x, y: element.y + height },
    { x: element.x + width, y: element.y + height },
    { x: element.x + width, y: element.y }
  ].map((point) => rotatePoint(point, center, element.rotation));
};

const buildEllipsePoints = (
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  rotation = 0,
  segments = DEFAULT_SEGMENTS
): Point[] => {
  const points: Point[] = [];
  const center = { x: centerX, y: centerY };

  for (let index = 0; index < segments; index += 1) {
    const angle = (Math.PI * 2 * index) / segments;
    const point = {
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY
    };

    points.push(rotatePoint(point, center, rotation));
  }

  return points;
};

const buildPolygonPoints = (
  centerX: number,
  centerY: number,
  radius: number,
  sides: number,
  rotation = 0
): Point[] => {
  const points: Point[] = [];
  const angleOffset = ((rotation - 90) * Math.PI) / 180;

  for (let index = 0; index < sides; index += 1) {
    const angle = angleOffset + (Math.PI * 2 * index) / sides;
    points.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    });
  }

  return points;
};

const buildStarPoints = (
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  pointsCount: number,
  rotation = 0
): Point[] => {
  const points: Point[] = [];
  const angleOffset = ((rotation - 90) * Math.PI) / 180;

  for (let index = 0; index < pointsCount * 2; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = angleOffset + (Math.PI * index) / pointsCount;
    points.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    });
  }

  return points;
};

const buildLinePoints = (element: ShapeElement): Point[] => {
  if (Array.isArray(element.points) && element.points.length >= 4) {
    const rawPoints: Point[] = [];
    for (let index = 0; index < element.points.length; index += 2) {
      rawPoints.push({
        x: element.x + element.points[index] * element.scaleX,
        y: element.y + element.points[index + 1] * element.scaleY
      });
    }

    if (element.rotation) {
      const center = {
        x:
          rawPoints.reduce((sum, point) => sum + point.x, 0) / rawPoints.length,
        y:
          rawPoints.reduce((sum, point) => sum + point.y, 0) / rawPoints.length
      };

      return rawPoints.map((point) => rotatePoint(point, center, element.rotation));
    }

    return rawPoints;
  }

  const width = element.width * element.scaleX;
  const height = element.height * element.scaleY;
  const start = { x: element.x, y: element.y };
  const end = { x: element.x + width, y: element.y + height };
  const center = { x: element.x + width / 2, y: element.y + height / 2 };

  return [start, end].map((point) => rotatePoint(point, center, element.rotation));
};

const commandIsSupported = (command: string): boolean =>
  ['M', 'm', 'L', 'l', 'H', 'h', 'V', 'v', 'Z', 'z'].includes(command);

const tokenizePath = (data: string): string[] => {
  const matches = data.match(/[MLHVZmlhvz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
  return matches ?? [];
};

const buildPathSegments = (element: PathElement): { points: Point[]; closed: boolean }[] => {
  const tokens = tokenizePath(element.data);
  const segments: { points: Point[]; closed: boolean }[] = [];
  let index = 0;
  let current: Point = { x: 0, y: 0 };
  let startPoint: Point | null = null;
  let activePoints: Point[] = [];

  const flush = (closed = false) => {
    if (activePoints.length > 1) {
      segments.push({
        points: activePoints.map((point) => ({
          x: element.x + point.x * element.scaleX,
          y: element.y + point.y * element.scaleY
        })),
        closed
      });
    }
    activePoints = [];
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (!commandIsSupported(token)) {
      index += 1;
      continue;
    }

    index += 1;

    if (token === 'Z' || token === 'z') {
      if (startPoint) {
        activePoints.push(startPoint);
      }
      flush(true);
      startPoint = null;
      continue;
    }

    if (token === 'M' || token === 'm') {
      flush(false);
      const isRelative = token === 'm';
      while (index + 1 < tokens.length && !commandIsSupported(tokens[index])) {
        const nextPoint = {
          x: Number(tokens[index]),
          y: Number(tokens[index + 1])
        };
        index += 2;

        current = {
          x: isRelative ? current.x + nextPoint.x : nextPoint.x,
          y: isRelative ? current.y + nextPoint.y : nextPoint.y
        };

        if (activePoints.length === 0) {
          startPoint = { ...current };
          activePoints.push({ ...current });
        } else {
          activePoints.push({ ...current });
        }
      }
      continue;
    }

    const isRelative = token === token.toLowerCase();
    while (index < tokens.length && !commandIsSupported(tokens[index])) {
      if ((token === 'L' || token === 'l') && index + 1 < tokens.length) {
        const nextPoint = {
          x: Number(tokens[index]),
          y: Number(tokens[index + 1])
        };
        index += 2;
        current = {
          x: isRelative ? current.x + nextPoint.x : nextPoint.x,
          y: isRelative ? current.y + nextPoint.y : nextPoint.y
        };
        activePoints.push({ ...current });
        continue;
      }

      if (token === 'H' || token === 'h') {
        const x = Number(tokens[index]);
        index += 1;
        current = {
          x: isRelative ? current.x + x : x,
          y: current.y
        };
        activePoints.push({ ...current });
        continue;
      }

      if (token === 'V' || token === 'v') {
        const y = Number(tokens[index]);
        index += 1;
        current = {
          x: current.x,
          y: isRelative ? current.y + y : y
        };
        activePoints.push({ ...current });
        continue;
      }

      index += 1;
    }
  }

  flush(false);

  if (!element.rotation) {
    return segments;
  }

  const center = { x: element.x, y: element.y };
  return segments.map((segment) => ({
    closed: segment.closed,
    points: segment.points.map((point) => rotatePoint(point, center, element.rotation))
  }));
};

const appendShape = (converter: MGLConverter, element: ShapeElement, transform: TransformContext) => {
  if (!element.visible) {
    return;
  }

  if (element.shapeType === 'rectangle') {
    addPolyline(converter, buildRectanglePoints(element), true, transform);
    return;
  }

  if (element.shapeType === 'circle') {
    const radius = (element.radius ?? element.width / 2) * element.scaleX;
    const centerX = element.x + radius;
    const centerY = element.y + radius;
    addPolyline(
      converter,
      buildEllipsePoints(centerX, centerY, radius, radius, element.rotation),
      true,
      transform
    );
    return;
  }

  if (element.shapeType === 'ellipse') {
    const radiusX = (element.radiusX ?? element.width / 2) * element.scaleX;
    const radiusY = (element.radiusY ?? element.height / 2) * element.scaleY;
    addPolyline(
      converter,
      buildEllipsePoints(element.x + radiusX, element.y + radiusY, radiusX, radiusY, element.rotation),
      true,
      transform
    );
    return;
  }

  if (element.shapeType === 'polygon') {
    const sides = Math.max(3, element.sides ?? 3);
    const radius = (element.radius ?? Math.min(element.width, element.height) / 2) * Math.max(element.scaleX, element.scaleY);
    addPolyline(
      converter,
      buildPolygonPoints(element.x + element.width / 2, element.y + element.height / 2, radius, sides, element.rotation),
      true,
      transform
    );
    return;
  }

  if (element.shapeType === 'star') {
    const pointsCount = Math.max(3, element.sides ?? 5);
    const outerRadius =
      (element.outerRadius ?? Math.min(element.width, element.height) / 2) * Math.max(element.scaleX, element.scaleY);
    const innerRadius = (element.innerRadius ?? outerRadius / 2) * Math.max(element.scaleX, element.scaleY);
    addPolyline(
      converter,
      buildStarPoints(
        element.x + element.width / 2,
        element.y + element.height / 2,
        innerRadius,
        outerRadius,
        pointsCount,
        element.rotation
      ),
      true,
      transform
    );
    return;
  }

  if (element.shapeType === 'line' || element.shapeType === 'arrow') {
    addPolyline(converter, buildLinePoints(element), false, transform);
  }
};

const appendPath = (converter: MGLConverter, element: PathElement, transform: TransformContext) => {
  if (!element.visible) {
    return;
  }

  const segments = buildPathSegments(element);
  for (const segment of segments) {
    addPolyline(converter, segment.points, segment.closed, transform);
  }
};

const appendGroup = (converter: MGLConverter, element: GroupElement, transform: TransformContext) => {
  if (!element.visible) {
    return;
  }

  const nextTransform: TransformContext = {
    x: element.x,
    y: element.y,
    scaleX: element.scaleX,
    scaleY: element.scaleY,
    rotation: element.rotation
  };

  const mergedTransform =
    transform === IDENTITY_TRANSFORM
      ? nextTransform
      : {
          x: applyTransform({ x: nextTransform.x, y: nextTransform.y }, transform).x,
          y: applyTransform({ x: nextTransform.x, y: nextTransform.y }, transform).y,
          scaleX: transform.scaleX * nextTransform.scaleX,
          scaleY: transform.scaleY * nextTransform.scaleY,
          rotation: transform.rotation + nextTransform.rotation
        };

  for (const child of element.children) {
    appendElement(converter, child, mergedTransform);
  }
};

const appendElement = (
  converter: MGLConverter,
  element: CanvasElement,
  transform: TransformContext = IDENTITY_TRANSFORM
) => {
  if (element.type === 'shape') {
    appendShape(converter, element, transform);
    return;
  }

  if (element.type === 'path') {
    appendPath(converter, element, transform);
    return;
  }

  if (element.type === 'group') {
    appendGroup(converter, element, transform);
  }
};

export const buildMimakiJob = (
  elements: CanvasElement[],
  documentSettings: DocumentSettings
): string => {
  const converter = new MGLConverter(documentSettings.dpi, documentSettings.unit);
  const cut = documentSettings.cutSettings;

  converter.init({
    pressure: cut?.pressure,
    speed: cut?.speed,
    offset: cut?.offset,
    tool: cut?.tool,
    includeConditionCommands: true
  });

  for (const element of elements) {
    appendElement(converter, element);
  }

  converter.finish();
  return converter.getOutput();
};
