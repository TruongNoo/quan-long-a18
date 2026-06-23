import React, { useState, useEffect } from 'react';
import { LayoutDashboard, ShoppingCart, Utensils, BarChart2, User, Bell, LogOut, Plus, ChevronRight, Check, KeyRound, Settings, Star, Shield, HelpCircle, FileText, Trash2, AlertTriangle, ChevronLeft, ChevronDown, ChevronUp, Send, X, CheckCircle, Sparkles, Download, Printer } from 'lucide-react';
import { subscribeMenu, subscribeTransactions, logout, isFirebaseConfigured, subscribeAuth, sendPasswordReset, getLatestVersionConfig } from './firebase';

// Import các cầu nối Bluetooth máy in
import BluetoothPrinter from './utils/bluetoothPrinterPlugin';
import { printBluetoothReceipt } from './utils/bluetoothPrinter';

// Import các component con
import Login from './components/Login';
import Overview from './components/Overview';
import Order from './components/Order';
import MenuManager from './components/MenuManager';
import Reports from './components/Reports';

const CURRENT_VERSION = '1.0.2';

// Hàm so sánh phiên bản Semantic Versioning (X.Y.Z)
const isNewerVersion = (latest, current) => {
  if (!latest || !current) return false;
  const latestParts = latest.split('.').map(Number);
  const currentParts = current.split('.').map(Number);
  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const latestPart = latestParts[i] || 0;
    const currentPart = currentParts[i] || 0;
    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }
  return false;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ===== STATE VÀ LOGIC MÁY IN BLUETOOTH =====
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [printerType, setPrinterType] = useState(() => localStorage.getItem('printer_connection_type') || 'system');
  const [selectedPrinter, setSelectedPrinter] = useState(() => localStorage.getItem('selected_printer_address') || '');
  const [pairedDevices, setPairedDevices] = useState([]);
  const [isBtEnabled, setIsBtEnabled] = useState(false);
  const [printerState, setPrinterState] = useState('disconnected'); // 'disconnected' | 'connecting' | 'connected'
  const [printerError, setPrinterError] = useState('');

  // Cập nhật localStorage khi có thay đổi cấu hình
  useEffect(() => {
    localStorage.setItem('printer_connection_type', printerType);
  }, [printerType]);

  useEffect(() => {
    localStorage.setItem('selected_printer_address', selectedPrinter);
  }, [selectedPrinter]);

  const checkBluetoothStatus = async () => {
    try {
      setPrinterError('');
      // 1. Kiểm tra quyền kết nối
      const perm = await BluetoothPrinter.checkBluetoothPermissions();
      if (!perm.granted) {
        const req = await BluetoothPrinter.requestBluetoothPermissions();
        if (!req.granted) {
          setPrinterError('Ứng dụng cần quyền Bluetooth để kết nối với máy in.');
          return;
        }
      }

      // 2. Kiểm tra trạng thái Bluetooth
      const enabledRes = await BluetoothPrinter.isBluetoothEnabled();
      setIsBtEnabled(enabledRes.enabled);
      
      if (enabledRes.enabled) {
        // Lấy danh sách thiết bị ghép đôi
        const devList = await BluetoothPrinter.listDevices();
        setPairedDevices(devList.devices || []);
        
        // Kiểm tra xem hiện tại socket có đang kết nối không
        const connStatus = await BluetoothPrinter.isConnected();
        if (connStatus.connected) {
          setPrinterState('connected');
          setSelectedPrinter(connStatus.address);
        } else {
          setPrinterState('disconnected');
        }
      } else {
        setPairedDevices([]);
        setPrinterState('disconnected');
      }
    } catch (err) {
      console.error(err);
      setPrinterError(err.message || 'Lỗi kiểm tra trạng thái Bluetooth.');
    }
  };

  const handleEnableBluetooth = async () => {
    try {
      setPrinterError('');
      const res = await BluetoothPrinter.enableBluetooth();
      if (res.enabled) {
        setIsBtEnabled(true);
        setTimeout(checkBluetoothStatus, 1200);
      }
    } catch (err) {
      setPrinterError(err.message || 'Không thể bật Bluetooth.');
    }
  };

  const handleConnectPrinter = async (address) => {
    try {
      setPrinterError('');
      setPrinterState('connecting');
      setSelectedPrinter(address);
      
      const res = await BluetoothPrinter.connect({ address });
      if (res.success) {
        setPrinterState('connected');
        addNotification(`Đã kết nối máy in Bluetooth thành công!`, 'info');
      } else {
        setPrinterState('disconnected');
        setPrinterError('Không thể kết nối với máy in.');
      }
    } catch (err) {
      setPrinterState('disconnected');
      setPrinterError(err.message || 'Lỗi khi kết nối với máy in.');
    }
  };

  const handleDisconnectPrinter = async () => {
    try {
      await BluetoothPrinter.disconnect();
      setPrinterState('disconnected');
      addNotification(`Đã ngắt kết nối máy in Bluetooth.`, 'info');
    } catch (err) {
      console.error(err);
    }
  };

  const handlePrintTest = async () => {
    try {
      setPrinterError('');
      const testItems = [
        { item: { name: 'Mon in thu (Test)' }, qty: 1, total: 10000 }
      ];
      await printBluetoothReceipt(testItems, 'BAN TEST', 10000);
      addNotification('Đã in thử biên lai!', 'info');
    } catch (err) {
      setPrinterError(err.message || 'Lỗi in thử.');
    }
  };

  // Tự động kiểm tra trạng thái khi mở modal cài đặt
  useEffect(() => {
    if (showPrinterModal && printerType === 'bluetooth') {
      checkBluetoothStatus();
    }
  }, [showPrinterModal, printerType]);

  // State cho thông báo cập nhật
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateInfo, setUpdateInfo] = useState({ latestVersion: '', downloadUrl: '', releaseNotes: '' });
  const [currentAppVersion, setCurrentAppVersion] = useState(() => {
    const savedInstalledVersion = localStorage.getItem('a18_installed_version') || CURRENT_VERSION;
    return isNewerVersion(savedInstalledVersion, CURRENT_VERSION)
      ? savedInstalledVersion
      : CURRENT_VERSION;
  });
  const [activeTab, setActiveTab] = useState('overview');
  const [menuItems, setMenuItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  
  // State cho modal đổi mật khẩu
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdEmail, setPwdEmail] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdStatus, setPwdStatus] = useState(null); // null | 'success' | 'error'
  const [pwdMsg, setPwdMsg] = useState('');
  
  // State cho màn hình Trợ giúp
  const [showHelp, setShowHelp] = useState(false);
  const [activeHelpId, setActiveHelpId] = useState(null);

  // State cho thông báo hoạt động
  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem('a18_notifications');
    return saved ? JSON.parse(saved) : [];
  });
  const [unreadCount, setUnreadCount] = useState(() => {
    const saved = localStorage.getItem('a18_unread_count');
    return saved ? Number(saved) : 0;
  });
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  useEffect(() => {
    localStorage.setItem('a18_notifications', JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem('a18_unread_count', String(unreadCount));
  }, [unreadCount]);

  const addNotification = (msg, type = 'info') => {
    const newNotif = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      msg,
      type,
      timestamp: Date.now()
    };
    setNotifications(prev => [newNotif, ...prev].slice(0, 30));
    setUnreadCount(prev => prev + 1);
  };

  const formatRelativeTime = (timestamp) => {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    
    const date = new Date(timestamp);
    return date.toLocaleDateString('vi-VN') + ' ' + date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  // Kiểm tra cập nhật phiên bản mới từ Firestore
  useEffect(() => {
    const isDismissed = sessionStorage.getItem('a18_update_dismissed') === 'true';
    if (isDismissed) return;

    const checkUpdate = async () => {
      try {
        const config = await getLatestVersionConfig();
        if (config && config.latest_version) {
          // Lấy phiên bản đã cài (được lưu khi người dùng bấm "Cập nhật ngay")
          // Dùng phiên bản cao hơn giữa code hiện tại và phiên bản đã lưu
          const savedInstalledVersion = localStorage.getItem('a18_installed_version') || CURRENT_VERSION;
          const effectiveVersion = isNewerVersion(savedInstalledVersion, CURRENT_VERSION)
            ? savedInstalledVersion
            : CURRENT_VERSION;

          if (isNewerVersion(config.latest_version, effectiveVersion)) {
            setUpdateInfo({
              latestVersion: config.latest_version,
              currentVersion: effectiveVersion,   // phiên bản thực tế đang chạy
              downloadUrl: config.download_url || '',
              releaseNotes: config.release_notes || 'Cập nhật phiên bản mới để nâng cao trải nghiệm.'
            });
            setShowUpdateModal(true);
          }
        }
      } catch (err) {
        console.error("Lỗi kiểm tra cập nhật:", err);
      }
    };

    // Đợi 2 giây để tránh làm chậm tiến trình khởi chạy ứng dụng
    const timer = setTimeout(checkUpdate, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Lắng nghe trạng thái đăng nhập (Firebase Auth hoặc localStorage offline)
  useEffect(() => {
    const unsubscribe = subscribeAuth((firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Lắng nghe thực đơn & giao dịch khi đã đăng nhập
  useEffect(() => {
    if (!user) return;

    // Lắng nghe thực đơn (Real-time từ Firestore hoặc LocalStorage)
    const unsubscribeMenu = subscribeMenu((items) => {
      setMenuItems(items);
    });

    // Lắng nghe các giao dịch (Real-time từ Firestore hoặc LocalStorage)
    const unsubscribeTransactions = subscribeTransactions((txs) => {
      setTransactions(txs);
    });

    return () => {
      unsubscribeMenu();
      unsubscribeTransactions();
    };
  }, [user]);

  // Tự động cuộn lên đầu trang khi chuyển Tab và reset cuộn window
  useEffect(() => {
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    const contentEl = document.querySelector('.app-content');
    if (contentEl) {
      contentEl.scrollTop = 0;
    }
  }, [activeTab]);

  // Reset cuộn window khi có thay đổi trạng thái đăng nhập hoặc bàn phím đóng
  useEffect(() => {
    const resetScroll = () => {
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
    };

    resetScroll();

    // Reset khi bàn phím đóng (mất focus ô nhập liệu)
    document.addEventListener('focusout', resetScroll);
    
    // Đăng ký cả sự kiện resize của window (bàn phím xuất hiện/ẩn làm thay đổi chiều cao)
    window.addEventListener('resize', resetScroll);

    return () => {
      document.removeEventListener('focusout', resetScroll);
      window.removeEventListener('resize', resetScroll);
    };
  }, [user]);

  // Đăng xuất
  const handleLogout = async () => {
    if (window.confirm('Bạn có chắc chắn muốn đăng xuất không?')) {
      await logout();
      setUser(null);
      setActiveTab('overview');
    }
  };

  // Xử lý gửi email đổi mật khẩu
  const handleSendPasswordReset = async () => {
    if (!pwdEmail.trim()) {
      setPwdStatus('error');
      setPwdMsg('Vui lòng nhập địa chỉ email.');
      return;
    }
    setPwdLoading(true);
    setPwdStatus(null);
    try {
      await sendPasswordReset(pwdEmail.trim());
      setPwdStatus('success');
      setPwdMsg(`Email đặt lại mật khẩu đã được gửi đến ${pwdEmail.trim()}. Vui lòng kiểm tra hộp thư (kể cả Spam).`);
    } catch (err) {
      setPwdStatus('error');
      const code = err?.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        setPwdMsg('Không tìm thấy tài khoản với email này. Kiểm tra lại email.');
      } else if (code === 'auth/network-request-failed') {
        setPwdMsg('Không có kết nối mạng. Vui lòng thử lại.');
      } else {
        setPwdMsg(err?.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
      }
    } finally {
      setPwdLoading(false);
    }
  };

  // Toggle FAQ accordion
  const toggleHelp = (key) => setActiveHelpId(prev => prev === key ? null : key);

  // Màn hình loading khi đang kiểm tra auth
  if (authLoading) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <div style={{ width: '48px', height: '48px', border: '3px solid rgba(92,107,192,0.3)', borderTopColor: '#5c6bc0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>Đang kết nối...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-container">
        <Login onLoginSuccess={(u) => setUser(u)} />
      </div>
    );
  }

  // Tiêu đề của từng Tab
  const getHeaderTitle = () => {
    if (showHelp) return 'TRỢ GIÚP & HƯỚNG DẪN';
    switch (activeTab) {
      case 'overview': return 'LÒNG NGON A18';
      case 'order': return 'GỌI MÓN';
      case 'menu': return 'QUẢN LÝ THỰC ĐƠN';
      case 'reports': return 'BÁO CÁO THU CHI';
      case 'account': return 'TÀI KHOẢN';
      default: return 'LÒNG NGON A18';
    }
  };

  // Nút bấm trên Header bên trái (nút back cho Trợ giúp)
  const renderHeaderLeft = () => {
    if (showHelp) {
      return (
        <button className="header-icon" onClick={() => setShowHelp(false)}>
          <ChevronLeft size={20} />
        </button>
      );
    }
    return <div style={{ width: '40px' }} />;
  };

  // Nút bấm trên Header bên phải
  const renderHeaderRight = () => {
    if (activeTab === 'menu') {
      return (
        <button 
          className="header-icon" 
          style={{ backgroundColor: 'rgba(0, 191, 165, 0.15)', color: '#00bfa5' }}
          onClick={() => {
            const btn = document.getElementById('add-menu-item-btn-hidden');
            if (btn) btn.click();
          }}
        >
          <Plus size={20} />
        </button>
      );
    }
    return (
      <button 
        className="header-icon" 
        style={{ position: 'relative' }} 
        onClick={() => {
          setShowNotifPanel(true);
          setUnreadCount(0);
        }}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-2px',
            right: '-2px',
            backgroundColor: '#ef5350',
            color: 'white',
            borderRadius: '50%',
            width: '16px',
            height: '16px',
            fontSize: '9px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid var(--bg-primary)',
            boxShadow: '0 0 4px rgba(239, 83, 80, 0.6)'
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="app-header">
        {renderHeaderLeft()}
        <h2 className="app-header-title">{getHeaderTitle()}</h2>
        {renderHeaderRight()}
      </header>

      {/* Main Content Area */}
      <main className="app-content">
        {activeTab === 'overview' && (
          <Overview 
            transactions={transactions} 
            menuItems={menuItems}
            onTabChange={(tab) => setActiveTab(tab)} 
            onNotify={addNotification}
          />
        )}
        {activeTab === 'order' && (
          <Order menuItems={menuItems} onNotify={addNotification} />
        )}
        {activeTab === 'menu' && (
          <MenuManager menuItems={menuItems} onNotify={addNotification} />
        )}
        {activeTab === 'reports' && (
          <Reports transactions={transactions} />
        )}
        
        {/* Tab Tài Khoản trực tiếp */}
        {activeTab === 'account' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '30px' }}>
            
            {/* Thẻ Profile Cao Cấp */}
            <div className="account-card" style={{ position: 'relative', overflow: 'hidden' }}>
              {/* Background decoration */}
              <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,191,165,0.15) 0%, transparent 70%)' }}></div>
              <div style={{ position: 'absolute', bottom: '-20px', left: '-20px', width: '80px', height: '80px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(92,107,192,0.15) 0%, transparent 70%)' }}></div>
              
              <div className="account-avatar-gradient">P</div>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'white', marginBottom: '4px' }}>Phạm Thị Hạnh</h3>
                <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', letterSpacing: '0.02em' }}>appquanlonga18@gmail.com</p>
              </div>
              <div className="badge-verified-green">
                <Check size={13} style={{ color: '#00bfa5' }} />
                Đã xác thực
              </div>
              
              {/* Thống kê nhanh */}
              <div style={{ display: 'flex', gap: '0', width: '100%', marginTop: '4px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                <div style={{ flex: 1, textAlign: 'center', padding: '10px 8px', borderRight: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#00bfa5' }}>{transactions.length}</div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>Giao dịch</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: '10px 8px', borderRight: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#5c6bc0' }}>{menuItems.length}</div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>Món ăn</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: '10px 8px' }}>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#ffa726' }}>A18</div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>Quán</div>
                </div>
              </div>
            </div>

            {/* Menu tài khoản */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              
              {/* Nhóm 1: Cài đặt */}
              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-text-secondary)', letterSpacing: '0.08em', paddingLeft: '4px', marginBottom: '2px' }}>CÀI ĐẶT TÀI KHOẢN</div>
              
              <div className="account-menu-item" style={{ cursor: 'pointer' }}>
                <div className="account-menu-left">
                  <div className="account-icon-wrapper" style={{ backgroundColor: 'rgba(92, 107, 192, 0.15)' }}>
                    <Settings size={18} style={{ color: '#5c6bc0' }} />
                  </div>
                  <div className="account-menu-details">
                    <span className="account-menu-title">Thông tin tài khoản</span>
                    <span className="account-menu-subtitle">appquanlonga18@gmail.com</span>
                  </div>
                </div>
                <ChevronRight size={18} style={{ color: '#555761' }} />
              </div>

              <div className="account-menu-item" onClick={() => setShowPrinterModal(true)} style={{ cursor: 'pointer' }}>
                <div className="account-menu-left">
                  <div className="account-icon-wrapper" style={{ backgroundColor: 'rgba(0, 191, 165, 0.15)' }}>
                    <Printer size={18} style={{ color: '#00bfa5' }} />
                  </div>
                  <div className="account-menu-details">
                    <span className="account-menu-title">Cấu hình máy in</span>
                    <span className="account-menu-subtitle">Kết nối Bluetooth hoặc Dây / Hệ thống</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '20px', backgroundColor: 'rgba(92,107,192,0.12)', color: '#5c6bc0', fontWeight: '600' }}>
                    {printerType === 'bluetooth' ? 'BLUETOOTH' : 'HỆ THỐNG'}
                  </span>
                  <ChevronRight size={18} style={{ color: '#555761' }} />
                </div>
              </div>

              <div className="account-menu-item" onClick={() => {
                setPwdEmail(user?.email || 'appquanlonga18@gmail.com');
                setPwdStatus(null);
                setPwdMsg('');
                setShowPwdModal(true);
              }} style={{ cursor: 'pointer' }}>
                <div className="account-menu-left">
                  <div className="account-icon-wrapper" style={{ backgroundColor: 'rgba(255, 167, 38, 0.15)' }}>
                    <KeyRound size={18} style={{ color: '#ffa726' }} />
                  </div>
                  <div className="account-menu-details">
                    <span className="account-menu-title">Đổi mật khẩu</span>
                    <span className="account-menu-subtitle">Gửi email đặt lại mật khẩu</span>
                  </div>
                </div>
                <ChevronRight size={18} style={{ color: '#555761' }} />
              </div>

              {/* Nhóm 2: Dữ liệu & Báo cáo */}
              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-text-secondary)', letterSpacing: '0.08em', paddingLeft: '4px', marginTop: '8px', marginBottom: '2px' }}>DỮ LIỆU & BÁO CÁO</div>

              <div className="account-menu-item" onClick={() => setActiveTab('reports')} style={{ cursor: 'pointer' }}>
                <div className="account-menu-left">
                  <div className="account-icon-wrapper" style={{ backgroundColor: 'rgba(0, 191, 165, 0.15)' }}>
                    <FileText size={18} style={{ color: '#00bfa5' }} />
                  </div>
                  <div className="account-menu-details">
                    <span className="account-menu-title">Xuất báo cáo PDF</span>
                    <span className="account-menu-subtitle">Sao kê thu chi theo tháng</span>
                  </div>
                </div>
                <ChevronRight size={18} style={{ color: '#555761' }} />
              </div>

              <div className="account-menu-item" style={{ cursor: 'pointer' }}>
                <div className="account-menu-left">
                  <div className="account-icon-wrapper" style={{ backgroundColor: 'rgba(239, 83, 80, 0.15)' }}>
                    <Shield size={18} style={{ color: '#ef5350' }} />
                  </div>
                  <div className="account-menu-details">
                    <span className="account-menu-title">Sao lưu dữ liệu</span>
                    <span className="account-menu-subtitle">Firebase tự động lưu trữ</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '20px', backgroundColor: 'rgba(0,191,165,0.15)', color: '#00bfa5', fontWeight: '600' }}>TỰ ĐỘNG</span>
                  <ChevronRight size={18} style={{ color: '#555761' }} />
                </div>
              </div>

              {/* Nhóm 3: Hỗ trợ */}
              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-text-secondary)', letterSpacing: '0.08em', paddingLeft: '4px', marginTop: '8px', marginBottom: '2px' }}>HỖ TRỢ</div>

              <div className="account-menu-item" onClick={() => setShowHelp(true)} style={{ cursor: 'pointer' }}>
                <div className="account-menu-left">
                  <div className="account-icon-wrapper" style={{ backgroundColor: 'rgba(92, 107, 192, 0.15)' }}>
                    <HelpCircle size={18} style={{ color: '#5c6bc0' }} />
                  </div>
                  <div className="account-menu-details">
                    <span className="account-menu-title">Trợ giúp &amp; Hướng dẫn</span>
                    <span className="account-menu-subtitle">Hướng dẫn sử dụng ứng dụng</span>
                  </div>
                </div>
                <ChevronRight size={18} style={{ color: '#555761' }} />
              </div>

              <div className="account-menu-item" style={{ cursor: 'pointer' }}>
                <div className="account-menu-left">
                  <div className="account-icon-wrapper" style={{ backgroundColor: 'rgba(255, 167, 38, 0.15)' }}>
                    <Star size={18} style={{ color: '#ffa726' }} />
                  </div>
                  <div className="account-menu-details">
                    <span className="account-menu-title">Đánh giá ứng dụng</span>
                    <span className="account-menu-subtitle">Chia sẻ cảm nhận của bạn</span>
                  </div>
                </div>
                <ChevronRight size={18} style={{ color: '#555761' }} />
              </div>
            </div>

            {/* Nút đăng xuất */}
            <button 
              className="btn-logout-outline" 
              onClick={handleLogout}
              style={{ marginTop: '4px' }}
            >
              <LogOut size={16} />
              Đăng xuất khỏi tài khoản
            </button>

            {/* Thông tin chân trang */}
            <div className="account-footer">
              <div>Lòng Ngon A18 v{currentAppVersion}</div>
              <div>Developed with Nguyễn Xuân Trường</div>
              <div style={{ marginTop: '4px' }}>© Quán Lòng Ngon A18</div>
            </div>

          </div>
        )}
      </main>

      {/* ===== MODAL ĐỔI MẬT KHẨU ===== */}
      {showPwdModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowPwdModal(false); }}>
          <div className="modal-box">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '14px', backgroundColor: 'rgba(255,167,38,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <KeyRound size={20} style={{ color: '#ffa726' }} />
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: 'white' }}>Đổi mật khẩu</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Gửi link đặt lại về Gmail</div>
                </div>
              </div>
              <button onClick={() => setShowPwdModal(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '4px' }}>
                <X size={20} />
              </button>
            </div>

            {pwdStatus === 'success' ? (
              /* Trạng thái thành công */
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(0,191,165,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <CheckCircle size={32} style={{ color: '#00bfa5' }} />
                </div>
                <div style={{ fontSize: '15px', fontWeight: '600', color: 'white', marginBottom: '8px' }}>Email đã được gửi!</div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.5', marginBottom: '20px' }}>{pwdMsg}</div>
                <div style={{ backgroundColor: 'rgba(255,167,38,0.08)', border: '1px solid rgba(255,167,38,0.2)', borderRadius: '12px', padding: '12px', fontSize: '12px', color: '#ffa726', lineHeight: '1.5', marginBottom: '20px', textAlign: 'left' }}>
                  💡 <strong>Lưu ý:</strong> Kiểm tra cả thư mục <strong>Spam/Junk</strong>. Link có hiệu lực trong <strong>1 giờ</strong>.
                </div>
                <button className="btn-primary" onClick={() => setShowPwdModal(false)}>Xong</button>
              </div>
            ) : (
              /* Form nhập email */
              <div>
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
                  Nhập địa chỉ Gmail đăng ký tài khoản. Chúng tôi sẽ gửi link đặt lại mật khẩu đến email của bạn.
                </p>
                <div className="input-icon-wrapper" style={{ marginBottom: '12px' }}>
                  <Send size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', zIndex: 1 }} />
                  <input
                    type="email"
                    className="input-field"
                    style={{ paddingLeft: '42px' }}
                    placeholder="appquanlonga18@gmail.com"
                    value={pwdEmail}
                    onChange={(e) => setPwdEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendPasswordReset()}
                  />
                </div>
                {pwdStatus === 'error' && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', backgroundColor: 'rgba(239,83,80,0.1)', border: '1px solid rgba(239,83,80,0.25)', borderRadius: '10px', padding: '10px 12px', marginBottom: '12px' }}>
                    <AlertTriangle size={14} style={{ color: '#ef5350', flexShrink: 0, marginTop: '1px' }} />
                    <span style={{ fontSize: '12px', color: '#ef5350', lineHeight: '1.4' }}>{pwdMsg}</span>
                  </div>
                )}
                <button
                  className="btn-primary"
                  onClick={handleSendPasswordReset}
                  disabled={pwdLoading}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  {pwdLoading ? (
                    <><div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Đang gửi...</>
                  ) : (
                    <><Send size={16} />Gửi email đặt lại mật khẩu</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== MÀN HÌNH TRỢ GIÚP ===== */}
      {showHelp && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--bg-primary)', zIndex: 150, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRadius: 'inherit' }}>
          {/* Header Trợ giúp */}
          <header className="app-header">
            <button className="header-icon" onClick={() => setShowHelp(false)}>
              <ChevronLeft size={20} />
            </button>
            <h2 className="app-header-title">TRỢ GIÚP &amp; HƯỚNG DẪN</h2>
            <div style={{ width: '40px' }} />
          </header>

          {/* Nội dung Trợ giúp */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 30px' }}>

            {/* Banner giới thiệu */}
            <div style={{ background: 'linear-gradient(135deg, rgba(92,107,192,0.2) 0%, rgba(0,191,165,0.15) 100%)', border: '1px solid rgba(92,107,192,0.3)', borderRadius: '20px', padding: '20px', marginBottom: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>🍖</div>
              <div style={{ fontSize: '17px', fontWeight: '700', color: 'white', marginBottom: '4px' }}>Lòng Ngon A18</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Ứng dụng quản lý quán ăn thông minh</div>
              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                <span>📍 321 Quan Nhân</span>
                <span>📞 Hỗ trợ 24/7</span>
                <span>⭐ v1.0.0</span>
              </div>
            </div>

            {/* Bắt đầu nhanh */}
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-text-secondary)', letterSpacing: '0.08em', marginBottom: '10px' }}>BẮT ĐẦU NHANH</div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
              {[
                { icon: '📊', title: 'Tổng quan', desc: 'Xem doanh thu & giao dịch hôm nay' },
                { icon: '🛒', title: 'Gọi món', desc: 'Tạo đơn hàng cho từng bàn' },
                { icon: '📋', title: 'Thực đơn', desc: 'Quản lý danh sách món ăn' },
                { icon: '📈', title: 'Báo cáo', desc: 'Xem thống kê & xuất PDF' },
              ].map((item) => (
                <div key={item.title} style={{ minWidth: '130px', background: 'var(--bg-card)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '14px 12px', textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: '24px', marginBottom: '6px' }}>{item.icon}</div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: 'white', marginBottom: '4px' }}>{item.title}</div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', lineHeight: '1.3' }}>{item.desc}</div>
                </div>
              ))}
            </div>

            {/* FAQ */}
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-text-secondary)', letterSpacing: '0.08em', marginBottom: '10px' }}>CÂU HỎI THƯỜNG GẶP</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {[
                {
                  id: 'q1', emoji: '🛒',
                  q: 'Làm thế nào để gọi món cho bàn?',
                  a: '1. Vào tab Gọi món ở thanh điều hướng dưới cùng.\n2. Chọn số bàn (Bàn 1–8) hoặc Mang về.\n3. Bấm vào tên món để thêm vào đơn.\n4. Điều chỉnh số lượng bằng nút + / −.\n5. Bấm nút Thanh toán màu xanh để tính tiền và tạo hóa đơn.',
                },
                {
                  id: 'q2', emoji: '💰',
                  q: 'Cách ghi chi tiêu thủ công?',
                  a: 'Doanh thu được tự động ghi nhận khi bạn thanh toán đơn hàng qua tab Gọi món.\n\nĐể ghi chi tiêu thủ công (ví dụ: mua nguyên liệu, tiền điện, nước)::\n1. Vào tab Tổng quan.\n2. Bấm nút "+ Chi" (đỏ) ở góc trên.\n3. Nhập số tiền và mô tả nội dung chi tiêu.\n4. Bấm "Lưu" để ghi lại.',
                },
                {
                  id: 'q3', emoji: '🗑️',
                  q: 'Cách xóa giao dịch hoặc món ăn?',
                  a: 'Bấm vào biểu tượng Thùng rác bên cạnh mục cần xóa. Hệ thống sẽ hiện thông báo xác nhận để tránh xóa nhầm. Xác nhận "Xóa" để hoàn tất.',
                },
                {
                  id: 'q4', emoji: '📄',
                  q: 'Xuất báo cáo PDF như thế nào?',
                  a: '1. Vào tab Báo cáo.\n2. Chọn tháng cần xuất ở phần bộ lọc.\n3. Bấm nút "Xuất PDF".\n4. File PDF sẽ được tải xuống thiết bị gồm: tổng thu, tổng chi, lợi nhuận và bảng chi tiết từng giao dịch.',
                },
                {
                  id: 'q5', emoji: '🔒',
                  q: 'Làm thế nào để đổi mật khẩu?',
                  a: '1. Vào tab Tài khoản.\n2. Bấm "Đổi mật khẩu".\n3. Nhập địa chỉ Gmail đã đăng ký.\n4. Bấm "Gửi email đặt lại mật khẩu".\n5. Kiểm tra hộp thư Gmail (kể cả Spam).\n6. Nhấn link trong email để tạo mật khẩu mới.',
                },
                {
                  id: 'q6', emoji: '📶',
                  q: 'Ứng dụng có dùng được khi mất mạng không?',
                  a: 'Có! Ứng dụng hoạt động ở chế độ ngoại tuyến (Offline). Dữ liệu sẽ được lưu cục bộ trên thiết bị và tự động đồng bộ lên Firebase khi kết nối lại mạng. Tuy nhiên, tính năng gửi email đổi mật khẩu yêu cầu kết nối internet.',
                },
                {
                  id: 'q7', emoji: '📱',
                  q: 'Cách thêm món ăn mới vào thực đơn?',
                  a: '1. Vào tab Thực đơn.\n2. Bấm nút + ở góc phải màn hình trên cùng.\n3. Nhập tên món, giá bán và chọn danh mục.\n4. Bấm "Lưu" để thêm vào thực đơn.\n\nNgoài ra, có thể bấm nút "Sửa" để cập nhật giá hoặc tên món đã có.',
                },
                {
                  id: 'q8', emoji: '🎯',
                  q: 'Mục tiêu doanh thu hàng ngày là gì?',
                  a: 'Ở tab Tổng quan, bấm vào biểu tượng chỉnh sửa bên cạnh "Mục tiêu" để đặt mục tiêu doanh thu hàng ngày. Thanh tiến trình sẽ hiển thị phần trăm đạt được trong ngày.',
                },
              ].map((item) => (
                <div key={item.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--color-border)', borderRadius: '16px', overflow: 'hidden' }}>
                  <button
                    onClick={() => toggleHelp(item.id)}
                    style={{ width: '100%', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', color: 'white', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>{item.emoji}</span>
                    <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', lineHeight: '1.3' }}>{item.q}</span>
                    {activeHelpId === item.id ? <ChevronUp size={16} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} /> : <ChevronDown size={16} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />}
                  </button>
                  {activeHelpId === item.id && (
                    <div style={{ padding: '0 16px 14px 46px', borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
                      {item.a.split('\n').map((line, idx) => (
                        <div key={idx} style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.6', marginBottom: idx < item.a.split('\n').length - 1 ? '2px' : 0 }}>{line}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Liên hệ hỗ trợ */}
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-text-secondary)', letterSpacing: '0.08em', marginBottom: '10px' }}>LIÊN HỆ HỖ TRỢ</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {[
                { icon: '📧', label: 'Email hỗ trợ', value: 'appquanlonga18@gmail.com', color: '#5c6bc0' },
                { icon: '📍', label: 'Địa chỉ quán', value: '321 Quan Nhân, Thanh Xuân, Hà Nội', color: '#00bfa5' },
                { icon: '⏰', label: 'Giờ mở cửa', value: '06:30 – 22:30 (Thứ 2 – Chủ nhật)', color: '#ffa726' },
              ].map((item) => (
                <div key={item.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: `${item.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>{item.icon}</div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>{item.label}</div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'white' }}>{item.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Phím tắt hữu ích */}
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-text-secondary)', letterSpacing: '0.08em', marginBottom: '10px' }}>MẸO SỬ DỤNG</div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {[
                { tip: '💡 Bấm logo trên Tổng quan để làm mới dữ liệu nhanh.' },
                { tip: '📋 Nhấn giữ món ăn trong Gọi món để xem chi tiết.' },
                { tip: '🔄 Dữ liệu tự đồng bộ mỗi khi có thay đổi trên Firebase.' },
                { tip: '📥 Dùng tab Báo cáo để theo dõi lợi nhuận từng tháng.' },
                { tip: '🏷️ Ghi nhãn danh mục đúng giúp báo cáo chính xác hơn.' },
                { tip: '🌙 Ứng dụng mặc định giao diện tối, thân thiện với mắt.' },
              ].map((item, idx) => (
                <div key={idx} style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>{item.tip}</div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ textAlign: 'center', color: '#555761', fontSize: '11px', lineHeight: '1.7' }}>
              <div>Lòng Ngon A18 v{currentAppVersion}</div>
              <div>Developed with Nguyễn Xuân Trường</div>
              <div style={{ marginTop: '4px', color: 'rgba(92,107,192,0.6)' }}>© Quán Lòng Ngon A18</div>
            </div>
          </div>
        </div>
      )}

      {/* ===== MÀN HÌNH THÔNG BÁO HOẠT ĐỘNG ===== */}
      {showNotifPanel && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--bg-primary)', zIndex: 140, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRadius: 'inherit' }}>
          {/* Header Thông báo */}
          <header className="app-header">
            <button className="header-icon" onClick={() => setShowNotifPanel(false)}>
              <ChevronLeft size={20} />
            </button>
            <h2 className="app-header-title">THÔNG BÁO HOẠT ĐỘNG</h2>
            <button 
              className="header-icon" 
              style={{ backgroundColor: 'rgba(239, 83, 80, 0.15)', color: '#ef5350' }}
              onClick={() => {
                if (notifications.length === 0) return;
                if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử thông báo không?')) {
                  setNotifications([]);
                  setUnreadCount(0);
                }
              }}
              disabled={notifications.length === 0}
            >
              <Trash2 size={18} />
            </button>
          </header>

          {/* Nội dung Thông báo */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 30px' }}>
            {notifications.length === 0 ? (
              /* Trạng thái trống */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '70%', gap: '16px', color: 'var(--color-text-secondary)' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'rgba(92,107,192,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px' }}>
                  🔔
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: 'white' }}>Không có thông báo mới</div>
                </div>
              </div>
            ) : (
              /* Danh sách thông báo */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {notifications.map((notif) => {
                  let emoji = '📋';
                  let iconBg = 'rgba(92, 107, 192, 0.15)';
                  let iconColor = '#5c6bc0';
                  
                  if (notif.type === 'payment') {
                    emoji = '🛒';
                    iconBg = 'rgba(0, 191, 165, 0.15)';
                    iconColor = '#00bfa5';
                  } else if (notif.type === 'expense') {
                    emoji = '💸';
                    iconBg = 'rgba(239, 83, 80, 0.15)';
                    iconColor = '#ef5350';
                  } else if (notif.type === 'income') {
                    emoji = '💰';
                    iconBg = 'rgba(0, 191, 165, 0.15)';
                    iconColor = '#00bfa5';
                  } else if (notif.type === 'delete' || notif.type === 'menu_delete') {
                    emoji = '🗑️';
                    iconBg = 'rgba(239, 83, 80, 0.15)';
                    iconColor = '#ef5350';
                  } else if (notif.type === 'menu_add') {
                    emoji = '🍔';
                    iconBg = 'rgba(92, 107, 192, 0.15)';
                    iconColor = '#5c6bc0';
                  } else if (notif.type === 'menu_edit') {
                    emoji = '✏️';
                    iconBg = 'rgba(255, 167, 38, 0.15)';
                    iconColor = '#ffa726';
                  }

                  return (
                    <div 
                      key={notif.id} 
                      className="tx-list-item" 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'flex-start', 
                        gap: '14px', 
                        padding: '14px 16px', 
                        background: 'var(--bg-card)', 
                        border: '1px solid var(--color-border)', 
                        borderLeft: `3px solid ${iconColor}`,
                        borderRadius: '16px',
                        animation: 'fadeSlideUp 0.3s ease-out'
                      }}
                    >
                      <div style={{ 
                        width: '38px', 
                        height: '38px', 
                        borderRadius: '12px', 
                        backgroundColor: iconBg, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        fontSize: '18px', 
                        flexShrink: 0 
                      }}>
                        {emoji}
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <p style={{ fontSize: '13px', color: 'white', lineHeight: '1.45', fontWeight: '500', margin: 0 }}>
                          {notif.msg}
                        </p>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                          {formatRelativeTime(notif.timestamp)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== MODAL THÔNG BÁO CẬP NHẬT PHIÊN BẢN ===== */}
      {showUpdateModal && (
        <div className="modal-overlay" style={{ zIndex: 999 }}>
          <div className="modal-box" style={{ maxWidth: '340px', width: '90%', animation: 'fadeSlideUp 0.3s ease-out' }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '18px', backgroundColor: 'rgba(0,191,165,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', animation: 'pulse 2s infinite' }}>
                <Sparkles size={28} style={{ color: '#00bfa5' }} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'white', marginBottom: '4px' }}>Cập Nhật Phiên Bản Mới</h3>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                Đã có phiên bản mới tốt hơn!
              </p>
            </div>

            {/* Phiên bản */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '10px', marginBottom: '16px', border: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Hiện tại: <strong style={{ color: '#aaa' }}>v{updateInfo.currentVersion || CURRENT_VERSION}</strong></span>
              <ChevronRight size={14} style={{ color: 'var(--color-text-secondary)' }} />
              <span style={{ fontSize: '12px', color: '#00bfa5', fontWeight: '700' }}>Mới nhất: v{updateInfo.latestVersion}</span>
            </div>

            {/* Nhật ký thay đổi (Release Notes) */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-text-secondary)', letterSpacing: '0.05em', marginBottom: '6px' }}>CÓ GÌ MỚI:</div>
              <div style={{ maxHeight: '120px', overflowY: 'auto', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '10px 12px', fontSize: '12.5px', color: 'var(--color-text-secondary)', lineHeight: '1.5', border: '1px solid rgba(255,255,255,0.02)', textAlign: 'left' }}>
                {updateInfo.releaseNotes.split('\n').map((line, idx) => (
                  <div key={idx} style={{ marginBottom: idx < updateInfo.releaseNotes.split('\n').length - 1 ? '4px' : 0 }}>
                    {line}
                  </div>
                ))}
              </div>
            </div>

            {/* Nút hành động */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="btn-primary"
                onClick={() => {
                  if (updateInfo.downloadUrl) {
                    // Lưu phiên bản mới nhất vào localStorage để không hỏi lại sau khi cài
                    localStorage.setItem('a18_installed_version', updateInfo.latestVersion);
                    setCurrentAppVersion(updateInfo.latestVersion);
                    sessionStorage.setItem('a18_update_dismissed', 'true');
                    window.open(updateInfo.downloadUrl, '_system');
                    setShowUpdateModal(false);
                  } else {
                    alert('Chưa có link tải phiên bản mới. Vui lòng thử lại sau.');
                  }
                }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 16px', fontWeight: '600' }}
              >
                <Download size={16} />
                Tải về & Cập nhật ngay
              </button>
              <button
                className="btn-logout-outline"
                onClick={() => {
                  sessionStorage.setItem('a18_update_dismissed', 'true');
                  setShowUpdateModal(false);
                }}
                style={{ border: 'none', backgroundColor: 'transparent', color: 'var(--color-text-secondary)', padding: '10px', fontSize: '13px', fontWeight: '500', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
              >
                Để sau (Bỏ qua)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL CẤU HÌNH MÁY IN ===== */}
      {showPrinterModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowPrinterModal(false); }} style={{ zIndex: 998 }}>
          <div className="modal-box" style={{ maxWidth: '440px', width: '92%', animation: 'fadeSlideUp 0.3s ease-out' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '14px', backgroundColor: 'rgba(0,191,165,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Printer size={20} style={{ color: '#00bfa5' }} />
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: 'white' }}>Cấu hình máy in</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Kết nối Bluetooth hoặc Dây / Hệ thống</div>
                </div>
              </div>
              <button onClick={() => setShowPrinterModal(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '4px' }}>
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div>
              {/* Chọn kiểu kết nối */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--color-text-secondary)', marginBottom: '8px', letterSpacing: '0.04em' }}>KIỂU KẾT NỐI MÁY IN</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setPrinterType('system')}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '12px',
                      border: `1px solid ${printerType === 'system' ? '#00bfa5' : 'var(--color-border)'}`,
                      backgroundColor: printerType === 'system' ? 'rgba(0,191,165,0.15)' : '#14151b',
                      color: printerType === 'system' ? '#00bfa5' : 'white',
                      fontWeight: '600',
                      fontSize: '13px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    Hệ thống / Dây
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrinterType('bluetooth')}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '12px',
                      border: `1px solid ${printerType === 'bluetooth' ? '#5c6bc0' : 'var(--color-border)'}`,
                      backgroundColor: printerType === 'bluetooth' ? 'rgba(92,107,192,0.15)' : '#14151b',
                      color: printerType === 'bluetooth' ? '#5c6bc0' : 'white',
                      fontWeight: '600',
                      fontSize: '13px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    Bluetooth
                  </button>
                </div>
              </div>

              {printerType === 'system' && (
                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '14px', border: '1px solid var(--color-border)', fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>
                  <p style={{ margin: 0 }}>
                    💡 Ở chế độ <strong>Hệ thống / Dây</strong>, khi in hoá đơn, hệ thống sẽ mở hộp thoại in mặc định. Bạn có thể sử dụng máy in cổng USB qua cáp OTG hoặc qua Wifi/LAN được cài đặt trên máy.
                  </p>
                </div>
              )}

              {printerType === 'bluetooth' && (
                <div>
                  {/* Trạng thái tắt Bluetooth */}
                  {!isBtEnabled ? (
                    <div style={{ textAlign: 'center', padding: '24px 16px', backgroundColor: 'rgba(255,255,255,0.01)', borderRadius: '12px', border: '1px dashed var(--color-border)' }}>
                      <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '14px' }}>Bluetooth điện thoại đang tắt.</div>
                      <button className="btn-primary" type="button" onClick={handleEnableBluetooth} style={{ padding: '8px 18px', fontSize: '13px', backgroundColor: '#5c6bc0', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '600', cursor: 'pointer' }}>
                        Bật Bluetooth
                      </button>
                    </div>
                  ) : (
                    <div>
                      {/* Trạng thái kết nối hiện tại */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', padding: '12px 14px', borderRadius: '12px', marginBottom: '16px' }}>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', fontWeight: '600', letterSpacing: '0.04em' }}>TRẠNG THÁI MÁY IN</div>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: printerState === 'connected' ? '#00bfa5' : printerState === 'connecting' ? '#ffa726' : '#ef5350', marginTop: '2px' }}>
                            {printerState === 'connected' ? 'Đã kết nối' : printerState === 'connecting' ? 'Đang kết nối...' : 'Chưa kết nối'}
                          </div>
                          {selectedPrinter && (
                            <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '4px', fontFamily: 'monospace' }}>
                              {selectedPrinter}
                            </div>
                          )}
                        </div>
                        {printerState === 'connected' ? (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="button" onClick={handlePrintTest} style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', backgroundColor: 'rgba(0,191,165,0.12)', color: '#00bfa5', border: '1px solid rgba(0,191,165,0.25)', cursor: 'pointer' }}>
                              In thử
                            </button>
                            <button type="button" onClick={handleDisconnectPrinter} style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', backgroundColor: 'rgba(239,83,80,0.08)', color: '#ef5350', border: '1px solid rgba(239,83,80,0.2)', cursor: 'pointer' }}>
                              Ngắt
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {/* Thông báo lỗi nếu có */}
                      {printerError && (
                        <div style={{ backgroundColor: 'rgba(239,83,80,0.08)', border: '1px solid rgba(239,83,80,0.2)', borderRadius: '12px', padding: '10px 14px', color: '#ef5350', fontSize: '12px', marginBottom: '16px', lineHeight: '1.4' }}>
                          ⚠️ {printerError}
                        </div>
                      )}

                      {/* Danh sách thiết bị ghép đôi */}
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--color-text-secondary)', marginBottom: '8px', letterSpacing: '0.04em' }}>THIẾT BỊ ĐÃ GHÉP ĐÔI ({pairedDevices.length})</label>
                      <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                        {pairedDevices.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '16px', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                            Không tìm thấy máy in nào đã ghép đôi. Vui lòng vào Cài đặt của điện thoại để ghép đôi với máy in trước.
                          </div>
                        ) : (
                          pairedDevices.map((device, idx) => (
                            <div
                              key={idx}
                              onClick={() => printerState !== 'connecting' && handleConnectPrinter(device.address)}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                backgroundColor: selectedPrinter === device.address ? 'rgba(92,107,192,0.08)' : '#1a1b23',
                                border: `1px solid ${selectedPrinter === device.address ? '#5c6bc0' : 'var(--color-border)'}`,
                                cursor: printerState === 'connecting' ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s'
                              }}
                            >
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: 'white' }}>{device.name}</div>
                                <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px', fontFamily: 'monospace' }}>{device.address}</div>
                              </div>
                              {selectedPrinter === device.address && printerState === 'connected' && (
                                <Check size={16} style={{ color: '#00bfa5' }} />
                              )}
                              {selectedPrinter === device.address && printerState === 'connecting' && (
                                <span style={{ fontSize: '10px', color: '#ffa726', fontWeight: '600' }}>Đang kết nối...</span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '12px', lineHeight: '1.45' }}>
                        💡 <strong>Lưu ý:</strong> Cần ghép đôi (pair) máy in trong cài đặt Bluetooth của điện thoại trước (PIN thường là <code>0000</code> hoặc <code>1234</code>), sau đó thiết bị sẽ hiển thị ở đây để bạn kết nối.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                type="button"
                onClick={() => setShowPrinterModal(false)}
                style={{ padding: '10px 24px', fontSize: '13px', backgroundColor: '#333541', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600' }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="app-nav">
        <button 
          className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <LayoutDashboard className="nav-icon" size={22} />
          Tổng quan
        </button>
        <button 
          className={`nav-item ${activeTab === 'order' ? 'active' : ''}`}
          onClick={() => setActiveTab('order')}
        >
          <ShoppingCart className="nav-icon" size={22} />
          Gọi món
        </button>
        <button 
          className={`nav-item ${activeTab === 'menu' ? 'active' : ''}`}
          onClick={() => setActiveTab('menu')}
        >
          <Utensils className="nav-icon" size={22} />
          Thực đơn
        </button>
        <button 
          className={`nav-item ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          <BarChart2 className="nav-icon" size={22} />
          Báo cáo
        </button>
        <button 
          className={`nav-item ${activeTab === 'account' ? 'active' : ''}`}
          onClick={() => setActiveTab('account')}
        >
          <User className="nav-icon" size={22} />
          Tài khoản
        </button>
      </nav>
    </div>
  );
}
