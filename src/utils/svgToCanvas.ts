import { CanvasElement, PathElement } from '../types/canvas-elements';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface ParsedSvgResult {
  elements: CanvasElement[];
  dimensions: {
    width: number;
    height: number;
    minX: number;
    minY: number;
  };
}

const parseNumber = (value: string | null | undefined, fallback = 0): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const pointsToPathData = (points: Array<{ x: number; y: number }>, closePath = false): string => {
  if (points.length === 0) {
    return '';
  }

  const commands = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];
  for (let index = 1; index < points.length; index += 1) {
    commands.push(`L ${points[index].x.toFixed(2)} ${points[index].y.toFixed(2)}`);
  }

  if (closePath) {
    commands.push('Z');
  }

  return commands.join(' ');
};

const buildPathFromPoints = (pointsValue: string | null, closePath: boolean): string => {
  const rawPoints = (pointsValue ?? '')
    .trim()
    .split(/[\s,]+/)
    .map((value) => Number.parseFloat(value))
    .filter((value) => Number.isFinite(value));

  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index + 1 < rawPoints.length; index += 2) {
    points.push({ x: rawPoints[index], y: rawPoints[index + 1] });
  }

  return pointsToPathData(points, closePath);
};

const buildRectPath = (node: Element): string => {
  const x = parseNumber(node.getAttribute('x'));
  const y = parseNumber(node.getAttribute('y'));
  const width = parseNumber(node.getAttribute('width'));
  const height = parseNumber(node.getAttribute('height'));

  return pointsToPathData(
    [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height }
    ],
    true
  );
};

const buildLinePath = (node: Element): string => {
  const x1 = parseNumber(node.getAttribute('x1'));
  const y1 = parseNumber(node.getAttribute('y1'));
  const x2 = parseNumber(node.getAttribute('x2'));
  const y2 = parseNumber(node.getAttribute('y2'));

  return pointsToPathData(
    [
      { x: x1, y: y1 },
      { x: x2, y: y2 }
    ],
    false
  );
};

const buildEllipsePath = (node: Element, isCircle: boolean): string => {
  const cx = parseNumber(node.getAttribute('cx'));
  const cy = parseNumber(node.getAttribute('cy'));
  const rx = isCircle ? parseNumber(node.getAttribute('r')) : parseNumber(node.getAttribute('rx'));
  const ry = isCircle ? parseNumber(node.getAttribute('r')) : parseNumber(node.getAttribute('ry'));

  if (rx <= 0 || ry <= 0) {
    return '';
  }

  return [
    `M ${(cx - rx).toFixed(2)} ${cy.toFixed(2)}`,
    `A ${rx.toFixed(2)} ${ry.toFixed(2)} 0 1 0 ${(cx + rx).toFixed(2)} ${cy.toFixed(2)}`,
    `A ${rx.toFixed(2)} ${ry.toFixed(2)} 0 1 0 ${(cx - rx).toFixed(2)} ${cy.toFixed(2)}`,
    'Z'
  ].join(' ');
};

const getElementPathData = (node: Element): string => {
  switch (node.tagName.toLowerCase()) {
    case 'path':
      return node.getAttribute('d') ?? '';
    case 'polygon':
      return buildPathFromPoints(node.getAttribute('points'), true);
    case 'polyline':
      return buildPathFromPoints(node.getAttribute('points'), false);
    case 'rect':
      return buildRectPath(node);
    case 'line':
      return buildLinePath(node);
    case 'circle':
      return buildEllipsePath(node, true);
    case 'ellipse':
      return buildEllipsePath(node, false);
    default:
      return '';
  }
};

const splitPathSubpaths = (d: string): string[] => {
  const matches = d.match(/[Mm][^Mm]*/g);
  if (!matches || matches.length === 0) {
    return d.trim() ? [d] : [];
  }

  return matches
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
};

const pathNeedsFlattening = (d: string, transform?: string | null): boolean => {
  if (transform && transform.trim()) {
    return true;
  }

  return /[CcQqSsTtAa]/.test(d);
};

const sampleSvgPath = (helperSvg: SVGSVGElement, d: string, transform?: string | null): string => {
  const helperPath = document.createElementNS(SVG_NS, 'path');
  helperPath.setAttribute('d', d);
  if (transform) {
    helperPath.setAttribute('transform', transform);
  }
  helperSvg.appendChild(helperPath);

  try {
    const totalLength = helperPath.getTotalLength();
    const sampleCount = Math.max(120, Math.ceil(totalLength / 1.2));
    const points: Array<{ x: number; y: number }> = [];
    const matrix = helperPath.getCTM();
    const svgPoint = helperSvg.createSVGPoint();

    for (let index = 0; index <= sampleCount; index += 1) {
      const point = helperPath.getPointAtLength((index / sampleCount) * totalLength);

      if (matrix) {
        svgPoint.x = point.x;
        svgPoint.y = point.y;
        const transformed = svgPoint.matrixTransform(matrix);
        points.push({ x: transformed.x, y: transformed.y });
      } else {
        points.push({ x: point.x, y: point.y });
      }
    }

    const closesPath = /[Zz]\s*$/.test(d.trim());
    return pointsToPathData(points, closesPath);
  } finally {
    helperSvg.removeChild(helperPath);
  }
};

const createPathElement = (id: string, data: string): PathElement => ({
  id,
  type: 'path',
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  visible: true,
  locked: false,
  data,
  fill: 'transparent',
  stroke: '#00f2ff',
  strokeWidth: 0.5
});

const readViewBox = (svg: SVGSVGElement) => {
  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const [minX, minY, width, height] = viewBox.split(/[\s,]+/).map((value) => parseNumber(value));
    return { minX, minY, width, height };
  }

  return {
    minX: 0,
    minY: 0,
    width: parseNumber(svg.getAttribute('width'), 100),
    height: parseNumber(svg.getAttribute('height'), 100)
  };
};

export const parseSvgToElements = (content: string): ParsedSvgResult => {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(content, 'image/svg+xml');
  const svg = documentNode.querySelector('svg');

  if (!svg) {
    return {
      elements: [],
      dimensions: { width: 100, height: 100, minX: 0, minY: 0 }
    };
  }

  const bounds = readViewBox(svg);
  const sourceElements = Array.from(
    documentNode.querySelectorAll('path, polygon, polyline, rect, line, circle, ellipse')
  );

  const helperSvg = document.createElementNS(SVG_NS, 'svg');
  helperSvg.setAttribute('viewBox', `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`);
  helperSvg.style.position = 'absolute';
  helperSvg.style.width = '0';
  helperSvg.style.height = '0';
  helperSvg.style.opacity = '0';
  helperSvg.style.pointerEvents = 'none';
  helperSvg.style.left = '-99999px';
  helperSvg.style.top = '-99999px';
  document.body.appendChild(helperSvg);

  const elements = sourceElements
    .flatMap((node, index) => {
      const d = getElementPathData(node);
      if (!d) {
        return [];
      }

      return splitPathSubpaths(d)
        .map((subpath, subIndex) => {
          try {
            const transform = node.getAttribute('transform');
            if (!pathNeedsFlattening(subpath, transform)) {
              return createPathElement(`svg-path-${index}-${subIndex}`, subpath);
            }

            const flattened = sampleSvgPath(helperSvg, subpath, transform);
            return createPathElement(`svg-path-${index}-${subIndex}`, flattened);
          } catch {
            return createPathElement(`svg-path-${index}-${subIndex}`, subpath);
          }
        })
        .filter((element) => element.data.trim().length > 0);
    })
    .filter((element): element is PathElement => element !== null);

  document.body.removeChild(helperSvg);

  return {
    elements,
    dimensions: {
      width: bounds.width || 100,
      height: bounds.height || 100,
      minX: bounds.minX,
      minY: bounds.minY
    }
  };
};
