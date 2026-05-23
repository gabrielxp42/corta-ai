export interface AndroidMimakiSendResult {
  success: boolean;
  bytesSent?: number;
  message?: string;
}

export interface AndroidOTGBridgeAPI {
  isAvailable?: () => boolean | Promise<boolean>;
  requestPermission?: (vendorId?: number, productId?: number) => boolean | Promise<boolean>;
  connect?: (vendorId?: number, productId?: number) => boolean | Promise<boolean>;
  sendJob?: (payload: string) => AndroidMimakiSendResult | Promise<AndroidMimakiSendResult>;
  disconnect?: () => void | Promise<void>;
  getStatus?: () => string | Promise<string>;
}

declare global {
  interface Window {
    AndroidOTGBridge?: AndroidOTGBridgeAPI;
  }
}

export {};
