const { handleApi } = require('../server.js');

// Disable Vercel's body parser so our stream-based parseBody in server.js works
module.exports.config = { api: { bodyParser: false } };

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    await handleApi(req, res, url);
  } catch (err) {
    console.error('API error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
};
