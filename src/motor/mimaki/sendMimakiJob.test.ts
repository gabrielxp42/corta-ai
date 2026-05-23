import { describe, expect, it } from 'vitest';
import { sendMimakiJob, prepareMimakiJob } from './sendMimakiJob';
import { MimakiTransport } from './transport';
import { CanvasElement, DocumentSettings } from '../../types/canvas-elements';

const documentSettings: DocumentSettings = {
  width: 1000,
  height: 1000,
  dpi: 300,
  unit: 'px',
  background: '#000',
  cutSettings: {
    name: 'Vinil Adesivo',
    tool: 'CT1',
    speed: 20,
    pressure: 50,
    offset: 0.3
  }
};

const elements: CanvasElement[] = [
  {
    id: 'rect-1',
    type: 'shape',
    shapeType: 'rectangle',
    x: 4,
    y: 4,
    width: 1185.33,
    height: 1637.91,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    locked: false
  }
];

describe('sendMimakiJob', () => {
  it('prepara o payload MGL antes do envio', () => {
    const prepared = prepareMimakiJob(elements, documentSettings);

    expect(prepared.payload).toContain('IN;');
    expect(prepared.payload).toContain('ZX29.63;');
    expect(prepared.payload).toContain('PD1189.33,4.00;');
    expect(prepared.bytes).toBeGreaterThan(0);
  });

  it('envia o payload para o transporte selecionado', async () => {
    let capturedPayload = '';
    let sendCalls = 0;

    const transport: MimakiTransport = {
      kind: 'fake',
      isAvailable: async () => true,
      send: async (payload: string) => {
        sendCalls += 1;
        capturedPayload = payload;
        return {
          success: true,
          transport: 'fake',
          bytesSent: 123
        };
      }
    };

    const result = await sendMimakiJob({
      elements,
      documentSettings,
      transport
    });

    expect(sendCalls).toBe(1);
    expect(capturedPayload).toContain('IN;');
    expect(capturedPayload).toContain(';PU1585.33,0.00;');
    expect(result.success).toBe(true);
  });
});
