import { MimakiTransport, SendJobOptions, SendJobResult } from '../transport';

const BRIDGE_URL = 'http://127.0.0.1:17871';

interface BridgeHealthResponse {
  ok: boolean;
  connected: boolean;
  device?: {
    name: string;
    path: string;
  };
}

interface BridgeSendResponse {
  ok: boolean;
  transport: string;
  message?: string;
  bytesSent: number;
  deviceName?: string;
  error?: string;
}

const fetchWithTimeout = async (input: RequestInfo | URL, init?: RequestInit, timeoutMs = 1200) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export class WindowsBridgeTransport implements MimakiTransport {
  readonly kind = 'windows-bridge';

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetchWithTimeout(`${BRIDGE_URL}/health`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async hasPairedDevice(): Promise<boolean> {
    try {
      const response = await fetchWithTimeout(`${BRIDGE_URL}/health`, {
        method: 'GET',
      });
      if (!response.ok) {
        return false;
      }

      const data = (await response.json()) as BridgeHealthResponse;
      return Boolean(data.ok && data.connected);
    } catch {
      return false;
    }
  }

  async send(payload: string, options?: SendJobOptions): Promise<SendJobResult> {
    const response = await fetchWithTimeout(
      `${BRIDGE_URL}/send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payload,
          fileName: options?.fileName ?? 'FCCommand.dat',
        }),
      },
      10000,
    );

    const data = (await response.json()) as BridgeSendResponse;
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Bridge Windows recusou o envio.');
    }

    return {
      success: true,
      transport: this.kind,
      bytesSent: data.bytesSent,
      message: data.message || `Job enviado para ${data.deviceName ?? 'a Mimaki'} pelo bridge local.`,
    };
  }
}
