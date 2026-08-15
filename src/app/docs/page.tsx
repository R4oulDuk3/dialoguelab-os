import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Guides · Dialogue Lab", description: "Set up voices, characters, dialogue projects, and MCP." };

export default function DocsPage() {
  return <main className="docs-page">
    <nav className="docs-nav"><Link href="/projects">← Back to Dialogue Lab</Link><span>Help &amp; guides</span></nav>
    <header className="docs-hero"><p>Dialogue Lab documentation</p><h1>From first launch to a rendered conversation</h1><span>Dialogue Lab is local-first. A supported cloud provider is required for voice generation; projects and generated assets remain in your private app-data directory.</span><div className="docs-recommendation"><strong>Highly recommended</strong><p>Use Dialogue Lab together with Codex or Claude Code. Review and fine-tune visually in the app while an MCP-connected agent authors, revises, and renders your projects.</p><Link href="/docs/mcp">Set up the MCP server →</Link></div></header>
    <div className="docs-layout">
      <aside><a href="#getting-started">Getting started</a><a href="#voices">Voice providers</a><a href="#characters">Characters</a><a href="#dialogue">Dialogue editing</a><Link href="/docs/mcp">MCP setup guide</Link><a href="#privacy">Privacy &amp; backups</a><a href="#roadmap">Roadmap</a></aside>
      <article>
        <section id="getting-started"><h2>Getting started</h2><ol><li>Install Node.js 22.13+, FFmpeg, and ffprobe.</li><li>Run <code>npm ci</code>, then <code>npm run doctor</code>.</li><li>Run <code>npm run dev</code> and open <code>http://127.0.0.1:3000</code>.</li><li>Connect at least one voice provider when prompted.</li></ol><p>Python is optional and is only needed for the current local faster-whisper subtitle engine.</p></section>
        <section id="voices"><h2>Voice providers</h2><p>Open Settings and connect ElevenLabs, MiniMax, or Fish Audio. Dialogue Lab validates the key, encrypts it locally, and never returns the full key to the browser or MCP client.</p><p>Link an existing provider voice first. Voice cloning and Voice Design are advanced options. Only clone a voice when its speaker has authorized the use.</p></section>
        <section id="characters"><h2>Characters</h2><p>A character combines a local voice with one or more visual poses. Use consistent transparent PNG or WebP images, name each pose clearly, and select the voice that should speak its lines. Character artwork is private user data and is never part of the repository.</p></section>
        <section id="dialogue"><h2>Dialogue editing</h2><p>Each dialogue line links a character pose, generated speech, captions, and timing. In Flow mode, clips follow one another automatically. In Manual mode, a complete dialogue clip can be moved or trimmed as a synchronized group. Generate speech after the text and assigned voice are final, then review caption words before rendering.</p></section>
        <section id="mcp"><h2>Connect Codex or Claude Code</h2><p>Dialogue Lab is designed to work especially well with an MCP-connected coding agent. After the npm package is published, register <code>npx -y dialoguelab-mcp</code> as a local stdio server. From a checkout, run <code>npm run build:mcp</code> and point the client at <code>packages/dialoguelab-mcp/dist/cli.js</code>.</p><p>The app and MCP package use the same OS app-data directory by default. Set <code>DIALOGUELAB_DATA_DIR</code> on both when using a custom profile.</p><p><Link href="/docs/mcp">Open the complete MCP setup guide →</Link></p></section>
        <section id="privacy"><h2>Privacy and backups</h2><p>Never commit the app-data directory, SQLite files, master key, provider credentials, uploads, generated audio, or renders. Stop Dialogue Lab before backup or restore.</p><pre><code>npm run data:backup -- --output C:/safe/dialoguelab-backup{`\n`}npm run data:restore -- --from C:/safe/dialoguelab-backup --force</code></pre><p>The backup contains the encryption key and should be protected like the provider credentials it can decrypt.</p></section>
        <section id="roadmap"><h2>Roadmap</h2><p>Reddit Story and Text Story projects remain experimental and are hidden from normal creation flows. They can be enabled for development with <code>DIALOGUELAB_ENABLE_EXPERIMENTAL_PROJECTS=1</code>.</p></section>
      </article>
    </div>
  </main>;
}
