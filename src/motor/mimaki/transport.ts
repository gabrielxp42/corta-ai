export interface MimakiDeviceProfile {
  vendorId?: number;
  productId?: number;
  model?: string;
}

export interface SendJobOptions {
  fileName?: string;
  device?: MimakiDeviceProfile;
}

export interface SendJobResult {
  success: boolean;
  transport: string;
  bytesSent: number;
  message?: string;
}

export interface MimakiTransport {
  readonly kind: string;
  isAvailable(): Promise<boolean>;
  send(payload: string, options?: SendJobOptions): Promise<SendJobResult>;
}

export const DEFAULT_MIMAKI_DEVICE: MimakiDeviceProfile = {
  vendorId: 0x0a50,
  productId: 0x0101,
  model: 'Mimaki CG-AR'
};
