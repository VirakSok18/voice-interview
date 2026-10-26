import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

// Built-in Vite middleware so /api/tts works in local dev AND on Vercel seamlessly
function edgeNeuralTtsPlugin() {
  return {
    name: 'edge-neural-tts-api',
    configureServer(server) {
      server.middlewares.use('/api/tts', async (req, res) => {
        try {
          const url = new URL(req.url, 'http://localhost');
          let text = url.searchParams.get('text') || '';
          let voice = url.searchParams.get('voice') || 'en-US-AvaMultilingualNeural';

          if (req.method === 'POST') {
            const bodyChunks = [];
            for await (const chunk of req) bodyChunks.push(chunk);
            const raw = Buffer.concat(bodyChunks).toString();
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed.text) text = parsed.text;
              if (parsed.voice) voice = parsed.voice;
            }
          }

          if (!text.trim()) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing text' }));
            return;
          }

          const tts = new MsEdgeTTS();
          await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
          const { audioStream } = tts.toStream(text.trim());
          const chunks = [];

          await new Promise((resolve, reject) => {
            audioStream.on('data', (c) => chunks.push(c));
            audioStream.on('end', resolve);
            audioStream.on('error', reject);
          });

          const buf = Buffer.concat(chunks);
          try { tts.close(); } catch (_) {}

          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Content-Length', buf.length);
          res.end(buf);
        } catch (err) {
          console.error('Local Edge TTS error:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'TTS error' }));
        }
      });
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), edgeNeuralTtsPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true
  }
})
