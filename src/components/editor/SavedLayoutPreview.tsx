import React, { useMemo } from 'react';
import { CanvasElement } from '../../types/canvas-elements';

interface SavedLayoutPreviewProps {
  elements: CanvasElement[];
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const PREVIEW_COLOR = '#00f2ff';

const isFiniteNumber = (value: number) => Number.isFinite(value);

const getElementBounds = (element: CanvasElement): Bounds | null => {
  if (element.type === 'path') {
    const numbers = element.data.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
    if (numbers.length < 2) {
      return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < numbers.length - 1; index += 2) {
      const x = numbers[index];
      const y = numbers[index + 1];
      if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    if (!isFiniteNumber(minX) || !isFiniteNumber(minY) || !isFiniteNumber(maxX) || !isFiniteNumber(maxY)) {
      return null;
    }

    return { minX, minY, maxX, maxY };
  }

  if (element.type === 'group') {
    const childBounds = element.children
      .map(getElementBounds)
      .filter((value): value is Bounds => value !== null);

    if (childBounds.length === 0) {
      return null;
    }

    return {
      minX: Math.min(...childBounds.map((bound) => bound.minX)) + element.x,
      minY: Math.min(...childBounds.map((bound) => bound.minY)) + element.y,
      maxX: Math.max(...childBounds.map((bound) => bound.maxX)) + element.x,
      maxY: Math.max(...childBounds.map((bound) => bound.maxY)) + element.y,
    };
  }

  const width = Math.max(0, (element.width ?? 0) * Math.abs(element.scaleX ?? 1));
  const height = Math.max(0, (element.height ?? 0) * Math.abs(element.scaleY ?? 1));

  return {
    minX: element.x,
    minY: element.y,
    maxX: element.x + width,
    maxY: element.y + height,
  };
};

const renderShape = (element: Extract<CanvasElement, { type: 'shape' }>, index: number) => {
  const commonProps = {
    key: `${element.id}-${index}`,
    fill: 'none',
    stroke: element.stroke || PREVIEW_COLOR,
    strokeWidth: Math.max(1, element.strokeWidth ?? 1),
    opacity: element.opacity ?? 1,
  };

  if (element.shapeType === 'circle') {
    const radius = element.radius ?? Math.min(element.width, element.height) / 2;
    return <circle {...commonProps} cx={element.x + radius} cy={element.y + radius} r={radius} />;
  }

  if (element.shapeType === 'ellipse') {
    return (
      <ellipse
        {...commonProps}
        cx={element.x + element.width / 2}
        cy={element.y + element.height / 2}
        rx={(element.radiusX ?? element.width / 2) * Math.abs(element.scaleX ?? 1)}
        ry={(element.radiusY ?? element.height / 2) * Math.abs(element.scaleY ?? 1)}
      />
    );
  }

  if (element.shapeType === 'line' || element.shapeType === 'arrow') {
    const points = element.points ?? [0, 0, element.width, element.height];
    return (
      <polyline
        {...commonProps}
        points={points.map((value, pointIndex) => (pointIndex % 2 === 0 ? value + element.x : value + element.y)).join(' ')}
      />
    );
  }

  if (element.shapeType === 'polygon' || element.shapeType === 'star') {
    const points = element.points ?? [];
    return (
      <polygon
        {...commonProps}
        points={points.map((value, pointIndex) => (pointIndex % 2 === 0 ? value + element.x : value + element.y)).join(' ')}
      />
    );
  }

  return (
    <rect
      {...commonProps}
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      rx={element.cornerRadius ?? 0}
      ry={element.cornerRadius ?? 0}
    />
  );
};

const renderElement = (element: CanvasElement, index: number): React.ReactNode => {
  if (element.visible === false) {
    return null;
  }

  if (element.type === 'group') {
    const transform = `translate(${element.x} ${element.y}) rotate(${element.rotation || 0}) scale(${element.scaleX ?? 1} ${element.scaleY ?? 1})`;
    return (
      <g key={`${element.id}-${index}`} transform={transform} opacity={element.opacity ?? 1}>
        {element.children.map((child, childIndex) => renderElement(child, childIndex))}
      </g>
    );
  }

  if (element.type === 'path') {
    return (
      <path
        key={`${element.id}-${index}`}
        d={element.data}
        fill={element.fill === 'none' ? 'none' : element.fill || 'none'}
        stroke={element.stroke || PREVIEW_COLOR}
        strokeWidth={Math.max(1, element.strokeWidth ?? 1)}
        opacity={element.opacity ?? 1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (element.type === 'shape') {
    return renderShape(element, index);
  }

  if (element.type === 'text') {
    return (
      <text
        key={`${element.id}-${index}`}
        x={element.x}
        y={element.y + element.fontSize}
        fill={element.stroke || element.fill || PREVIEW_COLOR}
        fontSize={element.fontSize}
        opacity={element.opacity ?? 1}
      >
        {element.text}
      </text>
    );
  }

  return null;
};

export const SavedLayoutPreview: React.FC<SavedLayoutPreviewProps> = ({ elements }) => {
  const bounds = useMemo(() => {
    const allBounds = elements
      .map(getElementBounds)
      .filter((value): value is Bounds => value !== null);

    if (allBounds.length === 0) {
      return null;
    }

    return {
      minX: Math.min(...allBounds.map((bound) => bound.minX)),
      minY: Math.min(...allBounds.map((bound) => bound.minY)),
      maxX: Math.max(...allBounds.map((bound) => bound.maxX)),
      maxY: Math.max(...allBounds.map((bound) => bound.maxY)),
    };
  }, [elements]);

  if (!bounds) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[9px] font-black uppercase tracking-[0.2em] text-zinc-700">
        Sem previa
      </div>
    );
  }

  const padding = 20;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);

  return (
    <svg
      viewBox={`${bounds.minX - padding} ${bounds.minY - padding} ${width + padding * 2} ${height + padding * 2}`}
      className="h-full w-full opacity-75 transition-opacity group-hover:opacity-100"
      preserveAspectRatio="xMidYMid meet"
    >
      {elements.map((element, index) => renderElement(element, index))}
    </svg>
  );
};
