import { CanvasElement, DocumentSettings } from '../../types/canvas-elements';
import { AndroidOtgTransport } from './transports/androidOtgTransport';
import { sendMimakiJob } from './sendMimakiJob';

const smokeTestSettings: DocumentSettings = {
  width: 1000,
  height: 1000,
  dpi: 300,
  unit: 'px',
  background: '#000',
  cutSettings: {
    name: 'Smoke Test',
    tool: 'CT1',
    speed: 20,
    pressure: 50,
    offset: 0.3
  }
};

const smokeTestElements: CanvasElement[] = [
  {
    id: 'smoke-rect',
    type: 'shape',
    shapeType: 'rectangle',
    x: 4,
    y: 4,
    width: 120,
    height: 80,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    locked: false
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
