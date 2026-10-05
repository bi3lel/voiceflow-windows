param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root=[IO.Path]::GetFullPath($Destination)
[IO.Directory]::CreateDirectory($root) | Out-Null
$zip=[IO.Compression.ZipFile]::OpenRead($Archive)
try {
 foreach($entry in $zip.Entries) {
  $target=[IO.Path]::GetFullPath((Join-Path $root $entry.FullName))
  if(!$target.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Archive entry escapes extraction directory'}
  if($entry.FullName.EndsWith('/')){[IO.Directory]::CreateDirectory($target)|Out-Null;continue}
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
  [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$false)
 }
}finally{$zip.Dispose()}
