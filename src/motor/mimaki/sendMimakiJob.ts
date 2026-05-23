import { CanvasElement, DocumentSettings } from '../../types/canvas-elements';
import { buildMimakiJob } from './buildMimakiJob';
import { MimakiTransport, SendJobResult } from './transport';

export interface SendMimakiJobParams {
  elements: CanvasElement[];
  documentSettings: DocumentSettings;
  transport: MimakiTransport;
  fileName?: string;
}

export interface PreparedMimakiJob {
  payload: string;
  bytes: number;
}

export const prepareMimakiJob = (
  elements: CanvasElement[],
  documentSettings: DocumentSettings
): PreparedMimakiJob => {
  const payload = buildMimakiJob(elements, documentSettings);
  return {
    payload,
    bytes: new TextEncoder().encode(payload).length
  };
};

export const sendMimakiJob = async ({
  elements,
  documentSettings,
  transport,
  fileName = 'FCCommand.dat'
}: SendMimakiJobParams): Promise<SendJobResult> => {
  const payload = buildMimakiJob(elements, documentSettings);
  return transport.send(payload, { fileName });
};
