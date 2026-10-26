# Voice Interview AI

A minimalist, fluid, zero-backend AI voice interview simulator built with Three.js and Apple Human Interface Design principles.

## Features

- **100% Frontend Architecture**: Runs entirely within modern client browsers using Web Audio API and Web Speech API. Zero backend hosting or database required.
- **Topological Wireframe Mesh Orb**: 3D interactive sphere built in Three.js with Simplex noise displacement, dual wireframe contours, ambient floating particle cloud, and mouse parallax interaction.
- **Apple Fluid Design System**: Translucent frosted glass materials (`backdrop-filter: blur(28px) saturate(190%)`), hairline top edge lighting, SF Pro typography hierarchy, and critically damped spring transitions.
- **Instant Mid-Sentence Barge-In**: Real-time microphone amplitude analysis cuts off speech synthesis immediately when the candidate begins speaking, replicating natural human conversational turn-taking.
- **Built-in Intelligent Interview Engine**: Multi-stage technical interview workflows covering Full-Stack, Java & Spring Boot, Frontend Architecture, Mobile Development, and Distributed Systems with automated keyword depth evaluation.
- **Optional Neural Streaming**: Supports direct client-side Groq API integration for Llama 3.3 streaming with sub-300ms time-to-first-token.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Create production build
npm run build
```

## Tech Stack

- React 19
- Vite
- Three.js
- Tailwind CSS v4
- Web Audio API (AnalyserNode + RMS detection)
- Web Speech API (SpeechRecognition + SpeechSynthesis)
