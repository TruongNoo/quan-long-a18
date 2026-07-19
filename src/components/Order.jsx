import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, Minus, ShoppingCart, Printer, X, Check, Trash2, Utensils } from 'lucide-react';
import { addTransaction, subscribeTableCarts, saveTableCart } from '../firebase';
import { canvasToEscPosRasterBytes, uint8ArrayToBase64 } from '../utils/bluetoothPrinter';
import BluetoothPrinter from '../utils/bluetoothPrinterPlugin';
import html2canvas from 'html2canvas';

export default function Order({ menuItems, onNotify }) {
  const tables = ['Mang về', 'Bàn 1', 'Bàn 2', 'Bàn 3', 'Bàn 4', 'Bàn 5', 'Bàn 6', 'Bàn 7', 'Bàn 8'];
  
  // Trọng số sắp xếp danh mục (âm lên đầu, dương về sau cùng)
  const categoryWeights = {
    'Món chính': -90,
    'Lòng chần': -80,
    'Ăn nhanh': -70,
    'Khai vị': -60,
    'Rau xào': -50,
    'Món chiên xào': -40,
    'Đặc sản': -30,
    'Lẩu': -20,
    'Combo': -10,
    'Phụ': 10,
    'Nước ngọt': 80,
    'Rượu bia': 90,
    'Bia & Đồ uống': 100
  };

  const getCategoryWeight = (cat) => {
    return categoryWeights[cat] !== undefined ? categoryWeights[cat] : 0;
  };

  const sortedCategories = Array.from(new Set(menuItems.map(item => item.category).filter(Boolean)))
    .sort((a, b) => getCategoryWeight(a) - getCategoryWeight(b));

  // Tự động lấy và sắp xếp danh mục từ thực đơn thực tế trong database
  const categories = ['Tất cả', ...sortedCategories];

  const [activeOrderType, setActiveOrderType] = useState(() => {
    return localStorage.getItem('a18_active_order_type') || 'dinein';
  });
  const [selectedTable, setSelectedTable] = useState(() => {
    return localStorage.getItem('a18_selected_table') || 'Bàn 1';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');

  // ── Giỏ hàng tách riêng theo từng bàn ─────────────────────────────
  // Khởi tạo từ localStorage để load nhanh khi mở app, sau đó Firestore sẽ cập nhật
  const [tableQuantities, setTableQuantities] = useState(() => {
    const init = {};
    tables.forEach(t => { init[t] = {}; });
    try {
      const saved = localStorage.getItem('a18_table_quantities');
      if (saved) {
        const parsed = JSON.parse(saved);
        tables.forEach(t => { init[t] = parsed[t] || {}; });
      }
    } catch (e) {
      console.error('Lỗi load giỏ hàng từ localStorage:', e);
    }
    return init;
  });

  // Ref để biết khi nào đang viết lên Firestore (tránh snapshot của chính mình gây flicker)
  const isLocalUpdateRef = useRef(false);
  // Ref để debounce save lên Firestore
  const saveTimerRef = useRef({});

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showCartDetail, setShowCartDetail] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // States for custom deletion confirm modals
  const [deletingCartItem, setDeletingCartItem] = useState(null);
  const [deletingAllCart, setDeletingAllCart] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [syncError, setSyncError] = useState(null);

  // Lưu localStorage chỉ khi thay đổi
  useEffect(() => {
    localStorage.setItem('a18_active_order_type', activeOrderType);
  }, [activeOrderType]);

  useEffect(() => {
    localStorage.setItem('a18_selected_table', selectedTable);
  }, [selectedTable]);

  // Lắng nghe Firestore realtime để đồng bộ giữa các thiết bị
  useEffect(() => {
    const unsubscribe = subscribeTableCarts(
      (carts) => {
        // Bỏ qua snapshot nếu chính chúng ta vừa ghi (tránh flicker)
        if (isLocalUpdateRef.current) return;
        setSyncError(null);
        setTableQuantities(prev => {
          const merged = {};
          tables.forEach(t => {
            merged[t] = carts[t] || {};
          });
          // Chỉ cập nhật localStorage khi nhận data từ Firestore (thiết bị khác)
          localStorage.setItem('a18_table_quantities', JSON.stringify(merged));
          return merged;
        });
      },
      (errMsg) => {
        // Callback lỗi – hiển thị thông báo đồng bộ thất bại
        setSyncError(errMsg);
        console.error('[Sync Error]', errMsg);
      }
    );
    return () => unsubscribe();
  }, []);

  // Lấy giỏ hàng của bàn hiện tại
  const quantities = tableQuantities[selectedTable] || {};

  // ── Định dạng tiền VNĐ ──────────────────────────────────────────────
  const formatCurrency = (val) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', minimumFractionDigits: 0 })
      .format(val).replace('₫', 'đ');

  // ── Hàm debounced để save lên Firestore, tránh spam write liên tục ──
  const debouncedSave = useCallback((table, quantities) => {
    if (saveTimerRef.current[table]) clearTimeout(saveTimerRef.current[table]);
    saveTimerRef.current[table] = setTimeout(() => {
      isLocalUpdateRef.current = true;
      saveTableCart(table, quantities).finally(() => {
        // Sau 500ms cho phép nhận snapshot từ Firestore trở lại
        setTimeout(() => { isLocalUpdateRef.current = false; }, 500);
      });
    }, 150);
  }, []);

  // ── Tăng / giảm số lượng (chỉ ảnh hưởng đến bàn đang chọn) ─────────
  const handleQtyChange = useCallback((itemId, delta) => {
    setTableQuantities(prev => {
      const cur = prev[selectedTable] || {};
      const newQty = Math.max(0, (cur[itemId] || 0) + delta);
      const newQuantities = { ...cur, [itemId]: newQty };
      const newState = { ...prev, [selectedTable]: newQuantities };

      // Lưu localStorage ngay lập tức
      localStorage.setItem('a18_table_quantities', JSON.stringify(newState));
      // Ghi lên Firestore sau 150ms (debounced)
      debouncedSave(selectedTable, newQuantities);

      return newState;
    });
  }, [selectedTable, debouncedSave]);

  // ── Lọc danh sách món & Sắp xếp theo bảng chữ cái A-Z ────────────────
  const filteredItems = menuItems
    .filter(item => {
      const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = selectedCategory === 'Tất cả' || item.category === selectedCategory;
      return matchSearch && matchCat;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  // ── Tính tổng giỏ hàng BÀN HIỆN TẠI ────────────────────────────────
  const orderDetails = Object.entries(quantities)
    .filter(([, qty]) => qty > 0)
    .map(([itemId, qty]) => {
      const item = menuItems.find(i => i.id === itemId);
      return item ? { item, qty, total: item.price * qty } : null;
    })
    .filter(Boolean);

  const totalCost = orderDetails.reduce((s, d) => s + d.total, 0);
  const totalItemsCount = orderDetails.reduce((s, d) => s + d.qty, 0);

  // Đóng cart detail nếu trống
  useEffect(() => {
    if (totalItemsCount === 0) setShowCartDetail(false);
  }, [totalItemsCount]);

  // ── Tính tổng số bàn đang có món (badge trên từng nút bàn) ──────────
  const getTableBadge = (table) => {
    const tq = tableQuantities[table] || {};
    return Object.values(tq).reduce((s, q) => s + q, 0);
  };

  // ── Thanh toán ──────────────────────────────────────────────────────
  const handlePaymentClick = () => {
    if (totalCost === 0) { triggerToast('Vui lòng chọn ít nhất một món!'); return; }
    setShowConfirmDialog(true);
  };

  const saveOrderToDatabase = async () => {
    const desc = orderDetails.map(d => `${d.item.name} x${d.qty}`).join(', ');
    const tx = {
      type: 'in',
      description: `${selectedTable}: ${desc}`,
      amount: totalCost,
      timestamp: Date.now(),
      dateString: new Date().toLocaleDateString('vi-VN'),
    };
    try { await addTransaction(tx); } catch (err) { console.error(err); }
  };

  // Xóa giỏ hàng của bàn hiện tại sau khi thanh toán
  const resetCurrentTable = () => {
    const emptyCart = {};
    setTableQuantities(prev => {
      const newState = { ...prev, [selectedTable]: emptyCart };
      localStorage.setItem('a18_table_quantities', JSON.stringify(newState));
      return newState;
    });
    // Xóa debounce timer nếu có và ghi ngay lên Firestore
    if (saveTimerRef.current[selectedTable]) {
      clearTimeout(saveTimerRef.current[selectedTable]);
    }
    isLocalUpdateRef.current = true;
    saveTableCart(selectedTable, emptyCart).finally(() => {
      setTimeout(() => { isLocalUpdateRef.current = false; }, 500);
    });
  };

  const handlePayWithoutReceipt = async () => {
    setShowConfirmDialog(false);
    const desc = orderDetails.map(d => `${d.item.name} x${d.qty}`).join(', ');
    const cost = totalCost;
    await saveOrderToDatabase();
    if (onNotify) {
      onNotify(`Đã thanh toán ${selectedTable} (Không in HĐ): ${desc} (${formatCurrency(cost)})`, 'payment');
    }
    resetCurrentTable();
    triggerToast(`✓ Thanh toán ${selectedTable} thành công!`);
  };

  const handlePayWithReceipt = () => {
    setShowConfirmDialog(false);
    setShowReceipt(true);
  };

  // ── Vẽ hoá đơn lên Canvas 2D – giải quyết dấu tiếng Việt trên máy in thermal ──
  const buildReceiptCanvas = () => {
    // ─ Thông số máy in 58mm ─────────────────────────────────────────────────
    // - Độ phân giải: 203 DPI → 1mm = 8 dots
    // - Chiều rộng in thực tế (printable area): 48mm = 384 dots
    //   (58mm trừ ~5mm lề mỗi bên, đây là chuẩn của hầu hết máy in 58mm)
    // - Nếu dùng 464px (58mm) printer sẽ scale xuống 384 → mờ và bị cắt
    const DPI_MM  = 8;   // 8 dots/mm tại 203 DPI
    const W       = 384; // 48mm × 8 = 384 dots — khớp chính xác vùng in thực tế
    const PAD     = 8;   // 1mm padding mỗi bên (trong vùng in)
    const INNER   = W - PAD * 2;

    // Ước tính chiều cao tối đa
    const BASE_H  = 200 * DPI_MM + orderDetails.length * 28 * DPI_MM;
    const canvas  = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = BASE_H;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, BASE_H);
    ctx.fillStyle = '#000';

    let y = PAD + 8;

    // ── hàm tiện ích ────────────────────────────────────────────────────────
    const drawText = (str, x, yy, size = 20, bold = false, align = 'left') => {
      ctx.font = `${bold ? 'bold ' : ''}${size}px Arial, sans-serif`;
      ctx.textAlign = align;
      ctx.fillText(str, x, yy);
      ctx.textAlign = 'left';
    };
    const centerText = (str, yy, size = 20, bold = false) =>
      drawText(str, W / 2, yy, size, bold, 'center');
    const rightText  = (str, yy, size = 20, bold = false) =>
      drawText(str, W - PAD, yy, size, bold, 'right');

    const dashedLine = (yy) => {
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, yy);
      ctx.lineTo(W - PAD, yy);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const lh = (mm) => Math.round(mm * DPI_MM); // line height helper

    // ── HEADER ──────────────────────────────────────────────────────────────
    y += lh(3);
    centerText('QUÁN LÒNG NGON A18', y, 30, true);  y += lh(11);
    centerText('ĐC: 321 Quan Nhân, Thanh Xuân, Hà Nội', y, 17);  y += lh(7);
    centerText('SĐT: 0984.873.113', y, 17);  y += lh(8);

    dashedLine(y);  y += lh(5);
    centerText('HÓA ĐƠN THANH TOÁN', y, 22, true);  y += lh(10);

    // ── INFO ────────────────────────────────────────────────────────────────
    const now     = new Date();
    const dateStr = now.toLocaleDateString('vi-VN') + ' - ' + now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const hdCode  = 'HD' + Date.now().toString().slice(-6);

    drawText(`Bàn: ${selectedTable}`, PAD, y, 20, true);  y += lh(8);
    drawText(`Ngày: ${dateStr}`, PAD, y, 18);  y += lh(7);
    drawText(`Mã HĐ: ${hdCode}`, PAD, y, 18);  y += lh(8);

    dashedLine(y);  y += lh(5);

    // ── TABLE HEADER (4 cột: Tên món | SL | Đơn giá | T.Tiền) ──────────────
    // Vị trí cột (px từ trái canvas)
    const colSL    = PAD + Math.round(INNER * 0.56); // SL center
    const colGia   = PAD + Math.round(INNER * 0.68); // Đơn giá left
    const colTotal = W - PAD;                         // T.Tiền right

    drawText('Tên món', PAD, y, 18, true);
    drawText('SL',  colSL, y, 18, true, 'center');
    drawText('Đơn giá', colGia, y, 18, true);
    rightText('T.Tiền', y, 18, true);
    y += lh(6);
    dashedLine(y);  y += lh(5);

    // ── TABLE ROWS ───────────────────────────────────────────────────────────
    const fmt = (n) => new Intl.NumberFormat('vi-VN').format(n);
    const ITEM_FONT = 19;
    const maxNameW  = INNER * 0.54; // tối đa 54% chiều rộng cho tên món

    orderDetails.forEach((d) => {
      ctx.font = `${ITEM_FONT}px Arial, sans-serif`;
      // Word-wrap tên món
      const words = d.item.name.split(' ');
      const lines = [];
      let cur = '';
      words.forEach(w => {
        const test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width <= maxNameW) {
          cur = test;
        } else {
          if (cur) lines.push(cur);
          cur = w;
        }
      });
      if (cur) lines.push(cur);

      // Vẽ dòng đầu + số liệu trên cùng dòng (hoặc dòng cuối nếu có wrap)
      lines.forEach((ln, li) => {
        drawText(ln, PAD, y, ITEM_FONT);
        if (li === lines.length - 1) {
          // Số liệu chỉ vẽ ở dòng cuối của tên món
          drawText(String(d.qty), colSL, y, ITEM_FONT, false, 'center');
          drawText(fmt(d.item.price), colGia, y, ITEM_FONT);
          rightText(fmt(d.total), y, ITEM_FONT, true);
        }
        y += lh(8);
      });
    });

    dashedLine(y);  y += lh(5);

    // ── TỔNG CỘNG ────────────────────────────────────────────────────────────
    drawText('TỔNG CỘNG:', PAD, y, 22, true);
    rightText(fmt(totalCost) + ' đ', y, 22, true);
    y += lh(10);

    dashedLine(y);  y += lh(6);

    // ── FOOTER ───────────────────────────────────────────────────────────────
    centerText('Cảm ơn quý khách!', y, 19, true);  y += lh(8);
    centerText('Hẹn gặp lại quý khách lần sau.', y, 17);  y += lh(12);

    // Cắt canvas theo chiều cao thực tế
    const trimmed = document.createElement('canvas');
    trimmed.width  = W;
    trimmed.height = y;
    trimmed.getContext('2d').drawImage(canvas, 0, 0);
    return trimmed;
  };


  const handlePrint = async () => {
    const printerType    = localStorage.getItem('printer_connection_type') || 'system';
    const printerAddress = localStorage.getItem('selected_printer_address');

    if (printerType === 'bluetooth' && printerAddress) {
      // ═══════════════════════════════════════════════════════════════════
      // GIẢI PHÁP: dùng html2canvas chụp đúng element HTML preview
      // → output in = output màn hình, dấu tiếng Việt đúng 100%
      // ═══════════════════════════════════════════════════════════════════
      try {
        triggerToast('⏳ Đang chuẩn bị in...');

        // 1. Chờ 1 frame để React render xong element trước khi chụp
        await new Promise(r => requestAnimationFrame(r));

        const receiptEl = document.getElementById('print-section-target');
        if (!receiptEl) {
          triggerToast('✗ Không tìm thấy hoá đơn');
          return;
        }

        // 2. Chụp HTML element thành canvas (scale 3x để dấu tiếng Việt cực rõ)
        const capturedCanvas = await html2canvas(receiptEl, {
          backgroundColor: '#ffffff',
          scale: 3,          // 3x resolution – dấu tiếng Việt sắc nét
          useCORS: true,
          logging: false,
          allowTaint: true,
        });

        // 3. Scale canvas xuống 384px wide (vùng in thực tế 48mm ở 203 DPI)
        const PRINT_W = 384;
        const ratio   = PRINT_W / capturedCanvas.width;
        const printH  = Math.round(capturedCanvas.height * ratio);
        const printCanvas = document.createElement('canvas');
        printCanvas.width  = PRINT_W;
        printCanvas.height = printH;
        const pCtx = printCanvas.getContext('2d');
        pCtx.imageSmoothingEnabled = true;
        pCtx.imageSmoothingQuality = 'high';
        pCtx.drawImage(capturedCanvas, 0, 0, PRINT_W, printH);

        // 4. Convert canvas → ESC/POS raster image bytes (GS v 0)
        const bytes      = canvasToEscPosRasterBytes(printCanvas);
        const base64Data = uint8ArrayToBase64(bytes);

        // 5. Kết nối Bluetooth nếu chưa kết nối
        const status = await BluetoothPrinter.isConnected();
        if (!status.connected) {
          triggerToast('⏳ Đang kết nối máy in...');
          await BluetoothPrinter.connect({ address: printerAddress });
        }

        // 6. Gửi lệnh in
        await BluetoothPrinter.print({ base64Data });
        await finishPayment();

      } catch (err) {
        console.error('html2canvas print error:', err);
        triggerToast(`✗ Lỗi in: ${err.message || err}`);
      }

    } else {
      // Không có Bluetooth: in qua hệ thống
      printViaCanvas();
    }
  };

  // In bằng canvas – ĐẢM BẢO dấu tiếng Việt trên MỌI máy in thermal
  // Cách hoạt động: thay HTML text bằng ảnh PNG (pixel) → máy in nhận pixel, không qua font
  const printViaCanvas = () => {
    const canvas  = buildReceiptCanvas();
    const imgData = canvas.toDataURL('image/png');

    const target = document.getElementById('print-section-target');
    if (!target) {
      finishPayment();
      return;
    }

    // Lưu nội dung HTML gốc
    const savedHTML = target.innerHTML;
    const savedPadding = target.style.padding;

    // Thay toàn bộ nội dung bằng ảnh canvas
    target.innerHTML = '';
    target.style.padding = '0';
    const img = document.createElement('img');
    img.src = imgData;
    img.style.cssText = 'width:100%;display:block;';
    target.appendChild(img);

    // Chờ 1 frame để browser vẽ ảnh xong, rồi gọi print
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();

        // Khôi phục nội dung HTML gốc sau khi in
        target.innerHTML = savedHTML;
        target.style.padding = savedPadding || '';

        finishPayment();
      }, 200);
    });
  };

  const finishPayment = async () => {
    const desc = orderDetails.map(d => `${d.item.name} x${d.qty}`).join(', ');
    const cost = totalCost;
    await saveOrderToDatabase();
    if (onNotify) {
      onNotify(`Đã in hóa đơn và thanh toán ${selectedTable}: ${desc} (${formatCurrency(cost)})`, 'payment');
    }
    resetCurrentTable();
    setShowReceipt(false);
    triggerToast('✓ Đã in hoá đơn và thanh toán!');
  };



  const triggerToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2800);
  };

  const getAvatarChar = (name) => (name ? name.trim()[0].toUpperCase() : 'M');

  return (
    <div style={{ display: 'flex', flex: '1', flexDirection: 'column', gap: '15px', position: 'relative' }}>

      {/* CSS in ấn – khổ giấy 58mm, in ảnh canvas (không in text) */}
      <style>{`
        @media print {
          @page {
            size: 58mm auto;
            margin: 0;
          }
          body, html {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          body * { visibility: hidden !important; }
          #print-section-target,
          #print-section-target * { visibility: visible !important; }
          #print-section-target {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 58mm !important;
            max-width: 58mm !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            box-sizing: border-box !important;
          }
          #print-section-target img {
            width: 100% !important;
            display: block !important;
          }
        }
      `}</style>


      {/* ── Chọn loại hình phục vụ (Mang về / Ăn tại bàn) ──────────────── */}
      <div className="order-type-selector" style={{
        display: 'flex',
        background: '#14151b',
        borderRadius: '12px',
        padding: '4px',
        border: '1px solid var(--color-border)',
        marginBottom: '4px'
      }}>
        <button
          type="button"
          className={`order-type-btn ${activeOrderType === 'takeaway' ? 'active' : ''}`}
          onClick={() => {
            setActiveOrderType('takeaway');
            setSelectedTable('Mang về');
          }}
          style={{
            flex: 1,
            padding: '10px 0',
            textAlign: 'center',
            fontSize: '13px',
            fontWeight: '700',
            borderRadius: '9px',
            color: activeOrderType === 'takeaway' ? 'white' : 'var(--color-text-secondary)',
            backgroundColor: activeOrderType === 'takeaway' ? 'var(--color-primary)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
        >
          <ShoppingCart size={14} />
          Mang về
          {getTableBadge('Mang về') > 0 && (
            <span style={{
              minWidth: '18px', height: '18px',
              background: '#ef5350', color: 'white',
              borderRadius: '9px', fontSize: '10px', fontWeight: '700',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 4px', lineHeight: 1,
              marginLeft: '4px'
            }}>
              {getTableBadge('Mang về')}
            </span>
          )}
        </button>
        <button
          type="button"
          className={`order-type-btn ${activeOrderType === 'dinein' ? 'active' : ''}`}
          onClick={() => {
            setActiveOrderType('dinein');
            if (selectedTable === 'Mang về') {
              setSelectedTable('Bàn 1');
            }
          }}
          style={{
            flex: 1,
            padding: '10px 0',
            textAlign: 'center',
            fontSize: '13px',
            fontWeight: '700',
            borderRadius: '9px',
            color: activeOrderType === 'dinein' ? 'white' : 'var(--color-text-secondary)',
            backgroundColor: activeOrderType === 'dinein' ? 'var(--color-primary)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
        >
          <Utensils size={14} />
          Phục vụ tại bàn
        </button>
      </div>

      {/* ── Chọn bàn (Chỉ hiện khi chọn Phục vụ tại bàn) ───────────────── */}
      {activeOrderType === 'dinein' && (
        <div className="table-selector-scroll">
          {tables.filter(t => t !== 'Mang về').map(t => {
            const badge = getTableBadge(t);
            return (
              <button
                key={t}
                className={`table-btn ${selectedTable === t ? 'active' : ''}`}
                onClick={() => setSelectedTable(t)}
                style={{ position: 'relative' }}
              >
                {selectedTable === t && <Check size={13} />}
                {t}
                {badge > 0 && selectedTable !== t && (
                  <span style={{
                    position: 'absolute', top: '-6px', right: '-6px',
                    minWidth: '18px', height: '18px',
                    background: '#ef5350', color: 'white',
                    borderRadius: '9px', fontSize: '10px', fontWeight: '700',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px', lineHeight: 1,
                  }}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Tìm kiếm ─────────────────────────────────────────────── */}
      <div className="search-wrapper">
        <Search className="search-icon" size={18} />
        <input
          type="text"
          className="search-input"
          placeholder="Tìm kiếm món ăn, combo..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '14px', color: 'var(--color-text-secondary)' }}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* ── Tabs danh mục ─────────────────────────────────────────── */}
      <div className="categories-scroll">
        {categories.map(cat => (
          <button
            key={cat}
            className={`category-tab ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* ── Danh sách món ─────────────────────────────────────────── */}
      <div className="foods-grid">
        {filteredItems.length === 0 ? (
          <div style={{ gridColumn: 'span 3', textAlign: 'center', color: 'var(--color-text-secondary)', padding: '40px 0', fontSize: '13px' }}>
            Không tìm thấy món ăn nào.
          </div>
        ) : (
          filteredItems.map(item => {
            const qty = quantities[item.id] || 0;
            return (
              <div 
                key={item.id} 
                className={`food-card ${qty > 0 ? 'selected' : ''}`}
                onClick={() => handleQtyChange(item.id, 1)}
              >
                <div className="food-avatar">{getAvatarChar(item.name)}</div>
                <div className="food-name">{item.name}</div>
                <div className="food-price">{formatCurrency(item.price)}</div>
                <div className="qty-control" onClick={(e) => e.stopPropagation()}>
                  {qty > 0 && (
                    <button className="qty-btn" onClick={() => handleQtyChange(item.id, -1)}>
                      <Minus size={12} />
                    </button>
                  )}
                  {qty > 0 && <span className="qty-display">{qty}</span>}
                  <button className="qty-btn add" onClick={() => handleQtyChange(item.id, 1)}>
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Thanh toán nổi ────────────────────────────────────────── */}
      <div className="checkout-bar">
        <div
          className="checkout-info"
          onClick={() => totalItemsCount > 0 && setShowCartDetail(true)}
          style={{ cursor: totalItemsCount > 0 ? 'pointer' : 'default' }}
        >
          <span style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            color: totalItemsCount > 0 ? '#5c6bc0' : 'var(--color-text-secondary)',
            fontWeight: totalItemsCount > 0 ? '600' : '400',
            textDecoration: totalItemsCount > 0 ? 'underline' : 'none',
            fontSize: '13px',
          }}>
            <ShoppingCart size={15} />
            {totalItemsCount > 0
              ? `${selectedTable} · ${totalItemsCount} món (Xem / Sửa)`
              : `${selectedTable} · Chưa chọn món`}
          </span>
          <span className="checkout-total">
            {totalCost > 0 ? formatCurrency(totalCost) : '—'}
          </span>
        </div>
        <button className="checkout-btn" onClick={handlePaymentClick}>
          THANH TOÁN
        </button>
      </div>

      {/* Toast */}
      {toastMsg && <div className="toast-msg">{toastMsg}</div>}

      {/* ── Dialog xác nhận in hoá đơn ───────────────────────────── */}
      {showConfirmDialog && (
        <div className="dialog-overlay">
          <div className="dialog-box" style={{ maxWidth: '360px' }}>
            <div className="dialog-icon-wrapper">
              <Printer size={28} />
            </div>
            <h3 className="dialog-title">Xác nhận thanh toán</h3>
            <p className="dialog-desc">
              <strong>{selectedTable}</strong> — Tổng cộng:&nbsp;
              <span style={{ color: '#00bfa5', fontWeight: '700' }}>{formatCurrency(totalCost)}</span>
              <br />Bạn có muốn in hoá đơn không?
            </p>
            <div className="dialog-buttons">
              <button className="dialog-btn secondary" onClick={handlePayWithoutReceipt}>
                Không in
              </button>
              <button className="dialog-btn primary" onClick={handlePayWithReceipt}>
                <Printer size={15} /> In hoá đơn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Màn hình hoá đơn 57mm ─────────────────────────────────── */}
      {showReceipt && (
        <div className="bill-overlay">
          <div className="bill-scroll-container">
            <div id="print-section-target" className="thermal-bill printable-area">

              {/* Header quán */}
              <div className="bill-header">
                <div className="bill-brand">QUÁN LÒNG NGON A18</div>
                <div style={{ fontSize: '9px', marginBottom: '2px' }}>Địa chỉ: Số nhà 321 Quan Nhân, Thanh Xuân, Hà Nội</div>
                <div style={{ fontSize: '9px' }}>SĐT: 0984.873.113</div>
              </div>

              <div className="bill-divider" />

              <div style={{ textAlign: 'center', fontWeight: '800', fontSize: '11px', marginBottom: '4px' }}>
                HÓA ĐƠN THANH TOÁN
              </div>

              <div style={{ fontSize: '9px', marginBottom: '2px' }}>
                <span>Bàn: <strong>{selectedTable}</strong></span>
              </div>
              <div style={{ fontSize: '9px', display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span>Ngày: {new Date().toLocaleDateString('vi-VN')}</span>
                <span>Giờ: {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div style={{ fontSize: '9px', marginBottom: '2px' }}>Mã HĐ: HD{Date.now().toString().slice(-6)}</div>

              <div className="bill-divider" />

              {/* Cột: Tên món | SL | Đơn giá | Thành tiền */}
              <div className="bill-table-header">
                <span>Tên món</span>
                <span style={{ textAlign: 'center' }}>SL</span>
                <span style={{ textAlign: 'right' }}>Đơn giá</span>
                <span style={{ textAlign: 'right' }}>T.Tiền</span>
              </div>
              <div className="bill-divider" />

              {orderDetails.map((d, i) => (
                <div key={i} className="bill-table-row">
                  <span className="bill-item-name">{d.item.name}</span>
                  <span style={{ textAlign: 'center' }}>{d.qty}</span>
                  <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {new Intl.NumberFormat('vi-VN').format(d.item.price)}
                  </span>
                  <span style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: '700' }}>
                    {new Intl.NumberFormat('vi-VN').format(d.total)}
                  </span>
                </div>
              ))}

              <div className="bill-divider" />

              {/* Tổng cộng */}
              <div className="bill-total-row">
                <span>TỔNG CỘNG:</span>
                <span style={{ color: '#000' }}>{formatCurrency(totalCost)}</span>
              </div>

              <div className="bill-divider" />

              {/* Footer */}
              <div className="bill-footer">
                <div>Cảm ơn quý khách!</div>
                <div>Hẹn gặp lại quý khách lần sau.</div>
              </div>

            </div>
          </div>
          <div className="bill-actions">
            <button
              className="dialog-btn secondary"
              onClick={() => setShowReceipt(false)}
              style={{ flex: '1', backgroundColor: '#e53935' }}
            >
              Đóng lại
            </button>
            <button
              className="dialog-btn primary"
              onClick={handlePrint}
              style={{ flex: '2', backgroundColor: '#00bfa5' }}
            >
              <Printer size={16} style={{ marginRight: '8px' }} />
              Xác nhận &amp; In
            </button>
          </div>
        </div>
      )}


      {/* ── Modal chi tiết giỏ hàng BÀN HIỆN TẠI ────────────────── */}
      {showCartDetail && (
        <div className="dialog-overlay" onClick={() => setShowCartDetail(false)}>
          <div
            className="dialog-box"
            style={{ maxWidth: '420px', textAlign: 'left', alignItems: 'stretch' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-title-row" style={{ marginBottom: '15px' }}>
              <span className="card-label" style={{ fontSize: '15px' }}>
                <ShoppingCart size={18} />
                {selectedTable} — Phần món đã chọn
              </span>
              <button onClick={() => setShowCartDetail(false)} style={{ color: 'var(--color-text-secondary)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto', marginBottom: '15px' }}>
              {orderDetails.map((d, i) => (
                <div key={i} className="menu-item-row" style={{ padding: '12px 14px' }}>
                  <div className="menu-item-info">
                    <div className="menu-item-details">
                      <span className="menu-item-name">{d.item.name}</span>
                      <span className="menu-item-cat">{formatCurrency(d.item.price)}/phần</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="qty-control">
                      <button className="qty-btn" onClick={() => handleQtyChange(d.item.id, -1)}>
                        <Minus size={12} />
                      </button>
                      <span className="qty-display">{d.qty}</span>
                      <button className="qty-btn add" onClick={() => handleQtyChange(d.item.id, 1)}>
                        <Plus size={12} />
                      </button>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#00bfa5', minWidth: '70px', textAlign: 'right' }}>
                      {formatCurrency(d.total)}
                    </div>
                    <button
                      className="menu-action-btn delete"
                      onClick={() => {
                        if (navigator.vibrate) navigator.vibrate(100);
                        setDeletingCartItem({ id: d.item.id, name: d.item.name, qty: d.qty });
                        setIsShaking(true);
                        setTimeout(() => setIsShaking(false), 350);
                      }}
                      style={{ color: '#ef5350' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Tổng cộng */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 14px', backgroundColor: '#14151b',
              borderRadius: '12px', border: '1px solid var(--color-border)', marginBottom: '15px',
            }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-secondary)' }}>TỔNG CỘNG TẠM TÍNH:</span>
              <span style={{ fontSize: '17px', fontWeight: '700', color: '#00bfa5' }}>{formatCurrency(totalCost)}</span>
            </div>

            <div className="dialog-buttons">
              <button
                className="dialog-btn secondary"
                onClick={() => {
                  if (navigator.vibrate) navigator.vibrate(100);
                  setDeletingAllCart(true);
                  setIsShaking(true);
                  setTimeout(() => setIsShaking(false), 350);
                }}
                style={{ backgroundColor: '#ef5350', color: 'white' }}
              >
                Xóa tất cả
              </button>
              <button className="dialog-btn primary" onClick={() => setShowCartDetail(false)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xác nhận xóa món đơn lẻ khỏi giỏ hàng */}
      {deletingCartItem && (
        <div className="dialog-overlay" onClick={() => setDeletingCartItem(null)} style={{ zIndex: 200 }}>
          <div 
            className={`dialog-box ${isShaking ? 'shake-effect' : ''}`}
            style={{ maxWidth: '380px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-icon-wrapper" style={{ backgroundColor: 'rgba(239, 83, 80, 0.15)', color: '#ef5350' }}>
              <Trash2 size={28} />
            </div>
            <h3 className="dialog-title">Bỏ món ăn?</h3>
            <p className="dialog-desc" style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '24px', textAlign: 'center' }}>
              Bạn có chắc chắn muốn bỏ món <strong style={{ color: 'white' }}>{deletingCartItem.name}</strong> (x{deletingCartItem.qty}) khỏi giỏ hàng của <strong style={{ color: 'white' }}>{selectedTable}</strong> không?
            </p>
            <div className="dialog-buttons">
              <button 
                className="dialog-btn secondary" 
                onClick={() => setDeletingCartItem(null)}
              >
                Hủy bỏ
              </button>
              <button 
                className="dialog-btn primary" 
                style={{ backgroundColor: '#ef5350' }}
                onClick={() => {
                  if (navigator.vibrate) navigator.vibrate(80);
                  handleQtyChange(deletingCartItem.id, -deletingCartItem.qty);
                  setDeletingCartItem(null);
                  triggerToast(`Đã bỏ ${deletingCartItem.name} khỏi giỏ hàng!`);
                }}
              >
                ✓ Bỏ món
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xác nhận xóa TOÀN BỘ giỏ hàng */}
      {deletingAllCart && (
        <div className="dialog-overlay" onClick={() => setDeletingAllCart(false)} style={{ zIndex: 200 }}>
          <div 
            className={`dialog-box ${isShaking ? 'shake-effect' : ''}`}
            style={{ maxWidth: '380px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-icon-wrapper" style={{ backgroundColor: 'rgba(239, 83, 80, 0.15)', color: '#ef5350' }}>
              <Trash2 size={28} />
            </div>
            <h3 className="dialog-title">Xóa giỏ hàng?</h3>
            <p className="dialog-desc" style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '24px', textAlign: 'center' }}>
              Bạn có chắc chắn muốn xóa toàn bộ món ăn đang chọn của <strong style={{ color: 'white' }}>{selectedTable}</strong> không?<br/>
              Hành động này sẽ làm trống giỏ hàng của bàn này.
            </p>
            <div className="dialog-buttons">
              <button 
                className="dialog-btn secondary" 
                onClick={() => setDeletingAllCart(false)}
              >
                Hủy bỏ
              </button>
              <button 
                className="dialog-btn primary" 
                style={{ backgroundColor: '#ef5350' }}
                onClick={() => {
                  if (navigator.vibrate) navigator.vibrate(80);
                  resetCurrentTable();
                  setDeletingAllCart(false);
                  setShowCartDetail(false);
                  triggerToast('Đã xóa toàn bộ món của bàn!');
                }}
              >
                ✓ Xóa tất cả
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
