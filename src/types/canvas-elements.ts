export type ShapeType = 'rectangle' | 'circle' | 'ellipse' | 'star' | 'polygon' | 'line' | 'arrow';

export interface ShapeElement {
  type: 'shape';
  shapeType: ShapeType;
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  visible: boolean;
  locked: boolean;
  name?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  radius?: number;
  radiusX?: number;
  radiusY?: number;
  sides?: number;
  innerRadius?: number;
  outerRadius?: number;
  points?: number[];
  cornerRadius?: number;
  dash?: number[];
  dashEnabled?: boolean;
  repeatGroupId?: string;
}

export interface TextElement {
  type: 'text';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  visible: boolean;
  locked: boolean;
  name?: string;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontStyle?: 'normal' | 'bold' | 'italic';
  textDecoration?: 'underline' | 'line-through' | '';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokePosition?: 'center' | 'outside';
  letterSpacing?: number;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  opacity?: number;
  repeatGroupId?: string;
}

export interface GroupElement {
  type: 'group';
  id: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  visible: boolean;
  locked: boolean;
  name?: string;
  opacity?: number;
  children: CanvasElement[];
  repeatGroupId?: string;
}

export interface PathElement {
  type: 'path';
  id: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  visible: boolean;
  locked: boolean;
  name?: string;
  data: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  repeatGroupId?: string;
}

export interface ImageElement {
  type: 'image';
  id: string;
  src: string;
  srcRef?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  visible: boolean;
  locked: boolean;
  name?: string;
  opacity?: number;
  repeatGroupId?: string;
}

export type CanvasElement = ImageElement | ShapeElement | TextElement | GroupElement | PathElement;

export interface LibraryItem {
  id: string;
  file: File;
  displayName: string;
  path: string;
}

export interface CutSettings {
  name: string;
  tool: string;
  speed: number;
  pressure: number;
  offset: number;
  overcutMm: number;
}

export type CutConditionMode = 'machine' | 'preset' | 'manual';
export type CutTraversalMode = 'mimaki' | 'ltr' | 'serpentine';

export interface DocumentSettings {
  width: number;
  height: number;
  dpi: number;
  unit: 'px' | 'cm' | 'mm';
  background: string;
  mirror?: boolean;
  aspectRatio?: string;
  widthCm?: number;
  heightCm?: number;
  name?: string;
  backgroundColor?: 'transparent' | 'white' | 'black';
  cutConditionMode?: CutConditionMode;
  cutTraversalMode?: CutTraversalMode;
  cutSettings?: CutSettings;
}

export interface HistoryState {
  images: CanvasElement[];
  selectedId: string | null;
  selectedIds?: string[];
}

export interface Document {
  id: string;
  settings: DocumentSettings;
  images: CanvasElement[];
  selectedIds: string[];
  history: HistoryState[];
  historyIndex: number;
  hasUnsavedChanges: boolean;
}
