"""Benchmark only: CT2 model directories are not GGML .bin files. No downloads here."""
import argparse,json,time,platform,subprocess,gc,unicodedata,re
from pathlib import Path
def tokens(t):return re.findall(r'\w+',unicodedata.normalize('NFC',t).lower())
def wer(ref,hyp):
 a,b=tokens(ref),tokens(hyp);row=list(range(len(b)+1))
 for i,x in enumerate(a,1):
  nxt=[i]
  for j,y in enumerate(b,1):nxt.append(min(nxt[-1]+1,row[j]+1,row[j-1]+(x!=y)))
  row=nxt
 return {'edits':row[-1],'words':len(a),'wer':row[-1]/max(1,len(a))}
def gpu():
 try:return subprocess.check_output(['nvidia-smi','--query-gpu=name,memory.used,memory.total,driver_version','--format=csv,noheader'],text=True).strip()
 except Exception as e:return str(e)
def main():
 p=argparse.ArgumentParser();p.add_argument('--model',required=True);p.add_argument('--corpus',required=True);p.add_argument('--output',required=True);args=p.parse_args()
 import ctranslate2
 from faster_whisper import WhisperModel
 corpusPath=Path(args.corpus);corpus=json.loads(corpusPath.read_text(encoding='utf8'))
 report={'platform':platform.platform(),'python':platform.python_version(),'ctranslate2':ctranslate2.__version__,'fasterWhisper':'1.2.1','model':args.model,'gpuBefore':gpu(),'results':[],'failures':[]}
 try:report['supportedComputeTypes']=sorted(ctranslate2.get_supported_compute_types('cuda'))
 except Exception as e:report['computeError']=str(e)
 for compute in ['float16','int8_float16']:
  model=None
  try:
   t=time.perf_counter();model=WhisperModel(args.model,device='cuda',compute_type=compute,local_files_only=True);loadMs=(time.perf_counter()-t)*1000
   report['results'].append({'compute':compute,'phase':'load','loadMs':loadMs,'gpu':gpu()})
   segments,_=model.transcribe(str(corpusPath.parent/corpus[0]['file']),language=corpus[0]['language'],task='transcribe',beam_size=1,vad_filter=False,condition_on_previous_text=False);list(segments)
   for clip in corpus:
    for rep in range(3):
     t=time.perf_counter();segments,info=model.transcribe(str(corpusPath.parent/clip['file']),language=clip['language'],task='transcribe',beam_size=1,vad_filter=False,condition_on_previous_text=False)
     text=''.join(s.text for s in segments);ms=(time.perf_counter()-t)*1000
     row={'compute':compute,'clip':clip['id'],'language':clip['language'],'repetition':rep,'transcript':text,'reference':clip['reference'],'transcriptionMs':ms,**wer(clip['reference'],text)}
     report['results'].append(row);print(compute,clip['id'],rep,round(ms,1),'ms',flush=True)
  except Exception as e:
   import traceback
   report['failures'].append({'compute':compute,'error':str(e),'traceback':traceback.format_exc()});print(compute,repr(e),flush=True)
  finally:
   if model is not None:del model
   gc.collect()
 report['gpuAfter']=gpu();Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
if __name__=='__main__':main()
