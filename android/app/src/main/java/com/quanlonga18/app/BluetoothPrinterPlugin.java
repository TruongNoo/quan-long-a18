package com.quanlonga18.app;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Intent;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;
import androidx.activity.result.ActivityResult;

import java.io.IOException;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(
    name = "BluetoothPrinter",
    permissions = {
        @Permission(
            strings = {
                "android.permission.BLUETOOTH_CONNECT",
                "android.permission.BLUETOOTH_SCAN"
            },
            alias = "bluetooth"
        )
    }
)
public class BluetoothPrinterPlugin extends Plugin {
    
    private BluetoothSocket bluetoothSocket;
    private OutputStream outputStream;
    private String connectedAddress = null;
    
    // Standard SPP (Serial Port Profile) UUID
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    @PluginMethod
    public void checkBluetoothPermissions(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            boolean granted = getPermissionState("bluetooth") == PermissionState.GRANTED;
            result.put("granted", granted);
        } else {
            // Android 11 and below, legacy bluetooth permissions are granted on installation
            result.put("granted", true);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void requestBluetoothPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (getPermissionState("bluetooth") != PermissionState.GRANTED) {
                requestPermissionForAlias("bluetooth", call, "bluetoothPermissionsCallback");
            } else {
                JSObject result = new JSObject();
                result.put("granted", true);
                call.resolve(result);
            }
        } else {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
        }
    }

    @PermissionCallback
    private void bluetoothPermissionsCallback(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            boolean granted = getPermissionState("bluetooth") == PermissionState.GRANTED;
            result.put("granted", granted);
        } else {
            result.put("granted", true);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void isBluetoothEnabled(PluginCall call) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        JSObject result = new JSObject();
        if (adapter == null) {
            result.put("enabled", false);
            result.put("supported", false);
        } else {
            result.put("enabled", adapter.isEnabled());
            result.put("supported", true);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void enableBluetooth(PluginCall call) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            call.reject("Thiết bị không hỗ trợ Bluetooth.");
            return;
        }
        if (adapter.isEnabled()) {
            JSObject result = new JSObject();
            result.put("enabled", true);
            call.resolve(result);
            return;
        }
        
        Intent enableBtIntent = new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE);
        try {
            startActivityForResult(call, enableBtIntent, "enableBluetoothResult");
        } catch (SecurityException e) {
            call.reject("Thiếu quyền bật Bluetooth: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void enableBluetoothResult(PluginCall call, ActivityResult result) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        JSObject obj = new JSObject();
        if (adapter != null && adapter.isEnabled()) {
            obj.put("enabled", true);
            call.resolve(obj);
        } else {
            obj.put("enabled", false);
            call.reject("Người dùng từ chối kích hoạt Bluetooth.");
        }
    }

    @PluginMethod
    public void listDevices(PluginCall call) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            call.reject("Thiết bị không hỗ trợ Bluetooth.");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("Bluetooth chưa được bật.");
            return;
        }

        try {
            Set<BluetoothDevice> pairedDevices = adapter.getBondedDevices();
            JSArray devicesArray = new JSArray();
            for (BluetoothDevice device : pairedDevices) {
                JSObject deviceObj = new JSObject();
                deviceObj.put("name", device.getName() != null ? device.getName() : "Thiết bị không tên");
                deviceObj.put("address", device.getAddress());
                devicesArray.put(deviceObj);
            }
            JSObject result = new JSObject();
            result.put("devices", devicesArray);
            call.resolve(result);
        } catch (SecurityException e) {
            call.reject("Thiếu quyền kết nối Bluetooth (SecurityException).");
        }
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString("address");
        if (address == null || address.isEmpty()) {
            call.reject("Thiếu địa chỉ MAC máy in.");
            return;
        }

        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("Bluetooth chưa được kích hoạt.");
            return;
        }

        disconnectDevice();

        try {
            BluetoothDevice device = adapter.getRemoteDevice(address);
            bluetoothSocket = device.createRfcommSocketToServiceRecord(SPP_UUID);
            
            // Connect asynchronously in a thread to keep UI responsive
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        bluetoothSocket.connect();
                        outputStream = bluetoothSocket.getOutputStream();
                        connectedAddress = address;
                        
                        getActivity().runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                JSObject result = new JSObject();
                                result.put("success", true);
                                result.put("message", "Đã kết nối với máy in.");
                                call.resolve(result);
                            }
                        });
                    } catch (IOException e) {
                        try {
                            bluetoothSocket.close();
                        } catch (IOException ex) {
                            // Ignore
                        }
                        bluetoothSocket = null;
                        outputStream = null;
                        connectedAddress = null;
                        
                        getActivity().runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                call.reject("Không thể kết nối với máy in: " + e.getMessage());
                            }
                        });
                    } catch (SecurityException e) {
                        getActivity().runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                call.reject("Thiếu quyền kết nối Bluetooth (SecurityException): " + e.getMessage());
                            }
                        });
                    }
                }
            }).start();

        } catch (IllegalArgumentException e) {
            call.reject("Địa chỉ MAC không hợp lệ.");
        } catch (Exception e) {
            call.reject("Lỗi khi kết nối: " + e.getMessage());
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        disconnectDevice();
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void isConnected(PluginCall call) {
        JSObject result = new JSObject();
        boolean connected = (bluetoothSocket != null && bluetoothSocket.isConnected());
        result.put("connected", connected);
        result.put("address", connectedAddress != null ? connectedAddress : "");
        call.resolve(result);
    }

    @PluginMethod
    public void print(PluginCall call) {
        String base64Data = call.getString("base64Data");
        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("Thiếu dữ liệu in.");
            return;
        }

        if (bluetoothSocket == null || !bluetoothSocket.isConnected() || outputStream == null) {
            call.reject("Máy in chưa được kết nối.");
            return;
        }

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                    outputStream.write(bytes);
                    outputStream.flush();
                    
                    getActivity().runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            JSObject result = new JSObject();
                            result.put("success", true);
                            call.resolve(result);
                        }
                    });
                } catch (Exception e) {
                    getActivity().runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            call.reject("Lỗi khi gửi dữ liệu in: " + e.getMessage());
                        }
                    });
                }
            }
        }).start();
    }

    private void disconnectDevice() {
        try {
            if (outputStream != null) {
                outputStream.close();
            }
            if (bluetoothSocket != null) {
                bluetoothSocket.close();
            }
        } catch (IOException e) {
            // Ignore
        }
        outputStream = null;
        bluetoothSocket = null;
        connectedAddress = null;
    }
}
