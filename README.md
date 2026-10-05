# VoiceFlow

Offline multilingual voice dictation for Windows. Hold F9, speak, then release to type into the selected app.

## Install

1. Open [Releases](https://github.com/bi3lel/voiceflow-windows/releases).
2. Download **VoiceFlow-1.11.0-Windows-portable.zip**, right-click it and choose **Extract All**. You do not need GitHub's automatically generated source-code ZIPs.
3. Open the extracted folder and double-click **VoiceFlow.exe**. Follow the on-screen speech-model download and microphone test.

Keep the extracted folder together; its other files are application dependencies. No installer, compiler, Python, CUDA Toolkit or Ollama installation is required. Windows still runs VoiceFlow.exe inside the folder. A ZIP does not replace executable signing. The first speech-model download needs internet; dictation works offline afterwards. A compatible NVIDIA driver enables acceleration; other PCs can use the processor fallback.

This is an unsigned **Windows preview**. Windows may warn about an unknown publisher. Only install files from this repository. It has not yet been tested across clean PCs and multiple graphics cards.

## Use

Click where you want to type, hold **F9**, speak, and release. The small recording indicator disappears on release. Settings let you change the shortcut, use toggle mode, select another model, open History, copy a failed insertion, or unload the model to free memory.

Parakeet v3 is the recommended speech model and automatically detects 25 supported languages. Whisper Turbo is an alternative with broader language coverage. Model language support varies; it is not limited to the languages shown in the manual-language selector. English, Brazilian Portuguese and French were used in the supplied benchmarks. Experimental Whistle supports fewer languages and does not support Portuguese.

Speech models provide punctuation. The public preview does not download the research-licensed Qwen 3B editing model. Advanced users may configure an external local Ollama service with a model they are permitted to use.

## Privacy and updates

There is no cloud transcription. Models and runtimes download only during an explicit setup action. History saves original and final transcripts locally; audio is temporary. The portable ZIP keeps settings/history in its `data` folder, weights in `models` and downloaded runtimes in `runtime`. To update, close VoiceFlow and extract the new release over the same folder; retain your `data`, `models`, and downloaded runtime folders. Keep a backup of these folders before updating. The optional installer build instead stores user data in `%APPDATA%\VoiceFlow` and weights in its `offline` subfolder; it refreshes the desktop shortcut and keeps user data on uninstall. Generic release files include no personal history or microphone settings.

The supplied ZIP already includes `portable.flag` for SSD use. Keep its files together. Models, settings and history then stay beside the executable. Windows is the supported desktop platform. This repository does not include the Android companion.

## Development

Use Windows x64 and Node.js 22 or newer:

```powershell
npm ci
npm test
npm run check
npm run build
```

Build downloads a checksum-pinned prebuilt Whisper CPU runtime; no speech weights are bundled. The portable ZIP is written to `dist/VoiceFlow-1.11.0-Windows-portable.zip`. `npm run build:installer` builds the optional setup EXE for users who prefer installation. `npm run build:portable` builds the same ZIP explicitly. Build tools are development dependencies, not application requirements. See [release validation](docs/RELEASE_VALIDATION.md), [manual checks](docs/WINDOWS_TEST_CHECKLIST.md), [benchmarks](docs/BENCHMARKS.md), and [third-party notices](docs/THIRD_PARTY.md).

Application source is MIT licensed. Dependencies and downloaded models retain their own licenses. VoiceFlow is independent of Wispr Flow.
