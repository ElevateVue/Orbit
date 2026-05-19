let serverModule;
let loadError;

try {
  serverModule = require('../server.js');
} catch (err) {
  loadError = err;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (loadError) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Module load failed',
      message: loadError.message,
      stack: loadError.stack
    }));
    return;
  }

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    await serverModule.handleApi(req, res, url);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Handler error', message: err.message }));
  }
};
