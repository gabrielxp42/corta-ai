import React, { useEffect, useMemo, useState, useRef } from 'react';
import { KonvaCanvas } from './components/editor/KonvaCanvas';
import { CanvasElement, DocumentSettings, CutSettings } from './types/canvas-elements';
import { injectCustomFonts, CUSTOM_FONT_FAMILIES } from './utils/fontLoader';
import { 
  Scissors, Play, Settings, Type, Square, Circle as CircleIcon, 
  Usb, FileUp, Menu, X, Plus, Layers, Trash2, 
  ChevronRight, ChevronLeft, Download, Monitor,
  Maximize2, Minimize2, ZoomIn, ZoomOut, Library, FolderOpen
} from 'lucide-react';
import { MimakiOtg } from './motor/mimaki/plugins/mimakiOtgPlugin';
import { AndroidOtgTransport } from './motor/mimaki/transports/androidOtgTransport';
import { DownloadTransport } from './motor/mimaki/transports/downloadTransport';
import { WindowsBridgeTransport } from './motor/mimaki/transports/windowsBridgeTransport';
import { sendMimakiJob } from './motor/mimaki/sendMimakiJob';
import { parseMglToElements } from './utils/mglParser';
import { LibraryItemPreview } from './components/editor/LibraryItemPreview';

const PRESETS: CutSettings[] = [
  { name: 'Vinil Adesivo', pressure: 50, speed: 20, offset: 0.3, tool: 'CT1' },
  { name: 'Papel Comum', pressure: 60, speed: 40, offset: -1, tool: 'PEN' },
  { name: 'CUT2 Panel', pressure: -1, speed: -1, offset: -1, tool: 'CT2' },
  { name: 'CUT3 Panel', pressure: -1, speed: -1, offset: -1, tool: 'CT3' },
];

type TransportKind = 'android-otg' | 'windows-bridge' | 'download';

const TRANSPORT_LABELS: Record<TransportKind, string> = {
  'android-otg': 'Android OTG',
  'windows-bridge': 'Windows USB',
  download: 'Arquivo'
};

const TRANSPORT_ORDER: TransportKind[] = ['android-otg', 'windows-bridge', 'download'];

function App() {
  const [elements, setElements] = useState<CanvasElement[]>([
    {
      id: 'init-rect',
      type: 'shape',
      shapeType: 'rectangle',
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      locked: false,
      stroke: '#00f2ff',
      strokeWidth: 2
    }
  ]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(0.8);
  const [isSending, setIsSending] = useState(false);
  const [plotterConnected, setPlotterConnected] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'tools' | 'settings' | 'layers' | 'library'>('tools');
  const [libraryFiles, setLibraryFiles] = useState<any[]>([]);
  const [isFetchingLibrary, setIsFetchingLibrary] = useState(false);
  const [activeTransportKind, setActiveTransportKind] = useState<TransportKind>('download');
  const [availableTransports, setAvailableTransports] = useState<Record<TransportKind, boolean>>({
    'android-otg': false,
    'windows-bridge': false,
    download: true
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [docSettings, setDocSettings] = useState<DocumentSettings>({
    width: 600,
    height: 1000,
    dpi: 300,
    unit: 'mm',
    background: '#000',
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
    if (activeTab === 'library') {
      fetchLibrary();
    }
  }, [activeTab]);

  const fetchLibrary = async () => {
    setIsFetchingLibrary(true);
    try {
      const response = await fetch('http://127.0.0.1:17871/library');
      const data = await response.json();
      if (data.ok) {
        setLibraryFiles(data.files);
      }
    } catch (error) {
      console.error('Erro ao buscar biblioteca:', error);
    } finally {
      setIsFetchingLibrary(false);
    }
  };

  const handleLibraryItemClick = async (file: any) => {
    try {
      // O Vite serve a pasta public na raiz /
      const response = await fetch(`/${file.path}`);
      const content = await response.text();
      
      if (content) {
        if (window.confirm(`Deseja carregar "${file.name}" no canvas?`)) {
          const result = parseMglToElements(content);
          if (result.elements.length > 0) {
            // Adiciona como novos elementos sem limpar tudo, ou pergunta se quer limpar?
            // Para ser mais util, vamos perguntar se quer mesclar ou substituir
            if (window.confirm('Deseja LIMPAR o canvas antes de carregar?')) {
              setElements(result.elements);
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
            }
            alert(`Elemento "${file.name}" adicionado.`);
          }
        }
      }
    } catch (error) {
      console.error('Erro ao carregar item da biblioteca:', error);
      alert('Falha ao carregar item.');
    }
  };

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

        if (activeTransportKind === 'android-otg') {
          const result = await MimakiOtg.isConnected();
          connected = result.connected;
        } else if (activeTransportKind === 'windows-bridge') {
          connected = await windowsBridgeTransport.hasPairedDevice();
        }

        if (!cancelled) {
          setPlotterConnected(connected);
        }
      } catch {
        if (!cancelled) {
          setPlotterConnected(false);
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

  const handleSendToPlotter = async () => {
    if (elements.length === 0) {
      alert('Adicione elementos para cortar!');
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
      alert(result.message || 'Job enviado com sucesso!');
    } catch (error) {
      console.error('Erro ao enviar:', error);
      alert('Falha ao enviar para a plotter.');
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
          if (window.confirm('Este arquivo parece ser um Job completo. Deseja limpar o canvas e abrir como uma nova folha de corte?')) {
            const result = parseMglToElements(content);
            if (result.elements.length > 0) {
              setElements(result.elements);
              setDocSettings({
                ...docSettings,
                width: Math.ceil(result.dimensions.width),
                height: Math.ceil(result.dimensions.height)
              });
              setZoom(0.5); // Ajusta o zoom para ver a folha toda
              alert(`Job carregado: Folha ajustada para ${Math.ceil(result.dimensions.width)}x${Math.ceil(result.dimensions.height)}mm`);
            }
          } else {
            await transports[activeTransportKind].send(content);
          }
        }
      };
      reader.readAsText(file);
    } catch (error) {
      console.error('Erro:', error);
      alert('Falha ao disparar arquivo.');
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
    setSelectedIds([newCircle.id]);
  };

  const handleUpdateElement = (id: string, attrs: any) => {
    setElements(elements.map(el => el.id === id ? { ...el, ...attrs } : el));
  };

  const deleteSelected = () => {
    setElements(elements.filter(el => !selectedIds.includes(el.id)));
    setSelectedIds([]);
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
                {plotterConnected ? 'MIMAKI CONNECTED' : 'DISCONNECTED'}
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
              title="Windows USB"
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
              onClick={() => {
                setActiveTab('library');
                setSidebarOpen(true);
              }} 
              className={`w-14 h-14 flex items-center justify-center rounded-2xl transition-all active:scale-90 ${activeTab === 'library' && sidebarOpen ? 'bg-cyber-cyan text-black shadow-[0_0_15px_rgba(0,242,255,0.4)]' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'}`}
              title="Biblioteca"
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
          
          {/* Zoom Controls */}
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
              selectedIds={selectedIds}
              onSelect={setSelectedIds}
              onUpdateElement={handleUpdateElement}
              zoom={zoom}
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
                {(['tools', 'library', 'settings', 'layers'] as const).map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2.5 text-[10px] font-black tracking-widest uppercase rounded-lg transition-all ${activeTab === tab ? 'bg-zinc-800 text-cyber-cyan shadow-inner' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-8">
                {activeTab === 'tools' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-[10px] font-black tracking-[0.2em] text-zinc-600 uppercase mb-5">Presets de Material</h3>
                      <div className="grid gap-2.5">
                        {PRESETS.map(p => (
                          <button
                            key={p.name}
                            onClick={() => setDocSettings({...docSettings, cutSettings: p})}
                            className={`p-4 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                              docSettings.cutSettings?.name === p.name 
                              ? 'border-cyber-cyan bg-cyber-cyan/10 text-cyber-cyan shadow-[0_0_15px_rgba(0,242,255,0.1)]' 
                              : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 text-zinc-400'
                            }`}
                          >
                            <div className="font-bold text-sm mb-1">{p.name}</div>
                            <div className="text-[9px] font-black opacity-50 tracking-wider">
                              PRESS: {p.pressure > 0 ? `${p.pressure}g` : 'AUTO'} | SPEED: {p.speed > 0 ? `${p.speed}cm/s` : 'AUTO'}
                            </div>
                          </button>
                        ))}
                      </div>
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

                {activeTab === 'library' && (
                  <div className="space-y-6 animate-in slide-in-from-right-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[10px] font-black tracking-[0.2em] text-zinc-600 uppercase">Biblioteca de Vetores</h3>
                      <button 
                        onClick={fetchLibrary}
                        className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-cyber-cyan transition-all"
                        title="Atualizar"
                      >
                        <Plus size={16} className={isFetchingLibrary ? 'animate-spin' : ''} />
                      </button>
                    </div>

                    {isFetchingLibrary ? (
                      <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <div className="w-8 h-8 border-2 border-cyber-cyan border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-[10px] font-black tracking-widest text-zinc-600 uppercase">Buscando arquivos...</span>
                      </div>
                    ) : libraryFiles.length === 0 ? (
                      <div className="text-center py-20 px-4">
                        <FolderOpen size={40} className="mx-auto text-zinc-800 mb-4" />
                        <p className="text-xs text-zinc-500 font-medium">Nenhum arquivo encontrado na pasta public.</p>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {libraryFiles.map((file, i) => (
                          <button
                             key={i}
                             onClick={() => handleLibraryItemClick(file)}
                             className="group p-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:border-cyber-cyan hover:bg-cyber-cyan/5 transition-all text-left flex items-center gap-3 active:scale-[0.98]"
                           >
                             <div className="w-12 h-12 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-center text-zinc-700 group-hover:text-cyber-cyan transition-colors overflow-hidden">
                               <LibraryItemPreview filePath={file.path} />
                             </div>
                             <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-zinc-300 truncate group-hover:text-white transition-colors">{file.name}</div>
                              <div className="text-[9px] font-black text-zinc-600 uppercase tracking-tighter mt-0.5">
                                {file.category} • {(file.size / 1024).toFixed(1)} KB
                              </div>
                            </div>
                            <ChevronRight size={14} className="text-zinc-800 group-hover:text-cyber-cyan transition-colors" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'settings' && (
                  <div className="space-y-6 animate-in slide-in-from-right-4">
                    <div>
                      <h3 className="text-[10px] font-black tracking-[0.2em] text-zinc-600 uppercase mb-5">Área de Trabalho</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-zinc-500 uppercase">Largura (mm)</label>
                          <input 
                            type="number" 
                            value={docSettings.width} 
                            onChange={e => setDocSettings({...docSettings, width: Number(e.target.value)})}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm focus:border-cyber-cyan outline-none" 
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-zinc-500 uppercase">Altura (mm)</label>
                          <input 
                            type="number" 
                            value={docSettings.height} 
                            onChange={e => setDocSettings({...docSettings, height: Number(e.target.value)})}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm focus:border-cyber-cyan outline-none" 
                          />
                        </div>
                      </div>
                    </div>
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

      {/* Footer Industrial Style */}
      <footer className="h-10 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between px-5 text-[9px] font-black tracking-[0.15em] text-zinc-600 uppercase">
        <div className="flex gap-6 items-center">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyber-cyan"></div>
            <span>ENGINE: MGL-IIC v9.4</span>
          </div>
          <span className="hidden sm:inline">|</span>
          <span className="hidden sm:inline">TRANSPORT: {TRANSPORT_LABELS[activeTransportKind]}</span>
          <span className="hidden sm:inline">|</span>
          <span className="hidden sm:inline">VIEWPORT: {(zoom * 100).toFixed(0)}%</span>
        </div>
        <div className="flex gap-6 items-center text-zinc-500">
          <span>{elements.length} OBJECTS LOADED</span>
          <div className="bg-zinc-800 px-2 py-0.5 rounded text-cyber-cyan">
            READY TO PLOT
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
