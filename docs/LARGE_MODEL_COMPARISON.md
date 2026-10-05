# Whisper versus Parakeet: 300-recording comparison

4 October 2026. **Parakeet is substantially faster on this host; accuracy is close overall, with Whisper ahead in English.** The working Whisper Turbo Q8 default remains selected. Parakeet is an optional download/selection in Settings → Models.

100 recordings each in English US, Brazilian Portuguese and French France, totaling **54.296 minutes**. Google FLEURS test rows **100–199** were fixed before transcription, excluding the original nine-clip sample. Every WAV was submitted unchanged to both models. Both used **automatic language detection**, CUDA, their persistent native servers, and no cleanup/translation/speaker labels. One timed pass per recording per backend: 600 completed transcriptions, no failures. Models were unloaded between backend groups. Timings include local file/form preparation and completed HTTP transcription; they exclude recording and insertion.

| Language | Whisper Turbo Q8 WER | Parakeet v3 Q8 WER | Whisper median | Parakeet median |
|---|---:|---:|---:|---:|
| English | **5.34%** | 6.38% | 238.4 ms | **38.0 ms** |
| Brazilian Portuguese | **3.75%** | 4.19% | 265.8 ms | **42.4 ms** |
| French | 6.06% | **5.95%** | 274.1 ms | **41.4 ms** |

WER is word-error rate; lower is better. Scoring uses NFC/lowercase and ignores punctuation, retaining accents; there is **no semantic or number normalization**. Equivalent numeric spellings, contractions or hyphenation can count as errors. Character-error rates were Whisper/Parakeet: EN 2.41/2.95%, PT-BR 1.46/1.34%, FR 1.96/2.07%. The Portuguese character score favors Parakeet while its word score slightly favors Whisper; avoid calling this an unequivocal quality difference.

Paired clip bootstrap, 2000 draws, seed 20261004, estimates the Parakeet-minus-Whisper WER difference (percentage points): EN **+0.10 to +2.08**, PT-BR **−0.38 to +1.35**, FR **−1.13 to +0.91**. PT-BR and French intervals span zero. This is a clip-based estimate and ignores correlated speakers/repeated sentences. The 100 recordings contain 94/89/93 distinct references respectively, and do not represent 100 independent speakers. This is read-aloud speech, not a representative live dictation benchmark. Shortest clips: EN 3.84 s, PT-BR 5.34 s, FR 4.32 s; sub-second speech, noisy microphones and spontaneous self-corrections still need separate checks.

Both logs confirm NVIDIA CUDA on the actual RTX 5060, driver 617.14. Median latency advantage was 6.28× / 6.26× / 6.62×. P95 Whisper/Parakeet was EN 272.1/60.5 ms, PT-BR 321.3/60.8 ms, FR 324.8/54.9 ms.

Cached process/server startup to readiness: Parakeet 521.7 ms, Whisper 1107.4 ms; additional explicit silent warm transcription: 21.8/201.7 ms. Parakeet performs native warmup before server readiness, so these are not comparable pure weight-loading timers or first-install guarantees. The servers remain loaded during all utterances in their group.

Worker peak Windows working set after the run: Parakeet **803.8 MB**, Whisper **446.1 MB** (decimal MB). Parakeet's smaller model file does not imply lower system RAM. Whole-GPU used memory while loaded was 6129/6551 MiB, including other desktop/apps; **isolated/peak model VRAM was not measured**. This is a speed-versus-quality/memory choice, not evidence that Parakeet is universally lighter.

Practical choice: retain Whisper for the current reliable setup; try Parakeet if lower latency matters more, and compare the names, numbers and accents you actually dictate. The original nine-clip result looked more favorable to Parakeet; the larger sample is the better basis for this recommendation. Neither test proves general superiority. No model was automatically switched or removed.

## Evidence and reproduction

Full references, transcripts, hashes, timings, device logs, scores and summary: `benchmarks/large-model-comparison.json`. The exact corpus manifest is `benchmarks/large-corpus-manifest.json`; temporary audio/model/runtime downloads were removed after validation to avoid permanent disk growth.

Use the existing source setup, and explicitly install the optional Parakeet model/runtime through Settings. For the benchmark-only download script, Python with `pyarrow` is required; it is not an application runtime dependency:

```powershell
python -m pip install pyarrow==25.0.1
python scripts/prepare-comparison-corpus.py --ffmpeg 'D:/Toolkit/VoiceFlow/runtime/ffmpeg/ffmpeg.exe' --out 'D:/Tests/VoiceFlow-corpus'
node scripts/compare-models.js 'D:/Toolkit/VoiceFlow' 'D:/Tests/VoiceFlow-corpus/corpus.json' 'D:/Tests/VoiceFlow-comparison.json'
```

The comparator does not modify settings, record the microphone or paste. It verifies each WAV's manifest hash, unloads between models, and saves results every 25 clips. Check resulting corpus hashes against the preserved manifest for an exact reproduction. Optional `OVERRIDES_JSON` as a fourth argument sets alternate local model/runtime paths. The preserved report has paths from this test machine.

Sources: [Google FLEURS](https://huggingface.co/datasets/google/fleurs), CC-BY-4.0; [NVIDIA Parakeet v3 model card](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3); [pinned NVIDIA runtime](https://github.com/NVIDIA/NeMo-Speech.cpp/releases/tag/v0.2.0). The model card specifies European Portuguese training; this test explicitly used Brazilian Portuguese. Native default remains whisper.cpp v1.9.4 / large-v3-turbo Q8; optional native engine is NeMo-Speech.cpp v0.2.0 / Parakeet v3 Q8. See model-catalog.js for immutable revisions/checksums.
