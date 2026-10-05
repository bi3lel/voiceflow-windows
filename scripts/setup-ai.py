"""Explicit online setup of the pinned optional portable AI. Runtime never downloads."""
import hashlib,json,shutil,urllib.request,zipfile,argparse
from pathlib import Path
root=Path(__file__).resolve().parents[1]
def download(url,dest,sha):
 dest.parent.mkdir(parents=True,exist_ok=True)
 if dest.exists():
  with dest.open('rb') as f:actual=hashlib.file_digest(f,'sha256').hexdigest()
  if actual!=sha:raise RuntimeError('Existing file preserved; checksum differs: '+str(dest))
  return
 part=dest.with_name(dest.name+'.partial')
 with urllib.request.urlopen(url,timeout=120) as response,part.open('wb') as f:shutil.copyfileobj(response,f,1024*1024)
 with part.open('rb') as f:actual=hashlib.file_digest(f,'sha256').hexdigest()
 if actual!=sha:raise RuntimeError('Download checksum mismatch: '+str(part))
 part.rename(dest);print('Verified',dest.name,flush=True)
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--enable',action='store_true',help='Enable intelligent dictation in this portable installation');args=parser.parse_args()
 spec=json.loads((root/'ai-runtime-manifest.json').read_text(encoding='utf-8'));runtime=root/'runtime/ollama';stamp=runtime/'release.json'
 if runtime.exists():
  if not stamp.exists():raise RuntimeError('Existing Ollama folder preserved: no release stamp. Use a new installation folder.')
  if json.loads(stamp.read_text(encoding='utf-8')).get('sha256')!=spec['runtime']['sha256']:raise RuntimeError('Existing Ollama version preserved. Use a new installation folder.')
 else:
  archive=root/'setup-cache/ollama-windows-amd64.zip';download(spec['runtime']['url'],archive,spec['runtime']['sha256'])
  stage=root/'setup-cache/ollama-stage';stage.mkdir(parents=True,exist_ok=True)
  with zipfile.ZipFile(archive) as z:
   for name in z.namelist():
    if not (stage/name).resolve().is_relative_to(stage.resolve()):raise RuntimeError('Unsafe archive path')
   z.extractall(stage)
  if not (stage/'ollama.exe').is_file():raise RuntimeError('Runtime archive lacks ollama.exe')
  shutil.move(str(stage),str(runtime));stamp.write_text(json.dumps(spec['runtime'],indent=2)+'\n',encoding='utf-8')
 for blob in spec['model']['blobs']:
  dest=root/blob['file'];download(blob['url'],dest,blob['sha256'])
  if dest.stat().st_size!=blob['size']:raise RuntimeError('Model blob size differs')
 manifest=root/'models/ollama/manifests/registry.ollama.ai/library/qwen2.5/3b';download(spec['model']['manifestUrl'],manifest,spec['model']['manifestSha256'])
 if args.enable:
  file=root/'data/config.json';config=json.loads(file.read_text(encoding='utf-8-sig')) if file.exists() else {}
  config.update(useOllama=True,cleanupMode='dictation',managedOllama=True,ollamaModel=spec['model']['name'],cleanupPrompt='');file.parent.mkdir(parents=True,exist_ok=True)
  if file.exists():shutil.copyfile(file,file.with_suffix('.before-ai.json'))
  temp=file.with_suffix('.new');temp.write_text(json.dumps(config,indent=2)+'\n',encoding='utf-8');temp.replace(file)
 print('Local AI verified. Enable Smart dictation in Settings. No compiler/Python is needed at runtime.',flush=True)
if __name__=='__main__':main()
