import express from 'express';
import path from 'path';
import url from 'url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Phục vụ frontend tĩnh từ thư mục gốc
app.use(express.static(__dirname));

// Tạo route giả lập cho Netlify Functions
app.all('/.netlify/functions/:functionName', async (req, res) => {
  const functionName = req.params.functionName;
  try {
    const mod = await import(`./netlify/functions/${functionName}.js?t=${Date.now()}`); // Cache bust để dev tiện lợi
    
    // Giả lập Netlify Event Object
    const event = {
      httpMethod: req.method,
      body: Object.keys(req.body).length ? JSON.stringify(req.body) : '',
      queryStringParameters: req.query,
      headers: req.headers,
    };
    
    const context = {};
    const response = await mod.handler(event, context);

    res.status(response.statusCode || 200);
    if (response.headers) {
      for (const [key, val] of Object.entries(response.headers)) {
        res.setHeader(key, val);
      }
    }
    
    if (typeof response.body === 'string' && response.body.startsWith('{')) {
      res.setHeader('Content-Type', 'application/json');
    }
    
    res.send(response.body);
  } catch (err) {
    console.error('Lỗi khi chạy function:', err);
    res.status(500).json({ error: "Function execution failed" });
  }
});

// Middleware xử lý Single Page App / các đường dẫn chưa khai báo (phục hồi về index)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock Netlify server running on http://localhost:${PORT}`);
});
