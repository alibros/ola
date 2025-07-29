const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const OLLAMA_URL = 'http://127.0.0.1:11434';

// List available models
app.get('/api/models', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = await response.json();
    res.json(data.models || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// Chat with selected model
app.post('/api/chat', async (req, res) => {
  const { model, messages } = req.body;
  if (!model || !messages) {
    return res.status(400).json({ error: 'Model and messages are required' });
  }
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false })
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to chat with model' });
  }
});

app.listen(PORT, () => {
  console.log(`OLA server running at http://localhost:${PORT}`);
}); 