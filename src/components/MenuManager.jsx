import React, { useState } from 'react';
import { Search, Plus, Edit2, Trash2, X, Utensils, Tag, DollarSign, Check } from 'lucide-react';
import { saveMenuItem, deleteMenuItem } from '../firebase';

export default function MenuManager({ menuItems, onNotify }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null); // null means adding new
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Món chính');

  // Deletion custom confirm states
  const [deletingId, setDeletingId] = useState(null);
  const [deletingName, setDeletingName] = useState('');
  const [isShaking, setIsShaking] = useState(false);

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

  // Tự động lấy tất cả các danh mục từ database để làm bộ lọc Tabs
  const categories = ['Tất cả', ...sortedCategories];
  
  // Các danh mục có sẵn khi thêm/sửa món ăn
  const formCategories = Array.from(new Set([
    'Lòng chần', 'Ăn nhanh', 'Khai vị', 'Rau xào', 'Món chiên xào', 
    'Đặc sản', 'Lẩu', 'Combo', 'Nước ngọt', 'Rượu bia', 'Bia & Đồ uống', 'Phụ',
    ...sortedCategories
  ]));

  // Định dạng tiền
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val).replace('₫', 'đ');
  };

  // Lọc món ăn & Sắp xếp theo bảng chữ cái A-Z
  const filteredItems = menuItems
    .filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'Tất cả' || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  // Mở modal thêm món
  const handleOpenAdd = () => {
    setEditingId(null);
    setName('');
    setPrice('');
    setCategory('Món chính');
    setShowModal(true);
  };

  // Mở modal sửa món
  const handleOpenEdit = (item) => {
    setEditingId(item.id);
    setName(item.name);
    setPrice(new Intl.NumberFormat('vi-VN').format(item.price));
    setCategory(item.category || 'Món chính');
    setShowModal(true);
  };

  // Lưu món (Thêm mới hoặc Cập nhật)
  const handleSave = async (e) => {
    e.preventDefault();
    if (!name || !price) return;

    const itemData = {
      id: editingId,
      name,
      price: Number(price.replace(/\D/g, '')),
      category
    };

    try {
      await saveMenuItem(itemData);
      if (onNotify) {
        const priceFormatted = formatCurrency(itemData.price);
        if (editingId) {
          onNotify(`Đã cập nhật món ăn: ${name} - Giá mới: ${priceFormatted}`, 'menu_edit');
        } else {
          onNotify(`Đã thêm món mới: ${name} (${priceFormatted})`, 'menu_add');
        }
      }
      setShowModal(false);
    } catch (err) {
      alert('Không thể lưu món ăn: ' + err.message);
    }
  };



  return (
    <div style={{ display: 'flex', flex: '1', flexDirection: 'column', gap: '15px' }}>
      
      {/* Nút thêm mới nổi trên Header */}
      <div style={{ display: 'none' }}>
        {/* Helper to communicate with layout that we have an add button */}
        <button id="add-menu-item-btn-hidden" onClick={handleOpenAdd}></button>
      </div>

      {/* Ô tìm kiếm */}
      <div className="search-wrapper">
        <Search className="search-icon" size={18} />
        <input 
          type="text" 
          className="search-input" 
          placeholder="Tìm kiếm món ăn..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Tabs danh mục */}
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

      {/* Danh sách món ăn quản lý */}
      <div className="menu-list">
        {filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: '40px', fontSize: '13px' }}>
            Không tìm thấy món ăn nào. Nhấn biểu tượng "+" góc trên để thêm món.
          </div>
        ) : (
          filteredItems.map(item => (
            <div key={item.id} className="menu-item-row">
              <div className="menu-item-info">
                <div className="menu-item-icon-circle">
                  <Utensils size={18} />
                </div>
                <div className="menu-item-details">
                  <span className="menu-item-name">{item.name}</span>
                  <span className="menu-item-cat">{item.category}</span>
                </div>
              </div>
              
              <div className="menu-item-price-actions">
                <span className="menu-item-price">{formatCurrency(item.price)}</span>
                
                <button 
                  className="menu-action-btn edit" 
                  onClick={() => handleOpenEdit(item)}
                >
                  <Edit2 size={16} />
                </button>
                
                 <button 
                  className="menu-action-btn delete" 
                  onClick={() => {
                    if (navigator.vibrate) navigator.vibrate(100);
                    setDeletingId(item.id);
                    setDeletingName(item.name);
                    setIsShaking(true);
                    setTimeout(() => setIsShaking(false), 350);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Thêm / Sửa Món ăn */}
      {showModal && (
        <div className="dialog-overlay">
          <div className="dialog-box" style={{ maxWidth: '400px' }}>
            <div className="card-title-row" style={{ width: '100%', marginBottom: '20px' }}>
              <span className="card-label" style={{ fontSize: '15px' }}>
                <Utensils size={18} />
                {editingId ? 'Chỉnh sửa món ăn' : 'Thêm món ăn mới'}
              </span>
              <button onClick={() => setShowModal(false)} style={{ color: 'var(--color-text-secondary)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="modal-form">
              <div className="form-group">
                <label>Tên món ăn</label>
                <input 
                  type="text" 
                  placeholder="Ví dụ: Dồi sụn nướng, Lòng xe điếu..." 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Giá bán (đ)</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    placeholder="Ví dụ: 80.000" 
                    value={price}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      setPrice(raw ? new Intl.NumberFormat('vi-VN').format(Number(raw)) : '');
                    }}
                    required
                    style={{ width: '100%', paddingRight: '45px' }}
                  />
                  <span style={{ position: 'absolute', right: '14px', color: 'var(--color-text-secondary)', fontSize: '13px', fontWeight: '600' }}>đồng</span>
                </div>
              </div>

              <div className="form-group">
                <label>Danh mục</label>
                <select 
                  value={category} 
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {formCategories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="dialog-buttons" style={{ marginTop: '15px' }}>
                <button type="button" className="dialog-btn secondary" onClick={() => setShowModal(false)}>
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

      {/* Modal xác nhận xóa món ăn */}
      {deletingId && (
        <div className="dialog-overlay" onClick={() => setDeletingId(null)}>
          <div 
            className={`dialog-box ${isShaking ? 'shake-effect' : ''}`}
            style={{ maxWidth: '380px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-icon-wrapper" style={{ backgroundColor: 'rgba(239, 83, 80, 0.15)', color: '#ef5350' }}>
              <Trash2 size={28} />
            </div>
            <h3 className="dialog-title">Xóa món ăn?</h3>
            <p className="dialog-desc" style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
              Bạn có chắc chắn muốn xóa món <strong style={{ color: 'white' }}>{deletingName}</strong> khỏi thực đơn không?<br/>
              Hành động này sẽ xóa vĩnh viễn món ăn này.
            </p>
            <div className="dialog-buttons">
              <button 
                className="dialog-btn secondary" 
                onClick={() => setDeletingId(null)}
              >
                Hủy bỏ
              </button>
              <button 
                className="dialog-btn primary" 
                style={{ backgroundColor: '#ef5350' }}
                onClick={async () => {
                  if (navigator.vibrate) navigator.vibrate(80);
                  try {
                    await deleteMenuItem(deletingId);
                    if (onNotify) {
                      onNotify(`Đã xóa món ăn khỏi thực đơn: ${deletingName}`, 'menu_delete');
                    }
                    setDeletingId(null);
                  } catch (err) {
                    alert('Không thể xóa món ăn: ' + err.message);
                  }
                }}
              >
                ✓ Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
