import BluetoothPrinter from './bluetoothPrinterPlugin';

// Helper to remove Vietnamese accents for standard ASCII thermal printing
export const removeVietnameseAccents = (str) => {
  if (!str) return '';
  return str
    .normalize('NFD') // Decompose into base letters and diacritics
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^ -~]/g, ''); // Keep only printable ASCII (space to tilde)
};

// ─────────────────────────────────────────────────────────────────────────────
// GIẢI PHÁP TRIỆT ĐỂ: Chuyển canvas thành ESC/POS Raster Image (GS v 0)
// Cách hoạt động: gửi PIXEL DATA thay vì text → máy in đọc pixel, không cần
// font/encoding → dấu tiếng Việt hiển thị 100% đúng trên mọi máy in thermal
// ─────────────────────────────────────────────────────────────────────────────
export const canvasToEscPosRasterBytes = (canvas) => {
  const ctx = canvas.getContext('2d');
  const w   = canvas.width;
  const h   = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels    = imageData.data; // RGBA flat array

  // ESC/POS yêu cầu chiều rộng tính bằng bytes (mỗi byte = 8 pixels)
  const widthBytes = Math.ceil(w / 8);

  // Chuyển mỗi pixel sang 1 bit (đen=1, trắng=0), đóng gói 8 bit/byte
  const bitmapRows = [];
  for (let row = 0; row < h; row++) {
    for (let byteIdx = 0; byteIdx < widthBytes; byteIdx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const col = byteIdx * 8 + bit;
        if (col < w) {
          const idx = (row * w + col) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          // Độ sáng (luminance): pixel tối → in đen (bit=1)
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum < 128) {
            byte |= (0x80 >> bit); // MSB first
          }
        }
      }
      bitmapRows.push(byte);
    }
  }

  const ESC = 0x1B;
  const GS  = 0x1D;

  // Tham số chiều rộng và chiều cao cho lệnh GS v 0
  const xL = widthBytes & 0xFF;
  const xH = (widthBytes >> 8) & 0xFF;
  const yL = h & 0xFF;
  const yH = (h >> 8) & 0xFF;

  // Header: init → center-align → GS v 0 (Raster Bit Image command)
  const header = new Uint8Array([
    ESC, 0x40,             // Initialize printer
    ESC, 0x61, 0x01,       // Center alignment
    GS,  0x76, 0x30, 0x00, // GS v 0 – Raster image, normal density
    xL, xH, yL, yH,        // Width (bytes) & Height (dots)
  ]);

  const bitmap = new Uint8Array(bitmapRows);

  // Footer: feed 4 lines + partial cut
  const footer = new Uint8Array([
    ESC, 0x64, 0x04,       // Feed 4 lines
    GS,  0x56, 0x42, 0x00, // Partial cut
  ]);

  // Ghép tất cả lại
  const result = new Uint8Array(header.length + bitmap.length + footer.length);
  result.set(header, 0);
  result.set(bitmap, header.length);
  result.set(footer, header.length + bitmap.length);
  return result;
};



// Text alignment/spacing helpers (assuming 32 columns for 58mm printer)
const padRight = (str, len) => str.padEnd(len, ' ');
const padLeft = (str, len) => str.padStart(len, ' ');
const center = (str, len) => {
  if (str.length >= len) return str.substring(0, len);
  const left = Math.floor((len - str.length) / 2);
  return ' '.repeat(left) + str + ' '.repeat(len - str.length - left);
};

// Convert string to ASCII byte array
const textToBytes = (text) => {
  const clean = removeVietnameseAccents(text);
  const bytes = new Uint8Array(clean.length);
  for (let i = 0; i < clean.length; i++) {
    bytes[i] = clean.charCodeAt(i);
  }
  return bytes;
};

// Combine multiple Uint8Arrays
const concatArrays = (...arrays) => {
  let totalLength = 0;
  for (let arr of arrays) {
    totalLength += arr.length;
  }
  let result = new Uint8Array(totalLength);
  let offset = 0;
  for (let arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
};

// Format raw number to vi-VN currency style (e.g. 120.000)
const formatMoney = (val) => {
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0 }).format(val);
};

// Generate ESC/POS receipt data bytes
export const generateReceiptBytes = (orderDetails, selectedTable, totalCost) => {
  const ESC = 0x1B;
  const GS = 0x1D;

  const init = new Uint8Array([ESC, 0x40]);
  const centerAlign = new Uint8Array([ESC, 0x61, 0x01]);
  const leftAlign = new Uint8Array([ESC, 0x61, 0x00]);
  const rightAlign = new Uint8Array([ESC, 0x61, 0x02]);
  const doubleSize = new Uint8Array([GS, 0x21, 0x11]); // Double width & height
  const normalSize = new Uint8Array([GS, 0x21, 0x00]);
  const boldOn = new Uint8Array([ESC, 0x45, 0x01]);
  const boldOff = new Uint8Array([ESC, 0x45, 0x00]);
  const lf = new Uint8Array([0x0A]);
  
  let parts = [init];

  // Brand Name (Double size, bold, centered)
  parts.push(centerAlign);
  parts.push(doubleSize);
  parts.push(boldOn);
  parts.push(textToBytes("QUAN LONG NGON A18"));
  parts.push(lf);
  
  // Subtitle / Address / SĐT (Normal size, unbold, centered)
  parts.push(normalSize);
  parts.push(boldOff);
  parts.push(textToBytes("DC: 321 Quan Nhan, Thanh Xuan, HN"));
  parts.push(lf);
  parts.push(textToBytes("SDT: 0984.873.113"));
  parts.push(lf);
  
  // Divider
  parts.push(textToBytes("--------------------------------"));
  parts.push(lf);
  
  // Title
  parts.push(boldOn);
  parts.push(textToBytes("HOA DON THANH TOAN"));
  parts.push(lf);
  parts.push(boldOff);
  
  // Table & Date Info
  parts.push(leftAlign);
  parts.push(textToBytes(`Ban: ${selectedTable}`));
  parts.push(lf);
  
  const now = new Date();
  const dateStr = now.toLocaleDateString('vi-VN');
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  parts.push(textToBytes(`Ngay: ${dateStr} - ${timeStr}`));
  parts.push(lf);
  
  parts.push(textToBytes(`Ma HD: HD${Date.now().toString().slice(-6)}`));
  parts.push(lf);
  
  // Divider
  parts.push(textToBytes("--------------------------------"));
  parts.push(lf);
  
  // Table Header
  parts.push(boldOn);
  // Total 32 chars: 16 (name) + 4 (qty) + 12 (price)
  parts.push(textToBytes("Ten mon          SL    Thanh Tien"));
  parts.push(lf);
  parts.push(boldOff);
  
  // Divider
  parts.push(textToBytes("--------------------------------"));
  parts.push(lf);
  
  // Items
  for (let detail of orderDetails) {
    const name = detail.item.name || '';
    const cleanName = removeVietnameseAccents(name);
    // Left side: Item Name (truncated to 15 + 1 space)
    const namePart = padRight(cleanName.substring(0, 15), 16);
    // Center: Qty (4 columns)
    const qtyPart = center(detail.qty.toString(), 4);
    // Right side: Total Price (12 columns)
    const priceStr = formatMoney(detail.total || 0);
    const pricePart = padLeft(priceStr, 12);
    
    parts.push(textToBytes(namePart + qtyPart + pricePart));
    parts.push(lf);
  }
  
  // Divider
  parts.push(textToBytes("--------------------------------"));
  parts.push(lf);
  
  // Total Row
  parts.push(boldOn);
  const totalStr = formatMoney(totalCost);
  const totalLine = padRight("TONG CONG:", 16) + padLeft(totalStr, 16);
  parts.push(textToBytes(totalLine));
  parts.push(lf);
  parts.push(boldOff);
  
  // Divider
  parts.push(textToBytes("--------------------------------"));
  parts.push(lf);
  
  // Footer
  parts.push(centerAlign);
  parts.push(textToBytes("Cam on quy khach!"));
  parts.push(lf);
  parts.push(textToBytes("Hen gap lai quy khach lan sau."));
  parts.push(lf);
  
  // Paper feed & Cut (Feed 5 lines)
  parts.push(new Uint8Array([ESC, 0x64, 0x05]));
  // Paper partial cut
  parts.push(new Uint8Array([GS, 0x56, 0x42, 0x00]));
  
  return concatArrays(...parts);
};

// Convert Uint8Array to base64 string
export const uint8ArrayToBase64 = (uint8Array) => {
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return window.btoa(binary);
};

// High-level API to connect (if needed) and print a receipt via Bluetooth
export const printBluetoothReceipt = async (orderDetails, selectedTable, totalCost) => {
  try {
    // 1. Check if Bluetooth is enabled
    const enabledRes = await BluetoothPrinter.isBluetoothEnabled();
    if (!enabledRes.enabled) {
      if (enabledRes.supported) {
        await BluetoothPrinter.enableBluetooth();
      } else {
        throw new Error("Thiet bi khong ho tro Bluetooth.");
      }
    }

    // 2. Check if connected
    const status = await BluetoothPrinter.isConnected();
    if (!status.connected) {
      const savedAddress = localStorage.getItem('selected_printer_address');
      if (!savedAddress) {
        throw new Error("Chua chon may in trong phan cai dat.");
      }
      // Attempt connection to saved printer
      await BluetoothPrinter.connect({ address: savedAddress });
    }

    // 3. Generate print payload
    const bytes = generateReceiptBytes(orderDetails, selectedTable, totalCost);
    const base64Data = uint8ArrayToBase64(bytes);

    // 4. Send print job
    await BluetoothPrinter.print({ base64Data });
    return true;
  } catch (err) {
    console.error("Bluetooth printer error:", err);
    throw err;
  }
};
