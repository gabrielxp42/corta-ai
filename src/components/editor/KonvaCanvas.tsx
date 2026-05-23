import React, { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Rect, Circle, Text, Transformer, Path } from 'react-konva';
import { CanvasElement, ShapeElement, TextElement } from '../../types/canvas-elements';

interface KonvaCanvasProps {
  elements: CanvasElement[];
  width: number;
  height: number;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onUpdateElement: (id: string, attrs: any) => void;
  zoom: number;
}

export const KonvaCanvas: React.FC<KonvaCanvasProps> = ({
  elements,
  width,
  height,
  selectedIds,
  onSelect,
  onUpdateElement,
  zoom
}) => {
  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const [lastCenter, setLastCenter] = useState<any>(null);
  const [lastDist, setLastDist] = useState(0);

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

    const newScale = e.evt.deltaY < 0 ? oldScale * 1.1 : oldScale / 1.1;

    stage.scale({ x: newScale, y: newScale });

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
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

  const handleTouch = (e: any) => {
    const touch1 = e.evt.touches[0];
    const touch2 = e.evt.touches[1];

    if (touch1 && touch2) {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (stage.isDragging()) {
        stage.stopDrag();
      }

      const p1 = { x: touch1.clientX, y: touch1.clientY };
      const p2 = { x: touch2.clientX, y: touch2.clientY };

      if (!lastCenter) {
        setLastCenter(getCenter(p1, p2));
        setLastDist(getDistance(p1, p2));
        return;
      }

      const newDist = getDistance(p1, p2);
      const newCenter = getCenter(p1, p2);

      const distRatio = newDist / lastDist;
      const scale = stage.scaleX() * distRatio;

      stage.scale({ x: scale, y: scale });

      const dx = newCenter.x - lastCenter.x;
      const dy = newCenter.y - lastCenter.y;

      const newPos = {
        x: newCenter.x - (newCenter.x - stage.x()) * distRatio + dx,
        y: newCenter.y - (newCenter.y - stage.y()) * distRatio + dy,
      };

      stage.position(newPos);
      setLastDist(newDist);
      setLastCenter(newCenter);
    }
  };

  const handleTouchEnd = () => {
    setLastCenter(null);
    setLastDist(0);
  };

  const handleSelect = (e: any) => {
    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty) {
      onSelect([]);
      return;
    }

    const id = e.target.id();
    if (!id || e.target.getParent()?.className === 'Transformer') {
      return;
    }

    if (e.evt.shiftKey) {
      onSelect(selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id]);
    } else {
      onSelect([id]);
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
        width={window.innerWidth}
        height={window.innerHeight}
        draggable={selectedIds.length === 0}
        onWheel={handleWheel}
        onTouchMove={handleTouch}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleSelect}
        onTouchStart={handleSelect}
      >
        <Layer>
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
