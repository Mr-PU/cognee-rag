import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const C = {
  bg:      '#0a0a0f',
  surface: '#11111a',
  panel:   '#16161f',
  border:  '#2a2a3a',
  accent:  '#7c5cfc',
  accent2: '#00e5c0',
  text:    '#e8e8f0',
  muted:   '#6b6b80',
  error:   '#ff4d6d',
  success: '#00e5c0',
};

// ─── Provider presets ────────────────────────────────────────────────────────
const PROVIDERS = {
  ollama: {
    label: 'Ollama (Local)',
    llm_base_url: 'http://ollama:11434/v1',
    embedding_base_url: 'http://ollama:11434/api/embed',
    api_key: 'ollama',
    needsKey: false,
    separateEmbedProvider: false,
    embedding_dimensions: 768,
    llm_models: [],           // loaded live from /models
    embedding_models: [],     // loaded live from /models
  },
  openai: {
    label: 'OpenAI',
    llm_base_url: 'https://api.openai.com/v1',
    embedding_base_url: 'https://api.openai.com/v1',
    api_key: '',
    needsKey: true,
    separateEmbedProvider: false,
    embedding_dimensions: 1536,
    llm_models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    embedding_models: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
  },
  gemini: {
    label: 'Google Gemini',
    llm_base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    embedding_base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    api_key: '',
    needsKey: true,
    separateEmbedProvider: false,
    embedding_dimensions: 768,
    llm_models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'],
    embedding_models: ['text-embedding-004'],
  },
  groq: {
    label: 'Groq',
    llm_base_url: 'https://api.groq.com/openai/v1',
    embedding_base_url: 'https://api.openai.com/v1',
    api_key: '',
    needsKey: true,
    separateEmbedProvider: true,
    embedding_dimensions: 1536,
    llm_models: ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    embedding_models: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
  },
  together: {
    label: 'Together AI',
    llm_base_url: 'https://api.together.xyz/v1',
    embedding_base_url: 'https://api.together.xyz/v1',
    api_key: '',
    needsKey: true,
    separateEmbedProvider: false,
    embedding_dimensions: 768,
    llm_models: ['meta-llama/Llama-3-70b-chat-hf', 'meta-llama/Llama-3-8b-chat-hf', 'Qwen/Qwen2.5-72B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
    embedding_models: ['togethercomputer/m2-bert-80M-8k-retrieval', 'BAAI/bge-large-en-v1.5'],
  },
  anthropic: {
    label: 'Anthropic',
    llm_base_url: 'https://api.anthropic.com',
    embedding_base_url: 'https://api.openai.com/v1',
    api_key: '',
    needsKey: true,
    separateEmbedProvider: true,
    embedding_dimensions: 1536,
    llm_models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229'],
    embedding_models: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
  },
  custom: {
    label: 'Custom (OpenAI-compatible)',
    llm_base_url: '',
    embedding_base_url: '',
    api_key: '',
    needsKey: true,
    separateEmbedProvider: false,
    embedding_dimensions: 768,
    llm_models: [],
    embedding_models: [],
  },
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; color: ${C.text}; font-family: 'Syne', sans-serif; height: 100vh; overflow: hidden; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: ${C.surface}; }
  ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }

  .app {
    display: grid;
    grid-template-columns: 360px 1fr;
    grid-template-rows: 56px 1fr;
    height: 100vh;
  }

  .header {
    grid-column: 1 / -1;
    background: ${C.surface};
    border-bottom: 1px solid ${C.border};
    display: flex;
    align-items: center;
    padding: 0 24px;
    gap: 16px;
  }
  .header-logo { font-family: 'Space Mono', monospace; font-size: 13px; font-weight: 700; letter-spacing: .12em; color: ${C.accent}; text-transform: uppercase; }
  .header-sep { width: 1px; height: 24px; background: ${C.border}; }
  .header-title { font-size: 13px; color: ${C.muted}; letter-spacing: .05em; }
  .header-status { margin-left: auto; display: flex; align-items: center; gap: 8px; font-family: 'Space Mono', monospace; font-size: 11px; color: ${C.muted}; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: ${C.muted}; transition: background .4s; }
  .dot.online { background: ${C.accent2}; box-shadow: 0 0 6px ${C.accent2}; }

  .sidebar {
    background: ${C.panel};
    border-right: 1px solid ${C.border};
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .sidebar-section { padding: 16px 20px; border-bottom: 1px solid ${C.border}; }
  .section-label { font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: ${C.muted}; margin-bottom: 10px; }

  .field { margin-bottom: 10px; }
  .field:last-child { margin-bottom: 0; }
  .field-label { font-family: 'Space Mono', monospace; font-size: 10px; color: ${C.muted}; margin-bottom: 5px; letter-spacing: .08em; text-transform: uppercase; }

  .input, .select {
    width: 100%;
    background: ${C.surface};
    border: 1px solid ${C.border};
    color: ${C.text};
    font-family: 'Space Mono', monospace;
    font-size: 12px;
    padding: 8px 10px;
    border-radius: 6px;
    outline: none;
    transition: border-color .2s;
  }
  .input:focus, .select:focus { border-color: ${C.accent}; }
  .input.password { letter-spacing: .1em; }
  .input[disabled], .select[disabled] { opacity: 0.45; cursor: not-allowed; }

  .connect-row { display: flex; gap: 8px; align-items: center; margin-top: 12px; }
  .connect-status { font-family: 'Space Mono', monospace; font-size: 10px; flex: 1; }
  .connect-status.ok { color: ${C.accent2}; }
  .connect-status.err { color: ${C.error}; }

  .upload-zone {
    border: 1px dashed ${C.border};
    border-radius: 8px;
    padding: 18px 16px;
    text-align: center;
    cursor: pointer;
    transition: all .2s;
    position: relative;
    overflow: hidden;
  }
  .upload-zone:hover, .upload-zone.drag { border-color: ${C.accent}; background: rgba(124,92,252,.05); }
  .upload-zone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .upload-icon { font-size: 22px; margin-bottom: 6px; }
  .upload-text { font-size: 12px; color: ${C.muted}; line-height: 1.5; }
  .upload-text span { color: ${C.accent}; }

  .file-list { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
  .file-item { display: flex; align-items: center; gap: 8px; background: ${C.surface}; border: 1px solid ${C.border}; border-radius: 6px; padding: 7px 10px; font-size: 12px; }
  .file-item .fname { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-badge { font-family: 'Space Mono', monospace; font-size: 10px; padding: 2px 6px; border-radius: 3px; background: rgba(0,229,192,.12); color: ${C.accent2}; }
  .file-badge.loading { background: rgba(124,92,252,.15); color: ${C.accent}; animation: pulse 1.2s ease-in-out infinite; }
  .file-badge.error { background: rgba(255,77,109,.12); color: ${C.error}; }

  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-family: 'Syne', sans-serif; font-weight: 600; font-size: 12px; letter-spacing: .06em; padding: 8px 14px; border-radius: 6px; border: none; cursor: pointer; transition: all .18s; text-transform: uppercase; }
  .btn-primary { background: ${C.accent}; color: #fff; }
  .btn-primary:hover { background: #9070ff; transform: translateY(-1px); }
  .btn-ghost { background: transparent; color: ${C.muted}; border: 1px solid ${C.border}; }
  .btn-ghost:hover { color: ${C.text}; border-color: ${C.muted}; }
  .btn:disabled { opacity: .4; cursor: not-allowed; transform: none !important; }

  .graph-actions { display: flex; gap: 8px; }
  .note { font-size: 11px; color: ${C.muted}; margin-top: 6px; line-height: 1.5; font-family: 'Space Mono', monospace; }

  .main { display: grid; grid-template-rows: 1fr 340px; overflow: hidden; }

  .graph-panel { background: ${C.surface}; border-bottom: 1px solid ${C.border}; position: relative; overflow: hidden; }
  .panel-header { position: absolute; top: 0; left: 0; right: 0; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; z-index: 5; background: linear-gradient(to bottom, ${C.surface} 60%, transparent); }
  .panel-title { font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: ${C.muted}; }
  .graph-stats { font-family: 'Space Mono', monospace; font-size: 10px; color: ${C.muted}; }
  .graph-stats span { color: ${C.accent2}; }
  .graph-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: ${C.muted}; font-size: 13px; }
  .graph-empty-icon { font-size: 32px; opacity: .3; }

  .chat-panel { display: flex; flex-direction: column; overflow: hidden; background: ${C.bg}; }
  .chat-header { padding: 10px 20px; border-bottom: 1px solid ${C.border}; background: ${C.surface}; }
  .chat-messages { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
  .msg { display: flex; gap: 10px; animation: fadeUp .2s ease-out both; }
  .msg.user { flex-direction: row-reverse; }
  .msg-avatar { width: 28px; height: 28px; border-radius: 6px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
  .msg.user .msg-avatar { background: ${C.accent}; color: #fff; }
  .msg.assistant .msg-avatar { background: rgba(0,229,192,.15); color: ${C.accent2}; }
  .msg-bubble { max-width: 78%; padding: 10px 14px; border-radius: 10px; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
  .msg.user .msg-bubble { background: ${C.accent}; color: #fff; border-bottom-right-radius: 3px; }
  .msg.assistant .msg-bubble { background: ${C.panel}; border: 1px solid ${C.border}; color: ${C.text}; border-bottom-left-radius: 3px; }
  .msg-thinking { display: flex; gap: 4px; align-items: center; padding: 12px 14px; }
  .msg-thinking span { width: 6px; height: 6px; border-radius: 50%; background: ${C.muted}; animation: bounce 1.2s ease-in-out infinite; }
  .msg-thinking span:nth-child(2) { animation-delay: .15s; }
  .msg-thinking span:nth-child(3) { animation-delay: .3s; }
  .chat-input-row { padding: 12px 20px; border-top: 1px solid ${C.border}; display: flex; gap: 10px; align-items: flex-end; background: ${C.surface}; }
  .chat-textarea { flex: 1; background: ${C.bg}; border: 1px solid ${C.border}; color: ${C.text}; font-family: 'Syne', sans-serif; font-size: 13px; padding: 10px 14px; border-radius: 8px; outline: none; resize: none; min-height: 42px; max-height: 120px; line-height: 1.5; transition: border-color .2s; }
  .chat-textarea:focus { border-color: ${C.accent}; }
  .chat-textarea::placeholder { color: ${C.muted}; }
  .send-btn { width: 42px; height: 42px; border-radius: 8px; background: ${C.accent}; border: none; color: #fff; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .18s; flex-shrink: 0; }
  .send-btn:hover { background: #9070ff; }
  .send-btn:disabled { opacity: .4; cursor: not-allowed; }

  .toast { position: fixed; bottom: 20px; right: 20px; background: ${C.panel}; border: 1px solid ${C.border}; border-left: 3px solid ${C.accent2}; color: ${C.text}; font-size: 13px; padding: 12px 18px; border-radius: 8px; z-index: 100; animation: slideIn .3s ease-out both; max-width: 320px; }
  .toast.error { border-left-color: ${C.error}; }

  @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes bounce { 0%,80%,100% { transform: scale(.7); opacity: .5; } 40% { transform: scale(1); opacity: 1; } }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
  @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
`;

// ─── Knowledge Graph ──────────────────────────────────────────────────────────
function KnowledgeGraph({ nodes, edges }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const simRef = useRef(null);

  const draw = useCallback((width, height) => {
    if (!svgRef.current || nodes.length === 0 || width === 0 || height === 0) return;
    const svg = d3.select(svgRef.current);
    svg.attr('width', width).attr('height', height);
    svg.selectAll('*').remove();
    const g = svg.append('g');
    svg.call(d3.zoom().scaleExtent([0.2, 4]).on('zoom', e => g.attr('transform', e.transform)));
    svg.append('defs').append('marker')
      .attr('id', 'arrow').attr('viewBox', '0 -5 10 10')
      .attr('refX', 22).attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', C.accent);

    const nodeMap = new Map(nodes.map(n => [n.id, { ...n, x: width / 2, y: height / 2 }]));
    const linkData = edges
      .map(e => ({ source: nodeMap.get(e.source), target: nodeMap.get(e.target), label: e.label }))
      .filter(e => e.source && e.target);

    const link = g.append('g').selectAll('line').data(linkData).join('line')
      .attr('stroke', '#2a2a4a').attr('stroke-width', 1.5).attr('marker-end', 'url(#arrow)');
    const edgeLabel = g.append('g').selectAll('text').data(linkData).join('text')
      .attr('font-family', 'Space Mono,monospace').attr('font-size', '9px')
      .attr('fill', C.muted).attr('text-anchor', 'middle').text(d => d.label || '');

    const colors = [C.accent, C.accent2, '#a855f7', '#f59e0b', '#ef4444'];
    const nodeG = g.append('g').selectAll('g').data([...nodeMap.values()]).join('g').attr('cursor', 'grab')
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) simRef.current?.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => { if (!e.active) simRef.current?.alphaTarget(0); d.fx = null; d.fy = null; }));

    nodeG.append('circle').attr('r', 14)
      .attr('fill', (_, i) => colors[i % colors.length]).attr('fill-opacity', 0.18)
      .attr('stroke', (_, i) => colors[i % colors.length]).attr('stroke-width', 1.5);
    nodeG.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em')
      .attr('font-family', 'Space Mono,monospace').attr('font-size', '8px').attr('fill', C.text)
      .text(d => (d.label || d.id).slice(0, 12));
    const nodeLabel = g.append('g').selectAll('text').data([...nodeMap.values()]).join('text')
      .attr('text-anchor', 'middle').attr('dy', '2.4em')
      .attr('font-family', 'Syne,sans-serif').attr('font-size', '10px').attr('fill', C.muted)
      .text(d => { const l = d.label || d.id; return l.length > 20 ? l.slice(0, 18) + '…' : l; });

    if (simRef.current) simRef.current.stop();
    const sim = d3.forceSimulation([...nodeMap.values()])
      .force('link', d3.forceLink(linkData).distance(120).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-280))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(35))
      .on('tick', () => {
        link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
        edgeLabel.attr('x', d => (d.source.x + d.target.x) / 2).attr('y', d => (d.source.y + d.target.y) / 2);
        nodeG.attr('transform', d => `translate(${d.x},${d.y})`);
        nodeLabel.attr('x', d => d.x).attr('y', d => d.y);
      });
    simRef.current = sim;
  }, [nodes, edges]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        draw(width, height);
      }
    });
    ro.observe(el);
    const { width, height } = el.getBoundingClientRect();
    if (width > 0 && height > 0) draw(width, height);
    return () => { ro.disconnect(); simRef.current?.stop(); };
  }, [draw]);

  if (nodes.length === 0) {
    return (
      <div className="graph-empty">
        <div className="graph-empty-icon">◈</div>
        <span>Upload a document to build the knowledge graph</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <svg ref={svgRef} style={{ display: 'block' }} />
    </div>
  );
}

// ─── Provider Config Panel ────────────────────────────────────────────────────
function ProviderConfig({ onConnected, showToast }) {
  const [provider, setProvider]   = useState('ollama');
  const [llmModel, setLlmModel]   = useState('');
  const [embedModel, setEmbedModel] = useState('');
  const [apiKey, setApiKey]       = useState('');
  const [embedApiKey, setEmbedApiKey] = useState('');
  const [llmUrl, setLlmUrl]       = useState(PROVIDERS.ollama.llm_base_url);
  const [embedUrl, setEmbedUrl]   = useState(PROVIDERS.ollama.embedding_base_url);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus]       = useState(null); // null | 'ok' | 'err'
  const [statusMsg, setStatusMsg] = useState('');
  const [showKey, setShowKey]     = useState(false);
  const [dims, setDims]           = useState(768);

  const preset = PROVIDERS[provider];

  // Fetch Ollama models
  useEffect(() => {
    fetch(`${API}/models`)
      .then(r => r.json())
      .then(d => setOllamaModels(d.ollama_models || []))
      .catch(() => {});
  }, []);

  // When provider changes, reset fields to preset defaults
  useEffect(() => {
    const p = PROVIDERS[provider];
    setLlmUrl(p.llm_base_url);
    setEmbedUrl(p.embedding_base_url);
    setApiKey(p.api_key || '');
    setEmbedApiKey('');
    setDims(p.embedding_dimensions);
    setStatus(null);
    // Set default model selections
    const llmList = provider === 'ollama' ? ollamaModels : p.llm_models;
    const embedList = provider === 'ollama' ? ollamaModels : p.embedding_models;
    setLlmModel(llmList[0] || '');
    setEmbedModel(embedList[0] || '');
  }, [provider]);

  // When ollama models load, set defaults if provider is ollama
  useEffect(() => {
    if (provider === 'ollama' && ollamaModels.length > 0) {
      if (!llmModel) setLlmModel(ollamaModels[0]);
      if (!embedModel) setEmbedModel(ollamaModels.find(m => m.includes('embed')) || ollamaModels[0]);
    }
  }, [ollamaModels]);

  const llmList   = provider === 'ollama' ? ollamaModels : preset.llm_models;
  const embedList = provider === 'ollama' ? ollamaModels : preset.embedding_models;

  const handleConnect = async () => {
    if (!llmModel || !embedModel) {
      setStatus('err'); setStatusMsg('Select both models'); return;
    }
    setConnecting(true); setStatus(null);
    try {
      const body = {
        provider,
        llm_model: llmModel,
        llm_base_url: llmUrl,
        api_key: apiKey,
        embedding_model: embedModel,
        embedding_base_url: embedUrl,
        embedding_api_key: preset.separateEmbedProvider ? embedApiKey : apiKey,
        embedding_provider: preset.separateEmbedProvider ? 'openai' : provider,
        embedding_dimensions: dims,
      };
      const r = await fetch(`${API}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      setStatus('ok');
      setStatusMsg(`${preset.label} · ${llmModel}`);
      onConnected({ provider, llmModel, embedModel });
      showToast(`Connected to ${preset.label} ✓`);
    } catch (e) {
      setStatus('err');
      setStatusMsg(e.message.slice(0, 60));
      showToast(`Connection failed: ${e.message}`, 'error');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="sidebar-section">
      <div className="section-label">Provider</div>

      {/* Provider selector */}
      <div className="field">
        <select className="select" value={provider} onChange={e => setProvider(e.target.value)}>
          {Object.entries(PROVIDERS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* API Key */}
      {preset.needsKey && (
        <div className="field">
          <div className="field-label">API Key</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="input password"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={provider === 'ollama' ? 'ollama' : 'sk-…'}
            />
            <button className="btn btn-ghost" style={{ padding: '0 10px', flexShrink: 0 }}
              onClick={() => setShowKey(v => !v)}>{showKey ? '🙈' : '👁'}</button>
          </div>
        </div>
      )}

      {/* Separate embedding API key (Groq, Anthropic) */}
      {preset.separateEmbedProvider && (
        <div className="field">
          <div className="field-label">OpenAI Key (embeddings)</div>
          <input className="input password" type={showKey ? 'text' : 'password'}
            value={embedApiKey} onChange={e => setEmbedApiKey(e.target.value)}
            placeholder="sk-… (for text-embedding-3-small)" />
        </div>
      )}

      {/* LLM Model */}
      <div className="field">
        <div className="field-label">LLM Model</div>
        {provider === 'custom' || llmList.length === 0 ? (
          <input className="input" value={llmModel} onChange={e => setLlmModel(e.target.value)}
            placeholder="e.g. gpt-4o-mini" />
        ) : (
          <select className="select" value={llmModel} onChange={e => setLlmModel(e.target.value)}>
            {llmList.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>

      {/* Embedding Model */}
      <div className="field">
        <div className="field-label">
          Embedding Model {preset.separateEmbedProvider && <span style={{ color: C.accent2 }}>(OpenAI)</span>}
        </div>
        {provider === 'custom' || embedList.length === 0 ? (
          <input className="input" value={embedModel} onChange={e => setEmbedModel(e.target.value)}
            placeholder="e.g. text-embedding-3-small" />
        ) : (
          <select className="select" value={embedModel} onChange={e => setEmbedModel(e.target.value)}>
            {embedList.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>

      {/* Base URLs (collapsed for non-custom, expandable) */}
      {provider === 'custom' && (
        <>
          <div className="field">
            <div className="field-label">LLM Base URL</div>
            <input className="input" value={llmUrl} onChange={e => setLlmUrl(e.target.value)}
              placeholder="https://your-api/v1" />
          </div>
          <div className="field">
            <div className="field-label">Embedding Base URL</div>
            <input className="input" value={embedUrl} onChange={e => setEmbedUrl(e.target.value)}
              placeholder="https://your-api/v1" />
          </div>
          <div className="field">
            <div className="field-label">Embedding Dimensions</div>
            <input className="input" type="number" value={dims} onChange={e => setDims(Number(e.target.value))}
              placeholder="768" />
          </div>
        </>
      )}

      {/* Connect button + status */}
      <div className="connect-row">
        <button className="btn btn-primary" style={{ flex: 1 }}
          onClick={handleConnect} disabled={connecting}>
          {connecting ? '…' : status === 'ok' ? '✓ Connected' : '⚡ Connect'}
        </button>
      </div>
      {status && (
        <div className={`connect-status ${status}`} style={{ marginTop: 6 }}>
          {status === 'ok' ? '✓ ' : '✗ '}{statusMsg}
        </div>
      )}
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hello! Configure your AI provider above, upload a document, then ask me anything about it." }
  ]);
  const [input, setInput]         = useState('');
  const [thinking, setThinking]   = useState(false);
  const [files, setFiles]         = useState([]);
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [dataset, setDataset]     = useState('default');
  const [online, setOnline]       = useState(false);
  const [toast, setToast]         = useState(null);
  const [drag, setDrag]           = useState(false);
  const [activeProvider, setActiveProvider] = useState(null);
  const chatEndRef  = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const showToast = useCallback((msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    const check = async () => {
      try { const r = await fetch(`${API}/health`); setOnline(r.ok); }
      catch { setOnline(false); }
    };
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, []);

  const fetchGraph = useCallback(async () => {
    setLoadingGraph(true);
    try {
      const r = await fetch(`${API}/graph?dataset=${encodeURIComponent(dataset)}`);
      const data = await r.json();
      // Sanitize nodes and edges: backend may return stringified tuples like "(id, {...})".
      const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      const nameRe = /name'\s*:\s*'([^']+)'|\"name\"\s*:\s*\"([^\"]+)\"/i;
      const normalizeId = value => {
        const str = String(value ?? '');
        const match = str.match(uuidRe);
        return match ? match[0] : str;
      };
      const normalizedLabel = (node, defaultId) => {
        let label = node?.label || node?.name || defaultId;
        if ((!label || String(label).trim() === '') && typeof node === 'string') {
          const nm = node.match(nameRe);
          if (nm) label = nm[1] || nm[2] || defaultId;
        }
        return String(label || defaultId).slice(0, 30);
      };

      const sanitizedNodes = (data.nodes || []).map(n => {
        try {
          const idStr = String(n?.id || n);
          const m = idStr.match(uuidRe);
          if (m) {
            const nid = m[0];
            return { id: nid, label: normalizedLabel(n, nid) };
          }
        } catch (e) { /* ignore */ }
        const nid = normalizeId(n?.id || n);
        return { id: nid, label: normalizedLabel(n, nid) };
      });

      const sanitizedEdges = (data.edges || []).map(e => {
        const sourceRaw = e?.source ?? e?.from ?? e?.source_node_id ?? (Array.isArray(e) ? e[0] : undefined);
        const targetRaw = e?.target ?? e?.to ?? e?.target_node_id ?? (Array.isArray(e) ? e[1] : undefined);
        const label = e?.label || e?.relationship_name || e?.type || (Array.isArray(e) ? e[2] : '');
        return {
          source: normalizeId(sourceRaw),
          target: normalizeId(targetRaw),
          label: String(label || '').slice(0, 30),
        };
      }).filter(e => e.source && e.target);

      setGraphData({ nodes: sanitizedNodes, edges: sanitizedEdges });
    } catch { showToast('Failed to load graph', 'error'); }
    finally { setLoadingGraph(false); }
  }, [dataset, showToast]);

  const handleUpload = useCallback(async (fileList) => {
    for (const file of fileList) {
      const id = Date.now() + Math.random();
      setFiles(f => [...f, { id, name: file.name, status: 'loading' }]);
      const form = new FormData();
      form.append('file', file);
      form.append('dataset', dataset);
      try {
        const r = await fetch(`${API}/upload`, { method: 'POST', body: form });
        if (!r.ok) throw new Error(await r.text());
        setFiles(f => f.map(x => x.id === id ? { ...x, status: 'done' } : x));
        showToast(`${file.name} ingested ✓`);
        await fetchGraph();
        setMessages(m => [...m, {
          role: 'assistant',
          text: `I've ingested "${file.name}" and built the knowledge graph. Ask me anything about it!`
        }]);
      } catch (e) {
        setFiles(f => f.map(x => x.id === id ? { ...x, status: 'error' } : x));
        showToast(`Failed: ${e.message}`, 'error');
      }
    }
  }, [dataset, fetchGraph, showToast]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setMessages(m => [...m, { role: 'user', text }]);
    setInput('');
    setThinking(true);
    try {
      const r = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, dataset }),
      });
      const data = await r.json();
      setMessages(m => [...m, { role: 'assistant', text: data.answer || 'No response.' }]);
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', text: `Error: ${e.message}` }]);
    } finally { setThinking(false); }
  }, [input, thinking, dataset]);

  const handleReset = async () => {
    if (!window.confirm('Clear all graph data?')) return;
    try {
      await fetch(`${API}/reset`, { method: 'DELETE' });
      setFiles([]);
      setGraphData({ nodes: [], edges: [] });
      setMessages([{ role: 'assistant', text: 'Knowledge graph cleared. Upload a new document to begin.' }]);
      showToast('Graph cleared');
    } catch { showToast('Reset failed', 'error'); }
  };

  return (
    <>
      <style>{css}</style>
      <div className="app">
        {/* Header */}
        <header className="header">
          <span className="header-logo">◈ Cognee</span>
          <div className="header-sep" />
          <span className="header-title">Knowledge Explorer</span>
          {activeProvider && (
            <>
              <div className="header-sep" />
              <span style={{ fontSize: 11, fontFamily: 'Space Mono,monospace', color: C.accent2 }}>
                {PROVIDERS[activeProvider.provider]?.label} · {activeProvider.llmModel}
              </span>
            </>
          )}
          <div className="header-status">
            <div className={`dot ${online ? 'online' : ''}`} />
            {online ? 'CONNECTED' : 'OFFLINE'}
          </div>
        </header>

        {/* Sidebar */}
        <aside className="sidebar">
          {/* Provider Config */}
          <ProviderConfig
            onConnected={cfg => setActiveProvider(cfg)}
            showToast={showToast}
          />

          {/* Dataset */}
          <div className="sidebar-section">
            <div className="section-label">Dataset</div>
            <input className="input" value={dataset}
              onChange={e => setDataset(e.target.value)} placeholder="dataset name" />
          </div>

          {/* Upload */}
          <div className="sidebar-section">
            <div className="section-label">Documents</div>
            <div className={`upload-zone ${drag ? 'drag' : ''}`}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); handleUpload([...e.dataTransfer.files]); }}>
              <input type="file" multiple accept=".txt,.pdf,.md,.csv"
                onChange={e => handleUpload([...e.target.files])} />
              <div className="upload-icon">⬆</div>
              <div className="upload-text">Drop files or <span>browse</span><br />.txt · .pdf · .md · .csv</div>
            </div>
            {files.length > 0 && (
              <div className="file-list">
                {files.map(f => (
                  <div key={f.id} className="file-item">
                    <span className="fname">{f.name}</span>
                    <span className={`file-badge ${f.status === 'loading' ? 'loading' : f.status === 'error' ? 'error' : ''}`}>
                      {f.status === 'loading' ? 'ingesting' : f.status === 'done' ? 'ready' : 'error'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Graph controls */}
          <div className="sidebar-section">
            <div className="section-label">Graph</div>
            <div className="graph-actions">
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={fetchGraph} disabled={loadingGraph}>
                {loadingGraph ? '…' : '↺ Refresh'}
              </button>
              <button className="btn btn-ghost" onClick={handleReset}>✕ Clear</button>
            </div>
          </div>

          <div style={{ flex: 1 }} />
          <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: 'Space Mono,monospace', lineHeight: 1.7 }}>
              Cognee · Local & Private<br />
              OpenAI-compatible APIs
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="main">
          <div className="graph-panel">
            <div className="panel-header">
              <span className="panel-title">Knowledge Graph</span>
              <span className="graph-stats">
                <span>{graphData.nodes.length}</span> nodes · <span>{graphData.edges.length}</span> edges
              </span>
            </div>
            <KnowledgeGraph nodes={graphData.nodes} edges={graphData.edges} />
          </div>

          <div className="chat-panel">
            <div className="chat-header">
              <span className="panel-title">Chat with your data</span>
            </div>
            <div className="chat-messages">
              {messages.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  <div className="msg-avatar">{m.role === 'user' ? 'U' : '◈'}</div>
                  <div className="msg-bubble">{m.text}</div>
                </div>
              ))}
              {thinking && (
                <div className="msg assistant">
                  <div className="msg-avatar">◈</div>
                  <div className="msg-bubble">
                    <div className="msg-thinking"><span /><span /><span /></div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="chat-input-row">
              <textarea className="chat-textarea" value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Ask anything about your documents…" rows={1} />
              <button className="send-btn" onClick={handleSend} disabled={!input.trim() || thinking}>➤</button>
            </div>
          </div>
        </main>
      </div>

      {toast && <div className={`toast ${toast.type === 'error' ? 'error' : ''}`}>{toast.msg}</div>}
    </>
  );
}
