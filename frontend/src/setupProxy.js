const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Proxy WebSocket endpoint specifically
  app.use(
    '/websocket',
    createProxyMiddleware({
      target: 'ws://localhost:8080/websocket',
      changeOrigin: true,
      logLevel: 'info',
      ws: true // Enable websocket proxying
    })
  );

  // Proxy other API requests to backend
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8080/api',
      changeOrigin: true
    })
  );

};