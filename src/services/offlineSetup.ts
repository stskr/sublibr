import { LOCAL_WEIGHTS, formatWeightSize, type LocalWeightId } from './localModelCatalog';

export type OfflineDepId = 'whisper-cli' | 'llama-server' | 'whisper-multilingual' | 'qwen-translator';

export type OfflineDepKind = 'runtime' | 'weights';

export type OfflineDepSpec = {
  id: OfflineDepId;
  kind: OfflineDepKind;
  label: string;
  why: string;
  formula?: 'whisper-cpp' | 'llama.cpp';
  weightId?: LocalWeightId;
  neededFor: 'transcribe' | 'translate';
};

export const OFFLINE_DEPS: OfflineDepSpec[] = [
  {
    id: 'whisper-cli',
    kind: 'runtime',
    label: 'whisper-cli',
    why: 'Runs Whisper on this computer so audio never leaves the machine.',
    formula: 'whisper-cpp',
    neededFor: 'transcribe',
  },
  {
    id: 'llama-server',
    kind: 'runtime',
    label: 'llama-server',
    why: 'Serves the local translator. Whisper cannot translate.',
    formula: 'llama.cpp',
    neededFor: 'translate',
  },
  {
    id: 'whisper-multilingual',
    kind: 'weights',
    label: LOCAL_WEIGHTS['whisper-multilingual'].label,
    why: 'Default transcription for 99 languages, with word timestamps for subtitles.',
    weightId: 'whisper-multilingual',
    neededFor: 'transcribe',
  },
  {
    id: 'qwen-translator',
    kind: 'weights',
    label: LOCAL_WEIGHTS['qwen-translator'].label,
    why: 'Local translation. Needed only if Translation is set to Local.',
    weightId: 'qwen-translator',
    neededFor: 'translate',
  },
];

export function brewFormulaAllowlist(): string[] {
  return OFFLINE_DEPS.flatMap((dep) => (dep.formula ? [dep.formula] : []));
}

export function weightSizeLabel(id: LocalWeightId): string {
  return formatWeightSize(LOCAL_WEIGHTS[id].bytes);
}
