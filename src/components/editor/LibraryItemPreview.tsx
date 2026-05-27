import React, { memo, useEffect, useRef, useState } from 'react';
import { parseMglToElements } from '../../utils/mglParser';
import { CanvasElement } from '../../types/canvas-elements';

interface LibraryItemPreviewProps {
  filePath: string;
  lazy?: boolean;
}

const PREVIEW_COLOR = '#00f2ff';
const svgMarkupCache = new Map<string, string>();
const parsedElementsCache = new Map<string, CanvasElement[]>();

const applyPreviewColorToSvg = (svgContent: string): string => {
  const styleTag = `
    <style>
      path, rect, circle, ellipse, polygon, polyline, line, text {
        fill: ${PREVIEW_COLOR} !important;
        stroke: ${PREVIEW_COLOR} !important;
      }
      [fill="none"], [fill="transparent"] {
        fill: none !important;
      }
      [stroke="none"], [stroke="transparent"] {
        stroke: none !important;
      }
    </style>
  `;

  const withRootAttrs = svgContent.replace(
    /<svg\b([^>]*)>/i,
    `<svg$1 width="100%" height="100%" preserveAspectRatio="xMidYMid meet" color="${PREVIEW_COLOR}">${styleTag}`
  );

  return withRootAttrs
    .replace(/fill="(?!none|transparent)([^"]*)"/gi, `fill="${PREVIEW_COLOR}"`)
    .replace(/stroke="(?!none|transparent)([^"]*)"/gi, `stroke="${PREVIEW_COLOR}"`)
    .replace(/style="([^"]*)"/gi, (_match, styleContent: string) => {
      const sanitized = styleContent
        .replace(/fill\s*:\s*[^;]+;?/gi, '')
        .replace(/stroke\s*:\s*[^;]+;?/gi, '')
        .trim();

      const suffix = sanitized ? `${sanitized}; ` : '';
      return `style="${suffix}fill: ${PREVIEW_COLOR}; stroke: ${PREVIEW_COLOR};"`;
    });
};

export const LibraryItemPreview: React.FC<LibraryItemPreviewProps> = memo(({ filePath, lazy = false }) => {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [svgMarkup, setSvgMarkup] = useState('');
  const [loading, setLoading] = useState(!lazy);
  const [shouldLoad, setShouldLoad] = useState(!lazy);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isSvg = filePath.toLowerCase().endsWith('.svg');

  useEffect(() => {
    setElements([]);
    setSvgMarkup('');
    setLoading(!lazy);
    setShouldLoad(!lazy);
  }, [filePath, lazy]);

  useEffect(() => {
    if (!lazy || shouldLoad || !containerRef.current || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px' }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [lazy, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) {
      return;
    }

    const fetchAndParse = async () => {
      const cachedSvgMarkup = svgMarkupCache.get(filePath);
      if (cachedSvgMarkup) {
        setSvgMarkup(cachedSvgMarkup);
        setLoading(false);
        return;
      }

      const cachedElements = parsedElementsCache.get(filePath);
      if (cachedElements) {
        setElements(cachedElements);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/${filePath}`);
        const content = await response.text();

        if (isSvg) {
          const markup = applyPreviewColorToSvg(content);
          svgMarkupCache.set(filePath, markup);
          setSvgMarkup(markup);
        } else {
          const result = parseMglToElements(content);
          parsedElementsCache.set(filePath, result.elements);
          setElements(result.elements);
        }
      } catch (error) {
        console.error('Erro no preview:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAndParse();
  }, [filePath, isSvg, shouldLoad]);

  const content = (() => {
    if (!shouldLoad || loading) {
      return <div className="h-full w-full bg-zinc-950/80" />;
    }

    if (isSvg) {
      return (
        <div
          className="h-full w-full p-1 opacity-70 transition-opacity group-hover:opacity-100 [&_svg]:h-full [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      );
    }

    if (elements.length === 0) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-[8px] font-black uppercase text-zinc-800">
          Sem previa
        </div>
      );
    }

    const paths = elements.filter(el => el.type === 'path') as any[];

    return (
      <div
        className="h-full w-full p-1 opacity-40 transition-opacity group-hover:opacity-100"
      >
        <svg
          viewBox="0 0 600 1000"
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {paths.map((p, i) => (
            <path
              key={i}
              d={p.data}
              fill="none"
              stroke={PREVIEW_COLOR}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      </div>
    );
  })();

  return <div ref={containerRef} className="h-full w-full">{content}</div>;
});
