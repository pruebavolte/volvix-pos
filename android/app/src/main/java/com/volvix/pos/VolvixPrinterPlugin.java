package com.volvix.pos;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Puente de HARDWARE de impresion para Android (2026-09-20, rol Loyverse APK).
 * SIN logica de negocio: solo manda bytes (ya armados en public/volvix-escpos.js) por
 *   - TCP (JetDirect 9100)            -> printRaw / ping
 *   - Bluetooth clasico SPP (RFCOMM)  -> printBluetooth / listBluetooth
 * JS: window.VolvixPlatform (public/volvix-platform.js) es el UNICO que lo llama.
 */
@CapacitorPlugin(
    name = "VolvixPrinter",
    permissions = {
        @Permission(alias = "btconnect", strings = { Manifest.permission.BLUETOOTH_CONNECT })
    }
)
public class VolvixPrinterPlugin extends Plugin {

    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private final ExecutorService pool = Executors.newCachedThreadPool();

    // ---------------------------------------------------------------- TCP

    @PluginMethod
    public void printRaw(final PluginCall call) {
        final String host = call.getString("host", "");
        final int port = call.getInt("port", 9100);
        final int timeout = call.getInt("timeoutMs", 6000);
        final String b64 = call.getString("data", "");
        if (host == null || host.trim().isEmpty()) { call.reject("host requerido"); return; }
        if (b64 == null || b64.isEmpty()) { call.reject("data requerido"); return; }
        pool.execute(new Runnable() {
            @Override public void run() {
                try {
                    byte[] data = Base64.decode(b64, Base64.DEFAULT);
                    writeTcp(host.trim(), port, data, timeout);
                    JSObject ret = new JSObject();
                    ret.put("ok", true);
                    ret.put("bytesWritten", data.length);
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject(e.getClass().getSimpleName() + ": " + e.getMessage());
                }
            }
        });
    }

    @PluginMethod
    public void ping(final PluginCall call) {
        final String host = call.getString("host", "");
        final int port = call.getInt("port", 9100);
        final int timeout = call.getInt("timeoutMs", 2500);
        pool.execute(new Runnable() {
            @Override public void run() {
                Socket s = new Socket();
                JSObject ret = new JSObject();
                try {
                    s.connect(new InetSocketAddress(host, port), timeout);
                    ret.put("ok", true);
                } catch (Exception e) {
                    ret.put("ok", false);
                    ret.put("error", e.getMessage());
                } finally {
                    try { s.close(); } catch (Exception ignored) { }
                }
                call.resolve(ret);
            }
        });
    }

    private static void writeTcp(String host, int port, byte[] data, int timeoutMs) throws IOException {
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(host, port), timeoutMs);
            s.setSoTimeout(timeoutMs);
            s.setTcpNoDelay(true);
            OutputStream os = s.getOutputStream();
            os.write(data);
            os.flush();
            try { s.shutdownOutput(); } catch (Exception ignored) { }
            try { Thread.sleep(250); } catch (InterruptedException ignored) { }
        } finally {
            try { s.close(); } catch (Exception ignored) { }
        }
    }

    // ---------------------------------------------------------------- Bluetooth SPP

    private boolean btAllowed(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true; // <Android 12: permiso normal en manifest
        if (getPermissionState("btconnect") == PermissionState.GRANTED) return true;
        requestPermissionForAlias("btconnect", call, "btPermissionCallback");
        return false;
    }

    @PermissionCallback
    private void btPermissionCallback(PluginCall call) {
        if (getPermissionState("btconnect") != PermissionState.GRANTED) {
            call.reject("Permiso de Bluetooth denegado");
            return;
        }
        String m = call.getMethodName();
        if ("listBluetooth".equals(m)) listBluetooth(call);
        else if ("printBluetooth".equals(m)) printBluetooth(call);
        else call.reject("metodo desconocido");
    }

    private BluetoothAdapter adapter() {
        BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return bm != null ? bm.getAdapter() : null;
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void listBluetooth(PluginCall call) {
        if (!btAllowed(call)) return;
        BluetoothAdapter ad = adapter();
        if (ad == null) { call.reject("Este equipo no tiene Bluetooth"); return; }
        JSArray arr = new JSArray();
        try {
            Set<BluetoothDevice> bonded = ad.getBondedDevices();
            if (bonded != null) {
                for (BluetoothDevice d : bonded) {
                    JSObject o = new JSObject();
                    o.put("name", d.getName() == null ? d.getAddress() : d.getName());
                    o.put("address", d.getAddress());
                    arr.put(o);
                }
            }
        } catch (SecurityException e) {
            call.reject("Permiso de Bluetooth denegado");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("enabled", ad.isEnabled());
        ret.put("devices", arr);
        call.resolve(ret);
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void printBluetooth(final PluginCall call) {
        if (!btAllowed(call)) return;
        final String address = call.getString("address", "");
        final String b64 = call.getString("data", "");
        if (address == null || !BluetoothAdapter.checkBluetoothAddress(address.toUpperCase())) { call.reject("direccion Bluetooth invalida"); return; }
        if (b64 == null || b64.isEmpty()) { call.reject("data requerido"); return; }
        final BluetoothAdapter ad = adapter();
        if (ad == null || !ad.isEnabled()) { call.reject("Bluetooth apagado: enciendelo y reintenta"); return; }
        pool.execute(new Runnable() {
            @Override public void run() {
                BluetoothSocket sock = null;
                try {
                    byte[] data = Base64.decode(b64, Base64.DEFAULT);
                    BluetoothDevice dev = ad.getRemoteDevice(address.toUpperCase());
                    ad.cancelDiscovery();
                    sock = dev.createRfcommSocketToServiceRecord(SPP);
                    sock.connect();
                    OutputStream os = sock.getOutputStream();
                    os.write(data);
                    os.flush();
                    try { Thread.sleep(400); } catch (InterruptedException ignored) { }
                    JSObject ret = new JSObject();
                    ret.put("ok", true);
                    ret.put("bytesWritten", data.length);
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject(e.getClass().getSimpleName() + ": " + e.getMessage());
                } finally {
                    if (sock != null) { try { sock.close(); } catch (Exception ignored) { } }
                }
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        pool.shutdown();
    }
}
