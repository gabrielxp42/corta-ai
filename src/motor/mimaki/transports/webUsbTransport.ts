import {
  DEFAULT_MIMAKI_DEVICE,
  MimakiDeviceProfile,
  MimakiTransport,
  SendJobOptions,
  SendJobResult
} from '../transport';

const USB_TRANSFER_CHUNK_SIZE = 4096;

const getUsb = (): USB | null => {
  if (typeof navigator === 'undefined' || typeof navigator.usb === 'undefined') {
    return null;
  }

  return navigator.usb;
};

const matchesDevice = (device: USBDevice, profile: MimakiDeviceProfile): boolean => {
  if (profile.vendorId !== undefined && device.vendorId !== profile.vendorId) {
    return false;
  }

  if (profile.productId !== undefined && device.productId !== profile.productId) {
    return false;
  }

  return true;
};

export class WebUsbTransport implements MimakiTransport {
  readonly kind = 'web-usb';

  async isAvailable(): Promise<boolean> {
    return getUsb() !== null && window.isSecureContext;
  }

  async hasPairedDevice(deviceProfile: MimakiDeviceProfile = DEFAULT_MIMAKI_DEVICE): Promise<boolean> {
    const usb = getUsb();
    if (!usb || !(await this.isAvailable())) {
      return false;
    }

    const devices = await usb.getDevices();
    return devices.some(device => matchesDevice(device, deviceProfile));
  }

  async send(payload: string, options?: SendJobOptions): Promise<SendJobResult> {
    const usb = getUsb();
    if (!usb || !(await this.isAvailable())) {
      throw new Error('WebUSB não está disponível neste navegador. Use Chrome ou Edge em localhost/HTTPS.');
    }

    const deviceProfile = options?.device ?? DEFAULT_MIMAKI_DEVICE;
    const device = await this.getOrRequestDevice(usb, deviceProfile);
    const endpoint = await this.openWritableEndpoint(device);
    const bytes = new TextEncoder().encode(payload);

    let bytesSent = 0;

    try {
      for (let offset = 0; offset < bytes.length; offset += USB_TRANSFER_CHUNK_SIZE) {
        const chunk = bytes.slice(offset, offset + USB_TRANSFER_CHUNK_SIZE);
        const result = await device.transferOut(endpoint.endpointNumber, chunk);

        if (result.status !== 'ok') {
          throw new Error(`Falha no envio USB (${result.status}).`);
        }

        bytesSent += result.bytesWritten ?? chunk.length;
      }
    } finally {
      await this.safeClose(device);
    }

    return {
      success: true,
      transport: this.kind,
      bytesSent,
      message: 'Job enviado para a Mimaki via WebUSB no Windows.'
    };
  }

  private async getOrRequestDevice(usb: USB, deviceProfile: MimakiDeviceProfile): Promise<USBDevice> {
    const pairedDevices = await usb.getDevices();
    const pairedDevice = pairedDevices.find(device => matchesDevice(device, deviceProfile));
    if (pairedDevice) {
      return pairedDevice;
    }

    try {
      return await usb.requestDevice({
        filters: [
          {
            vendorId: deviceProfile.vendorId,
            productId: deviceProfile.productId
          }
        ]
      });
    } catch (error) {
      const domError = error as DOMException;
      if (domError.name === 'NotFoundError') {
        throw new Error('Seleção da Mimaki cancelada no navegador.');
      }

      throw error;
    }
  }

  private async openWritableEndpoint(device: USBDevice): Promise<{
    interfaceNumber: number;
    alternateSetting: number;
    endpointNumber: number;
  }> {
    if (!device.opened) {
      await device.open();
    }

    const configurationValue = device.configuration?.configurationValue ?? device.configurations[0]?.configurationValue ?? 1;
    if (device.configuration?.configurationValue !== configurationValue) {
      await device.selectConfiguration(configurationValue);
    }

    const endpoint = this.findBulkOutEndpoint(device);
    if (!endpoint) {
      throw new Error('Nenhum endpoint USB de escrita foi encontrado para a Mimaki.');
    }

    const currentInterface = device.configuration?.interfaces.find(
      usbInterface => usbInterface.interfaceNumber === endpoint.interfaceNumber
    );

    if (!currentInterface?.claimed) {
      await device.claimInterface(endpoint.interfaceNumber);
    }

    await device.selectAlternateInterface(endpoint.interfaceNumber, endpoint.alternateSetting);

    return endpoint;
  }

  private findBulkOutEndpoint(device: USBDevice): {
    interfaceNumber: number;
    alternateSetting: number;
    endpointNumber: number;
  } | null {
    const configuration = device.configuration;
    if (!configuration) {
      return null;
    }

    for (const usbInterface of configuration.interfaces) {
      for (const alternate of usbInterface.alternates) {
        const endpoint = alternate.endpoints.find(candidate => candidate.direction === 'out' && candidate.type === 'bulk');
        if (endpoint) {
          return {
            interfaceNumber: usbInterface.interfaceNumber,
            alternateSetting: alternate.alternateSetting,
            endpointNumber: endpoint.endpointNumber
          };
        }
      }
    }

    return null;
  }

  private async safeClose(device: USBDevice): Promise<void> {
    try {
      if (device.opened) {
        await device.close();
      }
    } catch {
      // Ignora erros no fechamento para não mascarar falhas reais de envio.
    }
  }
}
