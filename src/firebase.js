import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "firebase/auth";
import { 
  getFirestore,
  collection, 
  doc, 
  getDoc,
  setDoc, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  Timestamp
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAXtd-I0NQ4pAdLuzujTxOH_8dMa869OSw",
  authDomain: "long-ngon-a18.firebaseapp.com",
  databaseURL: "https://long-ngon-a18-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "long-ngon-a18",
  storageBucket: "long-ngon-a18.firebasestorage.app",
  messagingSenderId: "609995983429",
  appId: "1:609995983429:web:83b2348782bf68f7ab712c"
};

// Tên collection đúng theo Firebase của bạn
const COL_MENU        = "thuc_don";
const COL_TRANSACTION = "quan_ly_thu_chi";

const isFirebaseConfigured =
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  firebaseConfig.projectId !== "YOUR_PROJECT_ID";

let app  = null;
let auth = null;
let db   = null;

if (isFirebaseConfigured) {
  try {
    app  = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db   = getFirestore(app);
    console.log("Firebase initialized successfully!");
  } catch (error) {
    console.error("Failed to initialize Firebase, falling back to LocalStorage:", error);
  }
} else {
  console.log("Using LocalStorage fallback (Firebase config is not set).");
}

export { auth, db, isFirebaseConfigured };

// Lắng nghe trạng thái đăng nhập Firebase Auth (real-time)
export const subscribeAuth = (callback) => {
  if (isFirebaseConfigured && auth) {
    return onAuthStateChanged(auth, callback);
  } else {
    // Offline: đọc từ localStorage
    const savedUser = localStorage.getItem('mock_user');
    if (savedUser) {
      try { callback(JSON.parse(savedUser)); }
      catch { callback(null); }
    } else {
      callback(null);
    }
    return () => {}; // unsubscribe no-op
  }
};

// ── Chuyển đổi field từ Firebase → App ─────────────────────────────
// Firebase: { note, type: "thu"/"chi", created_at (Timestamp), date (Timestamp), amount, category }
// App:      { description, type: "in"/"out", timestamp (ms), dateString, amount, category }
const fromFirebaseTx = (id, data) => {
  // Lấy timestamp ms từ created_at hoặc date
  let ts = Date.now();
  if (data.created_at) {
    ts = data.created_at instanceof Timestamp
      ? data.created_at.toMillis()
      : (typeof data.created_at === 'number' ? data.created_at : Date.now());
  } else if (data.date) {
    ts = data.date instanceof Timestamp
      ? data.date.toMillis()
      : (typeof data.date === 'number' ? data.date : Date.now());
  } else if (data.timestamp) {
    ts = typeof data.timestamp === 'number' ? data.timestamp : Date.now();
  }

  const dateString = new Date(ts).toLocaleDateString('vi-VN');

  return {
    id,
    amount:      Number(data.amount) || 0,
    description: data.note || data.description || '',
    category:    data.category || 'Gọi món',
    type:        data.type === 'thu' ? 'in' : data.type === 'chi' ? 'out' : (data.type || 'in'),
    timestamp:   ts,
    dateString,
    image_url:   data.image_url || null,
  };
};

// Chuyển đổi field từ App → Firebase khi ghi mới
const toFirebaseTx = (tx) => {
  const now = new Date(tx.timestamp || Date.now());
  return {
    amount:     Number(tx.amount),
    note:       tx.description || '',
    category:   tx.category || 'Gọi món',
    type:       tx.type === 'in' ? 'thu' : 'chi',
    created_at: serverTimestamp(),
    date:       Timestamp.fromDate(now),
    image_url:  null,
  };
};

// Hàm viết hoa chữ cái đầu tiên của chuỗi
const capitalizeFirst = (str) => {
  if (!str) return '';
  const trimmed = str.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

// ── Chuyển đổi field menu Firebase → App ──────────────────────────
// Firebase thuc_don có thể có: dish_name/name/ten, price/gia, category/danh_muc
const fromFirebaseMenu = (id, data) => ({
  id,
  name:     capitalizeFirst(data.dish_name || data.name || data.ten || ''),
  price:    Number(data.price || data.gia || 0),
  category: capitalizeFirst(data.category || data.danh_muc || 'Món chính'),
});

const toFirebaseMenu = (item) => {
  const capName = capitalizeFirst(item.name);
  return {
    dish_name: capName,
    name:      capName,
    price:     Number(item.price),
    category:  capitalizeFirst(item.category),
  };
};

// ── Menu mặc định theo thực đơn thật của Quán Lòng Ngon A18 ────────
const defaultMenu = [
  // Lòng chần
  { id: "m1",  name: "Lòng chần thường",       price: 199000, category: "Lòng chần" },
  { id: "m2",  name: "Lòng chần thường (lớn)",  price: 299000, category: "Lòng chần" },
  { id: "m3",  name: "Lòng chần đặc biệt",      price: 299000, category: "Lòng chần" },
  { id: "m4",  name: "Lòng thập cẩm",           price: 255000, category: "Lòng chần" },
  // Ăn nhanh
  { id: "m5",  name: "Cháo lòng",               price: 40000,  category: "Ăn nhanh" },
  { id: "m6",  name: "Bún lòng",                price: 40000,  category: "Ăn nhanh" },
  { id: "m7",  name: "Mỳ lòng giòn",            price: 60000,  category: "Ăn nhanh" },
  { id: "m8",  name: "Cháo đặc biệt",           price: 100000, category: "Ăn nhanh" },
  // Khai vị
  { id: "m9",  name: "Canh tiết luộc",          price: 40000,  category: "Khai vị" },
  { id: "m10", name: "Nộm sứa",                 price: 35000,  category: "Khai vị" },
  { id: "m11", name: "Dưa chuột",               price: 25000,  category: "Khai vị" },
  { id: "m12", name: "Tỏi phi",                 price: 40000,  category: "Khai vị" },
  { id: "m13", name: "Nem nắm",                 price: 50000,  category: "Khai vị" },
  // Rau xào
  { id: "m14", name: "Rau muống xào tỏi",       price: 45000,  category: "Rau xào" },
  { id: "m15", name: "Rau cải xào tỏi",         price: 40000,  category: "Rau xào" },
  // Món chiên / xào
  { id: "m16", name: "Mỡ đuôi chiên",           price: 140000, category: "Món chiên xào" },
  { id: "m17", name: "Lòng xào dừa",            price: 125000, category: "Món chiên xào" },
  { id: "m18", name: "Hàm lợn xào sả ớt",       price: 150000, category: "Món chiên xào" },
  { id: "m19", name: "Đặc sản rán",             price: 150000, category: "Món chiên xào" },
  { id: "m20", name: "Tim cật xào",             price: 150000, category: "Món chiên xào" },
  { id: "m21", name: "Dạ dày chiên giòn",       price: 150000, category: "Món chiên xào" },
  { id: "m22", name: "Đuôi mỡ",                 price: 80000,  category: "Món chiên xào" },
  { id: "m23", name: "Chạch chiên lá lốt",      price: 135000, category: "Món chiên xào" },
  { id: "m24", name: "Cá sống chiên lá lốt",    price: 120000, category: "Món chiên xào" },
  { id: "m25", name: "Mực khô xào",             price: 200000, category: "Món chiên xào" },
  { id: "m26", name: "Cá chép vàng",            price: 60000,  category: "Món chiên xào" },
  { id: "m27", name: "Tôp mỡ rán",              price: 150000, category: "Món chiên xào" },
  // Đặc sản
  { id: "m28", name: "Đầu lòng",                price: 300000, category: "Đặc sản" },
  { id: "m29", name: "Trứng ngâm",              price: 400000, category: "Đặc sản" },
  { id: "m30", name: "Ếch rang muối",           price: 120000, category: "Đặc sản" },
  // Lẩu
  { id: "m31", name: "Lẩu chào lòng (nhỏ)",    price: 259000, category: "Lẩu" },
  { id: "m32", name: "Lẩu chào lòng (lớn)",    price: 500000, category: "Lẩu" },
  { id: "m33", name: "Lẩu lòng chứa cay (nhỏ)",price: 299000, category: "Lẩu" },
  { id: "m34", name: "Lẩu lòng chứa cay (lớn)",price: 400000, category: "Lẩu" },
  // Combo
  { id: "m35", name: "Combo 1 (2 người)",       price: 245000, category: "Combo" },
  { id: "m36", name: "Combo 2 (3-4 người)",     price: 365000, category: "Combo" },
  // Bia
  { id: "m37", name: "Bia Hà Nội",              price: 22000,  category: "Bia & Đồ uống" },
  { id: "m38", name: "Bia Sài Gòn",             price: 21000,  category: "Bia & Đồ uống" },
  { id: "m39", name: "Bia Tiger Bạc",           price: 25000,  category: "Bia & Đồ uống" },
  { id: "m40", name: "Bia Trúc Bạch",           price: 30000,  category: "Bia & Đồ uống" },
  { id: "m41", name: "Bia Ô Tô",               price: 18000,  category: "Bia & Đồ uống" },
  { id: "m42", name: "Rượu trắng (chén)",       price: 10000,  category: "Bia & Đồ uống" },
  { id: "m43", name: "Rượu nếp (chén)",         price: 15000,  category: "Bia & Đồ uống" },
  // Nước ngọt
  { id: "m44", name: "Coca Cola",               price: 15000,  category: "Nước ngọt" },
  { id: "m45", name: "Fanta",                   price: 15000,  category: "Nước ngọt" },
  { id: "m46", name: "Nước lọc",               price: 10000,  category: "Nước ngọt" },
  { id: "m47", name: "Trà đá",                  price: 5000,   category: "Nước ngọt" },
  // Phụ
  { id: "m48", name: "Lạc luộc",               price: 25000,  category: "Phụ" },
  { id: "m49", name: "Lạc rang",               price: 35000,  category: "Phụ" },
  { id: "m50", name: "Nem chua",               price: 8000,   category: "Phụ" },
];

// ── Helper LocalStorage ─────────────────────────────────────────────
const getLocalData = (key, defaultVal) => {
  const data = localStorage.getItem(key);
  if (!data) { localStorage.setItem(key, JSON.stringify(defaultVal)); return defaultVal; }
  try { return JSON.parse(data); } catch { return defaultVal; }
};
const setLocalData = (key, data) => localStorage.setItem(key, JSON.stringify(data));

// ==========================================
// 1. DỊCH VỤ ĐĂNG NHẬP / ĐĂNG KÝ (AUTH)
// ==========================================
export const login = async (email, password) => {
  if (isFirebaseConfigured && auth) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } else {
    if ((email === "admin@a18.com" || email === "guest") && (password === "123456" || !password)) {
      const user = { email: email === "guest" ? "guest@a18.com" : email, uid: "mock-uid-128" };
      localStorage.setItem("mock_user", JSON.stringify(user));
      return user;
    }
    throw new Error("Tài khoản hoặc mật khẩu không đúng.");
  }
};

export const register = async (email, password) => {
  if (isFirebaseConfigured && auth) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } else {
    throw new Error("Đăng ký chỉ khả dụng khi đã kết nối Firebase.");
  }
};

export const logout = async () => {
  if (isFirebaseConfigured && auth) {
    await signOut(auth);
  } else {
    localStorage.removeItem("mock_user");
  }
};

// Gửi email đặt lại mật khẩu qua Firebase Auth
export const sendPasswordReset = async (email) => {
  if (isFirebaseConfigured && auth) {
    await sendPasswordResetEmail(auth, email);
  } else {
    // Offline mode: giả lập thành công
    return Promise.resolve();
  }
};

// ==========================================
// 2. DỊCH VỤ THỰC ĐƠN — collection: thuc_don
// ==========================================
export const subscribeMenu = (callback) => {
  if (isFirebaseConfigured && db) {
    const q = query(collection(db, COL_MENU));
    return onSnapshot(q, (snapshot) => {
      const items = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const rawName = data.dish_name || data.name || data.ten || '';
        const capName = capitalizeFirst(rawName);
        const rawCat = data.category || data.danh_muc || '';
        const capCat = capitalizeFirst(rawCat);
        
        let needsUpdate = false;
        const updateData = {};
        
        if (rawName && rawName !== capName) {
          updateData.dish_name = capName;
          updateData.name = capName;
          needsUpdate = true;
        }
        if (rawCat && rawCat !== capCat) {
          if (data.category) updateData.category = capCat;
          if (data.danh_muc) updateData.danh_muc = capCat;
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          const docRef = doc(db, COL_MENU, d.id);
          setDoc(docRef, updateData, { merge: true })
            .then(() => console.log(`Tự động viết hoa thực đơn [${d.id}]: ${rawName} -> ${capName}`))
            .catch(err => console.error("Lỗi tự động sửa thực đơn:", err));
        }
        
        items.push(fromFirebaseMenu(d.id, data));
      });
      callback(items.length > 0 ? items : defaultMenu);
    }, (error) => {
      console.error("Firestore menu error:", error);
      callback(getLocalData("a18_menu", defaultMenu));
    });
  } else {
    callback(getLocalData("a18_menu", defaultMenu));
    return () => {};
  }
};

export const saveMenuItem = async (item) => {
  if (isFirebaseConfigured && db) {
    const data = toFirebaseMenu(item);
    if (item.id) {
      await setDoc(doc(db, COL_MENU, item.id), data);
    } else {
      await addDoc(collection(db, COL_MENU), data);
    }
  } else {
    const items = getLocalData("a18_menu", defaultMenu);
    if (item.id) {
      const idx = items.findIndex(i => i.id === item.id);
      if (idx !== -1) items[idx] = { ...items[idx], name: item.name, price: Number(item.price), category: item.category };
    } else {
      items.push({ id: Date.now().toString(), name: item.name, price: Number(item.price), category: item.category });
    }
    setLocalData("a18_menu", items);
  }
};

export const deleteMenuItem = async (id) => {
  if (isFirebaseConfigured && db) {
    await deleteDoc(doc(db, COL_MENU, id));
  } else {
    const items = getLocalData("a18_menu", defaultMenu).filter(i => i.id !== id);
    setLocalData("a18_menu", items);
  }
};

// ==========================================
// 3. DỊCH VỤ GIAO DỊCH — collection: quan_ly_thu_chi
// ==========================================
export const subscribeTransactions = (callback) => {
  if (isFirebaseConfigured && db) {
    // Sắp xếp theo created_at giảm dần
    const q = query(collection(db, COL_TRANSACTION), orderBy("created_at", "desc"));
    return onSnapshot(q, (snapshot) => {
      const txs = [];
      snapshot.forEach((d) => txs.push(fromFirebaseTx(d.id, d.data())));
      callback(txs);
    }, (error) => {
      console.error("Firestore transactions error:", error);
      callback(getLocalData("a18_transactions", []));
    });
  } else {
    const notify = () => callback(getLocalData("a18_transactions", []));
    notify();
    window.addEventListener('a18_transactions_updated', notify);
    return () => window.removeEventListener('a18_transactions_updated', notify);
  }
};

export const addTransaction = async (tx) => {
  if (isFirebaseConfigured && db) {
    await addDoc(collection(db, COL_TRANSACTION), toFirebaseTx({
      ...tx,
      timestamp: tx.timestamp || Date.now(),
    }));
  } else {
    const txs = getLocalData("a18_transactions", []);
    txs.unshift({
      id: Date.now().toString(),
      ...tx,
      timestamp:  tx.timestamp  || Date.now(),
      dateString: tx.dateString || new Date().toLocaleDateString('vi-VN'),
    });
    setLocalData("a18_transactions", txs);
    window.dispatchEvent(new Event('a18_transactions_updated'));
  }
};

export const deleteTransaction = async (id) => {
  if (isFirebaseConfigured && db) {
    await deleteDoc(doc(db, COL_TRANSACTION, id));
  } else {
    const txs = getLocalData("a18_transactions", []).filter(tx => tx.id !== id);
    setLocalData("a18_transactions", txs);
    window.dispatchEvent(new Event('a18_transactions_updated'));
  }
};

export const deleteAllTodayTransactions = async () => {
  const todayStr = new Date().toLocaleDateString('vi-VN');
  if (isFirebaseConfigured && db) {
    const snapshot = await getDocs(query(collection(db, COL_TRANSACTION)));
    const deletes = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const ds = data.date instanceof Timestamp
        ? data.date.toDate().toLocaleDateString('vi-VN')
        : (data.dateString || '');
      if (ds === todayStr) deletes.push(deleteDoc(doc(db, COL_TRANSACTION, docSnap.id)));
    });
    await Promise.all(deletes);
  } else {
    const txs = getLocalData("a18_transactions", []).filter(tx => tx.dateString !== todayStr);
    setLocalData("a18_transactions", txs);
    window.dispatchEvent(new Event('a18_transactions_updated'));
  }
};

// ==========================================
// 4. KIỂM TRA PHIÊN BẢN ỨNG DỤNG
// ==========================================
export const getLatestVersionConfig = async () => {
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, "app_config", "version");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data();
      }
    } catch (error) {
      console.error("Lỗi khi lấy thông tin phiên bản từ Firestore:", error);
    }
  }
  return null;
};

// ==========================================
// 5. ĐỒNG BỘ GIỎ HÀNG THỜI GIAN THỰC (COLLECTION: gio_hang_tam)
// ==========================================
const COL_TABLE_CARTS = "gio_hang_tam";

export const subscribeTableCarts = (callback) => {
  if (isFirebaseConfigured && db) {
    const q = collection(db, COL_TABLE_CARTS);
    return onSnapshot(q, (snapshot) => {
      const carts = {};
      snapshot.forEach((d) => {
        carts[d.id] = d.data().quantities || {};
      });
      callback(carts);
    }, (error) => {
      console.error("Lỗi lắng nghe giỏ hàng từ Firestore:", error);
      callback(getLocalData("a18_table_quantities", {}));
    });
  } else {
    const notify = () => callback(getLocalData("a18_table_quantities", {}));
    notify();
    window.addEventListener('a18_table_quantities_updated', notify);
    return () => window.removeEventListener('a18_table_quantities_updated', notify);
  }
};

export const saveTableCart = async (table, quantities) => {
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, COL_TABLE_CARTS, table);
      await setDoc(docRef, {
        quantities: quantities || {},
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error(`Lỗi khi lưu giỏ hàng của bàn ${table} lên Firestore:`, error);
    }
  } else {
    const saved = getLocalData("a18_table_quantities", {});
    saved[table] = quantities;
    setLocalData("a18_table_quantities", saved);
    window.dispatchEvent(new Event('a18_table_quantities_updated'));
  }
};

