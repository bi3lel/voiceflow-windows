# Windows preview validation

Version 1.11.0, 5 October 2026.

This is suitable for a public preview, not a claim of complete production validation.

106 automated tests passed, covering sessions, process failure/cancellation, Unicode clipboard recovery, focus checks, dictation spacing, language arguments, list/correction validation, model downloads, CPU fallback, editing controls and installed/portable path resolution. Production npm dependency audit reported no known vulnerabilities at the time of this build. This does not cover vulnerabilities in Electron, native speech runtimes or development tools.

The installer contains no speech weights, editing weights, personal history, settings or recordings. It uses native Windows capture and a pinned Whisper CPU runtime; FFmpeg is optional and not bundled. Managed Qwen2.5-3B editing downloads are disabled in the public preview because its research license is not a general-purpose commercial license. The original personal build remains separate.

Remaining checks before a stable release include certificate signing, clean Windows accounts/PCs, independent CPU-only PCs, varied NVIDIA drivers/cards, real microphone disconnects, real GPU out-of-memory, offline network-disabled operation and arbitrary target apps. Pasting into elevated or unusual applications can fail; copy recovery remains available. Model recognition and punctuation accuracy vary by language and microphone.

The optional installer stores models/settings/history outside the application directory, so replacing or uninstalling application files preserves user data. It uses the same app ID and desktop shortcut. Public release assets include a portable ZIP and its checksum; GitHub's automatically generated source archives are for developers. Portable users should retain their data, models and downloaded runtime folders when updating.

The NSIS installer was installed and updated in an isolated folder on this Windows machine. Its packaged first-run flow reached the ready state after simulated interruption, microphone silence/retry and model warmup failure/retry. The real Windows microphone enumeration found the connected HyperX Quadcast without FFmpeg. Native keyboard module/helper, IPC, renderer controls and empty-clipboard handling passed packaged checks. The installer created and verified Desktop\VoiceFlow.lnk; after testing, that shortcut was restored to the owner's existing personal application. A synthetic model-data fixture outside the application folder survived the update. No actual speech weights or microphone audio were downloaded/recorded during this installer test.

The GitHub release uses a portable ZIP instead of the optional setup EXE. Its payload was extracted from the tested model-free installer and supplied with portable.flag. ZIP CRC and path/content checks passed; portable packaged startup/setup were checked separately. Packaging does not change unsigned executable trust.
