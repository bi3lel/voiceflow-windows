param([Parameter(Mandatory=$true)][string]$ApplicationPath)
$ErrorActionPreference='Stop'
$exe=(Resolve-Path -LiteralPath $ApplicationPath).ProviderPath
if([IO.Path]::GetFileName($exe) -ne 'VoiceFlow.exe'){throw 'Expected an installed VoiceFlow.exe'}
$desktop=[Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
if(-not $desktop){throw 'Windows desktop directory is unavailable'}
$linkPath=Join-Path $desktop 'VoiceFlow.lnk'
$shell=New-Object -ComObject WScript.Shell
$shortcut=$shell.CreateShortcut($linkPath)
$shortcut.TargetPath=$exe
$shortcut.WorkingDirectory=Split-Path -Parent $exe
$shortcut.Arguments=''
$shortcut.IconLocation=$exe+',0'
$shortcut.Description='VoiceFlow offline dictation — hold F9 to speak'
$shortcut.Save()
$check=$shell.CreateShortcut($linkPath)
if($check.TargetPath -ne $exe -or -not (Test-Path -LiteralPath $check.TargetPath -PathType Leaf)){throw 'Desktop shortcut verification failed'}
Write-Output ('Created and verified: '+$linkPath)
