param([ValidateSet('target','paste','context','sequence','devices','service')][string]$Action,[long]$Hwnd=0,[uint32]$TargetPid=0,[string]$Ffmpeg)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
if ($Action -eq 'devices') {
  if(-not $Ffmpeg -or -not (Test-Path -LiteralPath $Ffmpeg -PathType Leaf)){
    Add-Type -Path (Join-Path $PSScriptRoot 'native-capture.cs')
    ConvertTo-Json -InputObject @([VFMicrophone]::Devices()) -Compress
    exit 0
  }
  $ErrorActionPreference = 'Continue'
  $lines = & $Ffmpeg -hide_banner -list_devices true -f dshow -i dummy 2>&1 | Out-String
  $ErrorActionPreference = 'Stop'
  # FFmpeg intentionally exits nonzero for this enumeration command.
  $names = @([regex]::Matches($lines, '"([^"\r\n]+)"\s*\(audio\)') | ForEach-Object { $_.Groups[1].Value })
  ConvertTo-Json -InputObject $names -Compress
  exit 0
}
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
public class VFWin {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
 [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] a, int size);
 [DllImport("user32.dll")] static extern short GetAsyncKeyState(int v);
 [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }
 [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public KEYBDINPUT k; [FieldOffset(0)] public MOUSEINPUT m; }
 [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk, scan; public uint flags,time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int x,y; public uint data,flags,time; public UIntPtr extra; }
 public static long Target() { return GetForegroundWindow().ToInt64(); }
 public static uint Pid(long h) { uint p; GetWindowThreadProcessId(new IntPtr(h),out p); return p; }
 static INPUT Key(ushort k, bool up) { return new INPUT {type=1,u=new UNION {k=new KEYBDINPUT {vk=k,flags=up?2u:0u}}}; }
 public static bool Paste(long h, uint p) {
   if(h==0 || p==0) throw new Exception("No target window. Use Copy last transcript.");
   if(Target()!=h || Pid(h)!=p) throw new Exception("Focus changed. Use Copy last transcript.");
   foreach(int k in new int[]{0x10,0x11,0x12,0x5B,0x5C})
     if((GetAsyncKeyState(k)&0x8000)!=0) throw new Exception("Release modifier keys, then use Copy last transcript.");
   INPUT[] a={Key(0x11,false),Key(0x56,false),Key(0x56,true),Key(0x11,true)};
   uint sent=SendInput(4,a,Marshal.SizeOf(typeof(INPUT)));
   if(sent!=4) { SendInput(2,new INPUT[]{Key(0x56,true),Key(0x11,true)},Marshal.SizeOf(typeof(INPUT))); return false; }
   Thread.Sleep(350); // Clipboard consumption grace; no generic application acknowledgement exists.
   return true;
 }
}
'@
function Get-CaretContext([long]$Window, [uint32]$ProcessId) {
 if ([VFWin]::Target() -ne $Window -or [VFWin]::Pid($Window) -ne $ProcessId) { throw 'Focus changed. Use Copy last transcript.' }
 try {
  # Loaded once by the persistent helper. Only inspect the adjacent character;
  # never read the full document or alter the user's selection/caret.
  if (-not ('System.Windows.Automation.AutomationElement' -as [type])) {
   Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
  }
  $element = [System.Windows.Automation.AutomationElement]::FocusedElement
  for ($depth=0; $element -and $depth -lt 5; $depth++) {
   if ($element.Current.ProcessId -ne $ProcessId -or $element.Current.IsPassword) { break }
   $pattern = $null
   if ($element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern,[ref]$pattern)) {
    $ranges = $pattern.GetSelection()
    if ($ranges.Length -eq 1) {
     $range = $ranges[0]
     if ($range.GetText(1).Length -gt 0) { return @{known=$true;selected=$true;preceding=''} }
     $previous = $range.Clone()
     $moved = $previous.MoveEndpointByUnit([System.Windows.Automation.Text.TextPatternRangeEndpoint]::Start,[System.Windows.Automation.Text.TextUnit]::Character,-1)
     $character = if ($moved -eq 0) { '' } else { $previous.GetText(2) }
     return @{known=$true;selected=$false;preceding=$character}
    }
   }
   $element = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($element)
  }
 } catch { # Some applications do not expose accessible text ranges.
 }
 return @{known=$false;selected=$false;preceding=''}
}
if ($Action -eq 'service') {
 $captureError=$null
 try { Add-Type -Path (Join-Path $PSScriptRoot 'native-capture.cs') } catch { $captureError=$_.Exception.Message }
 while ($null -ne ($line = [Console]::ReadLine())) {
  $request = $null
  try {
   $request = $line | ConvertFrom-Json
   $value = switch ($request.action) {
    'target' { $h=[VFWin]::Target(); @{hwnd=$h;pid=[VFWin]::Pid($h)} }
    'sequence' { [VFWin]::GetClipboardSequenceNumber() }
    'context' { Get-CaretContext ([long]$request.hwnd) ([uint32]$request.pid) }
    'capture-start' { if($captureError){throw $captureError};[VFMicrophone]::Start([string]$request.file,[string]$request.device); @{started=$true} }
    'capture-info' { @{available=($null -eq $captureError);error=$captureError} }
    'capture-ready' { @{ready=[VFMicrophone]::Ready()} }
    'capture-stop' { if(-not $captureError){[VFMicrophone]::Stop()}; @{stopped=$true} }
    'paste' { @{accepted=[VFWin]::Paste([long]$request.hwnd,[uint32]$request.pid)} }
    default { throw 'Unknown helper action' }
   }
   @{id=$request.id;result=$value} | ConvertTo-Json -Compress -Depth 4 | ForEach-Object { [Console]::WriteLine($_) }
  } catch { @{id=$request.id;error=$_.Exception.Message} | ConvertTo-Json -Compress | ForEach-Object { [Console]::WriteLine($_) } }
 }
 if(-not $captureError){[VFMicrophone]::Stop()}
 exit 0
}
switch ($Action) {
 'target' { $h=[VFWin]::Target(); @{hwnd=$h;pid=[VFWin]::Pid($h)} | ConvertTo-Json -Compress }
 'sequence' { [VFWin]::GetClipboardSequenceNumber() | ConvertTo-Json -Compress }
 'context' { Get-CaretContext $Hwnd $TargetPid | ConvertTo-Json -Compress }
 'paste' { @{accepted=[VFWin]::Paste($Hwnd,$TargetPid)} | ConvertTo-Json -Compress }
}
