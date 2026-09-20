package com.volvix.pos;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Puente de hardware propio (impresion TCP/Bluetooth). Debe registrarse ANTES de super.onCreate.
        registerPlugin(VolvixPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
