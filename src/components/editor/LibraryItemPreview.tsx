import React, { useEffect, useState } from 'react';
import { parseMglToElements } from '../../utils/mglParser';
import { CanvasElement } from '../../types/canvas-elements';

interface LibraryItemPreviewProps {
  filePath: string;
}

export const LibraryItemPreview: React.FC<LibraryItemPreviewProps> = ({ filePath }) => {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAndParse = async () => {
      try {
        const response = await fetch(`/${filePath}`);
        const content = await response.text();
        const result = parseMglToElements(content);
        setElements(result.elements);
      } catch (error) {
        console.error('Erro no preview:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAndParse();
  }, [filePath]);

  if (loading) {
    return <div className="w-full h-full bg-zinc-950 animate-pulse" />;
  }

  if (elements.length === 0) {
    return (
      <div className="w-full h-full bg-zinc-950 flex items-center justify-center text-[8px] text-zinc-800 uppercase font-black">
        No Preview
      </div>
    );
  }

  // Gera um mini SVG do primeiro path ou de todos os paths combinados
  const paths = elements.filter(el => el.type === 'path') as any[];
  
  return (
    <svg 
      viewBox="0 0 600 1000" 
      className="w-full h-full p-1 opacity-40 group-hover:opacity-100 transition-opacity"
      preserveAspectRatio="xMidYMid meet"
    >
      {paths.map((p, i) => (
        <path 
          key={i} 
          d={p.data} 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        />
      ))}
    </svg>
  );
};
