const { handleApi } = require('../server.js');

const handler = async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    await handleApi(req, res, url);
  } catch (err) {
    console.error('API error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
};

// Disable Vercel's body parser so our stream-based parseBody in server.js works
handler.config = { api: { bodyParser: false } };

module.exports = handler;
