const os = require('os');
const path = require('path');
const express = require('express');
const cors = require('cors');

const booksRouter = require('./routes/books');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 简单请求日志
app.use((req, _res, next) => {
  console.log(`${new Date().toLocaleString()}  ${req.method} ${req.originalUrl}`);
  next();
});

app.use('/api', booksRouter);

// PC 端管理界面
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/', (_req, res) => {
  res.json({
    name: '图书馆管理系统服务',
    api: '/api',
    admin: '/admin',
    docs: '浏览器打开 /admin 进入电脑端管理界面',
  });
});

// 统一错误处理
app.use((err, _req, res, _next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || '服务器内部错误' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n📚 图书馆管理系统服务已启动: http://localhost:${PORT}`);
  console.log('\n手机端请使用本机在局域网中的 IP 访问，例如:');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  http://${net.address}:${PORT}`);
      }
    }
  }
  console.log('\n提示: 若手机无法访问，请在 Windows 防火墙中放行该端口。');
});
