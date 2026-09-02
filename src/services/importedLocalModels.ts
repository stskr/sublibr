import type { ImportedLocalModel } from '../types';

export function sanitizeImportedLocalModels(raw: unknown): ImportedLocalModel[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ImportedLocalModel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    const label = typeof rec.label === 'string' ? rec.label.trim() : '';
    const modelPath = typeof rec.path === 'string' ? rec.path.trim() : '';
    const runtime = rec.runtime;
    const architecture = typeof rec.architecture === 'string' ? rec.architecture : '';
    if (!id.startsWith('imp_')) continue;
    if (!modelPath) continue;
    if (runtime !== 'whisper' && runtime !== 'llama') continue;
    if (seen.has(id) || seen.has(modelPath)) continue;
    seen.add(id);
    seen.add(modelPath);
    out.push({
      id,
      label: label || 'Custom model',
      path: modelPath,
      runtime,
      architecture,
    });
  }
  return out;
}

export function newImportedModelId(): string {
  return `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
