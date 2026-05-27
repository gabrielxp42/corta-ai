import React, { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Rect, Circle, Text, Transformer, Path, Group } from 'react-konva';
import { CanvasElement, ShapeElement, TextElement } from '../../types/canvas-elements';

interface KonvaCanvasProps {
  elements: CanvasElement[];
  width: number;
  height: number;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onUpdateElement: (id: string, attrs: any) => void;
  zoom: number;
  onZoomChange?: (zoom: number) => void;
  mirrored?: boolean;
}

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 6;
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

export const KonvaCanvas: React.FC<KonvaCanvasProps> = ({
  elements,
  width,
  height,
  selectedIds,
  onSelect,
  onUpdateElement,
  zoom,
  onZoomChange,
  mirrored = false
}) => {
  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const [viewportSize, setViewportSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  const lastCenterRef = useRef<any>(null);
  const lastDistRef = useRef(0);
  const isPinchingRef = useRef(false);

  const applyZoomAtPoint = (stage: any, nextZoom: number, focusPoint?: { x: number; y: number }) => {
    const clampedZoom = clampZoom(nextZoom);
    const targetPoint = focusPoint ?? {
      x: viewportSize.width / 2,
      y: viewportSize.height / 2,
    };
    const oldScale = stage.scaleX() || 1;
    const pointTo = {
      x: (targetPoint.x - stage.x()) / oldScale,
      y: (targetPoint.y - stage.y()) / oldScale,
    };

    stage.scale({ x: clampedZoom, y: clampedZoom });
    stage.position({
      x: targetPoint.x - pointTo.x * clampedZoom,
      y: targetPoint.y - pointTo.y * clampedZoom,
    });
    stage.batchDraw();
    onZoomChange?.(clampedZoom);
  };

  const fitCameraToCanvas = () => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const padding = 48;
    const scale = clampZoom(
      Math.min(
        (viewportSize.width - padding * 2) / Math.max(width, 1),
        (viewportSize.height - padding * 2) / Math.max(height, 1)
      )
    );

    stage.scale({ x: scale, y: scale });
    stage.position({
      x: (viewportSize.width - width * scale) / 2,
      y: (viewportSize.height - height * scale) / 2,
    });
    stage.batchDraw();
    onZoomChange?.(scale);
  };

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const currentScale = stage.scaleX() || 1;
    if (Math.abs(currentScale - zoom) > 0.001) {
      applyZoomAtPoint(stage, zoom);
    }
  }, [zoom]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    if (stage.x() === 0 && stage.y() === 0 && (stage.scaleX() === 1 || stage.scaleX() === 0)) {
      fitCameraToCanvas();
    }
  }, [viewportSize.width, viewportSize.height, width, height]);

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * 1.08 : oldScale / 1.08;
    applyZoomAtPoint(stage, newScale, pointer);
  };

  const getDistance = (p1: any, p2: any) => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  };

  const getCenter = (p1: any, p2: any) => {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    };
  };

  const handleTouchStart = (e: any) => {
    const touch1 = e.evt.touches[0];
    const touch2 = e.evt.touches[1];

    if (touch1 && touch2) {
      e.evt.preventDefault();
      isPinchingRef.current = true;
      const p1 = { x: touch1.clientX, y: touch1.clientY };
      const p2 = { x: touch2.clientX, y: touch2.clientY };
      lastCenterRef.current = getCenter(p1, p2);
      lastDistRef.current = getDistance(p1, p2);
    }
  };

  const handleTouchMove = (e: any) => {
    const touch1 = e.evt.touches[0];
    const touch2 = e.evt.touches[1];

    if (touch1 && touch2) {
      e.evt.preventDefault();
      isPinchingRef.current = true;
      const stage = stageRef.current;
      if (stage.isDragging()) {
        stage.stopDrag();
      }

      const p1 = { x: touch1.clientX, y: touch1.clientY };
      const p2 = { x: touch2.clientX, y: touch2.clientY };

      if (!lastCenterRef.current) {
        lastCenterRef.current = getCenter(p1, p2);
        lastDistRef.current = getDistance(p1, p2);
        return;
      }

      const newDist = getDistance(p1, p2);
      const newCenter = getCenter(p1, p2);
      if (!lastDistRef.current) {
        lastDistRef.current = newDist;
        lastCenterRef.current = newCenter;
        return;
      }

      const distRatio = newDist / lastDistRef.current;
      const nextScale = clampZoom(stage.scaleX() * distRatio);
      const dx = newCenter.x - lastCenterRef.current.x;
      const dy = newCenter.y - lastCenterRef.current.y;

      const pointTo = {
        x: (newCenter.x - stage.x()) / (stage.scaleX() || 1),
        y: (newCenter.y - stage.y()) / (stage.scaleY() || 1),
      };
      stage.scale({ x: nextScale, y: nextScale });
      const newPos = {
        x: newCenter.x - pointTo.x * nextScale + dx,
        y: newCenter.y - pointTo.y * nextScale + dy,
      };

      stage.position(newPos);
      stage.batchDraw();
      lastDistRef.current = newDist;
      lastCenterRef.current = newCenter;
      onZoomChange?.(nextScale);
    }
  };

  const handleTouchEnd = (e: any) => {
    if (e.evt.touches.length < 2) {
      lastCenterRef.current = null;
      lastDistRef.current = 0;
      window.setTimeout(() => {
        isPinchingRef.current = false;
      }, 40);
    }
  };

  const handleSelect = (e: any) => {
    if (isPinchingRef.current) {
      return;
    }

    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty) {
      onSelect([]);
      return;
    }

    const id = e.target.id();
    if (!id || e.target.getParent()?.className === 'Transformer') {
      return;
    }

    const clickedElement = elements.find((element) => element.id === id);
    const repeatGroupId = clickedElement?.repeatGroupId;
    const targetIds = repeatGroupId
      ? elements
          .filter((element) => element.repeatGroupId === repeatGroupId)
          .map((element) => element.id)
      : [id];

    if (e.evt.shiftKey) {
      const alreadySelected = targetIds.every((targetId) => selectedIds.includes(targetId));
      onSelect(
        alreadySelected
          ? selectedIds.filter((selectedId) => !targetIds.includes(selectedId))
          : Array.from(new Set([...selectedIds, ...targetIds]))
      );
    } else {
      onSelect(targetIds);
    }
  };

  useEffect(() => {
    if (trRef.current && stageRef.current) {
      const nodes = selectedIds
        .map(id => stageRef.current.findOne('#' + id))
        .filter((node: any) => node && node.getType() !== 'Transformer');
      
      trRef.current.nodes(nodes);
      trRef.current.getLayer().batchDraw();
    }
  }, [selectedIds, elements]);

  const renderElement = (el: CanvasElement) => {
    const commonProps = {
      id: el.id,
      x: el.x,
      y: el.y,
      rotation: el.rotation,
      scaleX: el.scaleX,
      scaleY: el.scaleY,
      draggable: !el.locked,
      listening: !el.locked,
      onClick: handleSelect,
      onTap: handleSelect,
      onDragEnd: (e: any) => {
        onUpdateElement(el.id, { x: e.target.x(), y: e.target.y() });
      },
      onTransformEnd: (e: any) => {
        const node = e.target;
        onUpdateElement(el.id, {
          x: node.x(),
          y: node.y(),
          scaleX: node.scaleX(),
          scaleY: node.scaleY(),
          rotation: node.rotation()
        });
      }
    };

    if (el.type === 'path') {
      const path = el as any;
      return (
        <Path
          key={el.id}
          {...commonProps}
          data={path.data}
          stroke={path.stroke || '#00f2ff'}
          strokeWidth={path.strokeWidth || 0.5}
          lineCap="round"
          lineJoin="round"
          fill={path.fill || 'transparent'}
        />
      );
    }

    if (el.type === 'shape') {
      const shape = el as ShapeElement;
      const style = {
        fill: shape.fill || 'transparent',
        stroke: '#00f2ff',
        strokeWidth: 1,
      };

      switch (shape.shapeType) {
        case 'rectangle':
          return <Rect key={el.id} {...commonProps} {...style} width={shape.width} height={shape.height} cornerRadius={shape.cornerRadius} />;
        case 'circle':
          return <Circle key={el.id} {...commonProps} {...style} radius={shape.radius || 50} />;
        default:
          return null;
      }
    }

    if (el.type === 'text') {
      const text = el as TextElement;
      return (
        <Text
          key={el.id}
          {...commonProps}
          text={text.text}
          fontSize={text.fontSize}
          fontFamily={text.fontFamily}
          fontStyle={text.fontStyle}
          fill="transparent"
          stroke="#00f2ff"
          strokeWidth={0.5}
        />
      );
    }

    return null;
  };

  return (
    <div className="bg-zinc-900 overflow-hidden rounded-lg border border-zinc-800 shadow-2xl w-full h-full flex items-center justify-center">
      <Stage
        ref={stageRef}
        width={viewportSize.width}
        height={viewportSize.height}
        draggable={selectedIds.length === 0}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleSelect}
        onTap={handleSelect}
        onDblTap={fitCameraToCanvas}
      >
        <Layer>
          <Group x={mirrored ? width : 0} scaleX={mirrored ? -1 : 1}>
            <Rect
              x={0}
              y={0}
              width={width}
              height={height}
              fill="#27272a"
              stroke="#00f2ff"
              strokeWidth={2 / zoom}
              shadowBlur={20}
              shadowColor="#000"
            />
            
            {elements.map(renderElement)}
          </Group>
          
          <Transformer
            ref={trRef}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 5 || newBox.height < 5) return oldBox;
              return newBox;
            }}
            rotateEnabled={true}
            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
            anchorSize={12}
            anchorCornerRadius={3}
            anchorFill="#00f2ff"
            anchorStroke="#000"
            borderStroke="#00f2ff"
            borderDash={[4, 4]}
          />
        </Layer>
      </Stage>
    </div>
  );
};
