const { execFile, spawn } = require('node:child_process');
const path = require('node:path');
const script = path.join(__dirname,'..','scripts','windows.ps1').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
let service,serial=0,pending=new Map();
function close() { service?.kill(); service=null; }
function serviceCall(action,args,signal) {
  signal?.throwIfAborted();
  if(!service) {
    const p=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Action','service'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    service=p;let output='',errors='';
    p.stdin.on('error',()=>{});p.stderr.on('data',b=>{errors=(errors+b.toString()).slice(-4000);});
    p.stdout.on('data',b=>{
      output+=b.toString();let i;
      while((i=output.indexOf('\n'))>=0){const line=output.slice(0,i);output=output.slice(i+1);try{const response=JSON.parse(line);const request=pending.get(response.id);if(request){pending.delete(response.id);response.error?request.reject(Error(response.error)):request.resolve(response.result);}}catch{}}
    });
    const failed=e=>{if(service===p)service=null;for(const [id,request] of pending){if(request.proc===p){pending.delete(id);request.reject(Error(e.message||errors||'Windows helper stopped'));}}};
    p.on('error',failed);p.on('close',()=>failed(Error(errors||'Windows helper exited')));
  }
  return new Promise((resolve,reject)=>{
    const id=++serial;
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('Windows helper timed out'));close();},15000);
    const abort=()=>{pending.delete(id);clearTimeout(timer);if(action==='paste')close();reject(Error('Insertion cancelled'));};
    const finish=fn=>value=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);fn(value);};
    pending.set(id,{proc:service,resolve:finish(resolve),reject:finish(reject)});signal?.addEventListener('abort',abort,{once:true});
    const payload={id,action};if(action==='paste'||action==='context'){payload.hwnd=args[1];payload.pid=args[3];}
    if(action==='capture-start'){payload.file=args[0];payload.device=args[1];}
    service.stdin.write(JSON.stringify(payload)+'\n');
  });
}
function call(action, args = [], signal) {
  if (process.platform !== 'win32') return Promise.reject(Error('Windows insertion only'));
  if(action!=='devices')return serviceCall(action,args,signal);
  return new Promise((resolve,reject) => {
    execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Action',action,...args],
      {windowsHide:true,timeout:15000,signal,encoding:'utf8'},(error,stdout,stderr) => {
        if (error) reject(Error(stderr.trim() || error.message));
        else { try { resolve(JSON.parse(stdout.replace(/^\uFEFF/, '').trim())); } catch { reject(Error('Invalid Windows helper response')); } }
      });
  });
}
async function snapshot(clipboard) {
  const items = await clipboard.read();
  const saved = [];
  for (const item of items) {
    const data = {};
    for (const type of item.types) data[type] = await item.getType(type);
    // Windows can expose an empty item when the clipboard has no supported
    // formats. ClipboardItem rejects an empty MIME dictionary.
    if (Object.keys(data).length) saved.push(clipboard.makeItem(data));
  }
  return saved;
}
async function restore(clipboard, saved) {
  if (saved.length) await clipboard.write(saved); else await clipboard.clear();
}
function insertionText(text) {
  // Whisper/cleanup return trimmed text. Leave a boundary for the next
  // dictation without changing the original or formatted history entries.
  if (!text || /\s$/u.test(text)) return text;
  const structured = text.includes('\n') || /^\s*(?:[-*•]|\d+[.)])\s/u.test(text);
  return text + (structured ? '\n' : ' ');
}
function withLeadingBoundary(text, context) {
  // Inspect the current caret rather than assuming the last trailing space survived.
  // Empty fields and selected text must retain ordinary replacement semantics.
  if (!context?.known || context.selected || !context.preceding || !text || /^\s/u.test(text)) return text;
  const structured = text.includes('\n') || /^\s*(?:[-*•]|\d+[.)])\s/u.test(text);
  if (structured) return /[\r\n]$/u.test(context.preceding) ? text : '\n' + text;
  return /\s$/u.test(context.preceding) ? text : ' ' + text;
}
async function insert(text,target,config,signal,clipboard,helper = call) {
  signal.throwIfAborted();
  text = insertionText(text);
  if (config.pasteMethod === 'clipboard') { await clipboard.writeText(text); return 'copied'; }
  if (!target || !target.hwnd) throw Error('No target window. Use Copy last transcript.');
  const context = await helper('context',['-Hwnd',String(target.hwnd),'-TargetPid',String(target.pid)],signal).catch(() => null);
  text = withLeadingBoundary(text,context);
  const before = await helper('sequence',[],signal);
  const saved = await snapshot(clipboard);
  if(await helper('sequence',[],signal) !== before) throw Error('Clipboard changed during preparation; use Copy last transcript');
  // Recheck both HWND and foreground PID inside the helper immediately before SendInput.
  signal.throwIfAborted();
  await clipboard.writeText(text);
  let written;
  try {
    written = await helper('sequence',[],signal);
    const result = await helper('paste',['-Hwnd',String(target.hwnd),'-TargetPid',String(target.pid)],signal);
    if (!result.accepted) throw Error('Windows rejected paste; use Copy last transcript');
    // SendInput cannot acknowledge consumption by arbitrary applications. UI says "Paste sent".
    return 'paste-sent';
  } finally {
    const current = await helper('sequence').catch(() => null);
    // Never replace a newer clipboard written by the user or another application.
    if (written && current === written && await clipboard.readText() === text) await restore(clipboard,saved);
  }
}
module.exports = { call, close, insert, snapshot, restore, insertionText, withLeadingBoundary };
