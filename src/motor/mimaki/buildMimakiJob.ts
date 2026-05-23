import { CanvasElement, DocumentSettings } from '../../types/canvas-elements';
import { MGLConverter } from '../../utils/mglConverter';

export const buildMimakiJob = (
  elements: CanvasElement[],
  documentSettings: DocumentSettings
): string => {
  const converter = new MGLConverter(documentSettings.dpi);
  const cut = documentSettings.cutSettings;

  converter.init({
    pressure: cut?.pressure,
    speed: cut?.speed,
    offset: cut?.offset,
    tool: cut?.tool,
    includeConditionCommands: false
  });

  for (const element of elements) {
    if (element.type !== 'shape') {
      continue;
    }

    if (element.shapeType === 'rectangle') {
      converter.addRectangle(
        element.x,
        element.y,
        element.width * element.scaleX,
        element.height * element.scaleY,
        element.rotation
      );
    }

    if (element.shapeType === 'circle') {
      const radius = (element.radius ?? element.width / 2) * element.scaleX;
      converter.addCircle(element.x + radius, element.y + radius, radius);
    }
  }

  converter.finish();
  return converter.getOutput();
};
