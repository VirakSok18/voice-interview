import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

// Reuse a warm singleton WebSocket connection across serverless invocations for instant (<250ms) TTS
let sharedTts = null;
let currentVoice = null;

async function getReadyTts(voice) {
  if (!sharedTts || currentVoice !== voice) {
    sharedTts = new MsEdgeTTS();
    await sharedTts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    currentVoice = voice;
  }
  return sharedTts;
}

async function synthesizeBuffer(text, voice) {
  const tts = await getReadyTts(voice);
  const { audioStream } = tts.toStream(text);
  const chunks = [];

  await new Promise((resolve, reject) => {
    audioStream.on('data', (chunk) => chunks.push(chunk));
    audioStream.on('end', resolve);
    audioStream.on('error', reject);
  });

  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const text = (req.body?.text || req.query?.text || '').toString().trim();
    const voice = (req.body?.voice || req.query?.voice || 'en-US-AvaMultilingualNeural').toString();

    if (!text) {
      return res.status(400).json({ error: 'Missing text parameter' });
    }

    let audioBuffer;
    try {
      audioBuffer = await synthesizeBuffer(text, voice);
    } catch (_) {
      // Reconnect once if warm WebSocket closed
      sharedTts = null;
      audioBuffer = await synthesizeBuffer(text, voice);
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(audioBuffer);
  } catch (err) {
    console.error('Edge Neural TTS error:', err);
    sharedTts = null;
    return res.status(500).json({ error: 'Failed to synthesize neural speech' });
  }
}
