import { registerPlugin } from '@capacitor/core';

export interface MimakiUsbDeviceOptions {
  vendorId?: number;
  productId?: number;
}

export interface MimakiPermissionResult {
  granted: boolean;
  deviceFound: boolean;
  message?: string;
}

export interface MimakiConnectResult {
  success: boolean;
  message?: string;
  deviceName?: string;
}

export interface MimakiSendJobResult {
  success: boolean;
  bytesSent?: number;
  message?: string;
}

export interface MimakiStatusResult {
  connected: boolean;
  status: string;
  deviceName?: string;
}

export interface MimakiAvailabilityResult {
  value: boolean;
}

export interface MimakiOtgPlugin {
  isConnected(): Promise<{ connected: boolean }>;
  isAvailable(): Promise<MimakiAvailabilityResult>;
  requestPermission(options?: MimakiUsbDeviceOptions): Promise<MimakiPermissionResult>;
  connect(options?: MimakiUsbDeviceOptions): Promise<MimakiConnectResult>;
  sendJob(options: { payload: string }): Promise<MimakiSendJobResult>;
  disconnect(): Promise<{ success: boolean }>;
  getStatus(): Promise<MimakiStatusResult>;
}

export const MimakiOtg = registerPlugin<MimakiOtgPlugin>('MimakiOtg');
