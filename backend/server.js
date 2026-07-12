import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// ── MIDDLEWARE ──
app.use(cors());
app.use(express.json());

// ── HEALTH CHECK ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'CareerCompass backend is running' });
});

// ── API: CHAT ENDPOINT ──
app.post('/api/chat', async (req, res) => {
  try {
    const { systemPrompt, messages } = req.body;

    if (!systemPrompt || !messages || messages.length === 0) {
      return res.status(400).json({ error: 'Missing systemPrompt or messages' });
    }

    // Validate OpenRouter API key
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });
    }

    // Call OpenRouter API with 6-model fallback chain
    const modelChain = [
      'openrouter/auto',
      'google/gemini-2.0-flash',
      'anthropic/claude-3.5-sonnet',
      'meta-llama/llama-3.1-70b-instruct',
      'mistralai/mistral-large',
      'google/palm-2'
    ];

    let finalResponse = null;

    for (const model of modelChain) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://career-compass.vercel.app',
            'X-Title': 'CareerCompass'
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages
            ],
            temperature: 0.7,
            max_tokens: 1500
          })
        });

        if (response.ok) {
          const data = await response.json();
          finalResponse = data.choices?.[0]?.message?.content || null;
          if (finalResponse) {
            console.log(`✓ Success with model: ${model}`);
            break;
          }
        } else {
          const errorText = await response.text();
          console.warn('✗ ${model}:${response.status}');
          console.warn(errorText);
        }
      } catch (err) {
        console.warn(`✗ Model ${model} error: ${err.message}`);
      }
    }

    if (!finalResponse) {
      return res.status(503).json({ 
        error: 'All AI models failed. Please try again later.',
        details: 'OpenRouter API is unavailable'
      });
    }

    res.json({ reply: finalResponse });
  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// ── STATIC FILES (serve frontend) ──
app.use(express.static(join(__dirname, '../public')));

// ── SPA CATCH-ALL ROUTE (serve index.html for all non-API routes) ──
// Must come AFTER all API routes and static files
app.get('*', (req, res, next) => {
  const indexPath = join(__dirname, '../public/index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`Failed to serve index.html: ${err.message}`);
      res.status(404).json({ 
        error: 'File not found',
        path: indexPath,
        hint: 'Make sure public/index.html exists'
      });
    }
  });
});

// ── ERROR HANDLING ──
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Something went wrong',
    details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// ── START SERVER ──
app.listen(PORT, () => {
  console.log(`✦ CareerCompass backend running on http://localhost:${PORT}`);
  console.log(`✦ Health check: GET http://localhost:${PORT}/health`);
  console.log(`✦ API endpoint: POST http://localhost:${PORT}/api/chat`);
});

export default app;