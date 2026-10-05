# Third-party notices

VoiceFlow application code is MIT licensed. Dependencies and model weights have separate licenses.

Bundled with the Windows preview:

- Electron 44.5.1: MIT, with Chromium/Node component notices in the installed application's LICENSE and LICENSES.chromium.html files. https://github.com/electron/electron/tree/v44.5.1
- uiohook-napi 1.5.5: MIT wrapper; retain the libuiohook notices inside its native module distribution. https://github.com/SnosMe/uiohook-napi
- whisper.cpp 1.9.4, release b5130: MIT. The CPU archive is checksum-pinned in runtime-manifest.json; its license is included in assets/licenses/whisper.cpp.txt and beside the CPU executable. https://github.com/ggml-org/whisper.cpp/releases/tag/b5130
- SDL2: zlib license; part of the upstream Whisper CPU distribution. License text is in assets/licenses/SDL2.txt. https://github.com/libsdl-org/SDL/blob/SDL2/LICENSE.txt
- Gabarito: SIL Open Font License 1.1. Font and license are under src/fonts. https://github.com/google/fonts/tree/main/ofl/gabarito

Downloaded only when the user explicitly chooses a speech model:

- NVIDIA Parakeet-TDT-0.6B-v3: CC-BY-4.0. Author: NVIDIA. The Q8 GGUF representation is obtained from the NVIDIA model repository. Attribution and model license remain bundled with VoiceFlow even though weights are not. No change to model weights is claimed. https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
- NVIDIA NeMo-Speech.cpp 0.2.0 runtime: retain the upstream LICENSE and runtime component notices from the downloaded archive. Source and licensing: https://github.com/NVIDIA/NeMo-Speech.cpp/tree/v0.2.0
- NVIDIA CUDA runtime components: NVIDIA redistribution terms apply to the GPU archive; no complete CUDA Toolkit is installed. https://docs.nvidia.com/cuda/eula/
- Whisper model weights: MIT upstream terms. https://github.com/openai/whisper/blob/main/LICENSE . Pinned quantized models: https://huggingface.co/ggerganov/whisper.cpp
- Cactus Whistle/Needle: Apache 2.0; complete license in assets/licenses/Whistle-Apache-2.0.txt. Exact hashes/revisions in lib/model-catalog.js. https://huggingface.co/Cactus-Compute/whistle and https://github.com/cactus-compute/needle

The preview contains no FFmpeg binary, Ollama runtime, llama.cpp editing runtime or editing weights. Source includes optional FFmpeg capture and external Ollama integration for user-provided installations. The Qwen2.5-3B research license is retained as provenance in assets/licenses/Qwen2.5-3B.txt, but managed installation/activation is blocked in the public preview. No commercial clearance is claimed. https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/blob/main/LICENSE

Historical benchmark summaries use public Google FLEURS recordings, CC-BY-4.0. Google and dataset contributors are credited at https://huggingface.co/datasets/google/fleurs . No benchmark audio or personal recordings are distributed in this repository.
