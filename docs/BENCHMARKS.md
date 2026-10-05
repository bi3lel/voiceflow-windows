# Expanded comparison — 4 October 2026

The optional Parakeet backend is now implemented and tested on 300 new EN/PT-BR/FR recordings with automatic language detection. See [LARGE_MODEL_COMPARISON.md](LARGE_MODEL_COMPARISON.md) and benchmarks/large-model-comparison.json. Earlier sections below are historical. Whisper Turbo Q8 remains the selected default. Native microphone capture reduced measured median readiness from 764.0 to 79.5 ms; see OPTIONAL_MODELS.md.

# Measured backend evaluation — 3 October 2026

The practical default is **persistent whisper.cpp 1.9.4 b5130 with large-v3-turbo q8_0**. It retained the FP16 turbo error rate on these English and French samples, beat medium on Brazilian Portuguese and French, and delivered the lowest English/Brazilian Portuguese median latency here. Q5 used less memory but increased English/French errors. CTranslate2 improved Brazilian Portuguese WER slightly, but added Python, cuDNN and a different model distribution without a latency benefit on this host. These nine clips cannot establish general recognition quality.

## Actual host and method

Windows 11 build 10.0.26300; AMD Ryzen 7 5700X; NVIDIA GeForce RTX 5060; driver 617.14; NVIDIA-SMI reports 8,151 MiB total. Hardware was queried, not assumed. CUDA backend logs confirm inference used the GPU. Tests also loaded and transcribed with the separate CPU runtime.

Identical Google FLEURS test rows 0–2 for English US, Portuguese Brazil and French France were used for every candidate. Clip durations are EN 10.56/8.76/11.46 s, PT-BR 17.76/13.62/8.40 s, FR 10.20/23.40/8.28 s. Each model had an excluded first inference, followed by three repetitions per clip (nine timed observations per language). WER is summed word edits / summed reference words, lowercased Unicode word tokens with punctuation ignored; no semantic or number normalization. Repetition does not increase the number of distinct samples. Names and number expressions can be wrong even where aggregate WER looks favorable; review raw transcripts.

whisper.cpp uses its server defaults (greedy/best-of 2, flash attention enabled); CTranslate2 uses beam size 1, no VAD and no previous-text conditioning. Both use explicit language, transcription only. These are practical configurations, not rigorously identical decoders. Benchmarks ran one inference job at a time; comparison models were unloaded between groups. Background desktop GPU memory varied.

## Results

Load is process/server startup to health for whisper.cpp and model construction for CT2; it excludes first inference and is not full cold readiness. Warm transcription is WAV submission through completed transcript. It excludes microphone finalization, clipboard work and target application insertion.

| Backend / model | Load ms | EN median ms / WER | PT-BR median ms / WER | FR median ms / WER | Loaded GPU total MiB |
|---|---:|---:|---:|---:|---:|
| ggml-medium.bin | 5363.9 | 360.0 / 4.11% | 494.3 / 16.0% | 472.2 / 4.59% | 3739 |
| ggml-large-v3-turbo.bin | 1727.2 | 313.8 / 5.48% | 350.3 / 9.33% | 341.7 / 1.83% | 3536 |
| ggml-large-v3-turbo-q5_0.bin | 793.4 | 173.8 / 8.22% | 220.3 / 9.33% | 205.7 / 2.75% | 2390 |
| ggml-large-v3-turbo-q8_0.bin | 1100.4 | 172.1 / 5.48% | 219.7 / 9.33% | 212.4 / 1.83% | 2647 |
| CT2 FP16 | 1899.2 | 284.5 / 8.22% | 324.0 / 8.0% | 317.1 / 3.67% | 3598 |
| CT2 INT8_FLOAT16 | 3106.5 | 287.9 / 6.85% | 330.5 / 8.0% | 318.0 / 5.5% | 2633 |

The last column is the **whole GPU's used memory while the model was loaded**, not isolated model allocation or peak VRAM. Desktop/apps used roughly 1.4–2.0 GiB before/after these runs. Do not size a toolkit's LLM budget from this column alone. Model sizes and internal CUDA allocation messages are preserved in the raw logs.

## Cold initialization, CPU, and previous CLI behavior

A separate normal Windows-user cold Q8 test measured **1,151.2 ms to server health**, then **7,419.2 ms for first inference**, **8,590.7 ms total ready time**. The next automatic-language French transcription took **411.4 ms**, detected French with probability 0.999101, and preserved French text. Earlier restricted test-context startup incurred roughly 52 seconds of first-inference kernel/cache overhead; that is not reported as normal user startup. The warm action now performs inference, rather than merely declaring ready after loading weights. First-run driver/kernel cache and security context can materially change startup.

Explicit CPU Q8 processed PT-BR row 2 in **12,548.6 ms**, with **827.0 ms model startup**. CPU fallback is functional but much slower. Actual deliberate GPU exhaustion was not performed: startup failure and inference OOM recovery are fault-injection tested, including unload and separate CPU retry. The worker can be unloaded explicitly to release its model/GPU context.

The repaired medium CLI baseline launched a new process for each of the same nine WAVs. Total times ranged **54–72 seconds**, with native model-loading timers recorded separately in `cli-medium-results.json`. These runs used CLI defaults and the restricted test context; one overlapped an exploratory CT2 run. They are diagnostic evidence of the old startup problem, **not a controlled persistence speedup comparison**. The persistent medium result above is the useful baseline for choosing a model.

**Release-to-insertion latency was not measured in a live target application.** The app records modelLoadMs, transcriptionMs and releaseToInsertionMs in `data/last-metrics.json`; the last is measured through accepted paste input or completed copy. It cannot prove that arbitrary application software consumed the text. Do not substitute warm transcription times for dictation end-to-end latency.

## Versions, compatibility and alternatives

- whisper.cpp [b5130 binaries](https://github.com/ggml-org/whisper.cpp/releases/tag/b5130), source v1.9.4. Archive/model SHA-256 and model commit are pinned in `runtime-manifest.json`. The server source defaults language to English; VoiceFlow explicitly supplies `auto` when requested and disables translation/detection-only mode. See [pinned server source](https://github.com/ggml-org/whisper.cpp/blob/v1.9.4/examples/server/server.cpp).
- faster-whisper **1.2.1**, CTranslate2 **4.8.2**, Python **3.12.14**, PyAV **16.1.0**. FP16 and INT8_FLOAT16 both actually ran; advertised compute types and failures are recorded in `ct2-results.json` (no failures in the final run). CUDA 12.4 cuBLAS failed INT8 on this GPU during initial evaluation; **cuBLAS 12.9 and cuDNN 9.10.2** resolved it. That is additional runtime packaging work. See [faster-whisper requirements](https://github.com/SYSTRAN/faster-whisper/blob/v1.2.1/README.md) and [CTranslate2 releases](https://github.com/OpenNMT/CTranslate2/releases).
- CT2 converted model: `mobiuslabsgmbh/faster-whisper-large-v3-turbo`, pinned commit **0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf**; model.bin SHA-256 **e76620f83d5f5b69efd3d87e3dc180c1bd21df9fbebacfd4335e5e1efcc018da**. Download the config/tokenizer/preprocessor/vocabulary and model files from that revision before evaluation; `--model` must point to a complete local converted directory. This format is not a GGML `.bin` file. CT2/Python/cuDNN/model are evaluation-only and are not shipped as an application backend.
- Parakeet-TDT-0.6B-v3 was **not benchmarked or integrated**. Its [official model card](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) identifies European Portuguese training; Brazilian Portuguese remains a separate validation need. Native C++ deployment is now possible via [whisper.cpp's Parakeet example](https://github.com/ggml-org/whisper.cpp/blob/master/examples/parakeet-cli/README.md), so it is not dismissed as Linux-only. A separate model/worker and unmeasured Brazilian Portuguese quality did not justify replacing the tested backend for this repair.

## Evidence and remaining checks

`results-1791049441492.json` is the full persistent whisper.cpp comparison, `ct2-results.json` the final independent CT2 comparison, and `summary.json` the aggregate table. `warm-check.json`, `cpu-check.json` and `cli-medium-results.json` preserve actual transcripts and timing. Logs contain the original test-machine paths; relative application configuration is used in the shipped package.

Native Electron tests verified Unicode and rich clipboard read/write restoration, the N-API keyboard module, preload/IPC and both hidden renderer windows. Windows microphone enumeration found the installed microphone. These do not substitute for live capture, physical shortcut presses or paste into a foreground application. `packaged-self-test.json` records the final unpacked executable check. No measured figures are claimed for physical SSD drive-letter changes, physical network-disabled startup, elevated-app paste, login startup, deliberate OOM, installed NSIS, European Portuguese, or sub-second human dictation. The manual checklist covers those gaps and accents, punctuation, numbers, names and negations.

Corpus attribution and hashes are in `corpus/corpus.json`; see [Google FLEURS](https://huggingface.co/datasets/google/fleurs) (CC-BY-4.0). Reproduction commands and dependency setup are in `SETUP.md`.

## Output layouts and speaker analysis — 1.3.0

Eight typed layout cases passed across English, Portuguese and French. Actual cleanup range 335.7–2294.6 ms after local AI warm action (4566.5 ms). This does not include microphone/ASR latency or establish recognition accuracy. The installed app's first diagnostic cleanup took 3910.1 ms, including initial prompt processing; do not assume the smaller steady-state timings on a cold start.

| Published fixture | Observed/expected voices (specified count) | ASR inference ms | Speaker total ms | Native processing ms |
|---|---|---:|---:|---:|
| 1-two-speakers-en.wav | 2/2 | 449.0 | 943.7 | 673.0 |
| 2-two-speakers-en.wav | 2/2 | 664.9 | 3238.7 | 3022.0 |
| 0-four-speakers-zh.wav | 4/4 | 859.6 | 4420.8 | 4190.0 |

Speech server load/startup: 7549.0 ms, separately from inference. Speaker total includes process/model startup; its difference from native processing is overhead, not a pure model-load timer. Automatic clustering threshold 0.7 produced [3, 5] instead of [2, 4] voices on the two checked samples. Prefer a known expected count; neither automatic nor specified counts guarantee correct voice assignment. Short words/turns can remain uncertain.

No recorded microphone release-to-insertion measurement for the new speaker mode, no scored speaker error rate, and no PT-BR/FR multi-person voice-label accuracy claim. Existing speech-backend corpus comparisons remain above.

Reproduce typed checks from the source folder with `node scripts/evaluate-layouts.js` and `node scripts/evaluate-dictation.js`. Speaker checks: download the three named published fixtures from https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-segmentation-models into a test folder, then `node scripts/evaluate-speakers.js "D:/Test audio"`. These explicitly invoked evaluation scripts use the already installed local models and save reports in benchmarks. They need Node for source testing, not for the portable app.

## 1.3.1: fast ordinary dictation

The last user-generated 1.3.0 timing log had speech inference 197.4 ms and AI cleanup 846.2 ms, with release-to-insertion 1653.0 ms. Speaker labels were not enabled. The new default skips AI for ordinary speech; exact repeated-unit corrections are resolved before optional list formatting, while the original transcript remains unchanged.

On the same nine EN/PT-BR/FR corpus WAVs, warm speech inference took 287.1–460.7 ms; postprocessing took 0.022–1.033 ms, with zero AI requests in all nine cases. Speech warm action was 3089.2 ms; server load/startup 2423.9 ms. These are file-inference checks, not microphone release-to-insertion measurements.

All nine typed editing checks passed: five used local AI for list/correction intent; four ordinary/negated sentences bypassed it. The installed executable correctly formatted the short corrected shopping list in 322.9 ms after explicit AI warmup. Cold AI startup can still take seconds for the first list/correction; it is not part of ordinary speech latency. Disable Lists and spoken corrections for zero AI on every utterance, including lists.

See benchmarks/fast-dictation.json, intelligent-dictation.json and installed-fast-check.json. Speaker/email/FAQ modes and native acrylic are removed in 1.3.1. The 1.3.0 measurements above remain historical. Live microphone latency and desktop-compositor appearance after this revision require manual confirmation; packaged startup, transparent window construction, renderer recovery UI and keyboard bridge were checked on Windows.

## 1.3.2 microphone startup

Three real HyperX Quadcast captures per configuration: median spawn-to-first-audio progress fell from **1270.9 ms** to **806.6 ms** (36.5% reduction). Before range: 1262.5–1315.5 ms; after range: 781.7–861.9 ms. These are quiet live captures, not speech quality tests or full F9-to-insertion measurements. Source reports: `benchmarks/capture-startup-before.json` and `capture-startup-after.json`. Audio was deleted. No continuous microphone capture was introduced. DirectShow options follow [FFmpeg device documentation](https://ffmpeg.org/ffmpeg-devices.html#dshow).

## 1.3.4 corrected lists

The bundled Qwen2.5:3b returned accepted corrected lists in live text cleanup checks: the reported English example (288.5 ms), Portuguese (173.5 ms), and French (179.3 ms). The model was warmed first. These are cleanup-only timings, not microphone/transcription or release-to-insertion measurements. Complete inputs, outputs and model responses: `benchmarks/list-correction-check.json`.
