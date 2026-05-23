import { MimakiTransport, SendJobOptions, SendJobResult } from '../transport';

export class DownloadTransport implements MimakiTransport {
  readonly kind = 'download';

  async isAvailable(): Promise<boolean> {
    return typeof document !== 'undefined';
  }

  async send(payload: string, options?: SendJobOptions): Promise<SendJobResult> {
    const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = options?.fileName ?? 'FCCommand.dat';
    anchor.click();
    URL.revokeObjectURL(url);

    return {
      success: true,
      transport: this.kind,
      bytesSent: new TextEncoder().encode(payload).length,
      message: 'Arquivo de corte baixado para debug local.'
    };
  }
}
