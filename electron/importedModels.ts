import fs from 'fs';
import type { ImportedLocalModel } from '../src/types';
import { sanitizeImportedLocalModels } from '../src/services/importedLocalModels';
import { catalogWeightId, LOCAL_WEIGHTS, type LocalWeightId } from '../src/services/localModelCatalog';
import { resolveWeightFile } from './localModelPaths';

type SettingsStore = { get: (key: string) => unknown };

let storeRef: SettingsStore | null = null;

export function bindImportedModelStore(store: SettingsStore): void {
  storeRef = store;
}

export function getImportedLocalModels(): ImportedLocalModel[] {
  const settings = storeRef?.get('settings');
  if (!settings || typeof settings !== 'object') return [];
  return sanitizeImportedLocalModels((settings as { importedLocalModels?: unknown }).importedLocalModels);
}

export function catalogFilePresent(id: LocalWeightId): boolean {
  const spec = LOCAL_WEIGHTS[id];
  const found = resolveWeightFile(spec.file);
  if (!found) return false;
  try {
    return fs.statSync(found).size > 1_000_000;
  } catch {
    return false;
  }
}

export function resolveWhisperModelFile(modelId: string): string | null {
  const imported = getImportedLocalModels().find((item) => item.id === modelId && item.runtime === 'whisper');
  if (imported) return fs.existsSync(imported.path) ? imported.path : null;
  const weightId = catalogWeightId(modelId);
  if (!weightId || LOCAL_WEIGHTS[weightId].for !== 'transcribe') return null;
  return resolveWeightFile(LOCAL_WEIGHTS[weightId].file);
}

export function resolveLlamaModelFile(modelId: string): string | null {
  const imported = getImportedLocalModels().find((item) => item.id === modelId && item.runtime === 'llama');
  if (imported) return fs.existsSync(imported.path) ? imported.path : null;
  const weightId = catalogWeightId(modelId);
  if (!weightId || LOCAL_WEIGHTS[weightId].for !== 'translate') return null;
  return resolveWeightFile(LOCAL_WEIGHTS[weightId].file);
}

export function anyWhisperFilePresent(): boolean {
  const catalog = (Object.keys(LOCAL_WEIGHTS) as LocalWeightId[]).some(
    (id) => LOCAL_WEIGHTS[id].for === 'transcribe' && catalogFilePresent(id),
  );
  if (catalog) return true;
  return getImportedLocalModels().some((item) => item.runtime === 'whisper' && fs.existsSync(item.path));
}

export function anyLlamaFilePresent(): boolean {
  const catalog = (Object.keys(LOCAL_WEIGHTS) as LocalWeightId[]).some(
    (id) => LOCAL_WEIGHTS[id].for === 'translate' && catalogFilePresent(id),
  );
  if (catalog) return true;
  return getImportedLocalModels().some((item) => item.runtime === 'llama' && fs.existsSync(item.path));
}
