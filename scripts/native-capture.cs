using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// The already-running helper owns the device only during a recording.
public static class VFMicrophone {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct CAPS {
  public ushort manufacturer,product;public uint version;
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)] public string name;
  public uint formats;public ushort channels,reserved;
 }
 [StructLayout(LayoutKind.Sequential,Pack=2)] struct FORMAT {
  public ushort tag,channels;public uint rate,average;public ushort align,bits,extra;
 }
 [StructLayout(LayoutKind.Sequential)] struct HEADER {
  public IntPtr data;public uint length,recorded;public UIntPtr user;
  public uint flags,loops;public IntPtr next;public UIntPtr reserved;
 }
 [DllImport("winmm.dll")] static extern uint waveInGetNumDevs();
 [DllImport("winmm.dll",CharSet=CharSet.Unicode)] static extern uint waveInGetDevCapsW(UIntPtr id,out CAPS caps,uint size);
 [DllImport("winmm.dll")] static extern uint waveInOpen(out IntPtr device,uint id,ref FORMAT format,UIntPtr callback,UIntPtr instance,uint flags);
 [DllImport("winmm.dll")] static extern uint waveInPrepareHeader(IntPtr device,IntPtr header,uint size);
 [DllImport("winmm.dll")] static extern uint waveInUnprepareHeader(IntPtr device,IntPtr header,uint size);
 [DllImport("winmm.dll")] static extern uint waveInAddBuffer(IntPtr device,IntPtr header,uint size);
 [DllImport("winmm.dll")] static extern uint waveInStart(IntPtr device);
 [DllImport("winmm.dll")] static extern uint waveInStop(IntPtr device);
 [DllImport("winmm.dll")] static extern uint waveInReset(IntPtr device);
 [DllImport("winmm.dll")] static extern uint waveInClose(IntPtr device);
 static Recording active;
 public static string[] Devices(){
  var names=new System.Collections.Generic.List<string>();
  for(uint i=0;i<waveInGetNumDevs();i++){
   CAPS c;Check(waveInGetDevCapsW(new UIntPtr(i),out c,(uint)Marshal.SizeOf(typeof(CAPS))),"Microphone enumeration");
   if(!names.Contains(c.name))names.Add(c.name);
  }
  return names.ToArray();
 }
 static void Check(uint code,string operation){if(code!=0)throw new IOException(operation+" failed (Windows audio code "+code+")");}
 static uint Device(string name) {
  uint? match=null;
  for(uint i=0;i<waveInGetNumDevs();i++) {
   CAPS c;Check(waveInGetDevCapsW(new UIntPtr(i),out c,(uint)Marshal.SizeOf(typeof(CAPS))),"Microphone enumeration");
   if(String.Equals(c.name,name,StringComparison.OrdinalIgnoreCase))return i;
   if(c.name.Length==31 && name.StartsWith(c.name,StringComparison.OrdinalIgnoreCase)) {
    if(match.HasValue)throw new IOException("Ambiguous microphone name");match=i;
   }
  }
  if(match.HasValue)return match.Value;
  throw new IOException("Microphone not found in Windows PCM devices");
 }
 public static void Start(string filename,string name) {
  if(active!=null)throw new IOException("Microphone is already recording");
  var recording=new Recording(filename);
  try{recording.Open(Device(name));active=recording;}catch{recording.Dispose();throw;}
 }
 public static bool Ready(){if(active==null)throw new IOException("Microphone is not active");active.CheckError();if(active.ready.IsSet && unchecked(Environment.TickCount-active.lastData)>1500)throw new IOException("Microphone stopped delivering audio");return active.ready.IsSet;}
 public static void Stop(){if(active==null)return;var recording=active;active=null;recording.Dispose();recording.CheckError();}
 class Recording : IDisposable {
  internal readonly ManualResetEventSlim ready=new ManualResetEventSlim(false);
  internal volatile int lastData;
  readonly AutoResetEvent changed=new AutoResetEvent(false);
  readonly IntPtr[] headers=new IntPtr[4],buffers=new IntPtr[4];
  readonly bool[] queued=new bool[4],prepared=new bool[4];
  readonly object queueGate=new object();
  readonly uint size=(uint)Marshal.SizeOf(typeof(HEADER));
  FileStream file;IntPtr device;Thread worker;volatile bool stopping,resetComplete;Exception error;uint bytes;
  internal Recording(string filename){file=new FileStream(filename,FileMode.Create,FileAccess.Write,FileShare.Read);file.Write(new byte[44],0,44);}
  internal void CheckError(){if(error!=null)throw new IOException("Microphone capture failed: "+error.Message,error);}
  internal void Open(uint id) {
   var format=new FORMAT{tag=1,channels=1,rate=16000,average=32000,align=2,bits=16};
   Check(waveInOpen(out device,id,ref format,new UIntPtr((ulong)changed.SafeWaitHandle.DangerousGetHandle().ToInt64()),UIntPtr.Zero,0x50000),"Microphone open");
   for(int i=0;i<4;i++) {
    buffers[i]=Marshal.AllocHGlobal(1600);headers[i]=Marshal.AllocHGlobal((int)size);
    Marshal.StructureToPtr(new HEADER{data=buffers[i],length=1600},headers[i],false);
    Check(waveInPrepareHeader(device,headers[i],size),"Prepare audio buffer");prepared[i]=true;
    Check(waveInAddBuffer(device,headers[i],size),"Queue audio buffer");queued[i]=true;
   }
   worker=new Thread(Read){IsBackground=true,Name="VoiceFlow audio"};worker.Start();
   Check(waveInStart(device),"Microphone start");
  }
  void Read() {
   try {
    var block=new byte[1600];
    while(true) {
     changed.WaitOne(20);
     bool finalPass=resetComplete;
     for(int i=0;i<4;i++) {
      if(!queued[i])continue;
      var header=(HEADER)Marshal.PtrToStructure(headers[i],typeof(HEADER));
      if((header.flags&1)==0)continue;
      queued[i]=false;
      if(header.recorded>0) {
       if(header.recorded>1600 || bytes>Int32.MaxValue-header.recorded)throw new IOException("Invalid or excessively long audio");
       Marshal.Copy(header.data,block,0,(int)header.recorded);file.Write(block,0,(int)header.recorded);bytes+=header.recorded;lastData=Environment.TickCount;ready.Set();
      }
      lock(queueGate){if(!stopping){Check(waveInAddBuffer(device,headers[i],size),"Requeue audio buffer");queued[i]=true;}}
     }
     if(finalPass)break;
    }
   }catch(Exception e){error=e;}
  }
  public void Dispose() {
   lock(queueGate){stopping=true;if(device!=IntPtr.Zero){waveInStop(device);Check(waveInReset(device),"Finalize microphone");}}
   resetComplete=true;changed.Set();
   if(worker!=null && !worker.Join(2000))throw new IOException("Microphone finalization timed out");
   for(int i=0;i<4;i++) {
    if(prepared[i])Check(waveInUnprepareHeader(device,headers[i],size),"Release audio buffer");
    if(headers[i]!=IntPtr.Zero)Marshal.FreeHGlobal(headers[i]);if(buffers[i]!=IntPtr.Zero)Marshal.FreeHGlobal(buffers[i]);
   }
   if(device!=IntPtr.Zero)Check(waveInClose(device),"Close microphone");device=IntPtr.Zero;
   if(file!=null) {
    file.Position=0;using(var writer=new BinaryWriter(file,Encoding.ASCII,true)) {
     writer.Write(Encoding.ASCII.GetBytes("RIFF"));writer.Write(bytes+36);writer.Write(Encoding.ASCII.GetBytes("WAVEfmt "));
     writer.Write(16);writer.Write((ushort)1);writer.Write((ushort)1);writer.Write(16000);writer.Write(32000);writer.Write((ushort)2);writer.Write((ushort)16);
     writer.Write(Encoding.ASCII.GetBytes("data"));writer.Write(bytes);
    }
    file.Dispose();file=null;
   }
   changed.Dispose();ready.Dispose();
  }
 }
}
