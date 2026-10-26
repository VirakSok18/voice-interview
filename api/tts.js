import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const BLOCKED_TTS_PATTERNS = [
  /\b(kill|killing|murder|assassinate|slaughter|bomb|explosive|terrorist|terrorism|massacre|torture|suicide|suicidal|self[\s-]*harm)\b/i,
  /\b(sex|sexual|porn|pornography|nsfw|nude|naked|erotic|fetish|orgasm|masturbat|prostitut|rape|molest|incest|pedophil|hentai|blowjob|handjob|penis|vagina|dildo)\b/i,
  /\b(cocaine|heroin|methamphetamine|fentanyl|human\s*trafficking|ransomware|child\s*abuse|nazi|white\s*supremac|racial\s*slur|nigger|faggot|fuck\s*you|motherfucker|cunt)\b/i
];

const SAFE_FALLBACK_TEXT =
  "I am strictly a professional job interview and career learning assistant. Let's return to practicing for your job interview.";

// Dedicated per-request MsEdgeTTS instance so parallel/consecutive requests NEVER collide or cut off mid-sentence!
async function synthesizeBuffer(text, voice) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text);
  const chunks = [];

  await new Promise((resolve, reject) => {
    audioStream.on('data', (chunk) => chunks.push(chunk));
    audioStream.on('end', resolve);
    audioStream.on('error', reject);
  });

  try {
    tts.close();
  } catch (_) {}

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
    let text = (req.body?.text || req.query?.text || '').toString().trim();
    const voice = (req.body?.voice || req.query?.voice || 'en-US-JennyNeural').toString();

    if (!text) {
      return res.status(400).json({ error: 'Missing text parameter' });
    }

    // Server-side voice safety guard: never synthesize harmful, explicit, or illegal text
    if (BLOCKED_TTS_PATTERNS.some(pattern => pattern.test(text))) {
      text = SAFE_FALLBACK_TEXT;
    }

    let audioBuffer;
    try {
      audioBuffer = await synthesizeBuffer(text, voice);
    } catch (_) {
      audioBuffer = await synthesizeBuffer(text, voice);
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(audioBuffer);
  } catch (err) {
    console.error('Edge Neural TTS error:', err);
    return res.status(500).json({ error: 'Failed to synthesize neural speech' });
  }
}
