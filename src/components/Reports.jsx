import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Calendar, TrendingUp, ChevronDown, ChevronUp, Download, AlertCircle } from 'lucide-react';

// Cache font data to avoid fetching on every click
let cachedRobotoRegular = null;
let cachedRobotoBold = null;

const removeDiacritics = (str) => {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
};

// ── Định dạng tiền VNĐ ────────────────────────────────────────────────
const fmt = (val) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', minimumFractionDigits: 0 })
    .format(val).replace('₫', 'đ');

// Đọc font từ local (public/fonts/) thay vì CDN
const loadLocalFont = async (filename) => {
  const res = await fetch(`/fonts/${filename}`);
  if (!res.ok) throw new Error(`Không thể tải font: ${filename} (status ${res.status})`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export default function Reports({ transactions }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear]   = useState(new Date().getFullYear());
  const [filterMode, setFilterMode]       = useState('month'); // 'month' | 'range' | 'year'
  const [startMonth, setStartMonth]       = useState(0);
  const [endMonth, setEndMonth]           = useState(new Date().getMonth());
  const [expandedDays, setExpandedDays]   = useState({});
  const [exportStatus, setExportStatus]   = useState(''); // '' | 'exporting' | 'loading_font' | 'done' | 'error'
  const [exportError, setExportError]     = useState('');

  const months = Array.from({ length: 12 }, (_, i) => i);
  const years  = [2023, 2024, 2025, 2026, 2027];

  // ── Lọc giao dịch theo bộ lọc ────────────────────────────────────────
  const monthlyTransactions = transactions.filter(tx => {
    const d  = new Date(tx.timestamp);
    const yr = d.getFullYear();
    const mo = d.getMonth();
    if (yr !== selectedYear) return false;
    if (filterMode === 'month') return mo === selectedMonth;
    if (filterMode === 'year')  return true;
    const sm = Math.min(startMonth, endMonth);
    const em = Math.max(startMonth, endMonth);
    return mo >= sm && mo <= em;
  });

  const totalRevenue = monthlyTransactions.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0);
  const totalExpense = monthlyTransactions.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0);
  const netProfit    = totalRevenue - totalExpense;

  // ── Tiêu đề ───────────────────────────────────────────────────────────
  const getSummaryTitle = () => {
    if (filterMode === 'month') return `TỔNG KẾT THÁNG ${selectedMonth + 1}/${selectedYear}`;
    if (filterMode === 'year')  return `TỔNG KẾT CẢ NĂM ${selectedYear}`;
    const sm = Math.min(startMonth, endMonth), em = Math.max(startMonth, endMonth);
    return `TỔNG KẾT TỪ THÁNG ${sm + 1} ĐẾN THÁNG ${em + 1}/${selectedYear}`;
  };

  const getShortTitle = () => {
    if (filterMode === 'month') return `Thang_${selectedMonth + 1}_${selectedYear}`;
    if (filterMode === 'year')  return `Nam_${selectedYear}`;
    const sm = Math.min(startMonth, endMonth), em = Math.max(startMonth, endMonth);
    return `Thang_${sm + 1}_den_${em + 1}_${selectedYear}`;
  };

  // ── Nhóm theo ngày ────────────────────────────────────────────────────
  const groupTransactionsByDate = () => {
    const groups = {};
    monthlyTransactions.forEach(tx => {
      const key = tx.dateString || new Date(tx.timestamp).toLocaleDateString('vi-VN');
      if (!groups[key]) groups[key] = { dateString: key, transactions: [], revenue: 0, expense: 0 };
      groups[key].transactions.push(tx);
      if (tx.type === 'in') groups[key].revenue += tx.amount;
      else groups[key].expense += tx.amount;
    });
    return Object.values(groups).sort((a, b) => {
      const parse = s => { const [d,m,y] = s.split('/').map(Number); return new Date(y, m-1, d); };
      return parse(b.dateString) - parse(a.dateString);
    });
  };
  const dailyGroups = groupTransactionsByDate();

  const toggleDay = (key) => setExpandedDays(p => ({ ...p, [key]: !p[key] }));

  const getReportPeriodString = () => {
    const pad = (num) => String(num).padStart(2, '0');
    if (filterMode === 'month') {
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      return `01/${pad(selectedMonth + 1)}/${selectedYear} - ${pad(lastDay)}/${pad(selectedMonth + 1)}/${selectedYear} | Tháng ${selectedMonth + 1} năm ${selectedYear}`;
    }
    if (filterMode === 'year') {
      return `01/01/${selectedYear} - 31/12/${selectedYear} | Cả năm ${selectedYear}`;
    }
    const sm = Math.min(startMonth, endMonth);
    const em = Math.max(startMonth, endMonth);
    const lastDay = new Date(selectedYear, em + 1, 0).getDate();
    return `01/${pad(sm + 1)}/${selectedYear} - ${pad(lastDay)}/${pad(em + 1)}/${selectedYear} | Từ tháng ${sm + 1} đến tháng ${em + 1} năm ${selectedYear}`;
  };

  // ── Xuất PDF dùng jsPDF từ npm ────────────────────────────────────────
  const handleExportPDF = async (accented = true) => {
    setExportStatus('exporting');
    setExportError('');

    let useRoboto = accented;

    if (accented) {
      try {
        if (!cachedRobotoRegular || !cachedRobotoBold) {
          setExportStatus('loading_font');
          const [regData, boldData] = await Promise.all([
            loadLocalFont('Roboto-Regular.ttf'),
            loadLocalFont('Roboto-Medium.ttf'),
          ]);
          cachedRobotoRegular = regData;
          cachedRobotoBold = boldData;
        }
        setExportStatus('exporting');
      } catch (err) {
        console.error('Lỗi tải font Roboto local:', err);
        // Tự động fallback sang không dấu thay vì báo lỗi
        useRoboto = false;
        setExportStatus('exporting');
      }
    }

    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const now = new Date();

      if (useRoboto) {
        doc.addFileToVFS('Roboto-Regular.ttf', cachedRobotoRegular);
        doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
        doc.addFileToVFS('Roboto-Bold.ttf', cachedRobotoBold);
        doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
        doc.setFont('Roboto', 'normal');
      } else {
        doc.setFont('helvetica', 'normal');
      }

      const cleanText = (text) => {
        if (!text) return '';
        return useRoboto ? String(text) : removeDiacritics(String(text));
      };

      // ── Tiêu đề đầu trang (Header) ──────────────────────────────────
      // Cột trái: Thông tin quán ăn
      doc.setFontSize(11.5);
      doc.setFont(useRoboto ? 'Roboto' : 'helvetica', 'bold');
      doc.setTextColor(13, 71, 161); // Xanh dương đậm
      doc.text(cleanText('QUÁN LÒNG NGON A18'), 14, 15);

      doc.setFontSize(8);
      doc.setFont(useRoboto ? 'Roboto' : 'helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(cleanText('Ẩm Thực Lòng Phố - Đỉnh Cao Hương Vị'), 14, 19.5);
      doc.text(cleanText('Địa chỉ: 321 Quan Nhân, Thanh Xuân, Hà Nội'), 14, 23.5);

      // Cột phải: Mẫu số & Ngày xuất
      const pad = (n) => String(n).padStart(2, '0');
      const exportTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())} ngày ${pad(now.getDate())}/tháng ${pad(now.getMonth() + 1)}/năm ${now.getFullYear()}`;

      doc.setFontSize(7.5);
      doc.setFont(useRoboto ? 'Roboto' : 'helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(cleanText('Mẫu số: 01-SAOKE'), pageW - 14, 15, { align: 'right' });

      doc.setFont(useRoboto ? 'Roboto' : 'helvetica', 'normal');
      doc.setTextColor(130, 130, 130);
      doc.text(cleanText(`Ngày xuất: ${exportTimeStr}`), pageW - 14, 19.5, { align: 'right' });

      // Đường kẻ ngăn cách trên
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.25);
      doc.line(14, 26.5, pageW - 14, 26.5);

      // ── Tiêu đề bảng sao kê ──────────────────────────────────────────
      doc.setFontSize(13);
      doc.setFont(useRoboto ? 'Roboto' : 'helvetica', 'bold');
      doc.setTextColor(13, 71, 161); // Xanh dương đậm
      doc.text(cleanText('BẢNG SAO KÊ CHI TIẾT THU CHI'), pageW / 2, 34.5, { align: 'center' });

      doc.setFontSize(9);
      doc.setFont(useRoboto ? 'Roboto' : 'helvetica', 'normal');
      doc.setTextColor(90, 90, 90);
      doc.text(cleanText(`Kỳ báo cáo: ${getReportPeriodString()}`), pageW / 2, 40, { align: 'center' });

      // ── Thanh tóm tắt (Tổng thu, Tổng chi, Còn lại) ──────────────────
      const boxY = 44;
      const boxH = 14;
      const boxW = pageW - 28;

      doc.setFillColor(250, 250, 250);
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      doc.rect(14, boxY, boxW, boxH, 'FD');

      const colW = boxW / 3;
      doc.line(14 + colW, boxY, 14 + colW, boxY + boxH);
      doc.line(14 + 2 * colW, boxY, 14 + 2 * colW, boxY + boxH);

      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.setFont(useRoboto ? 'Roboto' : 'helvetica', 'normal');

      // Tổng thu
      doc.text(cleanText('Tổng thu'), 18, boxY + 8.5);
      doc.setTextColor(0, 140, 120);
      doc.setFont(useRoboto ? 'Roboto' : 'helvetica', 'bold');
      doc.text(`+${fmt(totalRevenue)}`, 14 + colW - 4, boxY + 8.5, { align: 'right' });

      // Tổng chi
      doc.setTextColor(100, 100, 100);
      doc.setFont(useRoboto ? 'Roboto' : 'helvetica', 'normal');
      doc.text(cleanText('Tổng chi'), 14 + colW + 4, boxY + 8.5);
      doc.setTextColor(200, 60, 60);
      doc.setFont(useRoboto ? 'Roboto' : 'helvetica', 'bold');
      doc.text(`-${fmt(totalExpense)}`, 14 + 2 * colW - 4, boxY + 8.5, { align: 'right' });

      // Lợi nhuận ròng
      doc.setTextColor(100, 100, 100);
      doc.setFont(useRoboto ? 'Roboto' : 'helvetica', 'normal');
      doc.text(cleanText('Lợi nhuận ròng'), 14 + 2 * colW + 4, boxY + 8.5);
      doc.setTextColor(...(netProfit >= 0 ? [0, 140, 120] : [200, 60, 60]));
      doc.setFont(useRoboto ? 'Roboto' : 'helvetica', 'bold');
      doc.text((netProfit >= 0 ? '+' : '') + fmt(netProfit), pageW - 18, boxY + 8.5, { align: 'right' });

      // ── Phần I. TỔNG HỢP THEO DANH MỤC ──────────────────────────────
      let y = boxY + boxH + 10;
      doc.setFontSize(10.5);
      doc.setFont(useRoboto ? 'Roboto' : 'helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(cleanText('I. TỔNG HỢP THEO DANH MỤC'), 14, y);

      const inTransactions  = monthlyTransactions.filter(t => t.type === 'in');
      const outTransactions = monthlyTransactions.filter(t => t.type === 'out');
      const inCount         = inTransactions.length;
      const outCount        = outTransactions.length;
      const totalCount      = inCount + outCount;

      const summaryRows = [
        [cleanText('Bán hàng'), inCount, `+${fmt(totalRevenue)}`, cleanText('Doanh thu bán hàng')],
        [cleanText('Chi phí'),  outCount, `-${fmt(totalExpense)}`, cleanText('Chi phí nguyên liệu & vận hành')],
        [cleanText('TỔNG CỘNG'), totalCount, (netProfit >= 0 ? '+' : '') + fmt(netProfit), ''],
      ];

      autoTable(doc, {
        startY: y + 4,
        head: [[
          cleanText('Danh mục'),
          cleanText('Số giao dịch'),
          cleanText('Tổng tiền'),
          cleanText('Ghi chú'),
        ]],
        body: summaryRows,
        theme: 'grid',
        styles: { font: useRoboto ? 'Roboto' : 'helvetica', fontSize: 8.5, cellPadding: 3, lineColor: [200, 200, 200], lineWidth: 0.1 },
        headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, halign: 'center' },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 25, halign: 'center' },
          2: { cellWidth: 45, halign: 'right', fontStyle: 'bold' },
          3: { cellWidth: 70 },
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            if (data.row.index === 2) data.cell.styles.fontStyle = 'bold';
            if (data.column.index === 2) {
              if (data.row.index === 0) data.cell.styles.textColor = [0, 140, 120];
              else if (data.row.index === 1) data.cell.styles.textColor = [200, 60, 60];
              else if (data.row.index === 2) data.cell.styles.textColor = netProfit >= 0 ? [0, 140, 120] : [200, 60, 60];
            }
          }
        },
        margin: { left: 14, right: 14 },
      });

      // ── Phần II. DANH SÁCH GIAO DỊCH CHI TIẾT ────────────────────────
      const afterY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(10.5);
      doc.setFont(useRoboto ? 'Roboto' : 'helvetica', 'bold');
      doc.text(cleanText(`II. DANH SÁCH GIAO DỊCH CHI TIẾT (${totalCount} giao dịch)`), 14, afterY);

      const detailRows = [...monthlyTransactions]
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((tx, idx) => {
          const dateStr = new Date(tx.timestamp).toLocaleDateString('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
          });
          const timeStr = new Date(tx.timestamp).toLocaleTimeString('vi-VN', {
            hour: '2-digit', minute: '2-digit', hour12: false,
          });
          return [
            idx + 1,
            `${dateStr} ${timeStr}`,
            tx.type === 'in' ? cleanText('Bán hàng') : cleanText('Chi phí'),
            cleanText(tx.description),
            (tx.type === 'in' ? '+' : '-') + fmt(tx.amount),
          ];
        });

      autoTable(doc, {
        startY: afterY + 4,
        head: [[
          cleanText('STT'),
          cleanText('Ngày'),
          cleanText('Danh mục'),
          cleanText('Chi tiết'),
          cleanText('Số tiền'),
        ]],
        body: detailRows,
        theme: 'grid',
        styles: { font: useRoboto ? 'Roboto' : 'helvetica', fontSize: 8, cellPadding: 2.5, lineColor: [200, 200, 200], lineWidth: 0.1 },
        headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, halign: 'center' },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 32, halign: 'left' },
          2: { cellWidth: 24, halign: 'left' },
          3: { cellWidth: 77, halign: 'left' },
          4: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 4) {
            const r = detailRows[data.row.index];
            if (r) {
              const isInc = r[2] === cleanText('Bán hàng');
              data.cell.styles.textColor = isInc ? [0, 140, 120] : [200, 60, 60];
            }
          }
        },
        margin: { left: 14, right: 14 },
      });

      // ── Chân trang ─────────────────────────────────────────────────
      const nPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= nPages; i++) {
        doc.setPage(i);
        const pH = doc.internal.pageSize.getHeight();
        doc.setFontSize(7.5);
        doc.setTextColor(150, 150, 150);
        doc.setFont(useRoboto ? 'Roboto' : 'helvetica', 'normal');
        doc.text(
          cleanText(`Trang ${i}/${nPages} - Quán Lòng A18 - Sao kê kết xuất lúc ${now.toLocaleDateString('vi-VN')} ${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`),
          pageW / 2,
          pH - 6,
          { align: 'center' }
        );
      }

      doc.save(`SaoKe_${getShortTitle()}_QuanLongA18_${useRoboto ? 'CoDau' : 'KhongDau'}.pdf`);
      setExportStatus('done');
      setTimeout(() => setExportStatus(''), 3000);
    } catch (err) {
      console.error('Lỗi xuất PDF:', err);
      setExportError(err.message || 'Không xác định');
      setExportStatus('error');
      setTimeout(() => setExportStatus(''), 5000);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flex: '1', flexDirection: 'column', gap: '15px' }}>

      {/* Bộ lọc thời gian */}
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '14px 16px', borderRadius: '18px', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Tabs chế độ */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {[['month', 'Theo Tháng'], ['range', 'Theo Các Tháng'], ['year', 'Cả Năm']].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`filter-tab ${filterMode === mode ? 'active' : ''}`}
              onClick={() => setFilterMode(mode)}
              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '8px' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Calendar size={15} style={{ color: '#5c6bc0' }} />
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Bộ lọc:</span>

          {filterMode === 'month' && (
            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
              style={{ border: 'none', background: 'transparent', fontSize: '13px', fontWeight: '700', color: 'white', cursor: 'pointer' }}>
              {months.map(m => <option key={m} value={m} style={{ backgroundColor: '#18191e' }}>Tháng {m + 1}</option>)}
            </select>
          )}

          {filterMode === 'range' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Từ</span>
              <select value={startMonth} onChange={e => setStartMonth(Number(e.target.value))}
                style={{ border: 'none', background: 'transparent', fontSize: '13px', fontWeight: '700', color: 'white', cursor: 'pointer' }}>
                {months.map(m => <option key={m} value={m} style={{ backgroundColor: '#18191e' }}>Tháng {m + 1}</option>)}
              </select>
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>đến</span>
              <select value={endMonth} onChange={e => setEndMonth(Number(e.target.value))}
                style={{ border: 'none', background: 'transparent', fontSize: '13px', fontWeight: '700', color: 'white', cursor: 'pointer' }}>
                {months.map(m => <option key={m} value={m} style={{ backgroundColor: '#18191e' }}>Tháng {m + 1}</option>)}
              </select>
            </div>
          )}

          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Năm</span>
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
            style={{ border: 'none', background: 'transparent', fontSize: '13px', fontWeight: '700', color: 'white', cursor: 'pointer' }}>
            {years.map(y => <option key={y} value={y} style={{ backgroundColor: '#18191e' }}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Tổng kết */}
      <div className="dashboard-card">
        <div className="card-title-row">
          <span className="card-label"><TrendingUp size={16} />{getSummaryTitle()}</span>
        </div>
        <div className="card-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Lợi nhuận ròng</div>
        <div className="dashboard-value" style={{ color: netProfit >= 0 ? '#00bfa5' : '#ef5350', marginBottom: '16px' }}>
          {netProfit >= 0 ? '+' : ''}{fmt(netProfit)}
        </div>
        <div className="dashboard-stats-grid" style={{ marginTop: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="stat-label" style={{ fontSize: '10px', color: '#00bfa5' }}>↑ Tổng thu (Doanh thu)</span>
            <span className="stat-value" style={{ fontSize: '14px', color: '#00bfa5' }}>+{fmt(totalRevenue)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderLeft: '1px solid var(--color-border)', paddingLeft: '15px' }}>
            <span className="stat-label" style={{ fontSize: '10px', color: '#ef5350' }}>↓ Tổng chi (Chi phí)</span>
            <span className="stat-value" style={{ fontSize: '14px', color: '#ef5350' }}>-{fmt(totalExpense)}</span>
          </div>
        </div>
      </div>

      {/* Nút xuất PDF – 2 tùy chọn */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          id="btn-export-codau"
          className="pdf-btn"
          onClick={() => handleExportPDF(true)}
          disabled={exportStatus === 'exporting' || exportStatus === 'loading_font'}
          style={{ flex: 1, opacity: (exportStatus === 'exporting' || exportStatus === 'loading_font') ? 0.7 : 1 }}
        >
          <Download size={16} />
          {exportStatus === 'loading_font' ? 'Đang tải font...' :
           exportStatus === 'exporting'    ? 'Đang tạo PDF...' :
           exportStatus === 'done'         ? '✓ Tải thành công!' :
           'Xuất PDF (Có Dấu)'}
        </button>

        <button
          id="btn-export-khongdau"
          className="pdf-btn"
          onClick={() => handleExportPDF(false)}
          disabled={exportStatus === 'exporting' || exportStatus === 'loading_font'}
          style={{
            flex: 1,
            opacity: (exportStatus === 'exporting' || exportStatus === 'loading_font') ? 0.7 : 1,
            background: 'linear-gradient(135deg, #424242, #212121)',
          }}
        >
          <Download size={16} />
          Xuất PDF (Không Dấu)
        </button>
      </div>

      {exportStatus === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: 'rgba(239,83,80,0.1)', borderRadius: '10px', border: '1px solid rgba(239,83,80,0.3)', fontSize: '12px', color: '#ef5350' }}>
          <AlertCircle size={14} />
          Lỗi xuất PDF: {exportError || 'Vui lòng thử lại.'}
        </div>
      )}

      {/* Chi tiết từng ngày */}
      <h3 className="section-title" style={{ marginTop: '10px' }}>Chi tiết từng ngày</h3>
      <div className="days-list" style={{ paddingBottom: '24px' }}>
        {dailyGroups.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: '30px', fontSize: '13px' }}>
            Không có giao dịch nào trong khoảng thời gian này.
          </div>
        ) : (
          dailyGroups.map(group => {
            const isExpanded = !!expandedDays[group.dateString];
            return (
              <div key={group.dateString} className="day-accordion">
                <button className="day-header" style={{ width: '100%', textAlign: 'left' }} onClick={() => toggleDay(group.dateString)}>
                  <span className="day-title">{group.dateString}</span>
                  <div className="day-amounts">
                    {group.revenue > 0 && <span className="day-amount-up">+{fmt(group.revenue)}</span>}
                    {group.expense > 0 && <span className="day-amount-down">-{fmt(group.expense)}</span>}
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="day-body">
                    {group.transactions.map((tx, idx) => (
                      <div key={tx.id || idx} className="tx-row">
                        <span className="tx-desc" style={{ color: 'white' }}>
                          {tx.description}
                          <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block', fontWeight: 'normal', marginTop: '2px' }}>
                            {new Date(tx.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </span>
                        <span className={`tx-val ${tx.type === 'in' ? 'in' : 'out'}`}>
                          {tx.type === 'in' ? '+' : '−'}{fmt(tx.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
