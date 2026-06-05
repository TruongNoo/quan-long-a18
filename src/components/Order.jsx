import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Minus, ShoppingCart, Printer, X, Check, Trash2, Utensils } from 'lucide-react';
import { addTransaction } from '../firebase';

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

  // ── KEY FIX: Giỏ hàng TÁCH RIÊNG theo từng bàn và lưu trữ LocalStorage ─────────────────────
  const [tableQuantities, setTableQuantities] = useState(() => {
    const saved = localStorage.getItem('a18_table_quantities');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const merged = {};
        tables.forEach(t => {
          merged[t] = parsed[t] || {};
        });
        return merged;
      } catch (e) {
        console.error('Lỗi load giỏ hàng từ LocalStorage:', e);
      }
    }
    const init = {};
    tables.forEach(t => { init[t] = {}; });
    return init;
  });

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showCartDetail, setShowCartDetail] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // States for custom deletion confirm modals
  const [deletingCartItem, setDeletingCartItem] = useState(null);
  const [deletingAllCart, setDeletingAllCart] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  // Tự động lưu trạng thái vào LocalStorage khi thay đổi
  useEffect(() => {
    localStorage.setItem('a18_active_order_type', activeOrderType);
  }, [activeOrderType]);

  useEffect(() => {
    localStorage.setItem('a18_selected_table', selectedTable);
  }, [selectedTable]);

  useEffect(() => {
    localStorage.setItem('a18_table_quantities', JSON.stringify(tableQuantities));
  }, [tableQuantities]);

  // Lấy giỏ hàng của bàn hiện tại
  const quantities = tableQuantities[selectedTable] || {};

  // ── Định dạng tiền VNĐ ──────────────────────────────────────────────
  const formatCurrency = (val) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', minimumFractionDigits: 0 })
      .format(val).replace('₫', 'đ');

  // ── Tăng / giảm số lượng (chỉ ảnh hưởng đến bàn đang chọn) ─────────
  const handleQtyChange = (itemId, delta) => {
    setTableQuantities(prev => {
      const cur = prev[selectedTable] || {};
      const newQty = Math.max(0, (cur[itemId] || 0) + delta);
      return {
        ...prev,
        [selectedTable]: { ...cur, [itemId]: newQty },
      };
    });
  };

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
    setTableQuantities(prev => ({ ...prev, [selectedTable]: {} }));
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

  const handlePrint = async () => {
    window.print();
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

      {/* CSS in ấn */}
      <style>{`
        @media print {
          @page {
            margin: 0;
          }
          body {
            margin: 0;
            background: white;
          }
          body * { visibility: hidden; }
          #print-section-target, #print-section-target * { visibility: visible; }
          #print-section-target {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 8mm 12mm;
            background: white !important;
            color: black !important;
            box-sizing: border-box;
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
              <div key={item.id} className={`food-card ${qty > 0 ? 'selected' : ''}`}>
                <div className="food-avatar">{getAvatarChar(item.name)}</div>
                <div className="food-name">{item.name}</div>
                <div className="food-price">{formatCurrency(item.price)}</div>
                <div className="qty-control">
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

      {/* ── Màn hình hoá đơn ─────────────────────────────────────── */}
      {showReceipt && (
        <div className="bill-overlay">
          <div className="bill-scroll-container">
            <div id="print-section-target" className="thermal-bill printable-area">
              <div className="bill-header">
                <div className="bill-brand">QUÁN LÒNG A18</div>
                <div style={{ fontSize: '10px' }}>Địa chỉ: Khu A18, TP Hà Nội</div>
                <div style={{ fontSize: '10px' }}>SĐT: 0987.654.321</div>
                <div className="bill-divider" />
                <div style={{ fontWeight: '700', fontSize: '13px' }}>HÓA ĐƠN THANH TOÁN</div>
                <div style={{ fontSize: '10px' }}>Bàn: {selectedTable}</div>
              </div>
              <div style={{ fontSize: '10px', marginBottom: '8px' }}>
                <div>Ngày: {new Date().toLocaleDateString('vi-VN')}</div>
                <div>Giờ: {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
                <div>Mã HĐ: HD{Date.now().toString().slice(-6)}</div>
              </div>
              <div className="bill-divider" />
              <div className="bill-table-header">
                <span>Tên món</span>
                <span style={{ textAlign: 'center' }}>SL</span>
                <span style={{ textAlign: 'right' }}>T.Tiền</span>
              </div>
              <div className="bill-divider" />
              {orderDetails.map((d, i) => (
                <div key={i} className="bill-table-row">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.item.name}</span>
                  <span style={{ textAlign: 'center' }}>{d.qty}</span>
                  <span style={{ textAlign: 'right' }}>{formatCurrency(d.total)}</span>
                </div>
              ))}
              <div className="bill-divider" />
              <div className="bill-total-row">
                <span>TỔNG CỘNG:</span>
                <span>{formatCurrency(totalCost)}</span>
              </div>
              <div className="bill-divider" />
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
