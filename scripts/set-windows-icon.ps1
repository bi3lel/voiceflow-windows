param([Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$Icon)
$ErrorActionPreference='Stop'
$exe=(Resolve-Path -LiteralPath $Executable).Path
$ico=(Resolve-Path -LiteralPath $Icon).Path
if([IO.Path]::GetFileName($exe) -ne 'VoiceFlow.exe'){throw 'Expected VoiceFlow.exe'}
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class VoiceFlowIcon {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr BeginUpdateResource(string file,bool delete);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateResource(IntPtr h,IntPtr type,IntPtr name,ushort lang,byte[] data,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool EndUpdateResource(IntPtr h,bool discard);
 [DllImport("shell32.dll")] static extern void SHChangeNotify(uint evt,uint flags,IntPtr first,IntPtr second);
 public static void Apply(string exe,string icon) {
  byte[] bytes=File.ReadAllBytes(icon);
  if(bytes.Length<6 || BitConverter.ToUInt16(bytes,0)!=0 || BitConverter.ToUInt16(bytes,2)!=1)throw new Exception("Invalid ICO");
  int count=BitConverter.ToUInt16(bytes,4);
  if(count<1 || bytes.Length<6+16*count)throw new Exception("Invalid icon directory");
  byte[] group=new byte[6+14*count];Array.Copy(bytes,0,group,0,6);
  IntPtr handle=BeginUpdateResource(exe,false);if(handle==IntPtr.Zero)throw new Win32Exception();
  bool committed=false;
  try {
   for(int i=0;i<count;i++) {
    int entry=6+16*i,size=checked((int)BitConverter.ToUInt32(bytes,entry+8)),offset=checked((int)BitConverter.ToUInt32(bytes,entry+12));
    if(size<1 || offset<0 || offset>bytes.Length-size)throw new Exception("Invalid icon image");
    byte[] png=new byte[size];Array.Copy(bytes,offset,png,0,size);
    Array.Copy(bytes,entry,group,6+14*i,12);
    ushort id=(ushort)(101+i);Array.Copy(BitConverter.GetBytes(id),0,group,6+14*i+12,2);
    if(!UpdateResource(handle,(IntPtr)3,(IntPtr)id,1033,png,(uint)size))throw new Win32Exception();
   }
   if(!UpdateResource(handle,(IntPtr)14,(IntPtr)1,1033,group,(uint)group.Length))throw new Win32Exception();
   if(!EndUpdateResource(handle,false))throw new Win32Exception();committed=true;
  } finally {if(!committed)EndUpdateResource(handle,true);}
  SHChangeNotify(0x08000000,0,IntPtr.Zero,IntPtr.Zero);
 }
}
'@
[VoiceFlowIcon]::Apply($exe,$ico)
Write-Output ('Applied Windows icon: '+$exe)
