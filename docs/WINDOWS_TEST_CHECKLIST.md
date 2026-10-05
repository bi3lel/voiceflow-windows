# Windows manual acceptance checklist

Record Windows version, GPU name/VRAM/driver, selected model, compute device, microphone, keyboard layout, and packaged/development mode. Use the raw/final history pair to assess every recognition result. Do not mark a check passed only because the pill says Paste sent.

| Check | Procedure and expected behavior |
|---|---|
| Microphone enumeration | List microphones; exact names appear, including Unicode names. Select the actual input. |
| Missing/denied microphone | Use a nonexistent device, unplug it, or deny desktop microphone permission. Loading becomes error; subsequent valid recording works; no stuck capture process. |
| Capture crash | Terminate only the dictation FFmpeg child during capture. Error includes diagnostics; no partial WAV is transcribed or inserted. |
| Silence | Record quiet/silence for 2–5 seconds. Silence/no-speech is reported and no text is inserted. Repeat with fan noise: RMS alone is not speech VAD; flag hallucinations. |
| Rapid hold | Tap F9 before capture is ready; then make ten rapid recordings. No old result appears in a new target. Starts while busy are ignored. |
| Toggle | Press/release once to start, repeat to stop. Keyboard repeat does not toggle repeatedly. Error/cancel does not leave a toggle latch. |
| Alternative shortcut | Test F8/F10/F11/F12 and Ctrl+Shift+Space; check conflicts with the target app. |
| AltGr layouts | In French and Portuguese layouts, type accented/symbol characters with AltGr; dictation must not start. |
| Cancellation | Cancel while loading mic, recording, stopping, transcribing, cleaning, and inserting. No late paste; FFmpeg/worker and audio temp files disappear. Load again afterward. |
| Focus change | Start from app A; switch to app B before transcription finishes. App B must receive no paste. Use Copy last transcript to recover. Also test closing A. |
| Modifiers | Keep Ctrl, Shift, Alt or Win down at insertion. Paste is blocked; release keys and recover manually. |
| Elevated window | Dictate to an administrator app from ordinary VoiceFlow. Rejected or unconsumed paste must be recoverable. Never infer target consumption from SendInput alone. |
| English | “Do not send the invoice to Michael. It is 42 euros and 50 cents.” Check names, negation and numbers against raw text. |
| Brazilian Portuguese | “Não envie a fatura para João. São R$ 1.250,50. A reunião é na sexta-feira.” Check ç/ã/é, Brazilian pronunciation, names and decimal/group separators. |
| European Portuguese | Repeat the Portuguese task with European pronunciation. This accent was not represented by the supplied PT-BR benchmark. |
| French | “François n’a pas reçu 42 euros. La réunion est prévue vendredi à 14 heures.” Check apostrophes, accents, names, negation and numbers. |
| Automatic language | Switch between separate EN/PT/FR recordings in auto mode. Output stays in the source language. Test mixed-language recordings separately; detection on very short speech can be unreliable. |
| Short recordings | Test 0.1, 0.5, 1, 2 and 5 second utterances. Very short/invalid captures must error cleanly; inspect recognition rather than expecting perfect detection. |
| Clipboard recovery | Put formatted text, an image and file references on the clipboard in separate trials. Dictate, verify target text and original clipboard restoration. Copy a new item during transcription/insertion; it must not be overwritten by restoration. |
| Slow paste consumer | Test large text in apps that delay clipboard reads. Verify text before relying on the restoration grace period; use copy-only if needed. |
| Copy-only | Disable auto-paste. Completion is Copied and text remains on the clipboard; no keystrokes are sent. |
| History | Tray History opens a full panel; copy/delete/clear works for UUID and old numeric entries. Disable history and verify its file clears. |
| Formatting | Test an ordinary sentence containing eggs, milk and bread. It stays a sentence and keeps its introduction. Raw history is preserved. |
| Ollama | Leave it disabled; dictation works. Enable with stopped server, empty output and changed numbers/names/negation. Raw text is retained with a warning; lexical rewrites are rejected. |
| CUDA diagnostics | Inspect actual backend log and GPU memory. CUDA model/compute buffers should be present; requested GPU mode alone is not evidence. |
| CPU fallback | Select CPU, then test auto with unavailable CUDA runtime/driver in an isolated copy. The CPU runtime works and fallback is reported. Restore binaries afterward. |
| OOM | In a controlled test environment with competing VRAM use, provoke allocation failure. Auto unloads the GPU worker and retries CPU; explicit CUDA reports the failure. Simulated tests do not replace this manual check. |
| Unload | Load/warm, record, then unload. Worker exits and GPU memory falls; next load works. Unload while busy asks to cancel/wait. |
| Offline startup | Complete setup, disable network adapters physically, quit and relaunch. Capture, transcription and local UI work without external requests. |
| Portable relocation | Copy whole package to an SSD folder with spaces, change its drive letter, and relaunch. Relative executable/model paths and SSD settings/history still work. |
| Single instance | Launch twice from the same or another portable copy. The second instance does not start another recorder. |
| Packaged execution | Run unpacked EXE, `--self-test`, and optionally installed NSIS version. Check ASAR-unpacked helper, native hook, tray/history, microphone and model paths. |
| Startup | In nonportable development and packaged modes, enable login startup and log out/in. Correct executable/arguments launch. Portable mode rejects login startup. |
| Exit | Quit during capture and inference, then inspect processes/data sessions. No orphan child process, microphone lock or persistent recording remains. |

For latency, use `data/last-metrics.json`: `modelLoadMs` is startup-to-health for the current worker, `loadWaitMs` is loading waited by this utterance, `transcriptionMs` covers the inference HTTP request, and `releaseToInsertionMs` covers release, finalization, cleanup, and accepted paste/copy. First warm-up is separately reported by model diagnostics. Measure actual target consumption separately if the app supports acknowledgement. Do not substitute inference-only latency for release-to-insertion latency.

## 1.3.1 checks

- Verify the compact transparent waveform without a gray rectangle or expanding error panel; GUI still hides on release. Details are available inside Settings.
- Dictate normal EN/PT-BR/FR sentences: no AI cleanup in last-metrics.json. Test negations/names/amounts.
- Explicit lists/corrections: latest intended quantity only, with original text saved in History.
- Disable Smart dictation: no AI on any utterance. Reformat a saved list manually in History.
- No email/FAQ/speaker controls or timestamp inference. Old configs migrate without losing the microphone choice.
- Focus change still prevents pasting into another application; Copy last transcript recovers text.

## 1.3.2 indicator checks

- Hold F9: only the small waveform appears at bottom center, with dim static bars while opening and moving white bars after audio capture starts. It must not take focus or appear in the taskbar.
- Release F9: the indicator hides immediately; background transcription and insertion continue. Check `captureStartupMs` separately from `releaseToInsertionMs`.
- Mute or unplug the microphone: only a brief orange indicator appears, with no expanding explanation. Open Settings from the tray to inspect the last notice.
- Copy/paste recovery and full History remain accessible in the tray. Hold/toggle and Esc still work.
- Repeat short and long recordings on other microphones: verify the 50 ms DirectShow buffer does not lose audio or overrun. Measurements on HyperX do not establish latency for other drivers.

## 1.3.3 spacing checks

- Dictate two sentences in the same field without typing between them: one space separates them. Repeat in English, Portuguese, and French.
- Dictate a list and then another recording: the next text starts on a new line.
- Repeat using copy-only mode or Copy last transcript; separators are included on the clipboard. History originals and final text remain trimmed.
- Verify prior clipboard contents are restored after automatic paste and focus-change recovery still works.

## 1.3.4 list checks

- Dictate: Okay, make a list. I want to go to the supermarket and buy three eggs. Actually, two eggs and one water bottle. Expect two bullets, two eggs and one water bottle; no rejected quantity or shopping preamble.
- Repeat in Portuguese and French; output must preserve the spoken language. Raw history remains unchanged. Failed AI output retains raw text with a notice in Settings.

## 1.4.0 UI checks

- Focus a field in another app, hold F9, speak, release. The small recording HUD must never steal focus and must immediately disappear; transcription/paste continue, with no text preview.
- Verify spacing, corrected lists, Unicode and clipboard recovery remain intact. Repeat hold/toggle and Esc.
- Settings: test all pages, Save, microphone refresh/test, model load/unload, supported shortcut capture and Escape cancel. Change should not begin dictation.
- History: search/filter, copy/edit, original text, reformat, delete/clear confirmation and export.
- Windows: minimize/maximize/drag/snap, light/dark system appearance, 125/150/200% DPI and reduced motion. Test multiple monitors and ensure the HUD is click-through.
- Run --self-test --self-test-ui for packaged visual/resource checks. Physical speech and another app paste consumption remain manual checks.


## 1.5.0: capture and optional models

- With Whisper Turbo Q8 still selected, hold F9, speak, release and repeat. Check the first word and final word are captured, spacing is retained, and the HUD hides on release. Read captureBackend/captureStartupMs in data/last-metrics.json.
- Release F9 immediately during loading; cancel during recording; retry. Verify the microphone indicator disappears between recordings. Unplug during recording and retry after reconnecting. Silence should remain a recoverable notice.
- Under Dictation → Capture options, try FFmpeg compatibility mode; save and compare. Return to Fast Windows capture with fallback.
- Under Models, install Q5 or Parakeet. Download alone must retain Q8 as Active. Cancel a download and verify partial files are removed; an offline download must fail without changing the current model.
- Explicitly choose Use for dictation, then test identical short EN/PT-BR/FR sentences, accents, names, quantities and negations. Compare original History text; do not infer accuracy from cleanup. Restore Q8 afterward.
- For Parakeet, choose CPU and record; choose Auto and Free GPU memory to test reload. Verify diagnostics identifies the active backend. Test offline after explicit installation.
- Repeat in the packaged app, from a path with spaces and a changed SSD drive letter.

## llama.cpp editor update

- In Settings, Download/Cancel/Retry text editing; CPU-only download must omit the Vulkan archive.
- Verify selected GGUF and backend in Diagnostics; ordinary prose must not start the editor.
- Dictate corrected shopping requests in English, Portuguese and French; keep introductions, units and final quantities.
- Free GPU memory while idle, then dictate again; one owned worker reloads. Wait five idle minutes and confirm it unloads.
- Cancel a long edit; no old result should paste. Close app while loading; no owned llama-server remains.
- In Auto, simulate GPU startup or allocation failure; CPU fallback is visible and succeeds. GPU-only errors retain raw.
- After setup, disable networking and test relaunch. Relocate portable folder to a drive/path with spaces.
- External Ollama is user-managed: changing backend must not kill unrelated services.
# VoiceFlow 1.9 additions

- Settings → Smart editing → Turn off AI editing: status becomes OFF; dictate a corrected shopping request and confirm faithful speech text, no editor load. Enable again and confirm lists/corrections resume.
- Disable Save dictation history: existing entries remain after restart; new dictation adds no entry. Enable again; existing history is retained.
- Quick Setup: choose an installed model without downloading; choose Whistle and read its language/duration limits; retry/cancel a failed download. Parakeet remains the default recommendation.
- Settings → Models → Whistle: Download does not activate; Use for dictation activates. Test English and French accents, names, numbers, silence, rapid release/re-recording, Escape cancellation and Free GPU memory. Verify Portuguese selection is refused. Verify a recording longer than 30 seconds reports the limit, rather than returning only its beginning.
- Switch back to Parakeet and verify Portuguese/Brazilian Portuguese, current microphone and AI editing choice remain intact.
- Run packaged execution with internet blocked; downloaded Whistle still starts without Python, CUDA or a compiler. Whistle CPU inference should not allocate speech-model VRAM.

