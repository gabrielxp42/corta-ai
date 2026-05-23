import { MimakiOtg } from '../plugins/mimakiOtgPlugin';
import { MimakiTransport, SendJobOptions, SendJobResult, DEFAULT_MIMAKI_DEVICE } from '../transport';

export class AndroidOtgTransport implements MimakiTransport {
  readonly kind = 'android-otg';

  async isAvailable(): Promise<boolean> {
    try {
      const result = await MimakiOtg.isAvailable();
      return result.value;
    } catch {
      return false;
    }
  }

  async send(payload: string, options?: SendJobOptions): Promise<SendJobResult> {
    const device = options?.device ?? DEFAULT_MIMAKI_DEVICE;

    const permission = await MimakiOtg.requestPermission({
      vendorId: device.vendorId,
      productId: device.productId
    });

    if (!permission.deviceFound) {
      throw new Error(permission.message || 'Nenhuma Mimaki compatível foi encontrada no USB OTG.');
    }

    if (!permission.granted) {
      throw new Error(permission.message || 'Permissão USB OTG negada no Android.');
    }

    const connection = await MimakiOtg.connect({
      vendorId: device.vendorId,
      productId: device.productId
    });

    if (!connection.success) {
      throw new Error(connection.message || 'Falha ao conectar com a Mimaki via OTG.');
    }

    const response = await MimakiOtg.sendJob({ payload });
    if (!response.success) {
      throw new Error(response.message || 'Falha ao enviar job para a Mimaki.');
    }

    return {
      success: true,
      transport: this.kind,
      bytesSent: response.bytesSent ?? new TextEncoder().encode(payload).length,
      message: response.message ?? 'Job enviado para a Mimaki via Android OTG.'
    };
  }
}
