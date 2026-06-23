package com.quanlonga18.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "PdfDownloader")
public class PdfDownloaderPlugin extends Plugin {
    @PluginMethod
    public void savePdf(PluginCall call) {
        String fileName = call.getString("fileName");
        String base64Data = call.getString("base64Data");

        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("Thiếu tên file PDF.");
            return;
        }

        if (base64Data == null || base64Data.trim().isEmpty()) {
            call.reject("Thiếu dữ liệu PDF.");
            return;
        }

        try {
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            Uri savedUri = saveToDownloads(fileName, bytes);

            JSObject result = new JSObject();
            result.put("uri", savedUri != null ? savedUri.toString() : "");
            result.put("fileName", fileName);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Không thể tải PDF về máy: " + error.getMessage(), error);
        }
    }

    private Uri saveToDownloads(String fileName, byte[] bytes) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
            values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Long Ngon A18");
            values.put(MediaStore.Downloads.IS_PENDING, 1);

            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                throw new Exception("Không tạo được file trong thư mục Download.");
            }

            try (OutputStream output = resolver.openOutputStream(uri)) {
                if (output == null) {
                    throw new Exception("Không mở được file PDF để ghi.");
                }
                output.write(bytes);
            }

            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
            return uri;
        }

        File folder = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Long Ngon A18");
        if (!folder.exists() && !folder.mkdirs()) {
            throw new Exception("Không tạo được thư mục Download/Long Ngon A18.");
        }

        File outputFile = new File(folder, fileName);
        try (FileOutputStream output = new FileOutputStream(outputFile)) {
            output.write(bytes);
        }
        return Uri.fromFile(outputFile);
    }
}
