// electron/server.js
const express = require('express');
const path = require('path');

function createStaticServer(port = 0) {
  return new Promise((resolve) => {
    const app = express();
    const pub = path.join(__dirname, '..', 'renderer'); // serve renderer/ folder
    app.use(express.static(pub, { extensions: ['html'] }));
    const srv = app.listen(port, '127.0.0.1', () => {
      const address = srv.address();
      const url = `http://127.0.0.1:${address.port}`;
      resolve({ server: srv, url });
    });
  });
}

module.exports = { createStaticServer };