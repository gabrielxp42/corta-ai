package com.overpixel.cortaai;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;

import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;

@CapacitorPlugin(name = "MimakiOtg")
public class MimakiOtgPlugin extends Plugin {
    private static final String ACTION_USB_PERMISSION = "com.overpixel.cortaai.USB_PERMISSION";
    private static final int DEFAULT_VENDOR_ID = 0x0A50;
    private static final int DEFAULT_PRODUCT_ID = 0x0101;
    private static final int USB_TIMEOUT_MS = 5000;
    private static final int CHUNK_SIZE = 4096;

    private UsbManager usbManager;
    private UsbDevice currentDevice;
    private UsbDeviceConnection connection;
    private UsbInterface dataInterface;
    private UsbEndpoint dataOutEndpoint;
    private boolean receiverRegistered = false;
    private PluginCall pendingPermissionCall;

    private final BroadcastReceiver usbPermissionReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!ACTION_USB_PERMISSION.equals(intent.getAction())) {
                return;
            }

            if (pendingPermissionCall == null) {
                return;
            }

            synchronized (this) {
                UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);

                JSObject result = new JSObject();
                result.put("granted", granted);
                result.put("deviceFound", device != null);
                result.put("message", granted ? "Permissão OTG concedida." : "Permissão OTG negada.");

                pendingPermissionCall.resolve(result);
                pendingPermissionCall = null;
            }
        }
    };

    @Override
    public void load() {
        usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        registerUsbReceiver();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        disconnectInternal();
        unregisterUsbReceiver();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("value", usbManager != null);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        UsbDevice device = findTargetDevice(call);
        JSObject result = new JSObject();

        if (device == null) {
            result.put("granted", false);
            result.put("deviceFound", false);
            result.put("message", "Mimaki USB não encontrada no OTG.");
            call.resolve(result);
            return;
        }

        if (usbManager.hasPermission(device)) {
            result.put("granted", true);
            result.put("deviceFound", true);
            result.put("message", "Permissão OTG já concedida.");
            call.resolve(result);
            return;
        }

        PendingIntent permissionIntent = PendingIntent.getBroadcast(
            getContext(),
            0,
            new Intent(ACTION_USB_PERMISSION),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
        );

        pendingPermissionCall = call;
        usbManager.requestPermission(device, permissionIntent);
    }

    @PluginMethod
    public void isConnected(PluginCall call) {
        UsbManager manager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        HashMap<String, UsbDevice> deviceList = manager.getDeviceList();
        boolean connected = false;

        for (UsbDevice device : deviceList.values()) {
            if (device.getVendorId() == 0x0A50 && device.getProductId() == 0x0101) {
                connected = true;
                break;
            }
        }

        JSObject ret = new JSObject();
        ret.put("connected", connected);
        call.resolve(ret);
    }

    @PluginMethod
    public void connect(PluginCall call) {
        UsbDevice device = findTargetDevice(call);
        if (device == null) {
            call.reject("Mimaki USB não encontrada para conexão.");
            return;
        }

        if (!usbManager.hasPermission(device)) {
            call.reject("Sem permissão USB para acessar a Mimaki.");
            return;
        }

        disconnectInternal();

        connection = usbManager.openDevice(device);
        if (connection == null) {
            call.reject("Falha ao abrir conexão USB com a Mimaki.");
            return;
        }

        UsbInterface selectedDataInterface = null;
        UsbEndpoint selectedOutEndpoint = null;

        for (int interfaceIndex = 0; interfaceIndex < device.getInterfaceCount(); interfaceIndex++) {
            UsbInterface usbInterface = device.getInterface(interfaceIndex);
            if (usbInterface.getId() != 0 && interfaceIndex != 0) {
                continue;
            }

            for (int endpointIndex = 0; endpointIndex < usbInterface.getEndpointCount(); endpointIndex++) {
                UsbEndpoint endpoint = usbInterface.getEndpoint(endpointIndex);
                if (endpoint.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK &&
                    endpoint.getDirection() == UsbConstants.USB_DIR_OUT) {
                    selectedDataInterface = usbInterface;
                    selectedOutEndpoint = endpoint;
                    break;
                }
            }

            if (selectedOutEndpoint != null) {
                break;
            }
        }

        if (selectedDataInterface == null || selectedOutEndpoint == null) {
            disconnectInternal();
            call.reject("Não foi possível localizar o endpoint BULK OUT da Mimaki.");
            return;
        }

        boolean claimed = connection.claimInterface(selectedDataInterface, true);
        if (!claimed) {
            disconnectInternal();
            call.reject("Falha ao assumir a interface USB de dados da Mimaki.");
            return;
        }

        currentDevice = device;
        dataInterface = selectedDataInterface;
        dataOutEndpoint = selectedOutEndpoint;

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("deviceName", device.getDeviceName());
        result.put("message", "Conectado à Mimaki via USB OTG.");
        call.resolve(result);
    }

    @PluginMethod
    public void sendJob(PluginCall call) {
        String payload = call.getString("payload");
        if (payload == null || payload.isEmpty()) {
            call.reject("Payload MGL vazio.");
            return;
        }

        if (connection == null || dataInterface == null || dataOutEndpoint == null) {
            call.reject("Nenhuma conexão OTG ativa com a Mimaki.");
            return;
        }

        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
        int sent = 0;

        while (sent < bytes.length) {
            int remaining = bytes.length - sent;
            int packetSize = Math.min(CHUNK_SIZE, remaining);
            byte[] chunk = new byte[packetSize];
            System.arraycopy(bytes, sent, chunk, 0, packetSize);

            int transferred = connection.bulkTransfer(dataOutEndpoint, chunk, packetSize, USB_TIMEOUT_MS);
            if (transferred < 0) {
                call.reject("Falha no bulkTransfer USB para a Mimaki no byte " + sent + ".");
                return;
            }

            sent += transferred;
        }

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("bytesSent", sent);
        result.put("message", "FCCommand.dat enviado para a Mimaki.");
        call.resolve(result);
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        disconnectInternal();

        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("connected", connection != null && currentDevice != null && dataOutEndpoint != null);
        result.put("status", buildStatusMessage());
        result.put("deviceName", currentDevice != null ? currentDevice.getDeviceName() : "");
        call.resolve(result);
    }

    private UsbDevice findTargetDevice(PluginCall call) {
        int vendorId = call.getInt("vendorId", DEFAULT_VENDOR_ID);
        int productId = call.getInt("productId", DEFAULT_PRODUCT_ID);
        HashMap<String, UsbDevice> devices = usbManager.getDeviceList();

        for (UsbDevice device : devices.values()) {
            if (device.getVendorId() == vendorId && device.getProductId() == productId) {
                return device;
            }
        }

        return null;
    }

    private void disconnectInternal() {
        if (connection != null && dataInterface != null) {
            try {
                connection.releaseInterface(dataInterface);
            } catch (Exception ignored) {
            }
        }

        if (connection != null) {
            try {
                connection.close();
            } catch (Exception ignored) {
            }
        }

        connection = null;
        currentDevice = null;
        dataInterface = null;
        dataOutEndpoint = null;
    }

    private String buildStatusMessage() {
        if (currentDevice == null || connection == null || dataOutEndpoint == null) {
            return "Mimaki OTG desconectada.";
        }

        return "Mimaki pronta! Certifique-se de que a máquina está em modo REMOTE. " +
            "(ID: " + Integer.toHexString(currentDevice.getVendorId()) + ":" + Integer.toHexString(currentDevice.getProductId()) + ")";
    }

    private void registerUsbReceiver() {
        if (receiverRegistered) {
            return;
        }

        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(usbPermissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(usbPermissionReceiver, filter);
        }
        receiverRegistered = true;
    }

    private void unregisterUsbReceiver() {
        if (!receiverRegistered) {
            return;
        }

        try {
            getContext().unregisterReceiver(usbPermissionReceiver);
        } catch (Exception ignored) {
        }
        receiverRegistered = false;
    }
}
