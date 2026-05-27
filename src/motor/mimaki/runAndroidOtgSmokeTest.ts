import { CanvasElement, DocumentSettings } from '../../types/canvas-elements';
import { AndroidOtgTransport } from './transports/androidOtgTransport';
import { sendMimakiJob } from './sendMimakiJob';

const smokeTestSettings: DocumentSettings = {
  width: 100,
  height: 100,
  dpi: 300,
  unit: 'mm',
  background: '#000',
  mirror: false,
  cutSettings: {
    name: 'Smoke Test',
    tool: 'CT1',
    speed: 20,
    pressure: 50,
    offset: 0.3,
    overcutMm: 0.2
  }
};

const smokeTestElements: CanvasElement[] = [
  {
    id: 'smoke-rect',
    type: 'shape',
    shapeType: 'rectangle',
    x: 10,
    y: 10,
    width: 50,
    height: 30,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    locked: false,
    stroke: '#00f2ff',
    strokeWidth: 1
  }
];

export const runAndroidOtgSmokeTest = async () => {
  const transport = new AndroidOtgTransport();

  return sendMimakiJob({
    elements: smokeTestElements,
    documentSettings: smokeTestSettings,
    transport,
    fileName: 'FCCommand-smoke.dat'
  });
};
