const { createApp } = require('../server.js');

let appPromise = createApp();

module.exports = async (req, res) => {
  try {
    const app = await appPromise;
    return app(req, res);
  } catch (error) {
    console.error("Vercel App Init Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
