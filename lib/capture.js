const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const { resolvePath } = require('./config');
function capture(file, config, signal, root, launch = spawn) {
  if (process.platform !== 'win32') throw Error('Microphone capture is implemented for Windows only');
  if (!config.micDevice) throw Error('Select a microphone in Settings');
  // DirectShow already supplies PCM format metadata. Avoid the default input
  // probe and large device buffers before delivering the first audio samples.
  const p = launch(resolvePath(config.ffmpegBin, root), ['-hide_banner','-y','-f','dshow',
    '-audio_buffer_size','50','-probesize','32','-analyzeduration','0','-i', `audio=${config.micDevice}`,
    '-ar','16000','-ac','1','-c:a','pcm_s16le','-stats_period','0.1','-progress','pipe:1', file], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
  let readyResolve, readyReject, doneResolve, doneReject, logs = '', progress = '', started = false, stopping = false, killTimer;
  const ready = new Promise((a,b) => { readyResolve = a; readyReject = b; });
  const done = new Promise((a,b) => { doneResolve = a; doneReject = b; });
  // Observe promises immediately: a process can exit before the caller awaits done.
  done.catch(() => {}); ready.catch(() => {});
  const startupTimer = setTimeout(() => { readyReject(Error(`Microphone startup timed out: ${logs}`)); cancel(); }, 10000);
  p.stderr.on('data', b => { logs = (logs + b.toString()).slice(-8000); });
  p.stdout.on('data', b => {
    progress = (progress + b.toString()).slice(-2000);
    if (!started && /out_time_us=[1-9]\d*/.test(progress)) { started = true; clearTimeout(startupTimer); readyResolve(); }
  });
  p.stdin.on('error', () => {});
  p.on('error', e => { readyReject(e); doneReject(e); });
  p.on('close', code => {
    clearTimeout(startupTimer); clearTimeout(killTimer); signal.removeEventListener('abort', cancel);
    if (!started) readyReject(Error(`Microphone did not capture audio: ${logs}`));
    if (code === 0 && stopping) doneResolve(); else doneReject(Error(`FFmpeg exited (${code}): ${logs}`));
  });
  function cancel() { if (p.exitCode === null) p.kill(); }
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  return { ready, done, cancel, stop() {
    if (stopping) return; stopping = true;
    p.stdin.end('q\n');
    killTimer = setTimeout(() => { doneReject(Error('FFmpeg finalization timed out')); cancel(); }, 5000);
  }};
}
async function inspectAudio(file) {
  const b = await fs.readFile(file);
  if (b.length < 44 || b.toString('ascii',0,4) !== 'RIFF' || b.toString('ascii',8,12) !== 'WAVE') throw Error('Invalid WAV capture');
  let data, format;
  for (let i = 12; i + 8 <= b.length;) {
    const size = b.readUInt32LE(i+4), type = b.toString('ascii',i,i+4);
    if (i + 8 + size > b.length) throw Error('WAV was not finalized');
    if (type === 'fmt ') format = b.subarray(i+8,i+8+size);
    if (type === 'data') data = b.subarray(i+8,i+8+size);
    i += 8 + size + (size % 2);
  }
  if (!format || format.length < 16 || format.readUInt16LE(0) !== 1 || format.readUInt16LE(2) !== 1 || format.readUInt32LE(4) !== 16000 || format.readUInt16LE(14) !== 16) throw Error('Expected 16 kHz mono PCM16 WAV');
  if (!data || data.length < 3200) throw Error('Recording is too short');
  let sum = 0,peak=0; for (let i=0; i+1<data.length; i+=2) { const v=data.readInt16LE(i);sum += v ** 2;peak=Math.max(peak,Math.abs(v)); }
  return {durationSeconds:data.length/32000,rms:Math.sqrt(sum/(data.length/2)),peak};
}
async function validateAudio(file) {
 const stats=await inspectAudio(file);
 if(stats.rms<25) throw Error('Silence detected in microphone capture. Check its physical mute button and Windows input volume, then use Test microphone in Settings.');
 return stats;
}
module.exports = { capture, validateAudio, inspectAudio };
