import React, { useState, useEffect } from 'react';
import { TrendingUp, Plus, FilePlus, Calendar, X, ShoppingBag, Utensils, Pencil, Trash2, Target, AlertTriangle } from 'lucide-react';
import { addTransaction, deleteTransaction } from '../firebase';

export default function Overview({ transactions, menuItems, onTabChange, onNotify }) {
  const [filter, setFilter] = useState('today');
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [expenseName, setExpenseName] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [incomeName, setIncomeName] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeCategory, setIncomeCategory] = useState('Món chính');
  const [selectedTx, setSelectedTx] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState('success'); // 'success' | 'error'

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

  const sortedCategories = Array.from(new Set((menuItems || []).map(item => item.category).filter(Boolean)))
    .sort((a, b) => getCategoryWeight(a) - getCategoryWeight(b));

  const formCategories = Array.from(new Set([
    'Lòng chần', 'Ăn nhanh', 'Khai vị', 'Rau xào', 'Món chiên xào', 
    'Đặc sản', 'Lẩu', 'Combo', 'Nước ngọt', 'Rượu bia', 'Bia & Đồ uống', 'Phụ',
    ...sortedCategories
  ]));

  const [isShaking, setIsShaking] = useState(false);

  const triggerDeleteConfirm = () => {
    if (navigator.vibrate) navigator.vibrate(100);
    setIsShaking(true);
    setConfirmDelete(true);
    setTimeout(() => setIsShaking(false), 350);
  };

  // ── Mục tiêu doanh thu ngày (lưu LocalStorage) ───────────────────────
  const [dailyTarget, setDailyTarget] = useState(() => {
    const saved = localStorage.getItem('a18_daily_target');
    return saved ? Number(saved) : 3000000;
  });
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetInput, setTargetInput] = useState('');

  // ── Xác nhận xóa giao dịch ──────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Định dạng tiền VNĐ ──────────────────────────────────────────────
  const formatCurrency = (val) => {
    if (val === 0) return '0 đ';
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency', currency: 'VND', minimumFractionDigits: 0,
    }).format(val).replace('₫', 'đ');
  };

  const previewAmount = (raw) => {
    const num = Number(raw.replace(/\D/g, ''));
    if (!raw || isNaN(num) || num === 0) return '';
    return formatCurrency(num);
  };

  // ── Lọc giao dịch ───────────────────────────────────────────────────
  const getFilteredTransactions = () => {
    const now = new Date();
    const todayStr = now.toLocaleDateString('vi-VN');
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    return transactions.filter(tx => {
      const txDate = new Date(tx.timestamp);
      if (filter === 'today') return tx.dateString === todayStr;
      if (filter === 'month') return txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;
      return true;
    });
  };

  const filteredTxs = getFilteredTransactions();

  // ── Tính toán hôm nay ────────────────────────────────────────────────
  const todayStr = new Date().toLocaleDateString('vi-VN');
  const todayTxs = transactions.filter(tx => tx.dateString === todayStr);
  const todayRevenue = todayTxs.filter(tx => tx.type === 'in').reduce((s, tx) => s + tx.amount, 0);
  const todayExpense = todayTxs.filter(tx => tx.type === 'out').reduce((s, tx) => s + tx.amount, 0);
  const todayProfit = todayRevenue - todayExpense;
  const targetPercent = Math.min(100, Math.round((todayRevenue / dailyTarget) * 100));

  // ── Tính toán theo bộ lọc ────────────────────────────────────────────
  const reportRevenue = filteredTxs.filter(tx => tx.type === 'in').reduce((s, tx) => s + tx.amount, 0);
  const reportExpense = filteredTxs.filter(tx => tx.type === 'out').reduce((s, tx) => s + tx.amount, 0);
  const reportProfit = reportRevenue - reportExpense;

  // ── Lưu chi tiêu thủ công ───────────────────────────────────────────
  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (!expenseName || !expenseAmount) return;
    const tx = {
      type: 'out', description: expenseName,
      amount: Number(expenseAmount.replace(/\D/g, '')),
      timestamp: Date.now(), dateString: new Date().toLocaleDateString('vi-VN'),
    };
    try {
      await addTransaction(tx);
      if (onNotify) {
        onNotify(`Ghi chi tiêu thủ công: ${expenseName} (${formatCurrency(tx.amount)})`, 'expense');
      }
      setExpenseName(''); setExpenseAmount('');
      setShowExpenseModal(false);
      triggerToast(`✓ Đã ghi chi tiêu: ${formatCurrency(tx.amount)}`, 'success');
    } catch (err) {
      alert('Không thể lưu chi tiêu: ' + err.message);
    }
  };

  // ── Lưu doanh thu thủ công ──────────────────────────────────────────
  const handleSaveIncome = async (e) => {
    e.preventDefault();
    if (!incomeName || !incomeAmount) return;
    const tx = {
      type: 'in', description: incomeName, category: incomeCategory,
      amount: Number(incomeAmount.replace(/\D/g, '')),
      timestamp: Date.now(), dateString: new Date().toLocaleDateString('vi-VN'),
    };
    try {
      await addTransaction(tx);
      if (onNotify) {
        onNotify(`Ghi doanh thu thủ công: ${incomeName} (${formatCurrency(tx.amount)})`, 'income');
      }
      setIncomeName(''); setIncomeAmount(''); setIncomeCategory('Món chính');
      setShowIncomeModal(false);
      triggerToast(`✓ Đã ghi doanh thu: ${formatCurrency(tx.amount)}`, 'success');
    } catch (err) {
      alert('Không thể lưu doanh thu: ' + err.message);
    }
  };

  // ── Xóa giao dịch ───────────────────────────────────────────────────
  const handleDeleteTx = async () => {
    if (!selectedTx) return;
    setDeleting(true);
    if (navigator.vibrate) navigator.vibrate(80);
    try {
      await deleteTransaction(selectedTx.id);
      if (onNotify) {
        onNotify(`Đã xóa giao dịch: ${selectedTx.description} (${formatCurrency(selectedTx.amount)})`, 'delete');
      }
      triggerToast('✓ Đã xóa giao dịch thành công', 'success');
      setSelectedTx(null);
      setConfirmDelete(false);
    } catch (err) {
      triggerToast('✗ Xóa thất bại: ' + err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ── Lưu mục tiêu doanh thu ──────────────────────────────────────────
  const handleSaveTarget = (e) => {
    e.preventDefault();
    const val = Number(targetInput.replace(/\D/g, ''));
    if (!val || val <= 0) return;
    setDailyTarget(val);
    localStorage.setItem('a18_daily_target', String(val));
    setShowTargetModal(false);
    setTargetInput('');
    triggerToast(`✓ Mục tiêu ngày: ${formatCurrency(val)}`, 'success');
  };

  const triggerToast = (msg, type = 'success') => {
    setToastMsg(msg); setToastType(type);
    setTimeout(() => setToastMsg(''), 2800);
  };

  const parseOrder = (desc) => {
    if (!desc) return null;
    const parts = desc.split(': ');
    if (parts.length < 2) return null;
    const table = parts[0];
    const itemsRaw = parts[1];
    const items = itemsRaw.split(', ').map(itemStr => {
      const match = itemStr.match(/(.+) x(\d+)$/);
      if (match) return { name: match[1], qty: parseInt(match[2], 10) };
      return { name: itemStr, qty: null };
    });
    return { table, items };
  };

  return (
    <div style={{ display: 'flex', flex: '1', flexDirection: 'column', gap: '18px' }}>

      {/* ── Thẻ Lợi Nhuận Hôm Nay ─────────────────────────────────── */}
      <div className="dashboard-card profit-card">
        <div className="card-title-row">
          <span className="card-label">
            <TrendingUp size={15} />
            Lợi nhuận hôm nay
          </span>
          <span className={`badge-status ${todayProfit >= 0 ? 'badge-success' : 'badge-danger'}`}>
            {todayProfit >= 0 ? '▲ Có lãi' : '▼ Thâm hụt'}
          </span>
        </div>
        <div className="dashboard-value" style={{ color: todayProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {todayProfit >= 0 ? '+' : ''}{formatCurrency(todayProfit)}
        </div>

        {/* Progress bar */}
        <div className="progress-bar-container">
          <div
            className="progress-bar"
            style={{
              width: `${targetPercent}%`,
              background: todayProfit >= 0
                ? 'linear-gradient(90deg, #00bfa5, #00e5c9)'
                : 'linear-gradient(90deg, #ef5350, #ff7043)',
            }}
          />
        </div>

        <div className="card-description" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span>Đạt&nbsp;
            <span style={{ color: todayProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: '700' }}>
              {targetPercent}%
            </span>
            &nbsp;chỉ tiêu —
          </span>
          <span style={{ color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Mục tiêu: {formatCurrency(dailyTarget)}
          </span>
          <button
            onClick={() => { setTargetInput(new Intl.NumberFormat('vi-VN').format(dailyTarget)); setShowTargetModal(true); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '3px',
              padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
              backgroundColor: 'rgba(92,107,192,0.18)', color: '#7986cb',
              border: '1px solid rgba(92,107,192,0.3)', cursor: 'pointer',
            }}
          >
            <Pencil size={10} /> Sửa
          </button>
        </div>
      </div>

      {/* ── Doanh Thu & Chi Phí Grid ───────────────────────────────── */}
      <div className="dashboard-stats-grid">
        <div className="stat-box stat-box-income">
          <span className="stat-label" style={{ color: 'var(--color-success)' }}>Doanh thu (Thu)</span>
          <div className="stat-value up">+{formatCurrency(todayRevenue)}</div>
        </div>
        <div className="stat-box stat-box-expense">
          <span className="stat-label" style={{ color: 'var(--color-danger)' }}>Chi phí (Chi)</span>
          <div className="stat-value down">-{formatCurrency(todayExpense)}</div>
        </div>
      </div>

      {/* ── Quản Lý Thu Chi Nhanh ─────────────────────────────────── */}
      <h3 className="section-title">Quản lý thu chi nhanh</h3>
      <div className="quick-actions-row">
        <button className="btn-action-card green" onClick={() => setShowIncomeModal(true)}>
          <Plus className="action-icon" size={22} />
          <div>
            <div className="action-title">THÊM MÓN THỦ CÔNG</div>
            <div className="action-subtitle">Ghi nhanh doanh thu</div>
          </div>
        </button>
        <button className="btn-action-card blue" onClick={() => setShowExpenseModal(true)}>
          <FilePlus className="action-icon" size={22} />
          <div>
            <div className="action-title">GHI CHI TIÊU THỦ CÔNG</div>
            <div className="action-subtitle">Nhập tiền mua hàng</div>
          </div>
        </button>
      </div>

      {/* ── Nhật Ký Thu Chi Gần Đây ───────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
        <h3 className="section-title" style={{ margin: 0 }}>Nhật ký thu chi</h3>
        <div className="filter-tabs">
          <button className={`filter-tab ${filter === 'today' ? 'active' : ''}`} onClick={() => setFilter('today')}>Hôm nay</button>
          <button className={`filter-tab ${filter === 'month' ? 'active' : ''}`} onClick={() => setFilter('month')}>Tháng</button>
          <button className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Tất cả</button>
        </div>
      </div>

      {/* Tóm tắt theo bộ lọc */}
      <div className="daily-summary-bar">
        <div className="summary-item">
          <span className="card-label">Tổng thu</span>
          <span className="summary-val" style={{ color: 'var(--color-success)' }}>+{formatCurrency(reportRevenue)}</span>
        </div>
        <div style={{ borderLeft: '1px solid var(--color-border)', height: '24px' }} />
        <div className="summary-item">
          <span className="card-label">Tổng chi</span>
          <span className="summary-val" style={{ color: 'var(--color-danger)' }}>-{formatCurrency(reportExpense)}</span>
        </div>
        <div style={{ borderLeft: '1px solid var(--color-border)', height: '24px' }} />
        <div className="summary-item">
          <span className="card-label">Lợi nhuận</span>
          <span className="summary-val" style={{ color: reportProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {reportProfit >= 0 ? '+' : ''}{formatCurrency(reportProfit)}
          </span>
        </div>
      </div>

      {/* Danh sách giao dịch */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '30px' }}>
        {filteredTxs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: '30px 20px', fontSize: '13px' }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>📋</div>
            Không có giao dịch nào trong khoảng thời gian này.
          </div>
        ) : (
          [...filteredTxs].sort((a, b) => b.timestamp - a.timestamp).map((tx) => (
            <div
              key={tx.id || tx.timestamp}
              className={`tx-list-item ${tx.type === 'in' ? 'tx-in' : 'tx-out'}`}
              onClick={() => { setSelectedTx(tx); setConfirmDelete(false); }}
            >
              <div className="tx-icon-circle" style={{
                backgroundColor: tx.type === 'in' ? 'rgba(0,191,165,0.15)' : 'rgba(239,83,80,0.15)',
                color: tx.type === 'in' ? 'var(--color-success)' : 'var(--color-danger)',
              }}>
                {tx.type === 'in' ? '+' : '−'}
              </div>
              <div className="tx-info">
                <span className="tx-desc">{tx.description}</span>
                <span className="tx-meta">
                  <Calendar size={10} />
                  {new Date(tx.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  &nbsp;·&nbsp;{tx.dateString}
                </span>
              </div>
              <div className="tx-amount" style={{ color: tx.type === 'in' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {tx.type === 'in' ? '+' : '−'}{formatCurrency(tx.amount)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className={`toast-msg ${toastType === 'error' ? 'toast-error' : ''}`}>
          {toastMsg}
        </div>
      )}

      {/* ── Modal Ghi Chi Tiêu Thủ Công ──────────────────────────── */}
      {showExpenseModal && (
        <div className="dialog-overlay">
          <div className="dialog-box" style={{ maxWidth: '400px' }}>
            <div className="card-title-row" style={{ width: '100%', marginBottom: '20px' }}>
              <span className="card-label" style={{ fontSize: '15px' }}>
                <FilePlus size={18} style={{ color: 'var(--color-danger)' }} />
                Ghi chi tiêu thủ công
              </span>
              <button onClick={() => { setShowExpenseModal(false); setExpenseName(''); setExpenseAmount(''); }}
                style={{ color: 'var(--color-text-secondary)' }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveExpense} className="modal-form">
              <div className="form-group">
                <label>Nội dung chi tiêu</label>
                <input type="text" placeholder="Vd: Mua rau, mua lòng heo, tiền điện..."
                  value={expenseName} onChange={(e) => setExpenseName(e.target.value)} required autoFocus />
              </div>
              <div className="form-group">
                <label>Số tiền (đ)</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input type="text" inputMode="numeric" placeholder="Vd: 150.000"
                    value={expenseAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      setExpenseAmount(raw ? new Intl.NumberFormat('vi-VN').format(Number(raw)) : '');
                    }}
                    required style={{ width: '100%', paddingRight: '45px' }} />
                  <span style={{ position: 'absolute', right: '14px', color: 'var(--color-text-secondary)', fontSize: '13px', fontWeight: '600' }}>đồng</span>
                </div>
                {previewAmount(expenseAmount) && (
                  <div style={{ marginTop: '6px', fontSize: '13px', color: 'var(--color-danger)', fontWeight: '600' }}>
                    ≈ {previewAmount(expenseAmount)}
                  </div>
                )}
              </div>
              <div className="dialog-buttons" style={{ marginTop: '15px' }}>
                <button type="button" className="dialog-btn secondary"
                  onClick={() => { setShowExpenseModal(false); setExpenseName(''); setExpenseAmount(''); }}>
                  Hủy bỏ
                </button>
                <button type="submit" className="dialog-btn primary" style={{ backgroundColor: 'var(--color-danger)' }}>
                  Lưu chi tiêu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Thêm Món / Ghi Doanh Thu Thủ Công ─────────────── */}
      {showIncomeModal && (
        <div className="dialog-overlay">
          <div className="dialog-box" style={{ maxWidth: '400px' }}>
            <div className="card-title-row" style={{ width: '100%', marginBottom: '20px' }}>
              <span className="card-label" style={{ fontSize: '15px' }}>
                <Utensils size={18} />
                Thêm món ăn mới
              </span>
              <button onClick={() => { setShowIncomeModal(false); setIncomeName(''); setIncomeAmount(''); setIncomeCategory('Món chính'); }}
                style={{ color: 'var(--color-text-secondary)' }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveIncome} className="modal-form">
              <div className="form-group">
                <label>Tên món ăn</label>
                <input type="text" placeholder="Ví dụ: Dồi sụn nướng, Lòng xe điếu..."
                  value={incomeName} onChange={(e) => setIncomeName(e.target.value)} required autoFocus />
              </div>
              <div className="form-group">
                <label>Giá bán (đ)</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input type="text" inputMode="numeric" placeholder="Ví dụ: 80.000"
                    value={incomeAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      setIncomeAmount(raw ? new Intl.NumberFormat('vi-VN').format(Number(raw)) : '');
                    }}
                    required style={{ width: '100%', paddingRight: '45px' }} />
                  <span style={{ position: 'absolute', right: '14px', color: 'var(--color-text-secondary)', fontSize: '13px', fontWeight: '600' }}>đồng</span>
                </div>
                {previewAmount(incomeAmount) && (
                  <div style={{ marginTop: '6px', fontSize: '13px', color: 'var(--color-success)', fontWeight: '600' }}>
                    ≈ {previewAmount(incomeAmount)}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Danh mục</label>
                <select value={incomeCategory} onChange={(e) => setIncomeCategory(e.target.value)}>
                  {formCategories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="dialog-buttons" style={{ marginTop: '15px' }}>
                <button type="button" className="dialog-btn secondary"
                  onClick={() => { setShowIncomeModal(false); setIncomeName(''); setIncomeAmount(''); setIncomeCategory('Món chính'); }}>
                  Hủy bỏ
                </button>
                <button type="submit" className="dialog-btn primary">
                  Lưu món ăn
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Đặt Mục Tiêu Doanh Thu ────────────────────────── */}
      {showTargetModal && (
        <div className="dialog-overlay">
          <div className="dialog-box" style={{ maxWidth: '380px' }}>
            <div className="card-title-row" style={{ width: '100%', marginBottom: '20px' }}>
              <span className="card-label" style={{ fontSize: '15px' }}>
                <Target size={18} style={{ color: '#7986cb' }} />
                Đặt mục tiêu doanh thu ngày
              </span>
              <button onClick={() => { setShowTargetModal(false); setTargetInput(''); }}
                style={{ color: 'var(--color-text-secondary)' }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveTarget} className="modal-form">
              <div className="form-group">
                <label>Mục tiêu doanh thu mỗi ngày</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="text" inputMode="numeric"
                    placeholder="Ví dụ: 3.000.000"
                    value={targetInput}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      setTargetInput(raw ? new Intl.NumberFormat('vi-VN').format(Number(raw)) : '');
                    }}
                    required autoFocus style={{ width: '100%', paddingRight: '45px' }}
                  />
                  <span style={{ position: 'absolute', right: '14px', color: 'var(--color-text-secondary)', fontSize: '13px', fontWeight: '600' }}>đồng</span>
                </div>
                {targetInput && Number(targetInput.replace(/\D/g, '')) > 0 && (
                  <div style={{ marginTop: '6px', fontSize: '13px', color: '#7986cb', fontWeight: '600' }}>
                    ≈ {formatCurrency(Number(targetInput.replace(/\D/g, '')))}
                  </div>
                )}
              </div>
              <div style={{ padding: '10px 12px', backgroundColor: 'rgba(92,107,192,0.08)', borderRadius: '8px',
                border: '1px solid rgba(92,107,192,0.2)', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
                💡 Mục tiêu này sẽ được lưu trên thiết bị và dùng để tính % hoàn thành mỗi ngày.
              </div>
              <div className="dialog-buttons">
                <button type="button" className="dialog-btn secondary"
                  onClick={() => { setShowTargetModal(false); setTargetInput(''); }}>
                  Hủy
                </button>
                <button type="submit" className="dialog-btn primary" style={{ background: 'linear-gradient(135deg, #5c6bc0, #7986cb)' }}>
                  Lưu mục tiêu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Chi Tiết Giao Dịch ──────────────────────────────── */}
      {selectedTx && (() => {
        const orderInfo = parseOrder(selectedTx.description);
        const isIncome = selectedTx.type === 'in';
        return (
          <div className="dialog-overlay" onClick={() => { setSelectedTx(null); setConfirmDelete(false); }}>
            <div
              className="dialog-box"
              style={{ maxWidth: '400px', textAlign: 'left', alignItems: 'stretch' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="card-title-row" style={{ marginBottom: '15px' }}>
                <span className="card-label" style={{ fontSize: '15px' }}>
                  <ShoppingBag size={18} style={{ color: isIncome ? 'var(--color-success)' : 'var(--color-danger)' }} />
                  Chi tiết giao dịch
                </span>
                <button onClick={() => { setSelectedTx(null); setConfirmDelete(false); }}
                  style={{ color: 'var(--color-text-secondary)' }}>
                  <X size={20} />
                </button>
              </div>

              {/* Amount Banner */}
              <div style={{
                textAlign: 'center', padding: '20px 0',
                borderBottom: '1px solid var(--color-border)', marginBottom: '15px'
              }}>
                <div style={{
                  fontSize: '26px', fontWeight: '700',
                  color: isIncome ? 'var(--color-success)' : 'var(--color-danger)'
                }}>
                  {isIncome ? '+' : '−'}{formatCurrency(selectedTx.amount)}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px', fontWeight: '500' }}>
                  {isIncome ? 'Doanh thu (Thu vào)' : 'Chi phí (Chi ra)'}
                </div>
              </div>

              {/* Meta */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', marginBottom: '15px',
                paddingBottom: '15px', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Thời gian:</span>
                  <span style={{ fontWeight: '600' }}>
                    {new Date(selectedTx.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · {selectedTx.dateString}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Mã giao dịch:</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>
                    TX{selectedTx.timestamp.toString().slice(-8)}
                  </span>
                </div>
                {orderInfo ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Phục vụ tại:</span>
                    <span style={{ fontWeight: '700', color: '#7986cb' }}>{orderInfo.table}</span>
                  </div>
                ) : (
                  selectedTx.category && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>Danh mục:</span>
                      <span style={{ fontWeight: '600', color: 'var(--color-warning)' }}>{selectedTx.category}</span>
                    </div>
                  )
                )}
              </div>

              {/* Items or Notes */}
              <div style={{ marginBottom: '20px' }}>
                {orderInfo ? (
                  <>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-text-secondary)',
                      marginBottom: '8px', letterSpacing: '0.06em' }}>DANH SÁCH MÓN ĂN MUA</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {orderInfo.items.map((item, idx) => (
                        <div key={idx} style={{
                          display: 'flex', justifyContent: 'space-between', padding: '8px 12px',
                          backgroundColor: 'var(--bg-input)', borderRadius: '8px',
                          border: '1px solid var(--color-border)'
                        }}>
                          <span style={{ fontWeight: '600' }}>{item.name}</span>
                          <span style={{ color: 'var(--color-success)', fontWeight: '700' }}>x{item.qty || 1}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-text-secondary)',
                      marginBottom: '6px', letterSpacing: '0.06em' }}>NỘI DUNG CHI TIẾT</div>
                    <div style={{
                      padding: '12px 14px', backgroundColor: 'var(--bg-input)',
                      borderRadius: '10px', border: '1px solid var(--color-border)',
                      fontSize: '13px', lineHeight: '1.5'
                    }}>
                      {selectedTx.description}
                    </div>
                  </>
                )}
              </div>

              {/* Confirm Delete Banner */}
              {confirmDelete && (
                <div 
                  className={isShaking ? 'shake-effect' : ''}
                  style={{
                    padding: '12px 14px', backgroundColor: 'rgba(239,83,80,0.1)',
                    borderRadius: '10px', border: '1px solid rgba(239,83,80,0.3)',
                    marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'flex-start'
                  }}
                >
                  <AlertTriangle size={16} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '1px' }} />
                  <div style={{ fontSize: '13px', color: 'var(--color-danger)', lineHeight: '1.4' }}>
                    <strong>Xác nhận xóa?</strong><br />
                    Thao tác này không thể hoàn tác. Giao dịch sẽ bị xóa vĩnh viễn.
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {!confirmDelete ? (
                <div className="dialog-buttons">
                  <button
                    className="dialog-btn secondary"
                    style={{ color: 'var(--color-danger)', borderColor: 'rgba(239,83,80,0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={triggerDeleteConfirm}
                  >
                    <Trash2 size={15} /> Xóa giao dịch
                  </button>
                  <button className="dialog-btn primary" onClick={() => { setSelectedTx(null); setConfirmDelete(false); }}
                    style={{ flex: 1 }}>
                    Đóng
                  </button>
                </div>
              ) : (
                <div className="dialog-buttons">
                  <button className="dialog-btn secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                    Hủy
                  </button>
                  <button
                    className="dialog-btn primary"
                    style={{ backgroundColor: 'var(--color-danger)', flex: 1 }}
                    onClick={handleDeleteTx}
                    disabled={deleting}
                  >
                    {deleting ? 'Đang xóa...' : '✓ Xóa ngay'}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

    </div>
  );
}
