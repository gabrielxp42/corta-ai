import { CanvasElement } from '../types/canvas-elements';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface ParsedVectorElements {
  elements: CanvasElement[];
  dimensions: {
    width: number;
    height: number;
    minX: number;
    minY: number;
  };
}

const parseViewBox = (value: string | null): [number, number, number, number] | null => {
  if (!value) {
    return null;
  }

  const parts = value
    .split(/[\s,]+/)
    .map(Number)
    .filter((part) => !Number.isNaN(part));

  if (parts.length !== 4) {
    return null;
  }

  return [parts[0], parts[1], parts[2], parts[3]];
};

const parseSize = (value: string | null, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const match = value.match(/-?\d*\.?\d+/);
  return match ? Number(match[0]) : fallback;
};

const pointsToPath = (pointsValue: string, closePath: boolean): string => {
  const values = pointsValue
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((point) => !Number.isNaN(point));

  if (values.length < 4) {
    return '';
  }

  let path = `M ${values[0]} ${values[1]}`;
  for (let index = 2; index < values.length; index += 2) {
    path += ` L ${values[index]} ${values[index + 1]}`;
  }

  if (closePath) {
    path += ' Z';
  }

  return path;
};

const elementToPathData = (element: Element): string => {
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'path') {
    return element.getAttribute('d') ?? '';
  }

  if (tagName === 'rect') {
    const x = Number(element.getAttribute('x') ?? 0);
    const y = Number(element.getAttribute('y') ?? 0);
    const width = Number(element.getAttribute('width') ?? 0);
    const height = Number(element.getAttribute('height') ?? 0);
    return `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} Z`;
  }

  if (tagName === 'circle') {
    const cx = Number(element.getAttribute('cx') ?? 0);
    const cy = Number(element.getAttribute('cy') ?? 0);
    const r = Number(element.getAttribute('r') ?? 0);
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy}`;
  }

  if (tagName === 'ellipse') {
    const cx = Number(element.getAttribute('cx') ?? 0);
    const cy = Number(element.getAttribute('cy') ?? 0);
    const rx = Number(element.getAttribute('rx') ?? 0);
    const ry = Number(element.getAttribute('ry') ?? 0);
    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`;
  }

  if (tagName === 'line') {
    const x1 = Number(element.getAttribute('x1') ?? 0);
    const y1 = Number(element.getAttribute('y1') ?? 0);
    const x2 = Number(element.getAttribute('x2') ?? 0);
    const y2 = Number(element.getAttribute('y2') ?? 0);
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  if (tagName === 'polygon') {
    return pointsToPath(element.getAttribute('points') ?? '', true);
  }

  if (tagName === 'polyline') {
    return pointsToPath(element.getAttribute('points') ?? '', false);
  }

  return '';
};

const flattenSinglePath = (svg: SVGSVGElement, pathData: string): string => {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathData);
  svg.appendChild(path);

  try {
    const totalLength = path.getTotalLength();
    if (!Number.isFinite(totalLength) || totalLength <= 0) {
      return pathData;
    }

    const sampleCount = Math.max(12, Math.ceil(totalLength / 2));
    let flattened = '';

    for (let index = 0; index <= sampleCount; index += 1) {
      const point = path.getPointAtLength((totalLength * index) / sampleCount);
      flattened += `${index === 0 ? 'M' : ' L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    }

    return flattened.trim();
  } finally {
    svg.removeChild(path);
  }
};

const flattenPathData = (svg: SVGSVGElement, pathData: string): string => {
  const subpaths = pathData.match(/[Mm][^Mm]*/g);
  if (!subpaths || subpaths.length === 0) {
    return flattenSinglePath(svg, pathData);
  }

  return subpaths
    .map((subpath) => flattenSinglePath(svg, subpath))
    .filter(Boolean)
    .join(' ');
};

const getPathBounds = (pathData: string) => {
  const numbers = pathData.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let index = 0; index < numbers.length; index += 2) {
    const x = numbers[index];
    const y = numbers[index + 1];

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { minX, minY, maxX, maxY };
};

export const parseSvgToElements = (svgText: string): ParsedVectorElements => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgElement = doc.querySelector('svg');

  if (!svgElement) {
    return {
      elements: [],
      dimensions: {
        width: 600,
        height: 1000,
        minX: 0,
        minY: 0
      }
    };
  }

  const sandbox = document.createElement('div');
  sandbox.style.position = 'absolute';
  sandbox.style.opacity = '0';
  sandbox.style.pointerEvents = 'none';
  sandbox.style.left = '-99999px';
  sandbox.innerHTML = svgText;
  document.body.appendChild(sandbox);

  const mountedSvg = sandbox.querySelector('svg') as SVGSVGElement | null;
  if (!mountedSvg) {
    document.body.removeChild(sandbox);
    return {
      elements: [],
      dimensions: {
        width: 600,
        height: 1000,
        minX: 0,
        minY: 0
      }
    };
  }

  const viewBox = parseViewBox(svgElement.getAttribute('viewBox'));
  const fallbackWidth = viewBox?.[2] ?? 100;
  const fallbackHeight = viewBox?.[3] ?? 100;
  const svgWidth = parseSize(svgElement.getAttribute('width'), fallbackWidth);
  const svgHeight = parseSize(svgElement.getAttribute('height'), fallbackHeight);

  const vectorNodes = Array.from(
    mountedSvg.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line')
  );

  const elements: CanvasElement[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  vectorNodes.forEach((node, index) => {
    const rawPathData = elementToPathData(node);
    if (!rawPathData) {
      return;
    }

    const flattenedPath = flattenPathData(mountedSvg, rawPathData);
    if (!flattenedPath) {
      return;
    }

    const bounds = getPathBounds(flattenedPath);
    if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)) {
      return;
    }

    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);

    elements.push({
      id: `svg-path-${index}`,
      type: 'path',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      locked: false,
      data: flattenedPath,
      stroke: '#00f2ff',
      strokeWidth: 0.5
    });
  });

  document.body.removeChild(sandbox);

  return {
    elements,
    dimensions: {
      width: Number.isFinite(maxX - minX) && maxX > minX ? maxX - minX : svgWidth,
      height: Number.isFinite(maxY - minY) && maxY > minY ? maxY - minY : svgHeight,
      minX: Number.isFinite(minX) ? minX : 0,
      minY: Number.isFinite(minY) ? minY : 0
    }
  };
};
