export type LocalRuntime = 'whisper' | 'llama';

export type InspectedLocalModel = {
  runtime: LocalRuntime;
  architecture: string;
  label: string;
};

const GGML_MAGICS = new Set(['lmgg', 'fmgg', 'tjgg']);
const LLM_ARCHITECTURES = new Set([
  'qwen2',
  'qwen2moe',
  'qwen3',
  'llama',
  'gemma',
  'gemma2',
  'gemma3',
]);

const GGUF_STRING = 8;

/** Read enough of a weight file to know whether whisper.cpp or llama-server can use it. */
export function inspectLocalModelBuffer(bytes: Uint8Array, filename: string): InspectedLocalModel {
  if (bytes.length < 8) {
    throw new Error('That file is too small to be a model.');
  }

  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (GGML_MAGICS.has(magic)) {
    return {
      runtime: 'whisper',
      architecture: 'whisper-ggml',
      label: labelFromFilename(filename),
    };
  }

  if (magic === 'GGUF') {
    const architecture = readGgufArchitecture(bytes);
    if (architecture === 'whisper') {
      return {
        runtime: 'whisper',
        architecture,
        label: labelFromFilename(filename),
      };
    }
    if (LLM_ARCHITECTURES.has(architecture)) {
      return {
        runtime: 'llama',
        architecture,
        label: labelFromFilename(filename),
      };
    }
    throw new Error(
      `This GGUF (${architecture}) is not a chat model Sublibr can translate with. Use a Qwen, Llama, or Gemma instruct GGUF.`,
    );
  }

  throw new Error('That file is not a whisper.cpp or llama.cpp model Sublibr can use.');
}

export function assertRuntime(inspected: InspectedLocalModel, expected: LocalRuntime): void {
  if (inspected.runtime === expected) return;
  if (expected === 'whisper') {
    throw new Error('That file is a translator GGUF. Add it under Models → translator, not Whisper.');
  }
  throw new Error('That file is a Whisper model. Add it under Models → Whisper, not translator.');
}

export function labelFromFilename(filename: string): string {
  return filename.replace(/\.(gguf|bin)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Custom model';
}

function readGgufArchitecture(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 24) throw new Error('That GGUF header is incomplete.');
  const version = view.getUint32(4, true);
  if (version < 2 || version > 3) {
    throw new Error(`Unsupported GGUF version (${version}).`);
  }
  const kvCount = Number(view.getBigUint64(16, true));
  let offset = 24;
  for (let i = 0; i < kvCount && offset + 8 < bytes.length; i += 1) {
    const key = readGgufString(bytes, view, offset);
    offset = key.next;
    if (offset + 4 > bytes.length) break;
    const valueType = view.getUint32(offset, true);
    offset += 4;
    if (key.value === 'general.architecture' && valueType === GGUF_STRING) {
      return readGgufString(bytes, view, offset).value;
    }
    offset = skipGgufValue(bytes, view, offset, valueType);
  }
  throw new Error('Could not read this GGUF’s architecture.');
}

function readGgufString(bytes: Uint8Array, view: DataView, offset: number): { value: string; next: number } {
  if (offset + 8 > bytes.length) throw new Error('That GGUF metadata is truncated.');
  const length = Number(view.getBigUint64(offset, true));
  const start = offset + 8;
  const end = start + length;
  if (length < 0 || end > bytes.length) throw new Error('That GGUF metadata is truncated.');
  return {
    value: new TextDecoder().decode(bytes.subarray(start, end)),
    next: end,
  };
}

function skipGgufValue(bytes: Uint8Array, view: DataView, offset: number, valueType: number): number {
  if (valueType === GGUF_STRING) return readGgufString(bytes, view, offset).next;
  if (valueType === 9) {
    if (offset + 12 > bytes.length) return bytes.length;
    const itemType = view.getUint32(offset, true);
    const count = Number(view.getBigUint64(offset + 4, true));
    let next = offset + 12;
    for (let i = 0; i < count && next < bytes.length; i += 1) {
      next = skipGgufValue(bytes, view, next, itemType);
    }
    return next;
  }
  const sizes: Record<number, number> = {
    0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8,
  };
  const size = sizes[valueType];
  if (!size) throw new Error('Unsupported GGUF metadata type.');
  return offset + size;
}
