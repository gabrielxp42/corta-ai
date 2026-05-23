/**
 * Utilitário para carregamento automático de fontes customizadas.
 * Escaneia a pasta de assets/fonts e gera as regras @font-face dinamicamente.
 */

export interface CustomFont {
  family: string;
  url: string;
  format: string;
}

// Escaneia a pasta de fontes por arquivos .ttf e .otf
const fontModules = import.meta.glob('../assets/fonts/**/*.{ttf,otf,woff,woff2}', { eager: true, query: '?url', import: 'default' });

export const getCustomFonts = (): CustomFont[] => {
  return Object.entries(fontModules).map(([path, moduleUrl]: [string, unknown]) => {   
    const parts = path.split('/');
    const fileName = parts[parts.length - 1];
    const fileNameWithoutExtension = fileName.replace(/\.(ttf|otf|woff2|woff)$/i, '');
    const family = fileNameWithoutExtension
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const format = fileName.endsWith('.ttf') ? 'truetype' :
                   fileName.endsWith('.otf') ? 'opentype' :
                   fileName.endsWith('.woff2') ? 'woff2' : 'woff';

    const urlStr = String(moduleUrl);
    // Evita encode duplo caso o Vite já tenha encodado
    const safeUrl = urlStr.includes('%20') ? urlStr : encodeURI(urlStr);

    return {
      family,
      url: safeUrl,
      format
    };
  });
};

/**
 * Injeta as regras @font-face no documento para que o navegador reconheça as fontes
 */
export const injectCustomFonts = () => {
  const fonts = getCustomFonts();
  if (fonts.length === 0) return;

  const styleId = 'custom-fonts-styles';
  let styleElement = document.getElementById(styleId) as HTMLStyleElement;

  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = styleId;
    document.head.appendChild(styleElement);
  }

  const fontFaces = fonts.map(font => `
    @font-face {
      font-family: '${font.family}';
      src: url('${font.url}');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }
  `).join('\n');

  styleElement.innerHTML = fontFaces;
  
  return fonts.map(f => f.family);
};

// Exporta a lista de nomes de famílias para o seletor da UI
export const CUSTOM_FONT_FAMILIES = getCustomFonts().map(f => f.family);
