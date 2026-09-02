export type LocalWeightId =
  | 'whisper-multilingual'
  | 'whisper-hebrew'
  | 'whisper-tiny'
  | 'whisper-base'
  | 'whisper-small'
  | 'whisper-medium'
  | 'qwen-translator'
  | 'qwen-translator-3b';

export type LocalWeightSpec = {
  id: LocalWeightId;
  file: string;
  url: string;
  bytes: number;
  label: string;
  detail: string;
  for: 'transcribe' | 'translate';
  tier: 'recommended' | 'advanced';
};

/** Hugging Face resolve URLs. Files are saved under the names local Whisper / llama.cpp already look for. */
export const LOCAL_WEIGHTS: Record<LocalWeightId, LocalWeightSpec> = {
  'whisper-multilingual': {
    id: 'whisper-multilingual',
    file: 'ggml-large-v3-turbo-official.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin?download=true',
    bytes: 1_624_555_275,
    label: 'Whisper Large v3 Turbo',
    detail: '99 languages · 1.6 GB',
    for: 'transcribe',
    tier: 'recommended',
  },
  'whisper-hebrew': {
    id: 'whisper-hebrew',
    file: 'ggml-large-v3-turbo.bin',
    url: 'https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin?download=true',
    bytes: 1_624_555_275,
    label: 'Hebrew Whisper',
    detail: 'Better Hebrew (ivrit.ai) · 1.6 GB',
    for: 'transcribe',
    tier: 'advanced',
  },
  'whisper-tiny': {
    id: 'whisper-tiny',
    file: 'ggml-tiny.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true',
    bytes: 77_691_713,
    label: 'Whisper Tiny',
    detail: 'Fastest · 75 MB',
    for: 'transcribe',
    tier: 'advanced',
  },
  'whisper-base': {
    id: 'whisper-base',
    file: 'ggml-base.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin?download=true',
    bytes: 147_951_465,
    label: 'Whisper Base',
    detail: 'Small · 142 MB',
    for: 'transcribe',
    tier: 'advanced',
  },
  'whisper-small': {
    id: 'whisper-small',
    file: 'ggml-small.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin?download=true',
    bytes: 487_601_967,
    label: 'Whisper Small',
    detail: 'Better accuracy · 466 MB',
    for: 'transcribe',
    tier: 'advanced',
  },
  'whisper-medium': {
    id: 'whisper-medium',
    file: 'ggml-medium.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true',
    bytes: 1_533_763_059,
    label: 'Whisper Medium',
    detail: 'High accuracy · 1.5 GB',
    for: 'transcribe',
    tier: 'advanced',
  },
  'qwen-translator': {
    id: 'qwen-translator',
    file: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf?download=true',
    bytes: 4_682_123_264,
    label: 'Qwen2.5 7B translator',
    detail: 'Best local translation · 4.7 GB',
    for: 'translate',
    tier: 'recommended',
  },
  'qwen-translator-3b': {
    id: 'qwen-translator-3b',
    file: 'Qwen2.5-3B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf?download=true',
    bytes: 1_930_000_000,
    label: 'Qwen2.5 3B translator',
    detail: 'Smaller, faster · 1.9 GB',
    for: 'translate',
    tier: 'advanced',
  },
};

export const LOCAL_WEIGHT_IDS = Object.keys(LOCAL_WEIGHTS) as LocalWeightId[];

const MODEL_ALIASES: Record<string, LocalWeightId> = {
  'whisper-large-v3-turbo': 'whisper-multilingual',
  'ivrit-whisper-large-v3-turbo': 'whisper-hebrew',
  'qwen2.5-7b-instruct': 'qwen-translator',
};

export function catalogWeightId(model: string): LocalWeightId | null {
  if (model in LOCAL_WEIGHTS) return model as LocalWeightId;
  return MODEL_ALIASES[model] ?? null;
}

/** ID stored in settings so existing installs keep working. */
export function persistedLocalId(weightId: LocalWeightId): string {
  if (weightId === 'whisper-multilingual') return 'whisper-large-v3-turbo';
  if (weightId === 'whisper-hebrew') return 'ivrit-whisper-large-v3-turbo';
  if (weightId === 'qwen-translator') return 'qwen2.5-7b-instruct';
  return weightId;
}

export function formatWeightSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  return `${bytes} B`;
}
