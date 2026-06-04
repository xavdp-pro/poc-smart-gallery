const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();
const port = 9999;

// Proxy API / uploads / WebSocket vers le backend (pathFilter : ne pas monter sur
// app.use('/api', …) sinon Express retire le préfixe et le backend reçoit /photos).
const backendProxy = createProxyMiddleware({
  target: 'http://127.0.0.1:8888',
  changeOrigin: true,
  ws: true,
  pathFilter: (pathname) =>
    pathname.startsWith('/api') ||
    pathname.startsWith('/uploads') ||
    pathname.startsWith('/socket.io'),
});

app.use(backendProxy);

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, '::', () => {
  console.log(`✅ HTTP server running on http://0.0.0.0:${port}`);
  console.log(`📂 Serving: ${path.join(__dirname, 'dist')}`);
});
