const fs = require('node:fs');
const path = require('node:path');
const defaults = Object.freeze({
  whisperBin: 'runtime/whisper/whisper-server.exe', whisperCpuBin: 'runtime/whisper-cpu/whisper-server.exe',
  whisperModel: 'models/ggml-large-v3-turbo-q8_0.bin', ffmpegBin: 'runtime/ffmpeg/ffmpeg.exe',
  speechBackend:'whisper',parakeetBin:'runtime/parakeet/bin/nemo-speech.exe',parakeetCpuBin:'runtime/parakeet-cpu/bin/nemo-speech.exe',parakeetModel:'models/parakeet-tdt-0.6b-v3.q8_0.gguf',
  captureBackend:'auto',
  whistleModel:'models/whistle.cact',
  setupCompleted:false,
  language: 'auto', micDevice: '', hotkeyMode: 'hold', hotkey: 'F9',
  smartFormat: false, pasteMethod: 'sendkeys', useOllama: false,
  cleanupMode: 'punctuation', managedOllama: false, outputFormat: 'auto',
  ollamaModel: 'llama3.2', ollamaUrl: 'http://127.0.0.1:11434',
  editingBackend:'llamacpp',editingModel:'models/qwen2.5-3b-instruct-q4_k_m.gguf',
  autoHideDelay: 2000, startWithWindows: false, historyEnabled: true,
  device: 'auto', cleanupPrompt: 'Correct only obvious punctuation. Preserve the spoken language, meaning, names, numbers and negations. Do not add or remove information. Return only the text.'
});
function validate(input, base = defaults) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid settings');
  const out = { ...base };
  if(!('editingBackend' in input)&&input.useOllama&&input.managedOllama===false)out.editingBackend='ollama';
  for (const [k, v] of Object.entries(input)) {
    if (!(k in defaults)) continue;
    if (typeof v !== typeof defaults[k]) throw Error(`Invalid ${k}`);
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  if(['speakers','email','faq'].includes(out.outputFormat))out.outputFormat='auto'; // Preserve existing settings while retiring speaker mode.
  if(!['whisper','parakeet','whistle'].includes(out.speechBackend))throw Error('Invalid speech backend');
  if(out.speechBackend==='whistle'&&out.language==='pt')throw Error('Whistle does not support Portuguese. Choose Parakeet or Whisper.');
  if(!['auto','native','ffmpeg'].includes(out.captureBackend))throw Error('Invalid microphone backend');
  if(!['llamacpp','ollama'].includes(out.editingBackend))throw Error('Invalid text editor backend');
  for (const [key, allowed] of Object.entries({ outputFormat:['auto','plain','list'], cleanupMode:['punctuation','dictation'],language: ['auto','en','pt','fr','es','de'], hotkeyMode: ['hold','toggle'], hotkey: ['F8','F9','F10','F11','F12','Ctrl+Shift+Space'], device: ['auto','cuda','cpu'], pasteMethod: ['sendkeys','clipboard'] })) {
    if (!allowed.includes(out[key])) throw Error(`Invalid ${key}`);
  }
  if (!Number.isFinite(out.autoHideDelay) || out.autoHideDelay < 500 || out.autoHideDelay > 6000) throw Error('Invalid hide delay');
  const url = new URL(out.ollamaUrl);
  if (url.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw Error('Ollama must use a local HTTP address');
  return out;
}
function resolvePath(value, root) {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(root, value);
}
function roots({ packaged, execPath, appPath, portableDir, userData }) {
  const bundledRoot = portableDir || (packaged ? path.dirname(execPath) : appPath);
  const portable=!!portableDir||fs.existsSync(path.join(bundledRoot,'portable.flag'));
  return { bundledRoot,root:packaged&&!portable?path.join(userData,'offline'):bundledRoot,
    data:portable?path.join(bundledRoot,'data'):userData };
}
function startupSpec(packaged, execPath, appPath) {
  return { path: execPath, args: packaged ? [] : [appPath] };
}
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.new', JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(file + '.new', file);
}
function load(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}
module.exports = { defaults, validate, resolvePath, roots, startupSpec, atomicJson, load };
