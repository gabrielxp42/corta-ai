import { describe, expect, it } from 'vitest';
import { sendMimakiJob, prepareMimakiJob } from './sendMimakiJob';
import { MimakiTransport } from './transport';
import { CanvasElement, DocumentSettings } from '../../types/canvas-elements';

const documentSettings: DocumentSettings = {
  width: 1000,
  height: 1000,
  dpi: 300,
  unit: 'mm',
  background: '#000',
  mirror: false,
  cutSettings: {
    name: 'Vinil Adesivo',
    tool: 'CT1',
    speed: 20,
    pressure: 50,
    offset: 0.3,
    overcutMm: 0.2
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
    expect(prepared.payload).toContain('ZX1185.20;');
    expect(prepared.payload).toContain('CT1;');
    expect(prepared.payload).toContain('PD47573.20,160.00;');
    expect(prepared.payload).toContain('PD160.00,168.00;');
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
    expect(capturedPayload).toContain(';PU63413.20,0.00;');
    expect(result.success).toBe(true);
  });

  it('espelha o payload quando o mirror estiver ativo', () => {
    const mirrored = prepareMimakiJob(
      [
        {
          id: 'mirror-rect',
          type: 'shape',
          shapeType: 'rectangle',
          x: 10,
          y: 10,
          width: 20,
          height: 10,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true,
          locked: false
        }
      ],
      {
        width: 100,
        height: 100,
        dpi: 300,
        unit: 'mm',
        background: '#000',
        mirror: true,
        cutSettings: documentSettings.cutSettings
      }
    );

    expect(mirrored.payload).toContain('PD3600.00,400.00;');
    expect(mirrored.payload).toContain('PD2800.00,800.00;');
  });

  it('nao envia comandos de condicao quando o modo estiver na maquina', () => {
    const prepared = prepareMimakiJob(elements, {
      ...documentSettings,
      cutConditionMode: 'machine'
    });

    expect(prepared.payload).not.toContain('CT1;');
    expect(prepared.payload).not.toContain('VS20;');
    expect(prepared.payload).not.toContain('FS50;');
  });

  it('percorre a fileira da direita para a esquerda no modo Mimaki', () => {
    const prepared = prepareMimakiJob(
      [
        {
          id: 'left',
          type: 'shape',
          shapeType: 'rectangle',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true,
          locked: false
        },
        {
          id: 'center',
          type: 'shape',
          shapeType: 'rectangle',
          x: 20,
          y: 0,
          width: 10,
          height: 10,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true,
          locked: false
        },
        {
          id: 'right',
          type: 'shape',
          shapeType: 'rectangle',
          x: 40,
          y: 0,
          width: 10,
          height: 10,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true,
          locked: false
        }
      ],
      {
        ...documentSettings,
        cutTraversalMode: 'mimaki'
      }
    );

    const rightIndex = prepared.payload.indexOf('PU1600.00,0.00;');
    const centerIndex = prepared.payload.indexOf('PU800.00,0.00;');
    const leftIndex = prepared.payload.indexOf('PU0.00,0.00;');

    expect(rightIndex).toBeGreaterThan(-1);
    expect(centerIndex).toBeGreaterThan(rightIndex);
    expect(leftIndex).toBeGreaterThan(centerIndex);
  });
});
