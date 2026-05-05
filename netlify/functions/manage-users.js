import { getStore } from '@netlify/blobs';
import fs from 'fs';
import path from 'path';

// Mock xử lý DB cho AI Studio Simulator
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
  if (!process.env.NETLIFY_TOKEN && !process.env.NETLIFY_BLOBS_CONTEXT) {
    return getLocalStore('account-db');
  }
  return getStore('account-db');
};

export const handler = async (event) => {
  const store = getUsersStore();
  const method = event.httpMethod;

  try {
    let users = await store.get('users', { type: 'json' }) || [];
    
    // Seed admin nếu trống db
    if (users.length === 0) {
      users.push({ fullName: "Administrator", username: "admin", password: "adminpassword", role: "admin", needsReset: false });
      await store.setJSON('users', users);
    }

    // 1. GET: Lấy danh sách tài khoản
    if (method === 'GET') {
      const safeUsers = users.map(u => ({ 
        username: u.username, 
        fullName: u.fullName, 
        role: u.role, 
        needsReset: u.needsReset 
      }));
      return { statusCode: 200, body: JSON.stringify(safeUsers) };
    }

    // 2. POST: Thêm tài khoản mới HOẶC Yêu cầu quên mật khẩu
    if (method === 'POST') {
      const body = JSON.parse(event.body);
      
      // Xử lý action Quên mật khẩu từ Staff
      if (body.action === 'request-reset') {
        const userIndex = users.findIndex(u => u.username === body.username);
        if (userIndex >= 0) {
          users[userIndex].needsReset = true;
          await store.setJSON('users', users);
          return { statusCode: 200, body: JSON.stringify({ message: 'Yêu cầu reset mật khẩu đã được gửi đến Admin.' }) };
        }
        return { statusCode: 404, body: JSON.stringify({ message: 'Tài khoản không tồn tại.' }) };
      }

      // Xử lý Thêm user từ Admin
      if (users.find(u => u.username === body.username)) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Lỗi: Tên đăng nhập (username) đã tồn tại.' }) };
      }
      users.push({
        fullName: body.fullName,
        username: body.username,
        password: body.password || '123456',
        role: body.role || 'staff',
        needsReset: false
      });
      await store.setJSON('users', users);
      return { statusCode: 201, body: JSON.stringify({ message: 'Thêm tài khoản thành công.' }) };
    }

    // 3. PUT: Reset mật khẩu (Admin thực hiện)
    if (method === 'PUT') {
       const body = JSON.parse(event.body);
       if (body.action === 'reset-password') {
         const userIndex = users.findIndex(u => u.username === body.username);
         if (userIndex >= 0) {
           users[userIndex].password = '123456';
           users[userIndex].needsReset = false;
           await store.setJSON('users', users);
           return { statusCode: 200, body: JSON.stringify({ message: 'Đã reset mật khẩu tài khoản về mặc định: 123456' }) };
         }
         return { statusCode: 404, body: JSON.stringify({ message: 'Không tìm thấy user.' }) };
       }
    }

    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}
