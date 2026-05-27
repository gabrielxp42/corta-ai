import React, { useEffect, useMemo, useState, useRef } from 'react';
import { KonvaCanvas } from './components/editor/KonvaCanvas';
import { CanvasElement, CutConditionMode, CutSettings, CutTraversalMode, DocumentSettings } from './types/canvas-elements';
import { injectCustomFonts, CUSTOM_FONT_FAMILIES } from './utils/fontLoader';
import { 
  Scissors, Play, Settings, Type, Square, Circle as CircleIcon, 
  Usb, FileUp, Menu, X, Plus, Layers, Trash2, 
  ChevronRight, ChevronLeft, Download, Monitor,
  Maximize2, Minimize2, ZoomIn, ZoomOut, Library, FolderOpen,
  ChevronUp, ChevronDown,
  AlertTriangle, CheckCircle2, Info
} from 'lucide-react';
import { MimakiOtg } from './motor/mimaki/plugins/mimakiOtgPlugin';
import { AndroidOtgTransport } from './motor/mimaki/transports/androidOtgTransport';
import { DownloadTransport } from './motor/mimaki/transports/downloadTransport';
import { BridgeHealthResponse, WindowsBridgeTransport } from './motor/mimaki/transports/windowsBridgeTransport';
import { sendMimakiJob } from './motor/mimaki/sendMimakiJob';
import { parseMglToElements } from './utils/mglParser';
import { parseSvgToElements } from './utils/svgToCanvas';
import { getCutSettingsSummary, snapMimakiOffset, snapMimakiPressure, snapMimakiSpeed, stepMimakiOffset, stepMimakiPressure, stepMimakiSpeed } from './utils/mimakiCutSettings';
import { LibraryItemPreview } from './components/editor/LibraryItemPreview';
import { SavedLayoutPreview } from './components/editor/SavedLayoutPreview';
import FluidGlass from './components/effects/FluidGlass';

const PRESETS: CutSettings[] = [
  { name: 'Vinil Adesivo', pressure: 50, speed: 20, offset: 0.3, overcutMm: 0.2, tool: 'CT1' },
  { name: 'Papel Comum', pressure: 60, speed: 40, offset: -1, overcutMm: 0, tool: 'PEN' },
  { name: 'CUT2 Panel', pressure: -1, speed: -1, offset: -1, overcutMm: 0, tool: 'CT2' },
  { name: 'CUT3 Panel', pressure: -1, speed: -1, offset: -1, overcutMm: 0, tool: 'CT3' },
];

const CUT_CONDITION_OPTIONS: Array<{ mode: CutConditionMode; label: string; description: string }> = [
  { mode: 'machine', label: 'Maquina', description: 'Usa o painel da Mimaki sem sobrescrever a condicao.' },
  { mode: 'preset', label: 'Preset', description: 'Aplica um material pronto com poucos toques.' },
  { mode: 'manual', label: 'Manual', description: 'Define ferramenta, velocidade e pressao aqui no app.' }
];

const CUT_TRAVERSAL_OPTIONS: Array<{ mode: CutTraversalMode; label: string; description: string }> = [
  { mode: 'mimaki', label: 'Mimaki', description: 'Percorre por fileira da direita para a esquerda.' },
  { mode: 'ltr', label: 'Esq. > Dir.', description: 'Percorre por fileira da esquerda para a direita.' },
  { mode: 'serpentine', label: 'Serpentina', description: 'Alterna o sentido a cada fileira.' }
];

const CUT_TOOL_OPTIONS = ['CT1', 'CT2', 'CT3', 'CT4', 'CT5', 'CT6', 'PEN', 'CRE'] as const;

type TransportKind = 'android-otg' | 'windows-bridge' | 'download';
type SidebarTab = 'tools' | 'settings' | 'layers';
type AssetModalTab = 'brands' | 'files';
type GalleryFillMode = 'quantity' | 'meters';
type GalleryOrientationMode = 'auto' | 'landscape' | 'portrait';

const clampCutOvercut = (value: number) => Math.min(2, Math.max(0, Number(value.toFixed(2))));

interface RemoteAssetFile {
  name: string;
  path: string;
  size: number;
  category: string;
}

interface ParsedGalleryAsset {
  file: RemoteAssetFile;
  elements: CanvasElement[];
  dimensions: {
    width: number;
    height: number;
    minX: number;
    minY: number;
  };
}

interface GalleryLayoutCandidate {
  rotated: boolean;
  scale: number;
  itemWidth: number;
  itemHeight: number;
  columns: number;
  rows: number;
  totalItems: number;
  sheetHeight: number;
}

interface RepeatLayoutState {
  asset: ParsedGalleryAsset;
  totalItems: number;
  columns: number;
  horizontalGap: number;
  verticalGap: number;
  sheetWidth: number;
  logoWidth: number;
  frameEnabled: boolean;
  frameMarginX: number;
  frameMarginY: number;
  orientationMode: GalleryOrientationMode;
}

interface MachineProfile {
  widthMm: number;
  label: string;
  source: string;
}

interface SavedLayout {
  id: string;
  name: string;
  createdAt: number;
  sourceLabel?: string;
  itemCount: number;
  elements: CanvasElement[];
  docSettings: DocumentSettings;
}

type FeedbackTone = 'info' | 'success' | 'warning' | 'error';

interface AppToast {
  id: string;
  title: string;
  message: string;
  tone: FeedbackTone;
}

type AppDialog =
  | {
      kind: 'confirm';
      title: string;
      message: string;
      tone: FeedbackTone;
      confirmLabel: string;
      cancelLabel: string;
      resolver: (value: boolean) => void;
    }
  | {
      kind: 'prompt';
      title: string;
      message: string;
      tone: FeedbackTone;
      confirmLabel: string;
      cancelLabel: string;
      placeholder?: string;
      initialValue: string;
      resolver: (value: string | null) => void;
    };

interface ElementBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const TRANSPORT_LABELS: Record<TransportKind, string> = {
  'android-otg': 'Android OTG',
  'windows-bridge': 'USB no Windows',
  download: 'Arquivo'
};

const TAB_LABELS: Record<SidebarTab, string> = {
  tools: 'Ferramentas',
  settings: 'Ajustes',
  layers: 'Camadas',
};

const TRANSPORT_ORDER: TransportKind[] = ['android-otg', 'windows-bridge', 'download'];
const MACHINE_WIDTH_DEFAULT = 580;
const GALLERY_MARGIN = 10;
const APP_PREVIEW_COLOR = '#00f2ff';
const SAVED_LAYOUTS_KEY = 'corta-ai.saved-layouts';
const SHEET_PRESETS = [
  { label: 'Padrao', width: 580, height: 1000 },
  { label: '1,5 m', width: 580, height: 1500 },
  { label: '2 m', width: 580, height: 2000 },
];
const mmToCm = (value: number) => value / 10;
const cmToMm = (value: number) => value * 10;
const isPathCommandToken = (token: string) => /^[MLZ]$/i.test(token);
const approxEqual = (a: number, b: number, tolerance = 0.5) => Math.abs(a - b) <= tolerance;
const SVG_NS = 'http://www.w3.org/2000/svg';
const pathBoundsCache = new Map<string, ElementBounds | null>();

const parsePathBoundsFallback = (data: string): ElementBounds | null => {
  const tokens = data.match(/[MLZmlz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < tokens.length; index += 1) {
    if (isPathCommandToken(tokens[index])) {
      continue;
    }

    const x = Number(tokens[index]);
    const y = Number(tokens[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    index += 1;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return { minX, minY, maxX, maxY };
};

const parsePathBounds = (data: string): ElementBounds | null => {
  const cached = pathBoundsCache.get(data);
  if (cached !== undefined) {
    return cached;
  }

  if (typeof document === 'undefined') {
    const fallback = parsePathBoundsFallback(data);
    pathBoundsCache.set(data, fallback);
    return fallback;
  }

  const svg = document.createElementNS(SVG_NS, 'svg');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', data);
  svg.appendChild(path);
  svg.style.position = 'absolute';
  svg.style.width = '0';
  svg.style.height = '0';
  svg.style.opacity = '0';
  svg.style.pointerEvents = 'none';
  svg.style.left = '-99999px';
  svg.style.top = '-99999px';
  document.body.appendChild(svg);

  try {
    const bbox = path.getBBox();
    const measured =
      Number.isFinite(bbox.x) &&
      Number.isFinite(bbox.y) &&
      Number.isFinite(bbox.width) &&
      Number.isFinite(bbox.height)
        ? {
            minX: bbox.x,
            minY: bbox.y,
            maxX: bbox.x + bbox.width,
            maxY: bbox.y + bbox.height
          }
        : parsePathBoundsFallback(data);

    pathBoundsCache.set(data, measured);
    return measured;
  } catch {
    const fallback = parsePathBoundsFallback(data);
    pathBoundsCache.set(data, fallback);
    return fallback;
  } finally {
    document.body.removeChild(svg);
  }
};

const getElementBounds = (element: CanvasElement): ElementBounds | null => {
  if (element.type === 'path') {
    return parsePathBounds(element.data);
  }

  if (element.type === 'shape' || element.type === 'text' || element.type === 'image') {
    const width = Math.max(0, (element.width ?? 0) * Math.abs(element.scaleX ?? 1));
    const height = Math.max(0, (element.height ?? 0) * Math.abs(element.scaleY ?? 1));
    return {
      minX: element.x,
      minY: element.y,
      maxX: element.x + width,
      maxY: element.y + height
    };
  }

  if (element.type === 'group') {
    const childBounds: ElementBounds[] = element.children
      .map((child) => getElementBounds(child))
      .filter((value): value is ElementBounds => value !== null);

    if (childBounds.length === 0) {
      return null;
    }

    return {
      minX: Math.min(...childBounds.map((bound) => bound.minX)) + element.x,
      minY: Math.min(...childBounds.map((bound) => bound.minY)) + element.y,
      maxX: Math.max(...childBounds.map((bound) => bound.maxX)) + element.x,
      maxY: Math.max(...childBounds.map((bound) => bound.maxY)) + element.y
    };
  }

  return null;
};

const getElementsBounds = (elements: CanvasElement[]): ElementBounds | null => {
  const bounds: ElementBounds[] = elements
    .map((element) => getElementBounds(element))
    .filter((value): value is ElementBounds => value !== null);

  if (bounds.length === 0) {
    return null;
  }

  return {
    minX: Math.min(...bounds.map((bound) => bound.minX)),
    minY: Math.min(...bounds.map((bound) => bound.minY)),
    maxX: Math.max(...bounds.map((bound) => bound.maxX)),
    maxY: Math.max(...bounds.map((bound) => bound.maxY))
  };
};

const getEffectiveDimensions = (elements: CanvasElement[], fallback: ParsedGalleryAsset['dimensions']) => {
  const bounds = getElementsBounds(elements);
  if (!bounds) {
    return fallback;
  }

  return {
    minX: bounds.minX,
    minY: bounds.minY,
    width: Math.max(1, bounds.maxX - bounds.minX),
    height: Math.max(1, bounds.maxY - bounds.minY)
  };
};

const inferMachineProfile = (transportKind: TransportKind, health: BridgeHealthResponse | null, connected: boolean): MachineProfile | null => {
  if (!connected) {
    return null;
  }

  if (transportKind === 'windows-bridge' && health?.device) {
    return {
      widthMm: MACHINE_WIDTH_DEFAULT,
      label: health.device.name || 'Mimaki conectada',
      source: 'Perfil CG-AR/A60R'
    };
  }

  if (transportKind === 'android-otg') {
    return {
      widthMm: MACHINE_WIDTH_DEFAULT,
      label: 'Mimaki via Android OTG',
      source: 'Perfil CG-AR/A60R'
    };
  }

  return null;
};

const isSvgFile = (file: RemoteAssetFile) => file.path.toLowerCase().endsWith('.svg');
const isLogoFile = (file: RemoteAssetFile) => file.path.toLowerCase().startsWith('logos/') && isSvgFile(file);
const isJobFile = (file: RemoteAssetFile) => !file.path.toLowerCase().startsWith('logos/') && !isSvgFile(file);
const getGalleryBrand = (file: RemoteAssetFile) => {
  const parts = file.path.split('/');
  return parts.length > 1 ? parts[1] : 'GERAL';
};

interface CompactStatProps {
  label: string;
  value: string;
  detail?: string;
}

const CompactStat: React.FC<CompactStatProps> = ({ label, value, detail }) => (
  <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/35 px-3 py-3">
    <div className="text-[8px] font-black uppercase tracking-[0.22em] text-zinc-500">{label}</div>
    <div className="mt-1 text-sm font-black leading-tight text-white">{value}</div>
    {detail ? <div className="mt-0.5 text-[9px] text-zinc-600">{detail}</div> : null}
  </div>
);

interface TouchStepperProps {
  label: string;
  value: string;
  onIncrement: () => void;
  onDecrement: () => void;
  helper?: string;
  touchUi?: boolean;
}

const triggerHapticFeedback = (duration = 8) => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return;
  }

  navigator.vibrate(duration);
};

const TouchStepper: React.FC<TouchStepperProps> = ({ label, value, onIncrement, onDecrement, helper, touchUi = false }) => {
  const holdTimeoutRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const repeatTickRef = useRef(0);

  const stopHold = () => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }

    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }

    repeatTickRef.current = 0;
  };

  useEffect(() => stopHold, []);

  const startHold = (action: () => void) => {
    stopHold();
    action();
    if (touchUi) {
      triggerHapticFeedback(10);
    }

    holdTimeoutRef.current = window.setTimeout(() => {
      holdIntervalRef.current = window.setInterval(() => {
        action();
        repeatTickRef.current += 1;
        if (touchUi && repeatTickRef.current % 3 === 0) {
          triggerHapticFeedback(6);
        }
      }, 90);
    }, 320);
  };

  const sharedButtonClass = `flex w-full items-center justify-center text-cyber-cyan transition-all hover:bg-cyber-cyan hover:text-black active:scale-[0.98] ${
    touchUi ? 'h-14' : 'h-12'
  }`;

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/45">
        <button
          type="button"
          onPointerDown={() => startHold(onIncrement)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onIncrement();
            }
          }}
          className={`${sharedButtonClass} border-b border-zinc-800`}
        >
          <ChevronUp size={touchUi ? 28 : 22} />
        </button>
        <div className={`flex flex-col items-center justify-center border-b border-zinc-800 text-center ${touchUi ? 'min-h-[92px] px-4 py-4' : 'min-h-[82px] px-4 py-3'}`}>
          <div className={`${touchUi ? 'text-[2rem]' : 'text-2xl'} font-black leading-none text-white`}>{value}</div>
          {helper ? (
            <div className="mt-2 text-[9px] uppercase tracking-[0.18em] text-zinc-600">
              {helper}
              {touchUi ? ' • segure para acelerar' : ''}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onPointerDown={() => startHold(onDecrement)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onDecrement();
            }
          }}
          className={sharedButtonClass}
        >
          <ChevronDown size={touchUi ? 28 : 22} />
        </button>
      </div>
      {touchUi && (
        <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-700">
          Toque ou segure
        </div>
      )}
    </div>
  );
};

const renderGalleryPreviewElement = (element: CanvasElement, key: string): React.ReactNode => {
  if (element.type === 'path') {
    return (
      <path
        key={key}
        d={element.data}
        fill={element.fill && element.fill !== 'transparent' ? APP_PREVIEW_COLOR : 'none'}
        stroke={element.stroke === 'none' ? 'none' : APP_PREVIEW_COLOR}
        strokeWidth={element.strokeWidth ?? 1}
        transform={`translate(${element.x} ${element.y}) scale(${element.scaleX} ${element.scaleY}) rotate(${element.rotation})`}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (element.type === 'shape' && element.shapeType === 'rectangle') {
    return (
      <rect
        key={key}
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        fill={element.fill && element.fill !== 'transparent' ? APP_PREVIEW_COLOR : 'none'}
        stroke={element.stroke === 'none' ? 'none' : APP_PREVIEW_COLOR}
        strokeWidth={element.strokeWidth ?? 1}
      />
    );
  }

  if (element.type === 'group') {
    return (
      <g
        key={key}
        transform={`translate(${element.x} ${element.y}) scale(${element.scaleX} ${element.scaleY}) rotate(${element.rotation})`}
      >
        {element.children.map((child, index) => renderGalleryPreviewElement(child, `${key}-${index}`))}
      </g>
    );
  }

  return null;
};

function App() {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(0.8);
  const [isSending, setIsSending] = useState(false);
  const [plotterConnected, setPlotterConnected] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>('tools');
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [assetModalTab, setAssetModalTab] = useState<AssetModalTab>('brands');
  const [libraryFiles, setLibraryFiles] = useState<RemoteAssetFile[]>([]);
  const [isFetchingLibrary, setIsFetchingLibrary] = useState(false);
  const [galleryFiles, setGalleryFiles] = useState<RemoteAssetFile[]>([]);
  const [isFetchingGallery, setIsFetchingGallery] = useState(false);
  const [activeGalleryBrand, setActiveGalleryBrand] = useState<string>('TODAS');
  const [selectedGalleryAsset, setSelectedGalleryAsset] = useState<ParsedGalleryAsset | null>(null);
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState(false);
  const [galleryFillMode, setGalleryFillMode] = useState<GalleryFillMode>('quantity');
  const [galleryOrientationMode, setGalleryOrientationMode] = useState<GalleryOrientationMode>('auto');
  const [galleryQuantity, setGalleryQuantity] = useState(50);
  const [galleryMeters, setGalleryMeters] = useState(1);
  const [galleryLogoWidth, setGalleryLogoWidth] = useState(70);
  const [galleryGap, setGalleryGap] = useState(4);
  const [gallerySheetWidth, setGallerySheetWidth] = useState(MACHINE_WIDTH_DEFAULT);
  const [galleryFrameEnabled, setGalleryFrameEnabled] = useState(false);
  const [galleryFrameMarginX, setGalleryFrameMarginX] = useState(cmToMm(0.1));
  const [galleryFrameMarginY, setGalleryFrameMarginY] = useState(cmToMm(0.1));
  const [isFrameConfigOpen, setIsFrameConfigOpen] = useState(false);
  const [isApplyingGallery, setIsApplyingGallery] = useState(false);
  const [repeatLayoutState, setRepeatLayoutState] = useState<RepeatLayoutState | null>(null);
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>(() => {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(SAVED_LAYOUTS_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed as SavedLayout[] : [];
    } catch (error) {
      console.error('Falha ao abrir montagens salvas.', error);
      return [];
    }
  });
  const [machineProfile, setMachineProfile] = useState<MachineProfile | null>(null);
  const [activeTransportKind, setActiveTransportKind] = useState<TransportKind>('download');
  const [availableTransports, setAvailableTransports] = useState<Record<TransportKind, boolean>>({
    'android-otg': false,
    'windows-bridge': false,
    download: true
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const [dialogState, setDialogState] = useState<AppDialog | null>(null);
  const [dialogInputValue, setDialogInputValue] = useState('');
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isSheetPanelExpanded, setIsSheetPanelExpanded] = useState(false);

  const [docSettings, setDocSettings] = useState<DocumentSettings>({
    width: 600,
    height: 1000,
    dpi: 300,
    unit: 'mm',
    background: '#000',
    mirror: true,
    cutConditionMode: 'preset',
    cutTraversalMode: 'mimaki',
    cutSettings: PRESETS[0]
  });

  const androidTransport = useMemo(() => new AndroidOtgTransport(), []);
  const windowsBridgeTransport = useMemo(() => new WindowsBridgeTransport(), []);
  const downloadTransport = useMemo(() => new DownloadTransport(), []);
  const transports = useMemo(
    () => ({
      'android-otg': androidTransport,
      'windows-bridge': windowsBridgeTransport,
      download: downloadTransport
    }),
    [androidTransport, windowsBridgeTransport, downloadTransport]
  );

  useEffect(() => {
    injectCustomFonts();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SAVED_LAYOUTS_KEY, JSON.stringify(savedLayouts));
  }, [savedLayouts]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const updatePointerMode = () => {
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsCoarsePointer(mediaQuery.matches || hasTouch);
    };

    updatePointerMode();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updatePointerMode);
      return () => mediaQuery.removeEventListener('change', updatePointerMode);
    }

    mediaQuery.addListener(updatePointerMode);
    return () => mediaQuery.removeListener(updatePointerMode);
  }, []);

  const removeToast = (toastId: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  };

  const showToast = (message: string, tone: FeedbackTone = 'info', title?: string) => {
    const toastId = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextToast: AppToast = {
      id: toastId,
      title:
        title ??
        (tone === 'success'
          ? 'Concluido'
          : tone === 'error'
            ? 'Algo deu errado'
            : tone === 'warning'
              ? 'Atencao'
              : 'Aviso'),
      message,
      tone,
    };

    setToasts((current) => [...current, nextToast].slice(-4));
    window.setTimeout(() => {
      removeToast(toastId);
    }, 4200);
  };

  const openConfirmDialog = (options: Omit<Extract<AppDialog, { kind: 'confirm' }>, 'kind' | 'resolver'>) =>
    new Promise<boolean>((resolve) => {
      setDialogState({
        kind: 'confirm',
        resolver: resolve,
        ...options,
      });
    });

  const openPromptDialog = (options: Omit<Extract<AppDialog, { kind: 'prompt' }>, 'kind' | 'resolver'>) =>
    new Promise<string | null>((resolve) => {
      setDialogInputValue(options.initialValue);
      setDialogState({
        kind: 'prompt',
        resolver: resolve,
        ...options,
      });
    });

  const closeDialog = () => {
    setDialogState(null);
    setDialogInputValue('');
  };

  const resolveDialog = (value: boolean | string | null) => {
    const currentDialog = dialogState;
    if (!currentDialog) {
      return;
    }

    closeDialog();

    if (currentDialog.kind === 'confirm') {
      currentDialog.resolver(Boolean(value));
      return;
    }

    currentDialog.resolver(typeof value === 'string' ? value : null);
  };

  const fetchAssetFiles = async (directory?: string): Promise<RemoteAssetFile[]> => {
    const query = new URLSearchParams({ t: Date.now().toString() });
    if (directory) {
      query.set('dir', directory);
    }

    try {
      const response = await fetch(`http://127.0.0.1:17871/library?${query.toString()}`);
      if (!response.ok) {
        throw new Error(`Erro no servidor: ${response.status}`);
      }

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || 'Falha ao listar arquivos.');
      }

      if (Array.isArray(data.files) && data.files.length > 0) {
        return data.files as RemoteAssetFile[];
      }
    } catch (error) {
      console.warn('Bridge local indisponivel para listar assets, usando manifesto embutido.', error);
    }

    const manifestResponse = await fetch(`/asset-manifest.json?t=${Date.now()}`);
    if (!manifestResponse.ok) {
      throw new Error(`Falha ao abrir manifesto local: ${manifestResponse.status}`);
    }

    const manifestData = await manifestResponse.json();
    const manifestFiles = Array.isArray(manifestData.files) ? manifestData.files as RemoteAssetFile[] : [];

    if (!directory) {
      return manifestFiles;
    }

    const normalizedDirectory = directory.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    return manifestFiles.filter((file) => file.path.startsWith(`${normalizedDirectory}/`) || file.path === normalizedDirectory);
  };

  const fetchTextAsset = async (assetPath: string): Promise<string> => {
    const response = await fetch(`/${assetPath}`);
    if (!response.ok) {
      throw new Error(`Falha ao abrir ${assetPath}`);
    }

    return response.text();
  };

  const fetchGallery = async () => {
    setIsFetchingGallery(true);
    try {
      const files = await fetchAssetFiles('logos');
      setGalleryFiles(files.filter(isLogoFile));
    } catch (error) {
      console.error('Erro ao buscar galeria:', error);
      setGalleryFiles([]);
    } finally {
      setIsFetchingGallery(false);
    }
  };

  const fetchLibrary = async () => {
    console.log('Iniciando busca na biblioteca...');
    setIsFetchingLibrary(true);
    try {
      const files = await fetchAssetFiles();
      const filteredFiles = files.filter(isJobFile);
      setLibraryFiles(filteredFiles);
      console.log(`Carregados ${filteredFiles.length || 0} arquivos.`);
    } catch (error) {
      console.error('Erro ao buscar biblioteca:', error);
      setLibraryFiles([]);
    } finally {
      setIsFetchingLibrary(false);
    }
  };

  const openAssetModal = (tab: AssetModalTab) => {
    setAssetModalTab(tab);
    setIsAssetModalOpen(true);

    if (tab === 'brands') {
      fetchGallery();
      return;
    }

    fetchLibrary();
  };

  const refreshActiveAssetTab = () => {
    if (assetModalTab === 'brands') {
      fetchGallery();
      return;
    }

    fetchLibrary();
  };

  const handleSaveCurrentLayout = async () => {
    if (elements.length === 0) {
      showToast('Monte uma folha no canvas antes de salvar.', 'warning', 'Nada para salvar');
      return;
    }

    const defaultName = selectedGalleryAsset
      ? `Montagem ${selectedGalleryAsset.file.name.replace(/\.[^/.]+$/, '')}`
      : `Montagem ${new Date().toLocaleDateString('pt-BR')}`;
    const name = (
      await openPromptDialog({
        title: 'Salvar montagem',
        message: 'Escolha um nome facil de reconhecer para encontrar essa montagem depois.',
        tone: 'info',
        initialValue: defaultName,
        placeholder: 'Ex.: Adidas peito 6,5 cm',
        confirmLabel: 'Salvar montagem',
        cancelLabel: 'Cancelar',
      })
    )?.trim();

    if (!name) {
      return;
    }

    const newLayout: SavedLayout = {
      id: `saved-layout-${Date.now()}`,
      name,
      createdAt: Date.now(),
      sourceLabel: selectedGalleryAsset?.file.name,
      itemCount: elements.length,
      elements: JSON.parse(JSON.stringify(elements)) as CanvasElement[],
      docSettings: JSON.parse(JSON.stringify(docSettings)) as DocumentSettings,
    };

    setSavedLayouts((current) => [newLayout, ...current].slice(0, 60));
    setIsAssetModalOpen(true);
    setAssetModalTab('files');
    showToast(`A montagem "${name}" foi salva em Arquivos prontos.`, 'success', 'Montagem salva');
  };

  const handleLoadSavedLayout = async (layout: SavedLayout) => {
    const confirmed = await openConfirmDialog({
      title: 'Carregar montagem salva',
      message: `Deseja carregar "${layout.name}" no canvas atual?`,
      tone: 'info',
      confirmLabel: 'Carregar no canvas',
      cancelLabel: 'Cancelar',
    });

    if (!confirmed) {
      return;
    }

    setElements(JSON.parse(JSON.stringify(layout.elements)) as CanvasElement[]);
    setRepeatLayoutState(null);
    setSelectedIds([]);
    setDocSettings(JSON.parse(JSON.stringify(layout.docSettings)) as DocumentSettings);
    setZoom(0.5);
    setIsAssetModalOpen(false);
    setSidebarOpen(true);
    setActiveTab('layers');
    showToast(`A montagem "${layout.name}" foi carregada no canvas.`, 'success', 'Montagem carregada');
  };

  const handleDeleteSavedLayout = async (layoutId: string) => {
    const confirmed = await openConfirmDialog({
      title: 'Excluir montagem',
      message: 'Deseja remover esta montagem salva da galeria?',
      tone: 'warning',
      confirmLabel: 'Excluir montagem',
      cancelLabel: 'Cancelar',
    });

    if (!confirmed) {
      return;
    }

    setSavedLayouts((current) => current.filter((layout) => layout.id !== layoutId));
    showToast('A montagem salva foi removida.', 'success', 'Montagem excluida');
  };

  const handleLibraryItemClick = async (file: RemoteAssetFile) => {
    try {
      const content = await fetchTextAsset(file.path);
      
      if (content) {
        const shouldLoad = await openConfirmDialog({
          title: 'Carregar arquivo pronto',
          message: `Deseja carregar "${file.name}" no canvas?`,
          tone: 'info',
          confirmLabel: 'Continuar',
          cancelLabel: 'Cancelar',
        });

        if (shouldLoad) {
          const result = parseMglToElements(content);
          if (result.elements.length > 0) {
            const shouldReplace = await openConfirmDialog({
              title: 'Substituir ou mesclar',
              message: 'Deseja limpar o canvas atual antes de carregar esse arquivo?',
              tone: 'warning',
              confirmLabel: 'Limpar e carregar',
              cancelLabel: 'Mesclar sem limpar',
            });

            if (shouldReplace) {
              setElements(result.elements);
              setRepeatLayoutState(null);
              setDocSettings({
                ...docSettings,
                width: Math.ceil(result.dimensions.width),
                height: Math.ceil(result.dimensions.height)
              });
            } else {
              // Mescla e centraliza (aproximadamente)
              const newElements = result.elements.map(el => ({
                ...el,
                id: `${el.id}-${Date.now()}`
              }));
              setElements([...elements, ...newElements]);
              setRepeatLayoutState(null);
            }
            showToast(`O arquivo "${file.name}" entrou no canvas.`, 'success', 'Arquivo carregado');
            setIsAssetModalOpen(false);
            setSidebarOpen(true);
            setActiveTab('layers');
          }
        }
      }
    } catch (error) {
      console.error('Erro ao carregar item da biblioteca:', error);
      showToast('Nao consegui carregar esse arquivo pronto.', 'error', 'Falha ao carregar');
    }
  };

  const handleOpenGalleryAsset = async (file: RemoteAssetFile) => {
    try {
      const content = await fetchTextAsset(file.path);
      const result = isSvgFile(file) ? parseSvgToElements(content) : parseMglToElements(content);

      if (result.elements.length === 0) {
        showToast('Nao consegui montar um preview valido dessa logo.', 'warning', 'Preview indisponivel');
        return;
      }

      const effectiveDimensions = getEffectiveDimensions(result.elements, result.dimensions);

      setSelectedGalleryAsset({
        file,
        elements: result.elements,
        dimensions: effectiveDimensions
      });
      setIsFrameConfigOpen(false);
      setIsGalleryModalOpen(true);
    } catch (error) {
      console.error('Erro ao abrir logo da galeria:', error);
      showToast('Nao consegui abrir essa logo agora.', 'error', 'Falha ao abrir');
    }
  };

  const cloneElementForGallery = (
    element: CanvasElement,
    offsetX: number,
    offsetY: number,
    scale: number,
    minX: number,
    minY: number,
    rotated: boolean,
    baseWidth: number,
    baseHeight: number,
    suffix: string,
    repeatGroupId?: string
  ): CanvasElement => {
    if (element.type === 'group') {
      return {
        ...element,
        id: `${element.id}-${suffix}`,
        x: offsetX + (element.x - minX) * scale,
        y: offsetY + (element.y - minY) * scale,
        scaleX: element.scaleX * scale,
        scaleY: element.scaleY * scale,
        locked: false,
        children: element.children.map((child, index) =>
          cloneElementForGallery(child, 0, 0, 1, 0, 0, rotated, baseWidth, baseHeight, `${suffix}-${index}`, repeatGroupId)
        ),
        repeatGroupId
      };
    }

    if (element.type === 'path') {
      const pathElement = element as any;
      return {
        ...pathElement,
        id: `${element.id}-${suffix}`,
        x: rotated
          ? offsetX + scale * (baseHeight + minY)
          : offsetX - minX * scale,
        y: rotated
          ? offsetY - minX * scale
          : offsetY - minY * scale,
        rotation: rotated ? 90 : 0,
        scaleX: scale,
        scaleY: scale,
        locked: false,
        visible: true,
        repeatGroupId
      };
    }

    const normalizedX = element.x - minX;
    const normalizedY = element.y - minY;
    const rotatedX = rotated ? baseHeight - normalizedY : normalizedX;
    const rotatedY = rotated ? normalizedX : normalizedY;

    return {
      ...element,
      id: `${element.id}-${suffix}`,
      x: rotatedX * scale + offsetX,
      y: rotatedY * scale + offsetY,
      rotation: rotated ? element.rotation + 90 : element.rotation,
      scaleX: element.scaleX * scale,
      scaleY: element.scaleY * scale,
      locked: false,
      visible: true,
      repeatGroupId
    } as CanvasElement;
  };

  const createGalleryFrameElement = (
    x: number,
    y: number,
    width: number,
    height: number,
    suffix: string,
    repeatGroupId?: string
  ): CanvasElement => ({
    type: 'shape',
    shapeType: 'rectangle',
    id: `frame-${suffix}`,
    x,
    y,
    width,
    height,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    locked: false,
    name: 'Frame',
    fill: 'transparent',
    stroke: APP_PREVIEW_COLOR,
    strokeWidth: 0.6,
    dash: [8, 4],
    dashEnabled: false,
    cornerRadius: 0,
    repeatGroupId,
  });

  const resolveRepeatLayout = (config: RepeatLayoutState): GalleryLayoutCandidate => {
    const baseWidth = Math.max(1, config.asset.dimensions.width);
    const baseHeight = Math.max(1, config.asset.dimensions.height);
    const targetLogoSize = Math.max(5, config.logoWidth);
    const baseScale = targetLogoSize / baseWidth;
    const frameMarginX = config.frameEnabled ? Math.max(0, config.frameMarginX) : 0;
    const frameMarginY = config.frameEnabled ? Math.max(0, config.frameMarginY) : 0;
    const evaluateCandidate = (rotated: boolean): GalleryLayoutCandidate => {
      const scale = baseScale;
      const contentWidth = Math.max(1, (rotated ? baseHeight : baseWidth) * scale);
      const contentHeight = Math.max(1, (rotated ? baseWidth : baseHeight) * scale);
      const itemWidth = contentWidth + frameMarginX * 2;
      const itemHeight = contentHeight + frameMarginY * 2;
      const usableWidth = Math.max(itemWidth, config.sheetWidth - GALLERY_MARGIN * 2);
      const maxColumns = Math.max(1, Math.floor((usableWidth + config.horizontalGap) / (itemWidth + config.horizontalGap)));
      const columns = Math.max(1, Math.min(config.columns, maxColumns));
      const rows = Math.max(1, Math.ceil(config.totalItems / columns));
      const sheetHeight = Math.max(
        100,
        Math.ceil(GALLERY_MARGIN * 2 + rows * itemHeight + Math.max(0, rows - 1) * config.verticalGap)
      );

      return {
        rotated,
        scale,
        itemWidth,
        itemHeight,
        columns,
        rows,
        totalItems: Math.max(1, config.totalItems),
        sheetHeight
      };
    };

    const normalCandidate = evaluateCandidate(false);
    const rotatedCandidate = evaluateCandidate(true);

    return (
      config.orientationMode === 'landscape'
        ? normalCandidate
        : config.orientationMode === 'portrait'
          ? rotatedCandidate
          : rotatedCandidate.sheetHeight < normalCandidate.sheetHeight
            ? rotatedCandidate
            : normalCandidate
    );
  };

  const buildRepeatLayout = (config: RepeatLayoutState) => {
    const baseWidth = Math.max(1, config.asset.dimensions.width);
    const baseHeight = Math.max(1, config.asset.dimensions.height);
    const frameMarginX = config.frameEnabled ? Math.max(0, config.frameMarginX) : 0;
    const frameMarginY = config.frameEnabled ? Math.max(0, config.frameMarginY) : 0;
    const layout = resolveRepeatLayout(config);

    const nextElements: CanvasElement[] = [];

    for (let index = 0; index < layout.totalItems; index += 1) {
      const row = Math.floor(index / layout.columns);
      const col = index % layout.columns;
      const itemsInRow = Math.min(layout.columns, layout.totalItems - row * layout.columns);
      const rowWidth = itemsInRow * layout.itemWidth + Math.max(0, itemsInRow - 1) * config.horizontalGap;
      const rowStartX = Math.max(GALLERY_MARGIN, (config.sheetWidth - rowWidth) / 2);
      const offsetX = rowStartX + col * (layout.itemWidth + config.horizontalGap);
      const offsetY = GALLERY_MARGIN + row * (layout.itemHeight + config.verticalGap);
      const suffix = `${Date.now()}-${index}`;
      const repeatGroupId = `repeat-${suffix}`;

      if (config.frameEnabled) {
        nextElements.push(
          createGalleryFrameElement(offsetX, offsetY, layout.itemWidth, layout.itemHeight, suffix, repeatGroupId)
        );
      }

      config.asset.elements.forEach((element, elementIndex) => {
        nextElements.push(
          cloneElementForGallery(
            element,
            offsetX + frameMarginX,
            offsetY + frameMarginY,
            layout.scale,
            config.asset.dimensions.minX,
            config.asset.dimensions.minY,
            layout.rotated,
            baseWidth,
            baseHeight,
            `${suffix}-${elementIndex}`,
            repeatGroupId
          )
        );
      });
    }

    return {
      elements: nextElements,
      sheetHeight: layout.sheetHeight,
      columns: layout.columns,
      rows: layout.rows,
      rotated: layout.rotated,
      itemWidth: layout.itemWidth,
      itemHeight: layout.itemHeight
    };
  };

  const handleApplyGalleryLayout = () => {
    if (!selectedGalleryAsset) {
      return;
    }

    const baseWidth = Math.max(1, selectedGalleryAsset.dimensions.width);
    const baseHeight = Math.max(1, selectedGalleryAsset.dimensions.height);
    const targetLogoSize = Math.max(5, galleryLogoWidth);
    const baseScale = targetLogoSize / baseWidth;
    const frameMarginX = galleryFrameEnabled ? Math.max(0, galleryFrameMarginX) : 0;
    const frameMarginY = galleryFrameEnabled ? Math.max(0, galleryFrameMarginY) : 0;
    const sheetWidth = Math.max(targetLogoSize + GALLERY_MARGIN * 2, gallerySheetWidth);
    const evaluateCandidate = (rotated: boolean): GalleryLayoutCandidate => {
      const scale = baseScale;
      const contentWidth = Math.max(1, (rotated ? baseHeight : baseWidth) * scale);
      const contentHeight = Math.max(1, (rotated ? baseWidth : baseHeight) * scale);
      const itemWidth = contentWidth + frameMarginX * 2;
      const itemHeight = contentHeight + frameMarginY * 2;
      const usableWidth = Math.max(itemWidth, sheetWidth - GALLERY_MARGIN * 2);
      const columns = Math.max(1, Math.floor((usableWidth + galleryGap) / (itemWidth + galleryGap)));

      if (galleryFillMode === 'meters') {
        const sheetHeight = Math.max(100, Math.round(galleryMeters * 1000));
        const rows = Math.max(1, Math.floor((sheetHeight - GALLERY_MARGIN * 2 + galleryGap) / (itemHeight + galleryGap)));
        return {
          rotated,
          scale,
          itemWidth,
          itemHeight,
          columns,
          rows,
          totalItems: columns * rows,
          sheetHeight
        };
      }

      const totalItems = Math.max(1, Math.round(galleryQuantity));
      const rows = Math.max(1, Math.ceil(totalItems / columns));
      const sheetHeight = Math.max(
        100,
        Math.ceil(GALLERY_MARGIN * 2 + rows * itemHeight + Math.max(0, rows - 1) * galleryGap)
      );

      return {
        rotated,
        scale,
        itemWidth,
        itemHeight,
        columns,
        rows,
        totalItems,
        sheetHeight
      };
    };

    const normalCandidate = evaluateCandidate(false);
    const rotatedCandidate = evaluateCandidate(true);
    const layout =
      galleryOrientationMode === 'landscape'
        ? normalCandidate
        : galleryOrientationMode === 'portrait'
          ? rotatedCandidate
          : galleryFillMode === 'meters'
            ? rotatedCandidate.totalItems > normalCandidate.totalItems
              ? rotatedCandidate
              : normalCandidate
            : rotatedCandidate.sheetHeight < normalCandidate.sheetHeight
              ? rotatedCandidate
              : normalCandidate;

    setIsApplyingGallery(true);
    const nextRepeatState: RepeatLayoutState = {
      asset: selectedGalleryAsset,
      totalItems: layout.totalItems,
      columns: layout.columns,
      horizontalGap: Math.max(0, galleryGap),
      verticalGap: Math.max(0, galleryGap),
      sheetWidth,
      logoWidth: galleryLogoWidth,
      frameEnabled: galleryFrameEnabled,
      frameMarginX: Math.max(0, galleryFrameMarginX),
      frameMarginY: Math.max(0, galleryFrameMarginY),
      orientationMode: galleryOrientationMode
    };
    const builtLayout = buildRepeatLayout(nextRepeatState);
    setElements(builtLayout.elements);
    setSelectedIds([]);
    setRepeatLayoutState(nextRepeatState);
    setDocSettings((current) => ({
      ...current,
      width: Math.ceil(sheetWidth),
      height: Math.ceil(builtLayout.sheetHeight)
    }));
    setZoom(0.45);
    setIsApplyingGallery(false);
    setIsGalleryModalOpen(false);
    setIsAssetModalOpen(false);
    setSidebarOpen(true);
    setActiveTab('settings');
  };

  const currentCanvasSummary = useMemo(() => ({
    widthCm: mmToCm(docSettings.width).toFixed(1),
    heightCm: mmToCm(docSettings.height).toFixed(1),
    heightMeters: (docSettings.height / 1000).toFixed(2)
  }), [docSettings.height, docSettings.width]);
  const activeCutSettings = useMemo(
    () => docSettings.cutSettings ?? PRESETS[0],
    [docSettings.cutSettings]
  );
  const cutConditionSummary = useMemo(() => {
    if (docSettings.cutConditionMode === 'machine') {
      return 'A Mimaki usa a condicao salva no proprio painel.';
    }

    return getCutSettingsSummary(activeCutSettings);
  }, [activeCutSettings, docSettings.cutConditionMode]);
  const cutTraversalLabel = useMemo(
    () => CUT_TRAVERSAL_OPTIONS.find((option) => option.mode === (docSettings.cutTraversalMode ?? 'mimaki'))?.label ?? 'Mimaki',
    [docSettings.cutTraversalMode]
  );
  const repeatLayoutPreview = useMemo(
    () => (repeatLayoutState ? resolveRepeatLayout(repeatLayoutState) : null),
    [repeatLayoutState]
  );
  const repeatOrientationComparison = useMemo(() => {
    if (!repeatLayoutState) {
      return null;
    }

    const normal = resolveRepeatLayout({ ...repeatLayoutState, orientationMode: 'landscape' });
    const rotated = resolveRepeatLayout({ ...repeatLayoutState, orientationMode: 'portrait' });
    const best: GalleryOrientationMode = rotated.sheetHeight < normal.sheetHeight ? 'portrait' : 'landscape';

    return { normal, rotated, best };
  }, [repeatLayoutState]);

  const formatNumberPtBr = (value: number, digits = 1) =>
    value.toLocaleString('pt-BR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  const formatCmFromMm = (value: number, digits = 1) => formatNumberPtBr(mmToCm(value), digits);
  const normalizeCutSettings = (settings: CutSettings): CutSettings => {
    const nextTool = settings.tool || 'CT1';
    return {
      ...settings,
      speed: settings.speed > 0 ? snapMimakiSpeed(settings.speed) : settings.speed,
      pressure: settings.pressure > 0 ? snapMimakiPressure(settings.pressure, nextTool) : settings.pressure,
      offset: settings.offset >= 0 ? snapMimakiOffset(settings.offset) : settings.offset,
      overcutMm: clampCutOvercut(settings.overcutMm ?? 0)
    };
  };
  const updateManualCutSettings = (partial: Partial<CutSettings>) => {
    setDocSettings((current) => ({
      ...current,
      cutConditionMode: 'manual',
      cutSettings: normalizeCutSettings({
        ...(current.cutSettings ?? PRESETS[0]),
        ...partial,
        name: partial.name ?? 'Manual'
      })
    }));
  };
  const adjustManualCutSetting = (key: 'speed' | 'pressure' | 'offset' | 'overcutMm', direction: -1 | 1) => {
    const currentValue = activeCutSettings[key];
    if (key === 'speed') {
      updateManualCutSettings({ speed: stepMimakiSpeed(currentValue > 0 ? currentValue : 20, direction) });
      return;
    }

    if (key === 'pressure') {
      updateManualCutSettings({
        pressure: stepMimakiPressure(currentValue > 0 ? currentValue : 50, activeCutSettings.tool, direction)
      });
      return;
    }

    if (key === 'offset') {
      updateManualCutSettings({ offset: stepMimakiOffset(currentValue >= 0 ? currentValue : 0.3, direction) });
      return;
    }

    updateManualCutSettings({
      overcutMm: clampCutOvercut((currentValue > 0 ? currentValue : 0) + direction * 0.05)
    });
  };
  const currentHeightMetersLabel = formatNumberPtBr(docSettings.height / 1000, 2);
  const previewLogoWidthMm = Math.max(5, galleryLogoWidth);
  const previewLogoHeightMm = selectedGalleryAsset
    ? Math.max(1, selectedGalleryAsset.dimensions.height * (previewLogoWidthMm / Math.max(1, selectedGalleryAsset.dimensions.width)))
    : 0;
  const previewFrameWidthMm = previewLogoWidthMm + (galleryFrameEnabled ? galleryFrameMarginX * 2 : 0);
  const previewFrameHeightMm = previewLogoHeightMm + (galleryFrameEnabled ? galleryFrameMarginY * 2 : 0);
  const previewLogoMaxMm = Math.max(previewLogoWidthMm, previewLogoHeightMm, 1);
  const previewLogoScale = 56 / previewLogoMaxMm;
  const previewLogoWidthPercent = Math.max(24, Math.min(72, previewLogoWidthMm * previewLogoScale));
  const previewLogoHeightPercent = Math.max(20, Math.min(72, previewLogoHeightMm * previewLogoScale));
  const previewFrameWidthPercent = galleryFrameEnabled
    ? Math.min(92, previewLogoWidthPercent + galleryFrameMarginX * previewLogoScale * 2)
    : previewLogoWidthPercent;
  const previewFrameHeightPercent = galleryFrameEnabled
    ? Math.min(92, previewLogoHeightPercent + galleryFrameMarginY * previewLogoScale * 2)
    : previewLogoHeightPercent;
  const previewViewBox = selectedGalleryAsset
    ? `${selectedGalleryAsset.dimensions.minX} ${selectedGalleryAsset.dimensions.minY} ${selectedGalleryAsset.dimensions.width} ${selectedGalleryAsset.dimensions.height}`
    : '0 0 100 100';
  const repeatLayoutRows = repeatLayoutPreview?.rows ?? 0;
  const isBestRepeatOrientationActive = Boolean(
    repeatLayoutState &&
    repeatOrientationComparison &&
    repeatLayoutState.orientationMode === repeatOrientationComparison.best
  );
  const useLightweightGalleryEffects = useMemo(() => {
    if (typeof window === 'undefined') {
      return isCoarsePointer;
    }

    const prefersReducedMotion = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 6;
    const lowCpu = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 6;

    return isCoarsePointer || prefersReducedMotion || lowMemory || lowCpu;
  }, [isCoarsePointer]);
  const galleryCardPerformanceStyle = useMemo(
    () => (useLightweightGalleryEffects
      ? ({ contentVisibility: 'auto', containIntrinsicSize: '320px' } as React.CSSProperties)
      : undefined),
    [useLightweightGalleryEffects]
  );

  const galleryBrands = useMemo(() => {
    const brands = Array.from(new Set(galleryFiles.map(getGalleryBrand))).sort();
    return ['TODAS', ...brands];
  }, [galleryFiles]);

  const visibleGalleryFiles = useMemo(() => {
    if (activeGalleryBrand === 'TODAS') {
      return galleryFiles;
    }

    return galleryFiles.filter((file) => getGalleryBrand(file) === activeGalleryBrand);
  }, [activeGalleryBrand, galleryFiles]);

  useEffect(() => {
    let cancelled = false;

    const detectAvailableTransports = async () => {
      const nextAvailability: Record<TransportKind, boolean> = {
        'android-otg': await androidTransport.isAvailable(),
        'windows-bridge': await windowsBridgeTransport.isAvailable(),
        download: await downloadTransport.isAvailable()
      };

      if (cancelled) {
        return;
      }

      setAvailableTransports(nextAvailability);
      setActiveTransportKind(currentKind => {
        if (nextAvailability[currentKind]) {
          return currentKind;
        }

        return TRANSPORT_ORDER.find(kind => nextAvailability[kind]) ?? 'download';
      });
    };

    detectAvailableTransports();
    return () => {
      cancelled = true;
    };
  }, [androidTransport, windowsBridgeTransport, downloadTransport]);

  useEffect(() => {
    let cancelled = false;

    const checkConnection = async () => {
      try {
        let connected = false;
        let nextProfile: MachineProfile | null = null;

        if (activeTransportKind === 'android-otg') {
          const result = await MimakiOtg.isConnected();
          connected = result.connected;
          nextProfile = inferMachineProfile(activeTransportKind, null, connected);
        } else if (activeTransportKind === 'windows-bridge') {
          const health = await windowsBridgeTransport.getHealth();
          connected = Boolean(health?.ok && health.connected);
          nextProfile = inferMachineProfile(activeTransportKind, health, connected);
        }

        if (!cancelled) {
          setPlotterConnected(connected);
          setMachineProfile(nextProfile);
        }
      } catch {
        if (!cancelled) {
          setPlotterConnected(false);
          setMachineProfile(null);
        }
      }
    };

    const interval = setInterval(checkConnection, 3000);
    checkConnection();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeTransportKind, windowsBridgeTransport]);

  useEffect(() => {
    if (!machineProfile) {
      return;
    }

    setGallerySheetWidth((current) => (
      approxEqual(current, MACHINE_WIDTH_DEFAULT) || approxEqual(current, machineProfile.widthMm)
        ? machineProfile.widthMm
        : current
    ));

    setDocSettings((current) => {
      if (elements.length > 0 && !approxEqual(current.width, MACHINE_WIDTH_DEFAULT) && !approxEqual(current.width, machineProfile.widthMm)) {
        return current;
      }

      return {
        ...current,
        width: machineProfile.widthMm
      };
    });
  }, [elements.length, machineProfile]);

  useEffect(() => {
    if (!repeatLayoutState) {
      return;
    }

    const builtLayout = buildRepeatLayout(repeatLayoutState);
    setElements(builtLayout.elements);
    setSelectedIds([]);
    setDocSettings((current) => ({
      ...current,
      width: Math.ceil(repeatLayoutState.sheetWidth),
      height: Math.ceil(builtLayout.sheetHeight)
    }));
  }, [repeatLayoutState]);

  const handleSendToPlotter = async () => {
    if (elements.length === 0) {
      showToast('Adicione elementos no canvas antes de iniciar o corte.', 'warning', 'Nada para cortar');
      return;
    }

    setIsSending(true);
    try {
      const transport = transports[activeTransportKind];
      const result = await sendMimakiJob({
        elements,
        documentSettings: docSettings,
        transport
      });
      showToast(result.message || 'Job enviado com sucesso.', 'success', 'Envio concluido');
    } catch (error) {
      console.error('Erro ao enviar:', error);
      showToast('Falha ao enviar para a plotter.', 'error', 'Envio interrompido');
    } finally {
      setIsSending(false);
    }
  };

  const handleImportAndSend = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsSending(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result as string;
        if (content) {
          const shouldOpenAsSheet = await openConfirmDialog({
            title: 'Abrir arquivo importado',
            message: 'Este arquivo parece ser um job completo. Deseja limpar o canvas e abrir como uma nova folha de corte?',
            tone: 'info',
            confirmLabel: 'Abrir nova folha',
            cancelLabel: 'Enviar direto',
          });

          if (shouldOpenAsSheet) {
            const result = parseMglToElements(content);
            if (result.elements.length > 0) {
              setElements(result.elements);
              setRepeatLayoutState(null);
              setDocSettings({
                ...docSettings,
                width: Math.ceil(result.dimensions.width),
                height: Math.ceil(result.dimensions.height)
              });
              setZoom(0.5); // Ajusta o zoom para ver a folha toda
              showToast(
                `Folha ajustada para ${mmToCm(result.dimensions.width).toFixed(1)} x ${mmToCm(result.dimensions.height).toFixed(1)} cm.`,
                'success',
                'Job carregado'
              );
            }
          } else {
            await transports[activeTransportKind].send(content);
            showToast('Arquivo enviado usando o transporte selecionado.', 'success', 'Envio iniciado');
          }
        }
      };
      reader.readAsText(file);
    } catch (error) {
      console.error('Erro:', error);
      showToast('Falha ao importar ou disparar esse arquivo.', 'error', 'Importacao falhou');
    } finally {
      setIsSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addRectangle = () => {
    const newRect: any = {
      id: `rect-${Date.now()}`,
      type: 'shape',
      shapeType: 'rectangle',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      locked: false,
      stroke: '#00f2ff',
      strokeWidth: 2
    };
    setElements([...elements, newRect]);
    setRepeatLayoutState(null);
    setSelectedIds([newRect.id]);
  };

  const addText = () => {
    const newText: any = {
      id: `text-${Date.now()}`,
      type: 'text',
      text: 'TEXTO CORTE',
      x: 100,
      y: 300,
      fontSize: 80,
      fontFamily: CUSTOM_FONT_FAMILIES[0] || 'Arial',
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      locked: false,
      stroke: '#00f2ff',
      strokeWidth: 2
    };
    setElements([...elements, newText]);
    setRepeatLayoutState(null);
    setSelectedIds([newText.id]);
  };

  const addCircle = () => {
    const newCircle: any = {
      id: `circle-${Date.now()}`,
      type: 'shape',
      shapeType: 'circle',
      x: 360,
      y: 220,
      width: 120,
      height: 120,
      radius: 60,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      locked: false,
      stroke: '#00f2ff',
      strokeWidth: 2
    };
    setElements([...elements, newCircle]);
    setRepeatLayoutState(null);
    setSelectedIds([newCircle.id]);
  };

  const handleUpdateElement = (id: string, attrs: any) => {
    setElements(elements.map(el => el.id === id ? { ...el, ...attrs } : el));
  };

  const deleteSelected = () => {
    setElements(elements.filter(el => !selectedIds.includes(el.id)));
    setRepeatLayoutState(null);
    setSelectedIds([]);
  };

  const handleUseBestRepeatOrientation = () => {
    if (!repeatOrientationComparison) {
      return;
    }

    setRepeatLayoutState((current) => (
      current
        ? { ...current, orientationMode: repeatOrientationComparison.best }
        : current
    ));
  };

  const handleRotateAllRepeatUnits = async () => {
    if (!repeatLayoutState || !repeatOrientationComparison) {
      return;
    }

    const currentHeight = repeatLayoutPreview?.sheetHeight ?? repeatOrientationComparison.normal.sheetHeight;
    const rotatedHeight = repeatOrientationComparison.rotated.sheetHeight;

    if (rotatedHeight > currentHeight + 1) {
      const confirmed = await openConfirmDialog({
        title: 'Giro aumenta a metragem',
        message: `Ao girar todas as logos, a folha sobe de ${formatCmFromMm(currentHeight)} cm para ${formatCmFromMm(rotatedHeight)} cm. Quer manter mesmo assim?`,
        tone: 'warning',
        confirmLabel: 'Girar mesmo assim',
        cancelLabel: 'Usar melhor'
      });

      if (!confirmed) {
        handleUseBestRepeatOrientation();
        showToast('Ajustei para a orientacao com melhor aproveitamento.', 'info', 'Melhor aproveitamento');
        return;
      }
    }

    setRepeatLayoutState((current) => current ? { ...current, orientationMode: 'portrait' } : current);
  };

  const rotateSelectedRepeatUnits = () => {
    if (selectedIds.length === 0) {
      showToast('Selecione ao menos uma logo no canvas para girar individualmente.', 'warning', 'Selecione uma unidade');
      return;
    }

    setElements((current) => {
      const selectedGroupIds = Array.from(new Set(
        current
          .filter((element) => selectedIds.includes(element.id))
          .map((element) => (element as any).repeatGroupId)
          .filter((value): value is string => Boolean(value))
      ));

      if (selectedGroupIds.length === 0) {
        showToast('Selecione uma unidade criada pela repeticao para girar o bloco inteiro.', 'warning', 'Selecao invalida');
        return current;
      }

      const boundsByGroup = new Map<string, ElementBounds>();
      selectedGroupIds.forEach((groupId) => {
        const groupElements = current.filter((element) => (element as any).repeatGroupId === groupId);
        const groupBounds = getElementsBounds(groupElements);
        if (groupBounds) {
          boundsByGroup.set(groupId, groupBounds);
        }
      });

      return current.map((element) => {
        const repeatGroupId = (element as any).repeatGroupId as string | undefined;
        if (!repeatGroupId || !boundsByGroup.has(repeatGroupId)) {
          return element;
        }

        const bounds = boundsByGroup.get(repeatGroupId)!;
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        const dx = element.x - centerX;
        const dy = element.y - centerY;

        return {
          ...element,
          x: centerX - dy,
          y: centerY + dx,
          rotation: element.rotation + 90
        } as CanvasElement;
      });
    });
  };

  return (
    <div className="h-screen w-screen bg-black text-zinc-300 flex flex-col overflow-hidden font-sans selection:bg-cyber-cyan/30">
      {/* Header Mobile-Friendly */}
      <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950/50 backdrop-blur-md z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-cyber-cyan rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(0,242,255,0.4)]">
            <Scissors className="text-black" size={24} />
          </div>
          <div className="hidden md:block">
            <h1 className="text-white font-black tracking-tighter text-xl italic leading-none">CORTA AI</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-2 h-2 rounded-full ${plotterConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className="text-[9px] font-black tracking-widest uppercase opacity-70">
                {plotterConnected ? 'MIMAKI CONECTADA' : 'DESCONECTADA'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-1">
            <button
              onClick={() => availableTransports['android-otg'] && setActiveTransportKind('android-otg')}
              disabled={!availableTransports['android-otg']}
              className={`flex items-center gap-1.5 rounded-xl px-2 py-2 text-[9px] font-black tracking-wider uppercase transition-all sm:px-3 sm:text-[10px] ${
                activeTransportKind === 'android-otg'
                  ? 'bg-cyber-cyan text-black'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400'
              }`}
              title="Android OTG"
            >
              <Usb size={14} />
              <span className="hidden sm:inline">Android</span>
            </button>
            <button
              onClick={() => availableTransports['windows-bridge'] && setActiveTransportKind('windows-bridge')}
              disabled={!availableTransports['windows-bridge']}
              className={`flex items-center gap-1.5 rounded-xl px-2 py-2 text-[9px] font-black tracking-wider uppercase transition-all sm:px-3 sm:text-[10px] ${
                activeTransportKind === 'windows-bridge'
                  ? 'bg-cyber-cyan text-black'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400'
              }`}
              title="USB no Windows"
            >
              <Monitor size={14} />
              <span className="hidden sm:inline">Windows</span>
            </button>
            <button
              onClick={() => availableTransports.download && setActiveTransportKind('download')}
              className={`flex items-center gap-1.5 rounded-xl px-2 py-2 text-[9px] font-black tracking-wider uppercase transition-all sm:px-3 sm:text-[10px] ${
                activeTransportKind === 'download'
                  ? 'bg-cyber-cyan text-black'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }`}
              title="Baixar arquivo"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Arquivo</span>
            </button>
          </div>
          <input type="file" ref={fileInputRef} onChange={handleImportAndSend} className="hidden" accept=".dat,.plt,.mgl,.txt" />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-3 hover:bg-zinc-800 rounded-xl transition-all border border-zinc-800 text-zinc-400 hover:text-white active:scale-95"
            title="Importar Arquivo"
          >
            <FileUp size={22} />
          </button>
          <button 
            onClick={handleSendToPlotter}
            disabled={isSending}
            className={`flex items-center gap-2 px-6 py-3 bg-cyber-cyan text-black rounded-xl font-black text-sm transition-all hover:brightness-110 active:scale-95 shadow-[0_0_25px_rgba(0,242,255,0.3)] ${isSending ? 'opacity-50' : ''}`}
          >
            <Play size={18} fill="black" />
            <span className="hidden xs:inline">{isSending ? 'ENVIANDO...' : 'CORTAR AGORA'}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        <div
          className="pointer-events-none absolute left-1/2 top-3 z-30 hidden md:block transition-all duration-300 ease-out"
          style={{ transform: `translateX(calc(-50% - ${sidebarOpen ? 160 : 0}px))` }}
        >
          <div className="relative overflow-hidden rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 shadow-[0_14px_40px_rgba(0,0,0,0.38)] backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-white/25" />
            <div className="flex items-center gap-3">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyber-cyan shadow-[0_0_10px_rgba(0,242,255,0.8)]" />
              <div className="flex items-center gap-3">
                {repeatLayoutState && (
                  <>
                    <div>
                      <div className="text-[7px] font-black uppercase tracking-[0.24em] text-zinc-500">Logos</div>
                      <div className="mt-0.5 text-[12px] font-black leading-none text-white">{repeatLayoutState.totalItems}</div>
                    </div>
                    <div className="h-6 w-px bg-white/8" />
                  </>
                )}
                <div>
                  <div className="text-[7px] font-black uppercase tracking-[0.24em] text-zinc-500">Largura</div>
                  <div className="mt-0.5 text-[12px] font-black leading-none text-white">{currentCanvasSummary.widthCm} cm</div>
                </div>
                <div className="h-6 w-px bg-white/8" />
                <div>
                  <div className="text-[7px] font-black uppercase tracking-[0.24em] text-zinc-500">Altura</div>
                  <div className="mt-0.5 text-[12px] font-black leading-none text-white">{currentCanvasSummary.heightCm} cm</div>
                </div>
                <div className="h-6 w-px bg-white/8" />
                <div>
                  <div className="text-[7px] font-black uppercase tracking-[0.24em] text-cyber-cyan/70">Metragem</div>
                  <div className="mt-0.5 text-[12px] font-black leading-none text-cyber-cyan">{currentHeightMetersLabel} m</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Barra de Ferramentas Flutuante */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-40">
          <div className="bg-zinc-900/90 backdrop-blur-2xl border border-zinc-800 p-2.5 rounded-3xl shadow-2xl flex flex-col gap-3">
            <button onClick={addText} className="w-14 h-14 flex items-center justify-center hover:bg-cyber-cyan hover:text-black rounded-2xl transition-all active:scale-90" title="Texto">
              <Type size={28} />
            </button>
            <button onClick={addRectangle} className="w-14 h-14 flex items-center justify-center hover:bg-cyber-cyan hover:text-black rounded-2xl transition-all active:scale-90" title="Retângulo">
              <Square size={28} />
            </button>
            <button onClick={addCircle} className="w-14 h-14 flex items-center justify-center hover:bg-cyber-cyan hover:text-black rounded-2xl transition-all active:scale-90" title="Círculo">
              <CircleIcon size={28} />
            </button>
            <div className="h-px bg-zinc-800 my-1 mx-2" />
            <button 
              onClick={() => openAssetModal('brands')} 
              className={`w-14 h-14 flex items-center justify-center rounded-2xl transition-all active:scale-90 ${isAssetModalOpen && assetModalTab === 'brands' ? 'bg-cyber-cyan text-black shadow-[0_0_15px_rgba(0,242,255,0.4)]' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'}`}
              title="Galeria de Logos"
            >
              <FolderOpen size={28} />
            </button>
            <button 
              onClick={() => openAssetModal('files')} 
              className={`w-14 h-14 flex items-center justify-center rounded-2xl transition-all active:scale-90 ${isAssetModalOpen && assetModalTab === 'files' ? 'bg-cyber-cyan text-black shadow-[0_0_15px_rgba(0,242,255,0.4)]' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'}`}
              title="Arquivos Prontos"
            >
              <Library size={28} />
            </button>
            <div className="h-px bg-zinc-800 my-1 mx-2" />
            <button 
              onClick={deleteSelected}
              disabled={selectedIds.length === 0}
              className={`w-14 h-14 flex items-center justify-center hover:bg-red-500 hover:text-white rounded-2xl transition-all active:scale-90 ${selectedIds.length === 0 ? 'opacity-20 pointer-events-none' : 'text-red-400'}`}
              title="Excluir"
            >
              <Trash2 size={28} />
            </button>
          </div>
          
          {/* Controles de Zoom */}
          <div className="bg-zinc-900/90 backdrop-blur-2xl border border-zinc-800 p-2 rounded-2xl shadow-2xl flex flex-col gap-1 mt-2">
            <button onClick={() => setZoom(prev => Math.min(prev + 0.1, 2))} className="p-2 hover:bg-zinc-800 rounded-lg transition-all active:scale-90">
              <ZoomIn size={20} />
            </button>
            <button onClick={() => setZoom(prev => Math.max(prev - 0.1, 0.2))} className="p-2 hover:bg-zinc-800 rounded-lg transition-all active:scale-90">
              <ZoomOut size={20} />
            </button>
          </div>
        </div>

        {/* Área Principal do Canvas */}
        <div className="flex-1 bg-[radial-gradient(#18181b_1px,transparent_1px)] [background-size:24px_24px] flex items-center justify-center overflow-auto p-4 custom-scrollbar z-10">
          <div className="shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-zinc-800 rounded-sm overflow-hidden bg-black transition-transform duration-200">
            <KonvaCanvas 
              elements={elements}
              width={docSettings.width}
              height={docSettings.height}
              mirrored={Boolean(docSettings.mirror)}
              selectedIds={selectedIds}
              onSelect={setSelectedIds}
              onUpdateElement={handleUpdateElement}
              zoom={zoom}
              onZoomChange={setZoom}
            />
          </div>
        </div>

        {/* Painel Lateral Direito (Configurações) */}
        <aside className={`${sidebarOpen ? 'w-80' : 'w-0'} bg-zinc-950 border-l border-zinc-800 transition-all duration-300 ease-in-out flex flex-col z-40 relative`}>
          {/* Toggle Sidebar Button */}
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 h-20 bg-zinc-950 border border-r-0 border-zinc-800 rounded-l-2xl flex items-center justify-center hover:text-cyber-cyan transition-colors shadow-[-10px_0_20px_rgba(0,0,0,0.5)]"
          >
            {sidebarOpen ? <ChevronRight size={24} /> : <ChevronLeft size={24} />}
          </button>

          {sidebarOpen && (
            <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex border-b border-zinc-800 p-2.5 gap-2 bg-zinc-900/30">
                {(['tools', 'settings', 'layers'] as const).map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2.5 text-[10px] font-black tracking-widest uppercase rounded-lg transition-all ${activeTab === tab ? 'bg-zinc-800 text-cyber-cyan shadow-inner' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {TAB_LABELS[tab]}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-8">
                {activeTab === 'tools' && (
                  <div className="space-y-6">
                    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/35 p-4 space-y-4">
                      <div>
                        <h3 className="text-[10px] font-black tracking-[0.2em] text-zinc-600 uppercase">Central de Corte</h3>
                        <p className="mt-1 text-[11px] text-zinc-500">Escolha como o app define a condicao e como a Mimaki percorre a folha.</p>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {CUT_CONDITION_OPTIONS.map((option) => (
                          <button
                            key={option.mode}
                            onClick={() => setDocSettings((current) => ({ ...current, cutConditionMode: option.mode }))}
                            className={`rounded-2xl border px-3 py-3 text-left transition-all active:scale-[0.98] ${
                              (docSettings.cutConditionMode ?? 'preset') === option.mode
                                ? 'border-cyber-cyan bg-cyber-cyan/10 text-cyber-cyan'
                                : 'border-zinc-800 bg-black/20 text-zinc-400 hover:border-zinc-700 hover:text-white'
                            }`}
                          >
                            <div className="text-[10px] font-black uppercase tracking-[0.18em]">{option.label}</div>
                            <div className="mt-1 text-[9px] leading-relaxed opacity-80">{option.description}</div>
                          </button>
                        ))}
                      </div>

                      {(docSettings.cutConditionMode ?? 'preset') !== 'machine' && (
                        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-black/20 p-3">
                          <div className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">
                            {(docSettings.cutConditionMode ?? 'preset') === 'preset' ? 'Presets de Material' : 'Ajuste Manual'}
                          </div>

                          {(docSettings.cutConditionMode ?? 'preset') === 'preset' ? (
                            <div className="grid gap-2.5">
                              {PRESETS.map((preset) => (
                                <button
                                  key={preset.name}
                                  onClick={() => setDocSettings((current) => ({
                                    ...current,
                                    cutConditionMode: 'preset',
                                    cutSettings: preset
                                  }))}
                                  className={`rounded-2xl border p-4 text-left transition-all active:scale-[0.98] ${
                                    activeCutSettings.name === preset.name
                                      ? 'border-cyber-cyan bg-cyber-cyan/10 text-cyber-cyan shadow-[0_0_15px_rgba(0,242,255,0.1)]'
                                      : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700'
                                  }`}
                                >
                                  <div className="font-bold text-sm mb-1">{preset.name}</div>
                                  <div className="text-[9px] font-black opacity-50 tracking-wider">
                                    FERRAMENTA: {preset.tool} | PRESSAO: {preset.pressure > 0 ? `${preset.pressure}g` : 'PAINEL'} | VELOCIDADE: {preset.speed > 0 ? `${preset.speed}cm/s` : 'PAINEL'}
                                  </div>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Ferramenta</label>
                                <div className="grid grid-cols-4 gap-2">
                                  {CUT_TOOL_OPTIONS.map((tool) => (
                                    <button
                                      key={tool}
                                      onClick={() => updateManualCutSettings({ tool })}
                                      className={`rounded-xl border px-2 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition-all ${
                                        activeCutSettings.tool === tool
                                          ? 'border-cyber-cyan bg-cyber-cyan/10 text-cyber-cyan'
                                          : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-white'
                                      }`}
                                    >
                                      {tool}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className={`grid gap-3 ${isCoarsePointer ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                <TouchStepper
                                  label="Velocidade"
                                  value={`${activeCutSettings.speed > 0 ? activeCutSettings.speed : 20} cm/s`}
                                  helper="passos reais da Mimaki"
                                  touchUi={isCoarsePointer}
                                  onIncrement={() => adjustManualCutSetting('speed', 1)}
                                  onDecrement={() => adjustManualCutSetting('speed', -1)}
                                />
                                <TouchStepper
                                  label="Pressao"
                                  value={`${activeCutSettings.pressure > 0 ? activeCutSettings.pressure : 50} g`}
                                  helper="passos reais da Mimaki"
                                  touchUi={isCoarsePointer}
                                  onIncrement={() => adjustManualCutSetting('pressure', 1)}
                                  onDecrement={() => adjustManualCutSetting('pressure', -1)}
                                />
                                <TouchStepper
                                  label="Offset"
                                  value={`${(activeCutSettings.offset >= 0 ? activeCutSettings.offset : 0.3).toFixed(2)} mm`}
                                  helper="passo de 0,05"
                                  touchUi={isCoarsePointer}
                                  onIncrement={() => adjustManualCutSetting('offset', 1)}
                                  onDecrement={() => adjustManualCutSetting('offset', -1)}
                                />
                                <TouchStepper
                                  label="Sobrecorte"
                                  value={`${(activeCutSettings.overcutMm ?? 0).toFixed(2)} mm`}
                                  helper="fecha melhor os cantos"
                                  touchUi={isCoarsePointer}
                                  onIncrement={() => adjustManualCutSetting('overcutMm', 1)}
                                  onDecrement={() => adjustManualCutSetting('overcutMm', -1)}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="rounded-2xl border border-zinc-800 bg-black/20 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Percurso do corte</div>
                            <div className="mt-1 text-xs font-bold text-white">{cutTraversalLabel}</div>
                          </div>
                          <div className="text-[9px] text-zinc-500">{cutConditionSummary}</div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {CUT_TRAVERSAL_OPTIONS.map((option) => (
                            <button
                              key={option.mode}
                              onClick={() => setDocSettings((current) => ({ ...current, cutTraversalMode: option.mode }))}
                              className={`rounded-2xl border px-3 py-3 text-left transition-all active:scale-[0.98] ${
                                (docSettings.cutTraversalMode ?? 'mimaki') === option.mode
                                  ? 'border-cyber-cyan bg-cyber-cyan/10 text-cyber-cyan'
                                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-white'
                              }`}
                            >
                              <div className="text-[10px] font-black uppercase tracking-[0.16em]">{option.label}</div>
                              <div className="mt-1 text-[9px] leading-relaxed opacity-80">{option.description}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Central de Arquivos</div>
                      <button
                        onClick={() => openAssetModal('brands')}
                        className="w-full rounded-2xl border border-cyber-cyan/30 bg-cyber-cyan/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-cyber-cyan transition-all hover:bg-cyber-cyan hover:text-black"
                      >
                        Abrir Galeria de Marcas
                      </button>
                      <button
                        onClick={() => openAssetModal('files')}
                        className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-200 transition-all hover:border-cyber-cyan hover:text-cyber-cyan"
                      >
                        Ver Arquivos Prontos
                      </button>
                      <button
                        onClick={handleSaveCurrentLayout}
                        className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-400 transition-all hover:border-zinc-500 hover:text-white"
                      >
                        Salvar Montagem Atual
                      </button>
                    </div>

                    {selectedIds.length === 1 && (
                      <div className="pt-6 border-t border-zinc-800 space-y-5 animate-in zoom-in-95 duration-200">
                        <h3 className="text-[10px] font-black tracking-[0.2em] text-zinc-600 uppercase">Elemento Selecionado</h3>
                        {elements.find(e => e.id === selectedIds[0])?.type === 'text' && (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">Conteúdo do Texto</label>
                              <textarea 
                                value={(elements.find(e => e.id === selectedIds[0]) as any)?.text || ''}
                                onChange={(e) => handleUpdateElement(selectedIds[0], { text: e.target.value })}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm focus:border-cyber-cyan outline-none transition-all resize-none h-24 font-medium"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">Família de Fonte</label>
                              <select 
                                value={(elements.find(e => e.id === selectedIds[0]) as any)?.fontFamily || ''}
                                onChange={(e) => handleUpdateElement(selectedIds[0], { fontFamily: e.target.value })}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 text-sm outline-none appearance-none cursor-pointer hover:border-zinc-700"
                              >
                                {CUSTOM_FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'settings' && (
                  <div className="space-y-6 animate-in slide-in-from-right-4">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-3 space-y-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[8px] font-black uppercase tracking-[0.16em] text-zinc-500">
                        <span className="text-cyber-cyan">Gestos</span>
                        <span>Pinca: zoom</span>
                        <span>|</span>
                        <span>Arraste</span>
                        <span>|</span>
                        <span>2 toques</span>
                      </div>

                      <button
                        onClick={() => setIsSheetPanelExpanded((current) => !current)}
                        className="w-full rounded-xl border border-zinc-800 bg-black/20 px-3 py-2.5 text-left transition-all hover:border-zinc-700"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[8px] font-black uppercase tracking-[0.18em] text-zinc-500">Folha</div>
                            <div className="mt-0.5 text-sm font-black leading-tight text-white">
                              {currentCanvasSummary.widthCm} x {currentCanvasSummary.heightCm} cm
                            </div>
                            <div className="mt-0.5 text-[9px] text-zinc-500">
                              Maquina {machineProfile ? `${mmToCm(machineProfile.widthMm).toFixed(1)} cm` : 'manual'}
                            </div>
                          </div>
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400">
                            {isSheetPanelExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>
                      </button>

                      <div className="grid grid-cols-3 gap-2">
                        {SHEET_PRESETS.map((preset) => (
                          <button
                            key={preset.label}
                            onClick={() => setDocSettings((current) => ({ ...current, width: preset.width, height: preset.height }))}
                            className={`rounded-xl border px-2 py-2 text-[9px] font-black uppercase tracking-[0.14em] transition-all ${
                              approxEqual(docSettings.width, preset.width) && approxEqual(docSettings.height, preset.height)
                                ? 'border-cyber-cyan/40 bg-cyber-cyan/10 text-cyber-cyan'
                                : 'border-zinc-800 bg-black/20 text-zinc-400 hover:border-zinc-700 hover:text-white'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      {isSheetPanelExpanded && (
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                          <input 
                            type="number" 
                            step="0.1"
                            value={mmToCm(docSettings.width)} 
                            onChange={e => setDocSettings({...docSettings, width: cmToMm(Number(e.target.value))})}
                            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-cyber-cyan" 
                          />
                          <input 
                            type="number" 
                            step="0.1"
                            value={mmToCm(docSettings.height)} 
                            onChange={e => setDocSettings({...docSettings, height: cmToMm(Number(e.target.value))})}
                            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-cyber-cyan" 
                          />
                          {machineProfile ? (
                            <button
                              onClick={() => setDocSettings((current) => ({ ...current, width: machineProfile.widthMm }))}
                              className="rounded-xl border border-cyber-cyan/30 bg-cyber-cyan/10 px-3 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-cyber-cyan transition-all hover:bg-cyber-cyan hover:text-black"
                            >
                              Maquina
                            </button>
                          ) : (
                            <div className="rounded-xl border border-zinc-800 bg-black/20 px-3 py-2 text-[8px] font-black uppercase tracking-[0.14em] text-zinc-600 flex items-center">
                              Manual
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4 transition-all hover:border-zinc-700">
                      <input
                        type="checkbox"
                        checked={Boolean(docSettings.mirror)}
                        onChange={(event) => setDocSettings((current) => ({ ...current, mirror: event.target.checked }))}
                        className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-cyber-cyan focus:ring-cyber-cyan"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-cyber-cyan">Mirror</span>
                          <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.16em] ${docSettings.mirror ? 'bg-cyber-cyan/15 text-cyber-cyan' : 'bg-zinc-800 text-zinc-400'}`}>
                            {docSettings.mirror ? 'Ligado' : 'Desligado'}
                          </span>
                        </div>
                        <div className="mt-1 text-sm font-black text-white">
                          Cortar espelhado
                        </div>
                        <div className="mt-1 text-[10px] leading-relaxed text-zinc-500">
                          Mantem o preview do canvas igual ao envio real da Mimaki para nao confundir o operador.
                        </div>
                      </div>
                    </label>

                    {repeatLayoutState && (
                      <div className="rounded-2xl border border-cyber-cyan/20 bg-cyber-cyan/5 p-4 space-y-4">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyber-cyan">Repeticao da Folha</div>
                          <div className="mt-1 text-[10px] leading-relaxed text-zinc-500">
                            Tamanho, orientacao, quantidade e espacamento.
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
                            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Unidades</div>
                            <div className="mt-1 text-lg font-black text-white">{repeatLayoutState.totalItems}</div>
                          </div>
                          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
                            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Fileiras</div>
                            <div className="mt-1 text-lg font-black text-white">{repeatLayoutRows}</div>
                          </div>
                          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
                            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Por Linha</div>
                            <div className="mt-1 text-lg font-black text-white">{repeatLayoutPreview?.columns ?? repeatLayoutState.columns}</div>
                          </div>
                          <button
                            onClick={() => setRepeatLayoutState((current) => current ? { ...current, frameEnabled: !current.frameEnabled } : current)}
                            className={`rounded-2xl border p-3 text-left transition-all ${
                              repeatLayoutState.frameEnabled
                                ? 'border-cyber-cyan/40 bg-cyber-cyan/10 text-white'
                                : 'border-zinc-800 bg-zinc-900/50 text-zinc-300'
                            }`}
                          >
                            <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500">Frame</div>
                            <div className="mt-1 text-lg font-black">{repeatLayoutState.frameEnabled ? 'On' : 'Off'}</div>
                          </button>
                        </div>

                        <div className="space-y-2">
                          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Orientacao</div>
                          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-1">
                            <button
                              onClick={handleUseBestRepeatOrientation}
                              className={`rounded-xl px-3 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${isBestRepeatOrientationActive ? 'bg-cyber-cyan text-black' : 'text-zinc-400 hover:text-white'}`}
                            >
                              Melhor
                            </button>
                            <button
                              onClick={() => setRepeatLayoutState((current) => current ? { ...current, orientationMode: 'landscape' } : current)}
                              className={`rounded-xl px-3 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${repeatLayoutState.orientationMode === 'landscape' ? 'bg-cyber-cyan text-black' : 'text-zinc-400 hover:text-white'}`}
                            >
                              Normal
                            </button>
                            <button
                              onClick={handleRotateAllRepeatUnits}
                              className={`rounded-xl px-3 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${repeatLayoutState.orientationMode === 'portrait' ? 'bg-cyber-cyan text-black' : 'text-zinc-400 hover:text-white'}`}
                            >
                              Girar
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <button
                            onClick={rotateSelectedRepeatUnits}
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-200 transition-all hover:border-cyber-cyan hover:text-cyber-cyan"
                          >
                            Girar unidade selecionada
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => setRepeatLayoutState((current) => current ? { ...current, totalItems: current.totalItems + 1 } : current)}
                            className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-200 transition-all hover:border-cyber-cyan hover:text-cyber-cyan"
                          >
                            + 1 unidade
                          </button>
                          <button
                            onClick={() => setRepeatLayoutState((current) => current ? { ...current, totalItems: Math.max(1, current.totalItems - 1) } : current)}
                            className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-200 transition-all hover:border-cyber-cyan hover:text-cyber-cyan"
                          >
                            - 1 unidade
                          </button>
                          <button
                            onClick={() => setRepeatLayoutState((current) => {
                              if (!current) {
                                return current;
                              }
                              const effectiveColumns = Math.max(1, repeatLayoutPreview?.columns ?? current.columns);
                              const rows = Math.max(1, Math.ceil(current.totalItems / effectiveColumns));
                              return { ...current, totalItems: (rows + 1) * effectiveColumns };
                            })}
                            className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-200 transition-all hover:border-cyber-cyan hover:text-cyber-cyan"
                          >
                            + 1 fileira
                          </button>
                          <button
                            onClick={() => setRepeatLayoutState((current) => {
                              if (!current) {
                                return current;
                              }
                              const effectiveColumns = Math.max(1, repeatLayoutPreview?.columns ?? current.columns);
                              const rows = Math.max(1, Math.ceil(current.totalItems / effectiveColumns));
                              return { ...current, totalItems: Math.max(1, (rows - 1) * effectiveColumns) };
                            })}
                            className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-200 transition-all hover:border-cyber-cyan hover:text-cyber-cyan"
                          >
                            - 1 fileira
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          <TouchStepper
                            label="Tamanho da logo (cm)"
                            value={formatCmFromMm(repeatLayoutState.logoWidth)}
                            helper="largura base da arte"
                            touchUi={isCoarsePointer}
                            onIncrement={() => setRepeatLayoutState((current) => current ? { ...current, logoWidth: current.logoWidth + cmToMm(0.1) } : current)}
                            onDecrement={() => setRepeatLayoutState((current) => current ? { ...current, logoWidth: Math.max(5, Number((current.logoWidth - cmToMm(0.1)).toFixed(3))) } : current)}
                          />
                          <TouchStepper
                            label="Unidades por fileira"
                            value={`${repeatLayoutPreview?.columns ?? repeatLayoutState.columns}`}
                            helper="valor real que cabe por linha"
                            touchUi={isCoarsePointer}
                            onIncrement={() => setRepeatLayoutState((current) => current ? { ...current, columns: current.columns + 1 } : current)}
                            onDecrement={() => setRepeatLayoutState((current) => current ? { ...current, columns: Math.max(1, current.columns - 1) } : current)}
                          />
                          <TouchStepper
                            label="Espacamento horizontal (cm)"
                            value={formatCmFromMm(repeatLayoutState.horizontalGap)}
                            helper="distancia entre colunas"
                            touchUi={isCoarsePointer}
                            onIncrement={() => setRepeatLayoutState((current) => current ? { ...current, horizontalGap: current.horizontalGap + cmToMm(0.1) } : current)}
                            onDecrement={() => setRepeatLayoutState((current) => current ? { ...current, horizontalGap: Math.max(0, Number((current.horizontalGap - cmToMm(0.1)).toFixed(3))) } : current)}
                          />
                          <TouchStepper
                            label="Espacamento vertical (cm)"
                            value={formatCmFromMm(repeatLayoutState.verticalGap)}
                            helper="distancia entre fileiras"
                            touchUi={isCoarsePointer}
                            onIncrement={() => setRepeatLayoutState((current) => current ? { ...current, verticalGap: current.verticalGap + cmToMm(0.1) } : current)}
                            onDecrement={() => setRepeatLayoutState((current) => current ? { ...current, verticalGap: Math.max(0, Number((current.verticalGap - cmToMm(0.1)).toFixed(3))) } : current)}
                          />
                          {repeatLayoutState.frameEnabled && (
                            <div className="grid grid-cols-2 gap-3">
                              <TouchStepper
                                label="Frame lateral (cm)"
                                value={formatCmFromMm(repeatLayoutState.frameMarginX)}
                                helper="folga nas laterais"
                                touchUi={isCoarsePointer}
                                onIncrement={() => setRepeatLayoutState((current) => current ? { ...current, frameMarginX: current.frameMarginX + cmToMm(0.1) } : current)}
                                onDecrement={() => setRepeatLayoutState((current) => current ? { ...current, frameMarginX: Math.max(0, Number((current.frameMarginX - cmToMm(0.1)).toFixed(3))) } : current)}
                              />
                              <TouchStepper
                                label="Frame altura (cm)"
                                value={formatCmFromMm(repeatLayoutState.frameMarginY)}
                                helper="folga vertical"
                                touchUi={isCoarsePointer}
                                onIncrement={() => setRepeatLayoutState((current) => current ? { ...current, frameMarginY: current.frameMarginY + cmToMm(0.1) } : current)}
                                onDecrement={() => setRepeatLayoutState((current) => current ? { ...current, frameMarginY: Math.max(0, Number((current.frameMarginY - cmToMm(0.1)).toFixed(3))) } : current)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'layers' && (
                  <div className="space-y-3 animate-in slide-in-from-right-4">
                    <h3 className="text-[10px] font-black tracking-[0.2em] text-zinc-600 uppercase mb-4">Lista de Camadas</h3>
                    {elements.length === 0 ? (
                      <div className="text-[10px] text-zinc-600 italic text-center py-10">Nenhum elemento no canvas</div>
                    ) : (
                      elements.map((el, index) => (
                        <div 
                          key={el.id}
                          onClick={() => setSelectedIds([el.id])}
                          className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${selectedIds.includes(el.id) ? 'border-cyber-cyan bg-cyber-cyan/10' : 'border-zinc-800 bg-zinc-900/30'}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="text-[10px] font-black text-zinc-700 w-4">{index + 1}</div>
                            <div className="text-xs font-bold uppercase truncate max-w-[120px]">
                              {el.type === 'text' ? (el as any).text : (el as any).shapeType}
                            </div>
                          </div>
                          {el.type === 'text' ? <Type size={14} className="text-zinc-600" /> : <Square size={14} className="text-zinc-600" />}
                        </div>
                      )).reverse()
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </main>

      {isAssetModalOpen && (
        <div className={`absolute inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 ${useLightweightGalleryEffects ? 'bg-black/88' : 'bg-black/75 backdrop-blur-md'}`}>
          <button
            aria-label="Fechar galeria"
            className="absolute inset-0"
            onClick={() => setIsAssetModalOpen(false)}
          />
          <div className="relative h-[min(88vh,860px)] w-full max-w-7xl overflow-hidden rounded-[32px] border border-white/10 bg-zinc-950/95 shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
            {!useLightweightGalleryEffects && (
              <div className="pointer-events-none absolute inset-0 opacity-80">
                <FluidGlass
                  mode={assetModalTab === 'files' ? 'bar' : 'lens'}
                  lensProps={{ scale: 3.3, ior: 1.15, thickness: 5, chromaticAberration: 0.12, anisotropy: 0.02 }}
                  barProps={{ scale: 6.8, ior: 1.12, thickness: 10, chromaticAberration: 0.08 }}
                />
              </div>
            )}
            <div className={`absolute inset-0 ${useLightweightGalleryEffects ? 'bg-[linear-gradient(135deg,rgba(0,242,255,0.06),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(82,39,255,0.18),transparent_34%)]' : 'bg-[radial-gradient(circle_at_top_left,rgba(0,242,255,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(82,39,255,0.24),transparent_35%)]'}`} />

            <div className="relative z-10 flex h-full flex-col">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-7">
                <div className="max-w-3xl">
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-cyber-cyan/80">Galeria Liquid Glass</div>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
                    {assetModalTab === 'brands' ? 'Marcas e logos separadas' : 'Arquivos prontos e montagens salvas'}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-zinc-300">
                    {assetModalTab === 'brands'
                      ? 'Escolha logos por marca, abra a arte e monte a folha automaticamente em poucos toques.'
                      : 'Aqui ficam seus arquivos prontos do projeto e as montagens que voce salvar durante a producao.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleSaveCurrentLayout}
                    className="rounded-2xl border border-cyber-cyan/30 bg-cyber-cyan/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-cyber-cyan transition-all hover:bg-cyber-cyan hover:text-black"
                  >
                    Salvar montagem atual
                  </button>
                  <button
                    onClick={refreshActiveAssetTab}
                    className="rounded-2xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-200 transition-all hover:border-cyber-cyan hover:text-cyber-cyan"
                  >
                    Atualizar lista
                  </button>
                  <button
                    onClick={() => setIsAssetModalOpen(false)}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-900/80 text-zinc-300 transition-all hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-4 sm:px-7">
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/20 p-1">
                  <button
                    onClick={() => {
                      setAssetModalTab('brands');
                      fetchGallery();
                    }}
                    className={`rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${assetModalTab === 'brands' ? 'bg-cyber-cyan text-black' : 'text-zinc-400 hover:text-white'}`}
                  >
                    Marcas
                  </button>
                  <button
                    onClick={() => {
                      setAssetModalTab('files');
                      fetchLibrary();
                    }}
                    className={`rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${assetModalTab === 'files' ? 'bg-cyber-cyan text-black' : 'text-zinc-400 hover:text-white'}`}
                  >
                    Arquivos prontos
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  <div className="rounded-full border border-white/10 bg-black/20 px-3 py-2">
                    {galleryFiles.length} logos
                  </div>
                  <div className="rounded-full border border-white/10 bg-black/20 px-3 py-2">
                    {libraryFiles.length} arquivos do projeto
                  </div>
                  <div className="rounded-full border border-white/10 bg-black/20 px-3 py-2">
                    {savedLayouts.length} montagens salvas
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
                {assetModalTab === 'brands' && (
                  <div className="space-y-5">
                    <div className="flex flex-wrap gap-2">
                      {galleryBrands.map((brand) => (
                        <button
                          key={brand}
                          onClick={() => setActiveGalleryBrand(brand)}
                          className={`rounded-2xl px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${activeGalleryBrand === brand ? 'bg-cyber-cyan text-black' : 'border border-white/10 bg-black/20 text-zinc-300 hover:border-cyber-cyan/40 hover:text-white'}`}
                        >
                          {brand}
                        </button>
                      ))}
                    </div>

                    {isFetchingGallery ? (
                      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-[28px] border border-white/10 bg-black/20">
                        <div className="h-10 w-10 rounded-full border-2 border-cyber-cyan border-t-transparent animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Buscando logos</span>
                      </div>
                    ) : visibleGalleryFiles.length === 0 ? (
                      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-[28px] border border-dashed border-white/10 bg-black/20 px-6 text-center">
                        <FolderOpen size={38} className="text-zinc-700" />
                        <div className="text-sm font-bold text-zinc-200">Nenhuma logo encontrada nesta aba</div>
                        <div className="max-w-md text-[11px] text-zinc-500">
                          Use arquivos SVG dentro de `public/logos` e organize por marca para aparecerem aqui.
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                        {visibleGalleryFiles.map((file) => (
                          <button
                            key={file.path}
                            onClick={() => handleOpenGalleryAsset(file)}
                            className={`group overflow-hidden rounded-[28px] border border-white/10 bg-black/25 text-left ${useLightweightGalleryEffects ? '' : 'transition-all hover:-translate-y-1 hover:border-cyber-cyan/50 hover:bg-cyber-cyan/5'}`}
                            style={galleryCardPerformanceStyle}
                          >
                            <div className="aspect-square border-b border-white/10 bg-black/40 p-4">
                              <LibraryItemPreview filePath={file.path} lazy />
                            </div>
                            <div className="space-y-1 p-4">
                              <div className="truncate text-sm font-black text-white">{file.name}</div>
                              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{file.category}</div>
                              <div className="pt-2 text-[10px] font-black uppercase tracking-widest text-cyber-cyan">Abrir e montar</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {assetModalTab === 'files' && (
                  <div className="space-y-8">
                    <section className="space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-black text-white">Montagens salvas</h3>
                          <p className="text-[11px] text-zinc-400">Salve uma composicao sua para reabrir depois direto por aqui.</p>
                        </div>
                        <button
                          onClick={handleSaveCurrentLayout}
                          className="rounded-2xl border border-cyber-cyan/30 bg-cyber-cyan/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-cyber-cyan transition-all hover:bg-cyber-cyan hover:text-black"
                        >
                          Salvar montagem
                        </button>
                      </div>

                      {savedLayouts.length === 0 ? (
                        <div className="rounded-[28px] border border-dashed border-white/10 bg-black/20 px-6 py-12 text-center">
                          <div className="text-sm font-bold text-zinc-200">Ainda nao ha montagens salvas</div>
                          <div className="mt-2 text-[11px] text-zinc-500">Monte uma folha no canvas e toque em salvar para ela aparecer aqui.</div>
                        </div>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {savedLayouts.map((layout) => (
                            <div key={layout.id} className="group overflow-hidden rounded-[28px] border border-white/10 bg-black/25" style={galleryCardPerformanceStyle}>
                              <button
                                onClick={() => handleLoadSavedLayout(layout)}
                                className="w-full text-left"
                              >
                                <div className="aspect-[1.2/1] border-b border-white/10 bg-black/35 p-4">
                                  <SavedLayoutPreview elements={layout.elements} />
                                </div>
                                <div className="space-y-2 p-4">
                                  <div className="truncate text-sm font-black text-white">{layout.name}</div>
                                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                    {layout.itemCount} objetos • {mmToCm(layout.docSettings.width).toFixed(1)} x {mmToCm(layout.docSettings.height).toFixed(1)} cm
                                  </div>
                                  <div className="text-[10px] text-zinc-500">
                                    {new Date(layout.createdAt).toLocaleString('pt-BR')}
                                  </div>
                                  {layout.sourceLabel && (
                                    <div className="text-[10px] font-black uppercase tracking-widest text-cyber-cyan/80">
                                      Base: {layout.sourceLabel}
                                    </div>
                                  )}
                                </div>
                              </button>
                              <div className="flex gap-2 border-t border-white/10 p-4">
                                <button
                                  onClick={() => handleLoadSavedLayout(layout)}
                                  className="flex-1 rounded-2xl border border-cyber-cyan/30 bg-cyber-cyan/10 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-cyber-cyan transition-all hover:bg-cyber-cyan hover:text-black"
                                >
                                  Carregar
                                </button>
                                <button
                                  onClick={() => handleDeleteSavedLayout(layout.id)}
                                  className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-red-300 transition-all hover:bg-red-500 hover:text-white"
                                >
                                  Excluir
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="space-y-4">
                      <div>
                        <h3 className="text-lg font-black text-white">Arquivos prontos do projeto</h3>
                        <p className="text-[11px] text-zinc-400">Arquivos montados que ja vieram com o app ou foram colocados na `public`.</p>
                      </div>

                      {isFetchingLibrary ? (
                        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-[28px] border border-white/10 bg-black/20">
                          <div className="h-10 w-10 rounded-full border-2 border-cyber-cyan border-t-transparent animate-spin" />
                          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Buscando arquivos</span>
                        </div>
                      ) : libraryFiles.length === 0 ? (
                        <div className="rounded-[28px] border border-dashed border-white/10 bg-black/20 px-6 py-12 text-center">
                          <div className="text-sm font-bold text-zinc-200">Nenhum arquivo pronto encontrado</div>
                          <div className="mt-2 text-[11px] text-zinc-500">Os arquivos fora da pasta `logos` aparecem automaticamente nesta area.</div>
                        </div>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {libraryFiles.map((file) => (
                            <button
                              key={file.path}
                              onClick={() => handleLibraryItemClick(file)}
                              className={`group overflow-hidden rounded-[28px] border border-white/10 bg-black/25 text-left ${useLightweightGalleryEffects ? '' : 'transition-all hover:-translate-y-1 hover:border-cyber-cyan/50 hover:bg-cyber-cyan/5'}`}
                              style={galleryCardPerformanceStyle}
                            >
                              <div className="aspect-[1.2/1] border-b border-white/10 bg-black/35 p-4">
                                <LibraryItemPreview filePath={file.path} lazy />
                              </div>
                              <div className="space-y-2 p-4">
                                <div className="truncate text-sm font-black text-white">{file.name}</div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{file.category}</div>
                                <div className="text-[10px] text-zinc-500">{(file.size / 1024).toFixed(1)} KB</div>
                                <div className="pt-2 text-[10px] font-black uppercase tracking-widest text-cyber-cyan">Carregar no canvas</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isGalleryModalOpen && selectedGalleryAsset && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/80 p-0 backdrop-blur-sm sm:p-4">
          <div className="flex h-[100dvh] w-full flex-col overflow-hidden border border-zinc-800 bg-zinc-950 shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-4xl sm:rounded-3xl lg:max-w-5xl">
            <div className={`flex items-center justify-between border-b border-zinc-800 ${isCoarsePointer ? 'px-5 py-4' : 'px-6 py-4'}`}>
              <div>
                <h2 className="text-white font-black text-lg tracking-tight">Montar Folha de Logos</h2>
                <p className="text-[11px] text-zinc-500 mt-1">{selectedGalleryAsset.file.name}</p>
              </div>
              <button
                onClick={() => setIsGalleryModalOpen(false)}
                className={`rounded-xl border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 transition-all flex items-center justify-center ${
                  isCoarsePointer ? 'h-12 w-12' : 'h-10 w-10'
                }`}
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid flex-1 overflow-y-auto lg:grid-cols-[0.95fr_1.05fr]">
              <div className="border-b border-zinc-800 bg-zinc-900/40 p-4 sm:p-5 lg:border-b-0 lg:border-r lg:p-6 flex items-center justify-center">
                <div className="w-full max-w-[320px] aspect-square rounded-3xl border border-zinc-800 bg-black p-4 text-zinc-600 sm:max-w-sm">
                  <LibraryItemPreview filePath={selectedGalleryAsset.file.path} />
                </div>
              </div>

              <div className={`space-y-5 p-4 sm:p-5 lg:p-6 ${isCoarsePointer ? 'pb-8' : ''}`}>
                <div className="grid grid-cols-2 gap-2">
                  <CompactStat label="Logo base" value={`${formatCmFromMm(selectedGalleryAsset.dimensions.width)} cm`} />
                  <CompactStat label="Altura" value={`${formatCmFromMm(selectedGalleryAsset.dimensions.height)} cm`} />
                  <CompactStat label="Folha" value={`${currentCanvasSummary.widthCm} x ${currentCanvasSummary.heightCm} cm`} />
                  <CompactStat
                    label="Largura"
                    value={`${machineProfile ? formatCmFromMm(machineProfile.widthMm) : formatCmFromMm(gallerySheetWidth)} cm`}
                    detail={machineProfile ? 'Detectada' : 'Manual'}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Modo de Preenchimento</label>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-1">
                    <button
                      onClick={() => setGalleryFillMode('quantity')}
                      className={`rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${galleryFillMode === 'quantity' ? 'bg-cyber-cyan text-black' : 'text-zinc-400 hover:text-white'}`}
                    >
                      Quantidade
                    </button>
                    <button
                      onClick={() => setGalleryFillMode('meters')}
                      className={`rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${galleryFillMode === 'meters' ? 'bg-cyber-cyan text-black' : 'text-zinc-400 hover:text-white'}`}
                    >
                      Metros
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Orientação da Logo</label>
                  <div className="grid grid-cols-3 gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-1">
                    <button
                      onClick={() => setGalleryOrientationMode('auto')}
                      className={`rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${galleryOrientationMode === 'auto' ? 'bg-cyber-cyan text-black' : 'text-zinc-400 hover:text-white'}`}
                    >
                      Automatico
                    </button>
                    <button
                      onClick={() => setGalleryOrientationMode('portrait')}
                      className={`rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${galleryOrientationMode === 'portrait' ? 'bg-cyber-cyan text-black' : 'text-zinc-400 hover:text-white'}`}
                    >
                      Em Pé
                    </button>
                    <button
                      onClick={() => setGalleryOrientationMode('landscape')}
                      className={`rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${galleryOrientationMode === 'landscape' ? 'bg-cyber-cyan text-black' : 'text-zinc-400 hover:text-white'}`}
                    >
                      Deitado
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    `Automatico` compara as duas posicoes e escolhe a que aproveita melhor a folha.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <TouchStepper
                    label={galleryFillMode === 'quantity' ? 'Quantas logos dessa?' : 'Quantos metros?'}
                    value={galleryFillMode === 'quantity' ? `${galleryQuantity}` : formatNumberPtBr(galleryMeters, 1)}
                    helper={galleryFillMode === 'quantity' ? 'toque para subir ou descer' : 'metros totais da folha'}
                    touchUi={isCoarsePointer}
                    onIncrement={() =>
                      galleryFillMode === 'quantity'
                        ? setGalleryQuantity((current) => current + 1)
                        : setGalleryMeters((current) => Number(Math.max(0.1, current + 0.1).toFixed(1)))
                    }
                    onDecrement={() =>
                      galleryFillMode === 'quantity'
                        ? setGalleryQuantity((current) => Math.max(1, current - 1))
                        : setGalleryMeters((current) => Number(Math.max(0.1, current - 0.1).toFixed(1)))
                    }
                  />

                  <TouchStepper
                    label="Qual tamanho da logo? (cm)"
                    value={formatCmFromMm(galleryLogoWidth)}
                    helper="largura da logo"
                    touchUi={isCoarsePointer}
                    onIncrement={() => setGalleryLogoWidth((current) => current + cmToMm(0.1))}
                    onDecrement={() => setGalleryLogoWidth((current) => Math.max(cmToMm(0.5), Number((current - cmToMm(0.1)).toFixed(3))))}
                  />

                  <TouchStepper
                    label="Largura util da folha (cm)"
                    value={formatCmFromMm(gallerySheetWidth)}
                    helper={machineProfile ? `maquina: ${formatCmFromMm(machineProfile.widthMm)} cm` : 'largura manual'}
                    touchUi={isCoarsePointer}
                    onIncrement={() => setGallerySheetWidth((current) => current + cmToMm(0.1))}
                    onDecrement={() => setGallerySheetWidth((current) => Math.max(cmToMm(10), Number((current - cmToMm(0.1)).toFixed(3))))}
                  />

                  <TouchStepper
                    label="Espacamento (cm)"
                    value={formatCmFromMm(galleryGap)}
                    helper="distancia entre logos"
                    touchUi={isCoarsePointer}
                    onIncrement={() => setGalleryGap((current) => current + cmToMm(0.1))}
                    onDecrement={() => setGalleryGap((current) => Math.max(0, Number((current - cmToMm(0.1)).toFixed(3))))}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setIsFrameConfigOpen(true)}
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-4 text-left transition-all hover:border-cyber-cyan/40 hover:bg-zinc-900/60"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Frame de corte</div>
                      <div className="mt-2 text-sm font-black text-white">
                        {galleryFrameEnabled
                          ? `Ativo • L ${formatCmFromMm(galleryFrameMarginX)} cm • A ${formatCmFromMm(galleryFrameMarginY)} cm`
                          : 'Desativado'}
                      </div>
                      <div className="mt-1 text-[10px] text-zinc-500">
                        Abra para configurar largura, altura e ver a logo real no preview.
                      </div>
                    </div>
                    <div className="rounded-xl border border-cyber-cyan/20 bg-cyber-cyan/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-cyber-cyan">
                      Configurar
                    </div>
                  </div>
                </button>

                {machineProfile && (
                  <button
                    onClick={() => setGallerySheetWidth(machineProfile.widthMm)}
                    className="w-full rounded-2xl border border-cyber-cyan/20 bg-cyber-cyan/5 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-cyber-cyan transition-all hover:bg-cyber-cyan hover:text-black"
                  >
                    Usar largura da maquina: {formatCmFromMm(machineProfile.widthMm)} cm
                  </button>
                )}

                <button
                  onClick={handleApplyGalleryLayout}
                  disabled={isApplyingGallery}
                  className={`w-full rounded-2xl px-5 font-black text-sm tracking-widest uppercase transition-all ${
                    isCoarsePointer ? 'py-5' : 'py-4'
                  } ${isApplyingGallery ? 'bg-zinc-800 text-zinc-500' : 'bg-cyber-cyan text-black hover:brightness-110 shadow-[0_0_25px_rgba(0,242,255,0.25)]'}`}
                >
                  {isApplyingGallery ? 'Montando folha...' : 'Gerar folha automaticamente'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isGalleryModalOpen && selectedGalleryAsset && isFrameConfigOpen && (
        <div className="absolute inset-0 z-[95] flex items-center justify-center bg-black/55 p-4 backdrop-blur-md">
          <button
            type="button"
            aria-label="Fechar configuracao de frame"
            className="absolute inset-0"
            onClick={() => setIsFrameConfigOpen(false)}
          />
          <div className="relative w-full max-w-lg overflow-hidden rounded-[30px] border border-white/15 bg-zinc-950/90 shadow-[0_24px_120px_rgba(0,0,0,0.7)] lg:max-w-5xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,242,255,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(82,39,255,0.22),transparent_40%)]" />
            <div className="pointer-events-none absolute inset-0 backdrop-blur-2xl" />
            <div className="relative z-10 space-y-5 p-5 sm:p-6 lg:space-y-6 lg:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500">Frame de corte</div>
                  <h3 className="mt-2 text-xl font-black tracking-tight text-white">Configure o quadro da repeticao</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                    Defina separadamente a folga horizontal e vertical do frame e acompanhe a logo real no preview.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFrameConfigOpen(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-zinc-300 transition-all hover:border-cyber-cyan/40 hover:text-cyber-cyan"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(340px,0.9fr)_minmax(520px,1.1fr)] lg:gap-6">
                <div className="rounded-3xl border border-white/10 bg-black/35 p-4 lg:p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Preview em tempo real</div>
                  <div className="mt-4 flex aspect-square items-center justify-center rounded-[28px] border border-zinc-800 bg-black">
                    <div className="relative h-[86%] w-[86%]">
                      {galleryFrameEnabled && (
                        <div
                          className="absolute left-1/2 top-1/2 border border-cyber-cyan/80 transition-all"
                          style={{
                            width: `${previewFrameWidthPercent}%`,
                            height: `${previewFrameHeightPercent}%`,
                            transform: 'translate(-50%, -50%)',
                          }}
                        />
                      )}
                      <div
                        className="absolute left-1/2 top-1/2 overflow-hidden transition-all"
                        style={{
                          width: `${previewLogoWidthPercent}%`,
                          height: `${previewLogoHeightPercent}%`,
                          transform: 'translate(-50%, -50%)',
                        }}
                      >
                        <svg
                          viewBox={previewViewBox}
                          className="h-full w-full"
                          preserveAspectRatio="xMidYMid meet"
                        >
                          {selectedGalleryAsset.elements.map((element, index) =>
                            renderGalleryPreviewElement(element, `frame-preview-${index}`)
                          )}
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 lg:gap-3">
                    <CompactStat label="Logo" value={`${formatCmFromMm(galleryLogoWidth)} cm`} detail="largura base" />
                    <CompactStat
                      label="Frame L"
                      value={galleryFrameEnabled ? `${formatCmFromMm(galleryFrameMarginX)} cm` : 'Desligado'}
                      detail="folga lateral"
                    />
                    <CompactStat
                      label="Frame A"
                      value={galleryFrameEnabled ? `${formatCmFromMm(galleryFrameMarginY)} cm` : 'Desligado'}
                      detail="folga vertical"
                    />
                  </div>
                </div>

                <div className="space-y-4 lg:space-y-5">
                  <button
                    type="button"
                    onClick={() => setGalleryFrameEnabled((current) => !current)}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition-all lg:px-5 ${
                      galleryFrameEnabled
                        ? 'border-cyber-cyan/40 bg-cyber-cyan/10 text-white'
                        : 'border-white/10 bg-black/25 text-zinc-300 hover:border-cyber-cyan/30'
                    }`}
                  >
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Status</div>
                    <div className="mt-2 text-sm font-black">{galleryFrameEnabled ? 'Frame ativo no corte' : 'Frame desativado'}</div>
                    <div className="mt-1 text-[10px] text-zinc-500">Toque para ligar ou desligar o quadro em volta de cada logo.</div>
                  </button>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <TouchStepper
                      label="Margem lateral do frame (cm)"
                      value={formatCmFromMm(galleryFrameMarginX)}
                      helper="espaco nas laterais"
                      touchUi={isCoarsePointer}
                      onIncrement={() => setGalleryFrameMarginX((current) => current + cmToMm(0.1))}
                      onDecrement={() => setGalleryFrameMarginX((current) => Math.max(0, Number((current - cmToMm(0.1)).toFixed(3))))}
                    />

                    <TouchStepper
                      label="Margem de altura do frame (cm)"
                      value={formatCmFromMm(galleryFrameMarginY)}
                      helper="espaco em cima e embaixo"
                      touchUi={isCoarsePointer}
                      onIncrement={() => setGalleryFrameMarginY((current) => current + cmToMm(0.1))}
                      onDecrement={() => setGalleryFrameMarginY((current) => Math.max(0, Number((current - cmToMm(0.1)).toFixed(3))))}
                    />
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-[11px] leading-relaxed text-zinc-400 lg:text-[12px]">
                    Quando o frame estiver ativo, as margens horizontal e vertical entram no calculo do espacamento e do tamanho final de cada repeticao.
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsFrameConfigOpen(false)}
                    className="w-full rounded-2xl bg-cyber-cyan px-5 py-4 text-sm font-black uppercase tracking-widest text-black transition-all hover:brightness-110"
                  >
                    Aplicar frame
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {dialogState && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/55 p-4 backdrop-blur-md">
          <button
            aria-label="Fechar aviso"
            className="absolute inset-0"
            onClick={() => resolveDialog(dialogState.kind === 'confirm' ? false : null)}
          />
          <div className="relative w-full max-w-xl overflow-hidden rounded-[30px] border border-white/15 bg-zinc-950/90 shadow-[0_24px_120px_rgba(0,0,0,0.7)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,242,255,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(82,39,255,0.22),transparent_40%)]" />
            <div className="pointer-events-none absolute inset-0 backdrop-blur-2xl" />
            <div className="relative z-10 space-y-6 p-6 sm:p-7">
              <div className="flex items-start gap-4">
                <div className={`mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${
                  dialogState.tone === 'success'
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                    : dialogState.tone === 'error'
                      ? 'border-red-400/30 bg-red-400/10 text-red-300'
                      : dialogState.tone === 'warning'
                        ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                        : 'border-cyber-cyan/30 bg-cyber-cyan/10 text-cyber-cyan'
                }`}>
                  {dialogState.tone === 'success' ? <CheckCircle2 size={22} /> : dialogState.tone === 'warning' ? <AlertTriangle size={22} /> : dialogState.tone === 'error' ? <AlertTriangle size={22} /> : <Info size={22} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.28em] text-zinc-500">Comunicacao do App</div>
                  <h3 className="mt-2 text-xl font-black tracking-tight text-white">{dialogState.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">{dialogState.message}</p>
                </div>
              </div>

              {dialogState.kind === 'prompt' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Nome da montagem</label>
                  <input
                    autoFocus
                    value={dialogInputValue}
                    placeholder={dialogState.placeholder}
                    onChange={(event) => setDialogInputValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        resolveDialog(dialogInputValue);
                      }
                    }}
                    className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-4 text-sm text-white outline-none transition-all placeholder:text-zinc-600 focus:border-cyber-cyan/40 focus:bg-black/45"
                  />
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  onClick={() => resolveDialog(dialogState.kind === 'confirm' ? false : null)}
                  className="rounded-2xl border border-zinc-700 bg-zinc-900/80 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-300 transition-all hover:border-zinc-500 hover:text-white"
                >
                  {dialogState.cancelLabel}
                </button>
                <button
                  onClick={() => resolveDialog(dialogState.kind === 'confirm' ? true : dialogInputValue)}
                  className={`rounded-2xl px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                    dialogState.tone === 'warning'
                      ? 'bg-amber-300 text-black hover:brightness-105'
                      : dialogState.tone === 'error'
                        ? 'bg-red-500 text-white hover:brightness-110'
                        : 'bg-cyber-cyan text-black hover:brightness-110'
                  }`}
                >
                  {dialogState.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute right-3 top-20 z-[120] flex w-[min(92vw,420px)] flex-col gap-3 sm:right-5">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto relative overflow-hidden rounded-[26px] border border-white/12 bg-zinc-950/82 shadow-[0_20px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
          >
            <div className={`absolute inset-0 ${
              toast.tone === 'success'
                ? 'bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(0,242,255,0.10),transparent_45%)]'
                : toast.tone === 'error'
                  ? 'bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.16),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(82,39,255,0.12),transparent_45%)]'
                  : toast.tone === 'warning'
                    ? 'bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.14),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(0,242,255,0.08),transparent_45%)]'
                    : 'bg-[radial-gradient(circle_at_top_left,rgba(0,242,255,0.16),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(82,39,255,0.16),transparent_45%)]'
            }`} />
            <div className="relative z-10 flex items-start gap-3 p-4">
              <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${
                toast.tone === 'success'
                  ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                  : toast.tone === 'error'
                    ? 'border-red-400/30 bg-red-400/10 text-red-300'
                    : toast.tone === 'warning'
                      ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                      : 'border-cyber-cyan/30 bg-cyber-cyan/10 text-cyber-cyan'
              }`}>
                {toast.tone === 'success' ? <CheckCircle2 size={18} /> : toast.tone === 'warning' ? <AlertTriangle size={18} /> : toast.tone === 'error' ? <AlertTriangle size={18} /> : <Info size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500">{toast.title}</div>
                <div className="mt-1 text-sm leading-relaxed text-zinc-200">{toast.message}</div>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="rounded-xl border border-white/10 bg-black/20 p-2 text-zinc-400 transition-all hover:border-white/20 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Rodape */}
      <footer className="h-10 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between px-5 text-[9px] font-black tracking-[0.15em] text-zinc-600 uppercase">
        <div className="flex gap-6 items-center">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyber-cyan"></div>
            <span>MOTOR: MGL-IIC v9.4</span>
          </div>
          <span className="hidden sm:inline">|</span>
          <span className="hidden sm:inline">TRANSPORTE: {TRANSPORT_LABELS[activeTransportKind]}</span>
          <span className="hidden sm:inline">|</span>
          <span className="hidden md:inline">FOLHA: {currentCanvasSummary.widthCm} x {currentCanvasSummary.heightCm} CM</span>
          <span className="hidden md:inline">|</span>
          <span className="hidden sm:inline">ZOOM: {(zoom * 100).toFixed(0)}%</span>
        </div>
        <div className="flex gap-6 items-center text-zinc-500">
          <span>{elements.length} OBJETOS</span>
          <div className="bg-zinc-800 px-2 py-0.5 rounded text-cyber-cyan">
            PRONTO PARA CORTAR
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
