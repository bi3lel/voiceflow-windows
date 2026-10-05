"""Explicit benchmark download only; never used by the dictation application.
Requires Python and pyarrow. Deletes parquet archives after extracting selected rows.
"""
import argparse,concurrent.futures,hashlib,json,subprocess,urllib.request,wave
from pathlib import Path
import pyarrow.parquet as pq
parser=argparse.ArgumentParser()
parser.add_argument('--ffmpeg',required=True,help='Path to the bundled ffmpeg.exe')
parser.add_argument('--out',default='benchmarks/large-corpus')
parser.add_argument('--offset',type=int,default=100)
parser.add_argument('--count',type=int,default=100)
args=parser.parse_args();root=Path(args.out).resolve();root.mkdir(parents=True,exist_ok=True)
if args.count<1 or args.offset<0:raise ValueError('Invalid sample count/offset')
with urllib.request.urlopen('https://datasets-server.huggingface.co/parquet?dataset=google/fleurs',timeout=120) as response:metadata=json.load(response)
def prepare(entry):
 config,language=entry;spec=next(s for s in metadata['parquet_files'] if s['config']==config and s['split']=='test')
 archive=root/(config+'.parquet');clips=[]
 try:
  with urllib.request.urlopen(spec['url'],timeout=120) as response,archive.open('wb') as file:
   while block:=response.read(1024*1024):file.write(block)
  if archive.stat().st_size!=spec['size']:raise ValueError('Incomplete dataset archive')
  parquet=pq.ParquetFile(archive);rows=[]
  try:
   position=0
   for batch in parquet.iter_batches(batch_size=100):
    data=batch.to_pylist()
    for index,row in enumerate(data,position):
     if args.offset<=index<args.offset+args.count:rows.append((index,row))
    position+=len(data)
    if position>=args.offset+args.count:break
   del batch
  finally:parquet.close()
  if len(rows)!=args.count:raise ValueError('Not enough test rows')
  for index,row in rows:
   name=f'{config}-{index}';source=root/(name+'.audio');destination=root/(name+'.wav')
   try:
    source.write_bytes(row['audio']['bytes'])
    subprocess.run([args.ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(source),'-ar','16000','-ac','1','-c:a','pcm_s16le',str(destination)],check=True)
   finally:source.unlink(missing_ok=True)
   with wave.open(str(destination),'rb') as audio:duration=audio.getnframes()/audio.getframerate()
   clips.append({'id':name,'file':destination.name,'language':language,'reference':row['raw_transcription'],'normalizedReference':row['transcription'],'durationSeconds':duration,'gender':row.get('gender'),
    'sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),'source':{'dataset':'google/fleurs','config':config,'split':'test','row':index,'license':'CC-BY-4.0','url':'https://huggingface.co/datasets/google/fleurs'}})
  print(config,len(clips),'recordings prepared',flush=True);return clips
 finally:archive.unlink(missing_ok=True)
clips=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for subset in pool.map(prepare,[('en_us','en'),('pt_br','pt'),('fr_fr','fr')]):clips.extend(subset)
(root/'corpus.json').write_text(json.dumps(clips,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
