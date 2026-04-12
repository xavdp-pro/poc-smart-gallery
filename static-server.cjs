const express = require('express');
const path = require('path');
const app = express();
const port = 9999;

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, '::', () => {
  console.log(`✅ HTTP server running on http://0.0.0.0:${port}`);
  console.log(`📂 Serving: ${path.join(__dirname, 'dist')}`);
});
