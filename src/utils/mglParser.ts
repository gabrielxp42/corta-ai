import { CanvasElement } from '../types/canvas-elements';

/**
 * Utilitário para transformar arquivos MGL-IIc / PLT (Mimaki) de volta em elementos visuais
 */
export const parseMglToElements = (content: string) => {
  const elements: CanvasElement[] = [];
  const lines = content.split(';');
  
  let currentPoints: number[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  // Fator de conversão: Mimaki usa unidades de 0.025mm (40 unidades por mm)
  // Mas vamos manter 1:1 com o que o motor de envio usa para consistência
  const SCALE = 0.025; 

  lines.forEach((line, index) => {
    const cmd = line.trim().substring(0, 2);
    const coords = line.trim().substring(2);
    
    if (cmd === 'PU' || cmd === 'PD') {
      const parts = coords.split(',').map(Number);
      if (parts.length === 2 && !isNaN(parts[0])) {
        const x = parts[0] * SCALE;
        const y = parts[1] * SCALE;
        
        // Atualiza limites do job
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        
        if (cmd === 'PD') {
          currentPoints.push(x, y);
        } else {
          if (currentPoints.length > 0) {
            elements.push(createPathElement(`imported-${index}`, currentPoints));
            currentPoints = [];
          }
          currentPoints.push(x, y);
        }
      }
    }
  });

  if (currentPoints.length > 2) {
    elements.push(createPathElement('imported-last', currentPoints));
  }

  return {
    elements,
    dimensions: {
      width: maxX - minX > 0 ? maxX - minX + 10 : 600,
      height: maxY - minY > 0 ? maxY - minY + 10 : 1000,
      minX,
      minY
    }
  };
};

const createPathElement = (id: string, points: number[]): any => ({
  id,
  type: 'path',
  x: 0,
  y: 0,
  data: pointsToPathData(points),
  stroke: '#00f2ff',
  strokeWidth: 0.5,
  visible: true,
  locked: true // Trava jobs importados para evitar mover bolinhas sem querer
});

const pointsToPathData = (points: number[]): string => {
  if (points.length < 4) return '';
  let path = `M ${points[0]} ${points[1]}`;
  for (let i = 2; i < points.length; i += 2) {
    path += ` L ${points[i]} ${points[i+1]}`;
  }
  return path;
};
