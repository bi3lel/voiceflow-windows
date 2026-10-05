!macro customInstall
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\scripts\create-desktop-shortcut.ps1" -ApplicationPath "$INSTDIR\VoiceFlow.exe"' $0
  ${If} $0 != 0
    MessageBox MB_OK "VoiceFlow installed, but its desktop shortcut could not be verified. Open VoiceFlow from the Start menu."
  ${EndIf}
!macroend
