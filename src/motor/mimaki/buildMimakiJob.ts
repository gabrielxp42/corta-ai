import { CanvasElement, CutTraversalMode, DocumentSettings, GroupElement, PathElement, ShapeElement } from '../../types/canvas-elements';
import { MGLConverter, Point } from '../../utils/mglConverter';

interface TransformMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

interface ElementBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface CutUnit {
  id: string;
  elements: CanvasElement[];
  bounds: ElementBounds;
  order: number;
}

const DEFAULT_SEGMENTS = 48;

const IDENTITY_TRANSFORM: TransformMatrix = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0
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

const applyTransform = (point: Point, transform: TransformMatrix): Point => ({
  x: point.x * transform.a + point.y * transform.c + transform.e,
  y: point.x * transform.b + point.y * transform.d + transform.f
});

const transformPoints = (points: Point[], transform: TransformMatrix): Point[] =>
  transform === IDENTITY_TRANSFORM
    ? points
    : points.map((point) => applyTransform(point, transform));

const multiplyTransform = (left: TransformMatrix, right: TransformMatrix): TransformMatrix => ({
  a: left.a * right.a + left.c * right.b,
  b: left.b * right.a + left.d * right.b,
  c: left.a * right.c + left.c * right.d,
  d: left.b * right.c + left.d * right.d,
  e: left.a * right.e + left.c * right.f + left.e,
  f: left.b * right.e + left.d * right.f + left.f
});

const createTransform = (x: number, y: number, scaleX: number, scaleY: number, rotation: number): TransformMatrix => {
  const angle = (rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    a: cos * scaleX,
    b: sin * scaleX,
    c: -sin * scaleY,
    d: cos * scaleY,
    e: x,
    f: y
  };
};

const addPolyline = (
  converter: MGLConverter,
  points: Point[],
  closePath = false,
  transform: TransformMatrix = IDENTITY_TRANSFORM
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

const pathNeedsFlattening = (data: string): boolean => /[CcQqSsTtAa]/.test(data);

const tokenizePath = (data: string): string[] => {
  const matches = data.match(/[MLHVZmlhvz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
  return matches ?? [];
};

const flattenPathData = (data: string): string => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', data);
  svg.appendChild(path);

  try {
    const totalLength = path.getTotalLength();
    if (!Number.isFinite(totalLength) || totalLength <= 0) {
      return data;
    }

    const sampleCount = Math.max(128, Math.ceil(totalLength / 1.2));
    const closesPath = /[Zz]\s*$/.test(data.trim());
    const points: Point[] = [];

    for (let index = 0; index <= sampleCount; index += 1) {
      const point = path.getPointAtLength((totalLength * index) / sampleCount);
      points.push({ x: point.x, y: point.y });
    }

    if (points.length < 2) {
      return data;
    }

    const commands = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];
    for (let index = 1; index < points.length; index += 1) {
      commands.push(`L ${points[index].x.toFixed(2)} ${points[index].y.toFixed(2)}`);
    }
    if (closesPath) {
      commands.push('Z');
    }

    return commands.join(' ');
  } catch {
    return data;
  }
};

const buildPathSegments = (element: PathElement): { points: Point[]; closed: boolean }[] => {
  const sourceData = pathNeedsFlattening(element.data) ? flattenPathData(element.data) : element.data;
  const tokens = tokenizePath(sourceData);
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

const appendShape = (converter: MGLConverter, element: ShapeElement, transform: TransformMatrix) => {
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

const appendPath = (converter: MGLConverter, element: PathElement, transform: TransformMatrix) => {
  if (!element.visible) {
    return;
  }

  const segments = buildPathSegments(element);
  for (const segment of segments) {
    addPolyline(converter, segment.points, segment.closed, transform);
  }
};

const appendGroup = (converter: MGLConverter, element: GroupElement, transform: TransformMatrix) => {
  if (!element.visible) {
    return;
  }

  const nextTransform = createTransform(
    element.x,
    element.y,
    element.scaleX,
    element.scaleY,
    element.rotation
  );
  const mergedTransform =
    transform === IDENTITY_TRANSFORM
      ? nextTransform
      : multiplyTransform(transform, nextTransform);

  for (const child of element.children) {
    appendElement(converter, child, mergedTransform);
  }
};

const appendElement = (
  converter: MGLConverter,
  element: CanvasElement,
  transform: TransformMatrix = IDENTITY_TRANSFORM
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

const createBoundsFromPoints = (points: Point[]): ElementBounds | null => {
  if (points.length === 0) {
    return null;
  }

  return points.reduce<ElementBounds>(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y)
    }),
    {
      minX: points[0].x,
      minY: points[0].y,
      maxX: points[0].x,
      maxY: points[0].y
    }
  );
};

const mergeBounds = (current: ElementBounds | null, next: ElementBounds | null): ElementBounds | null => {
  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  return {
    minX: Math.min(current.minX, next.minX),
    minY: Math.min(current.minY, next.minY),
    maxX: Math.max(current.maxX, next.maxX),
    maxY: Math.max(current.maxY, next.maxY)
  };
};

const getElementBounds = (
  element: CanvasElement,
  transform: TransformMatrix = IDENTITY_TRANSFORM
): ElementBounds | null => {
  if (element.type === 'shape') {
    if (element.shapeType === 'rectangle') {
      return createBoundsFromPoints(transformPoints(buildRectanglePoints(element), transform));
    }

    if (element.shapeType === 'circle') {
      const radius = (element.radius ?? element.width / 2) * element.scaleX;
      return createBoundsFromPoints(
        transformPoints(
          buildEllipsePoints(element.x + radius, element.y + radius, radius, radius, element.rotation),
          transform
        )
      );
    }

    if (element.shapeType === 'ellipse') {
      const radiusX = (element.radiusX ?? element.width / 2) * element.scaleX;
      const radiusY = (element.radiusY ?? element.height / 2) * element.scaleY;
      return createBoundsFromPoints(
        transformPoints(
          buildEllipsePoints(element.x + radiusX, element.y + radiusY, radiusX, radiusY, element.rotation),
          transform
        )
      );
    }

    if (element.shapeType === 'polygon') {
      const sides = Math.max(3, element.sides ?? 3);
      const radius = (element.radius ?? Math.min(element.width, element.height) / 2) * Math.max(element.scaleX, element.scaleY);
      return createBoundsFromPoints(
        transformPoints(
          buildPolygonPoints(element.x + element.width / 2, element.y + element.height / 2, radius, sides, element.rotation),
          transform
        )
      );
    }

    if (element.shapeType === 'star') {
      const pointsCount = Math.max(3, element.sides ?? 5);
      const outerRadius =
        (element.outerRadius ?? Math.min(element.width, element.height) / 2) * Math.max(element.scaleX, element.scaleY);
      const innerRadius = (element.innerRadius ?? outerRadius / 2) * Math.max(element.scaleX, element.scaleY);
      return createBoundsFromPoints(
        transformPoints(
          buildStarPoints(
            element.x + element.width / 2,
            element.y + element.height / 2,
            innerRadius,
            outerRadius,
            pointsCount,
            element.rotation
          ),
          transform
        )
      );
    }

    if (element.shapeType === 'line' || element.shapeType === 'arrow') {
      return createBoundsFromPoints(transformPoints(buildLinePoints(element), transform));
    }

    return null;
  }

  if (element.type === 'path') {
    return buildPathSegments(element).reduce<ElementBounds | null>(
      (bounds, segment) => mergeBounds(bounds, createBoundsFromPoints(transformPoints(segment.points, transform))),
      null
    );
  }

  if (element.type === 'group') {
    const nextTransform = createTransform(
      element.x,
      element.y,
      element.scaleX,
      element.scaleY,
      element.rotation
    );
    const mergedTransform =
      transform === IDENTITY_TRANSFORM
        ? nextTransform
        : multiplyTransform(transform, nextTransform);

    return element.children.reduce<ElementBounds | null>(
      (bounds, child) => mergeBounds(bounds, getElementBounds(child, mergedTransform)),
      null
    );
  }

  return null;
};

const getUnitCenterY = (bounds: ElementBounds) => (bounds.minY + bounds.maxY) / 2;
const getUnitCenterX = (bounds: ElementBounds) => (bounds.minX + bounds.maxX) / 2;
const getUnitHeight = (bounds: ElementBounds) => Math.max(1, bounds.maxY - bounds.minY);

const sortCutUnits = (units: CutUnit[], traversalMode: CutTraversalMode): CutUnit[] => {
  if (units.length < 2) {
    return units;
  }

  const orderedByRows = [...units].sort((left, right) => {
    if (Math.abs(left.bounds.minY - right.bounds.minY) > 2) {
      return left.bounds.minY - right.bounds.minY;
    }

    return left.order - right.order;
  });

  const rows: CutUnit[][] = [];
  let activeRow: CutUnit[] = [];
  let activeRowCenterY = 0;
  let activeRowAverageHeight = 0;

  for (const unit of orderedByRows) {
    const centerY = getUnitCenterY(unit.bounds);
    const height = getUnitHeight(unit.bounds);

    if (activeRow.length === 0) {
      activeRow = [unit];
      activeRowCenterY = centerY;
      activeRowAverageHeight = height;
      continue;
    }

    const rowTolerance = Math.max(6, activeRowAverageHeight * 0.45, height * 0.45);
    if (Math.abs(centerY - activeRowCenterY) <= rowTolerance) {
      activeRow.push(unit);
      activeRowCenterY =
        activeRow.reduce((total, entry) => total + getUnitCenterY(entry.bounds), 0) / activeRow.length;
      activeRowAverageHeight =
        activeRow.reduce((total, entry) => total + getUnitHeight(entry.bounds), 0) / activeRow.length;
      continue;
    }

    rows.push(activeRow);
    activeRow = [unit];
    activeRowCenterY = centerY;
    activeRowAverageHeight = height;
  }

  if (activeRow.length > 0) {
    rows.push(activeRow);
  }

  return rows.flatMap((row, rowIndex) => {
    const sortAscending = traversalMode === 'ltr' || (traversalMode === 'serpentine' && rowIndex % 2 === 1);

    return [...row].sort((left, right) => {
      const xDiff = getUnitCenterX(left.bounds) - getUnitCenterX(right.bounds);
      if (Math.abs(xDiff) > 2) {
        return sortAscending ? xDiff : -xDiff;
      }

      return left.order - right.order;
    });
  });
};

const buildCutUnits = (
  elements: CanvasElement[],
  rootTransform: TransformMatrix,
  traversalMode: CutTraversalMode
): CutUnit[] => {
  const groupedUnits = new Map<string, CutUnit>();
  const standaloneUnits: CutUnit[] = [];

  elements.forEach((element, index) => {
    const bounds = getElementBounds(element, rootTransform);
    if (!bounds) {
      return;
    }

    const groupId = element.repeatGroupId?.trim();
    if (!groupId) {
      standaloneUnits.push({
        id: element.id,
        elements: [element],
        bounds,
        order: index
      });
      return;
    }

    const existing = groupedUnits.get(groupId);
    if (existing) {
      existing.elements.push(element);
      existing.bounds = mergeBounds(existing.bounds, bounds) ?? existing.bounds;
      return;
    }

    groupedUnits.set(groupId, {
      id: groupId,
      elements: [element],
      bounds,
      order: index
    });
  });

  return sortCutUnits([...groupedUnits.values(), ...standaloneUnits], traversalMode);
};

export const buildMimakiJob = (
  elements: CanvasElement[],
  documentSettings: DocumentSettings
): string => {
  const converter = new MGLConverter(documentSettings.dpi, documentSettings.unit);
  const cut = documentSettings.cutSettings;
  const traversalMode = documentSettings.cutTraversalMode ?? 'mimaki';
  const rootTransform = documentSettings.mirror
    ? createTransform(documentSettings.width, 0, -1, 1, 0)
    : IDENTITY_TRANSFORM;

  converter.init({
    pressure: cut?.pressure,
    speed: cut?.speed,
    offset: cut?.offset,
    overcutMm: cut?.overcutMm,
    tool: cut?.tool,
    includeConditionCommands: documentSettings.cutConditionMode !== 'machine'
  });

  for (const unit of buildCutUnits(elements, rootTransform, traversalMode)) {
    for (const element of unit.elements) {
      appendElement(converter, element, rootTransform);
    }
  }

  converter.finish();
  return converter.getOutput();
};
