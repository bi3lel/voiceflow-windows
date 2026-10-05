const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { resolvePath } = require('./config');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function serverArgs(model, port, cpu, prefix) {
  return ['-m', model, '-l','auto','--host','127.0.0.1','--port',String(port), '--request-path',prefix,
    '-nt', ...(cpu ? ['-ng'] : [])];
}
function inferenceFields(language) {
  return { language: language || 'auto', translate: 'false', detect_language: 'false', response_format:'json',
    no_timestamps:'true', token_timestamps:'false' };
}
async function freePort() {
  return new Promise((resolve,reject) => {
    const server = net.createServer(); server.on('error',reject);
    server.listen(0,'127.0.0.1',() => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}
class Engine {
  constructor(root, temp, notify = () => {}, adapter = null) {
    this.adapter=adapter;
    this.root = root; this.temp = temp; this.notify = notify;
    this.proc = null; this.loading = null; this.info = { loaded: false, backend: adapter?.name || 'whisper.cpp v1.9.4', device: 'unloaded' };
  }
  async ensure(config, signal) {
    const key = JSON.stringify([config.whisperBin,config.whisperCpuBin,config.whisperModel,config.device]);
    if (this.proc && this.key === key && this.info.loaded) return;
    if (this.loading) await this.loading;
    signal.throwIfAborted();
    if (this.proc && this.key === key && this.info.loaded) return;
    await this.unload(); this.key = key;
    this.loading = this.start(config, signal);
    try { await this.loading; } finally { this.loading = null; }
  }
  async start(config, signal) {
    const model = resolvePath(config.whisperModel,this.root);
    await fs.access(model);
    if (/\.en(?:-|\.)/.test(path.basename(model))) throw Error('Use a multilingual model for EN/PT/FR');
    let cpu = config.device === 'cpu';
    try { await this.launch(config, model, cpu, signal); }
    catch (error) {
      await this.unload();
      if (signal.aborted || config.device !== 'auto') throw error;
      cpu = true;
      this.info.fallback = `GPU startup failed; CPU retry: ${error.message}`;
      this.notify(this.info);
      await this.launch(config, model, cpu, signal);
    }
  }
  async launch(config, model, cpu, signal) {
    const bin = resolvePath(cpu ? config.whisperCpuBin : config.whisperBin, this.root);
    await fs.access(bin); await fs.mkdir(this.temp,{recursive:true});
    const port = await freePort();
    const prefix = '/' + require('node:crypto').randomUUID();
    this.url = `http://127.0.0.1:${port}${this.adapter?'':prefix}`;
    this.headers=this.adapter?{Authorization:'Bearer '+prefix.slice(1)}:{};
    let logs = '', failure;
    const began = performance.now();
    const args=this.adapter?this.adapter.serverArgs(model,port,cpu):serverArgs(model,port,cpu,prefix);
    const env=this.adapter?{...process.env,NEMO_SPEECH_HTTP_API_KEY:prefix.slice(1)}:process.env;
    const p = spawn(bin,args,{ cwd: this.temp,env, windowsHide:true, stdio:['ignore','pipe','pipe'] });
    this.proc = p;
    const append = b => { logs = (logs + b.toString()).slice(-24000); this.info.log = logs; };
    p.stdout.on('data',append); p.stderr.on('data',append);
    p.on('error',e => { failure = e; });
    p.once('close',code => {
      failure ||= Error(`Speech server exited (${code}): ${logs.slice(-4000)}`);
      if (this.proc === p) { this.proc = null; this.info.loaded = false; this.info.device = 'unloaded'; this.notify(this.info); }
    });
    const abort = () => p.kill();
    signal.addEventListener('abort',abort,{once:true});
    try {
      while (performance.now() - began < 180000) {
        signal.throwIfAborted(); if (failure) throw failure;
        try {
          const response = await fetch(this.url + (this.adapter?'/ready':'/health'), { signal: AbortSignal.timeout(750) });
          const health = await response.json();
          if (response.ok && (this.adapter?health.ready===true:health.status === 'ok')) {
            if (failure || this.proc !== p) throw failure || Error('Server stopped');
            this.info = { ...this.info, loaded:true, model, modelLoadMs: performance.now()-began,
              device: cpu ? (this.adapter?'CPU (explicit GPU index -1)':'CPU (explicit -ng)') : (/CUDA\d* (?:model |compute )?buffer|using CUDA|CUDA backend|backend=CUDA\d|ggml_cuda_init: found/i.test(logs) ? 'CUDA (backend log confirmed)' : 'GPU requested; inspect backend log'), log:logs };
            this.notify(this.info); return;
          }
        } catch (e) { if (signal.aborted) throw e; }
        await sleep(150);
      }
      throw Error(`Model loading timed out: ${logs.slice(-4000)}`);
    } finally { signal.removeEventListener('abort',abort); }
  }
  async transcribe(file, config, signal) {
    const loadingBegan = performance.now();
    await this.ensure(config,signal);
    const loadWaitMs = performance.now() - loadingBegan;
    signal.throwIfAborted();
    const began = performance.now();
    const form = new FormData();
    form.set('file',new Blob([await fs.readFile(file)],{type:'audio/wav'}),'audio.wav');
    for (const [k,v] of Object.entries(this.adapter?this.adapter.inferenceFields(config.language):inferenceFields(config.language))) form.set(k,v);
    try {
      const response = await fetch(this.url + (this.adapter?'/v1/audio/transcriptions':'/inference'),{method:'POST',body:form,headers:this.headers,
        signal:AbortSignal.any([signal,AbortSignal.timeout(180000)])});
      if (!response.ok) throw Error(`${this.adapter?'Parakeet':'Whisper'} HTTP ${response.status}: ${await response.text()}`);
      const result = await response.json();
      if (typeof result.text !== 'string') throw Error('Invalid speech engine response');
      return { text:result.text, segments:result.segments, metrics:{ transcriptionMs:performance.now()-began, loadWaitMs, modelLoadMs:this.info.modelLoadMs, device:this.info.device,backend:this.info.backend } };
    } catch (e) {
      const log = this.info.log || '';
      await this.unload();
      if (!signal.aborted && config.device === 'auto' && /out of memory|cuda.*(?:error|failed)|alloc.*failed/i.test(log + e.message)) {
        this.info.fallback = 'GPU inference failed; retried on CPU';
        return this.transcribe(file,{...config,device:'cpu'},signal);
      }
      throw Error(`Transcription failed: ${e.message}. Raw audio cleaned up; retry or choose CPU in Settings.`);
    }
  }
  async warm(config, signal) {
    await this.ensure(config, signal);
    const file = path.join(this.temp, 'warm-' + require('node:crypto').randomUUID() + '.wav');
    const wav = Buffer.alloc(44 + 32000);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8);
    wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
    wav.writeUInt32LE(16000,24); wav.writeUInt32LE(32000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
    wav.write('data',36); wav.writeUInt32LE(32000,40);
    await fs.writeFile(file,wav);
    try {
      const started = performance.now();
      await this.transcribe(file,{...config,language:'en'},signal);
      this.info.warmupMs = performance.now()-started; this.notify(this.info); return this.info;
    } finally { await fs.unlink(file).catch(()=>{}); }
  }
  async unload() {
    const p = this.proc;
    if (p) {
      await new Promise(resolve => {
        if (p.exitCode !== null || p.signalCode !== null) return resolve();
        p.once('close',resolve); p.kill();
      });
      if (this.proc === p) this.proc = null;
    }
    this.info.loaded = false; this.info.device = 'unloaded'; this.notify(this.info);
  }
}
module.exports = { Engine, serverArgs, inferenceFields };
