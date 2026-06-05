import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Compass, ArrowRight } from 'lucide-react';
import { login, register } from '../firebase';

export default function Login({ onLoginSuccess }) {
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Dịch mã lỗi Firebase sang tiếng Việt
  const translateAuthError = (err) => {
    const code = err?.code || '';
    const map = {
      'auth/invalid-credential':        'Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.',
      'auth/user-not-found':            'Tài khoản không tồn tại. Hãy đăng ký trước.',
      'auth/wrong-password':            'Mật khẩu không đúng. Vui lòng thử lại.',
      'auth/invalid-email':             'Địa chỉ email không hợp lệ.',
      'auth/user-disabled':             'Tài khoản này đã bị vô hiệu hóa.',
      'auth/too-many-requests':         'Quá nhiều lần thử. Vui lòng đợi vài phút rồi thử lại.',
      'auth/email-already-in-use':      'Email này đã được đăng ký. Hãy đăng nhập thay vì đăng ký.',
      'auth/weak-password':             'Mật khẩu quá yếu. Hãy dùng ít nhất 6 ký tự.',
      'auth/network-request-failed':    'Không có kết nối mạng. Kiểm tra Wi-Fi và thử lại.',
      'auth/operation-not-allowed':     'Đăng nhập bằng Email/Mật khẩu chưa được bật. Liên hệ quản trị viên.',
      'auth/popup-closed-by-user':      'Cửa sổ đăng nhập bị đóng. Vui lòng thử lại.',
    };
    return map[code] || err?.message || 'Có lỗi xảy ra. Vui lòng thử lại.';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (activeTab === 'login') {
        const user = await login(email, password);
        onLoginSuccess(user);
      } else {
        const user = await register(email, password);
        onLoginSuccess(user);
        alert('Đăng ký tài khoản thành công! Bạn đã được tự động đăng nhập.');
      }
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const user = await login('guest', '');
      onLoginSuccess(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-brand">
        <div style={{
          width: '110px',
          height: '110px',
          borderRadius: '28px',
          overflow: 'hidden',
          marginBottom: '18px',
          boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
        }}>
          <img
            src="/logo.png"
            alt="Lòng Ngon A18 Logo"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        <h1 className="brand-title">Lòng Ngon A18</h1>
        <p className="brand-subtitle">Quản lý quán ăn thông minh</p>
      </div>

      <div className="login-card">
        <div className="tabs-header">
          <button 
            type="button" 
            className={`tab-btn ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => { setActiveTab('login'); setError(''); }}
          >
            Đăng nhập
          </button>
          <button 
            type="button" 
            className={`tab-btn ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => { setActiveTab('register'); setError(''); }}
          >
            Đăng ký
          </button>
        </div>

        {error && (
          <div style={{ color: '#ef5350', fontSize: '13px', textAlign: 'center', lineHeight: '1.4' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="form-group">
            <div className="input-icon-wrapper">
              <Mail className="input-icon" size={18} />
              <input 
                type="text" 
                className="input-field" 
                placeholder="Email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <div className="input-icon-wrapper">
              <Lock className="input-icon" size={18} />
              <input 
                type={showPassword ? 'text' : 'password'} 
                className="input-field input-field-pass" 
                placeholder="Mật khẩu" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button 
                type="button" 
                className="eye-btn"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {activeTab === 'login' && (
            <a href="#forgot" className="forgot-link" onClick={(e) => { e.preventDefault(); alert('Vui lòng liên hệ quản trị viên để khôi phục mật khẩu hoặc dùng thử chế độ Offline.'); }}>
              Quên mật khẩu?
            </a>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Đang xử lý...' : activeTab === 'login' ? 'Đăng nhập' : 'Đăng ký'}
          </button>
        </form>
      </div>

      <button className="guest-btn" onClick={handleGuestLogin} disabled={loading}>
        <Compass size={18} />
        Dùng thử không cần đăng nhập
        <ArrowRight size={14} style={{ marginLeft: '4px' }} />
      </button>
    </div>
  );
}
