import { getStore } from '@netlify/blobs';
import fs from 'fs';
import path from 'path';

// Mock DB Cache cho môi trường AI Studio (vì không xác thực được Netlify Token thực tế)
const getLocalStore = (name) => {
  const filePath = path.resolve(process.cwd(), `.mock-blobs-${name}.json`);
  return {
    get: async (key, options) => {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const val = data[key];
        if (!val) return null;
        if (options && options.type === 'json') return val;
        return JSON.stringify(val);
      } catch(e) { return null; }
    },
    setJSON: async (key, value) => {
      let data = {};
      try { data = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch(e){}
      data[key] = value;
      fs.writeFileSync(filePath, JSON.stringify(data));
    }
  };
};

const getUsersStore = () => {
  // Tự động dùng fallback Mock nếu không cài biến môi trường Netlify
  if (!process.env.NETLIFY_TOKEN && !process.env.NETLIFY_BLOBS_CONTEXT) {
    return getLocalStore('account-db');
  }
  return getStore('account-db');
};

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Chỉ hỗ trợ giao thức POST.' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const { username, password } = body;

    if (!username || !password) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Vui lòng cung cấp username và password!' }) };
    }

    const store = getUsersStore();
    let users = await store.get('users', { type: 'json' }) || [];

    // Tạo Admin mặc định nếu database trống
    if (users.length === 0) {
       const initialAdmin = { fullName: "Administrator", username: "admin", password: "adminpassword", role: "admin", needsReset: false };
       users.push(initialAdmin);
       await store.setJSON('users', users);
    }

    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
      // KHÔNG CUNG CẤP PASSWORD TRẢ VỀ FRONTEND
      const { password: _, ...safeUser } = user;
      return { 
        statusCode: 200, 
        body: JSON.stringify({ success: true, user: safeUser, token: 'fake-jwt-token-xyz' }) 
      };
    } else {
      return { statusCode: 401, body: JSON.stringify({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu.' }) };
    }
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
