import { describe, expect, it } from 'vitest';
import { inspectLocalModelBuffer, assertRuntime } from '../src/services/inspectLocalModel';
import { sanitizeImportedLocalModels } from '../src/services/importedLocalModels';
import { catalogWeightId, persistedLocalId, LOCAL_WEIGHTS } from '../src/services/localModelCatalog';
import { resolveLocalWhisperModel, resolveSavedModel, resolveSavedTranslatorModel } from '../src/services/providers';

function writeU64(buf: Buffer, offset: number, value: number): void {
  buf.writeBigUInt64LE(BigInt(value), offset);
}

function makeGguf(architecture: string, extraKvs = 0): Uint8Array {
  const key = Buffer.from('general.architecture');
  const val = Buffer.from(architecture);
  const extra = extraKvs * 16;
  const buf = Buffer.alloc(24 + 8 + key.length + 4 + 8 + val.length + extra);
  buf.write('GGUF', 0);
  buf.writeUInt32LE(3, 4);
  writeU64(buf, 8, 0);
  writeU64(buf, 16, 1 + extraKvs);
  let o = 24;
  writeU64(buf, o, key.length); o += 8;
  key.copy(buf, o); o += key.length;
  buf.writeUInt32LE(8, o); o += 4;
  writeU64(buf, o, val.length); o += 8;
  val.copy(buf, o);
  return new Uint8Array(buf);
}

describe('inspectLocalModelBuffer', () => {
  it('accepts whisper.cpp ggml files (lmgg)', () => {
    const bytes = new Uint8Array(Buffer.from('lmgg\0\0\0\0\0\0\0\0'));
    const result = inspectLocalModelBuffer(bytes, 'ggml-tiny.bin');
    expect(result.runtime).toBe('whisper');
    expect(result.architecture).toBe('whisper-ggml');
  });

  it('accepts whisper GGUF and qwen instruct GGUF', () => {
    expect(inspectLocalModelBuffer(makeGguf('whisper'), 'whisper.gguf').runtime).toBe('whisper');
    expect(inspectLocalModelBuffer(makeGguf('qwen2'), 'Qwen2.5-7B-Instruct-Q4_K_M.gguf')).toMatchObject({
      runtime: 'llama',
      architecture: 'qwen2',
    });
  });

  it('rejects embeddings and other GGUFs we cannot talk to', () => {
    expect(() => inspectLocalModelBuffer(makeGguf('bert'), 'bert.gguf')).toThrow(/not a chat model/i);
    expect(() => inspectLocalModelBuffer(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]), 'noise.bin')).toThrow(/not a whisper/i);
  });

  it('keeps Whisper and translator buttons from mixing files', () => {
    const whisper = inspectLocalModelBuffer(new Uint8Array(Buffer.from('lmggxxxx')), 'tiny.bin');
    const llama = inspectLocalModelBuffer(makeGguf('llama'), 'Llama-3.gguf');
    expect(() => assertRuntime(whisper, 'llama')).toThrow(/Whisper model/i);
    expect(() => assertRuntime(llama, 'whisper')).toThrow(/translator GGUF/i);
    expect(() => assertRuntime(whisper, 'whisper')).not.toThrow();
  });
});

describe('imported model list', () => {
  it('drops junk entries and duplicate paths', () => {
    expect(sanitizeImportedLocalModels([
      { id: 'imp_a', label: 'Tiny', path: '/models/a.bin', runtime: 'whisper', architecture: 'whisper-ggml' },
      { id: 'nope', label: 'Bad', path: '/models/b.bin', runtime: 'whisper', architecture: 'whisper-ggml' },
      { id: 'imp_b', label: 'Tiny 2', path: '/models/a.bin', runtime: 'whisper', architecture: 'whisper-ggml' },
      { id: 'imp_c', label: 'Qwen', path: '/models/c.gguf', runtime: 'llama', architecture: 'qwen2' },
    ])).toEqual([
      { id: 'imp_a', label: 'Tiny', path: '/models/a.bin', runtime: 'whisper', architecture: 'whisper-ggml' },
      { id: 'imp_c', label: 'Qwen', path: '/models/c.gguf', runtime: 'llama', architecture: 'qwen2' },
    ]);
  });
});

describe('local model ids', () => {
  it('maps saved aliases to catalog weights', () => {
    expect(catalogWeightId('whisper-large-v3-turbo')).toBe('whisper-multilingual');
    expect(catalogWeightId('ivrit-whisper-large-v3-turbo')).toBe('whisper-hebrew');
    expect(catalogWeightId('qwen2.5-7b-instruct')).toBe('qwen-translator');
    expect(catalogWeightId('whisper-tiny')).toBe('whisper-tiny');
    expect(persistedLocalId('whisper-multilingual')).toBe('whisper-large-v3-turbo');
    expect(LOCAL_WEIGHTS['whisper-tiny'].tier).toBe('advanced');
    expect(LOCAL_WEIGHTS['qwen-translator-3b'].for).toBe('translate');
  });

  it('does not auto-switch Hebrew; Turbo stays the default', () => {
    expect(resolveLocalWhisperModel('Hebrew')).toBe('whisper-large-v3-turbo');
    expect(resolveLocalWhisperModel('Hebrew', 'whisper-large-v3-turbo')).toBe('whisper-large-v3-turbo');
    expect(resolveLocalWhisperModel('Hebrew', 'whisper-tiny')).toBe('whisper-tiny');
    expect(resolveLocalWhisperModel('Hebrew', 'ivrit-whisper-large-v3-turbo')).toBe('ivrit-whisper-large-v3-turbo');
  });

  it('keeps Hebrew Whisper as an advanced catalog item', () => {
    expect(LOCAL_WEIGHTS['whisper-hebrew'].tier).toBe('advanced');
    expect(LOCAL_WEIGHTS['whisper-multilingual'].tier).toBe('recommended');
  });

  it('keeps imported and catalog ids when loading settings', () => {
    const imported = [{
      id: 'imp_abc',
      label: 'Custom',
      path: '/tmp/x.bin',
      runtime: 'whisper' as const,
      architecture: 'whisper-ggml',
    }];
    expect(resolveSavedModel('local', 'whisper-tiny', imported)).toBe('whisper-tiny');
    expect(resolveSavedModel('local', 'imp_abc', imported)).toBe('imp_abc');
    expect(resolveSavedModel('local', 'not-a-model', imported)).toBe('whisper-large-v3-turbo');
    expect(resolveSavedTranslatorModel('local', 'qwen-translator-3b')).toBe('qwen-translator-3b');
    expect(resolveSavedTranslatorModel('local', 'mystery')).toBe('qwen2.5-7b-instruct');
  });
});
