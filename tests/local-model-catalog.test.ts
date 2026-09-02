import { describe, expect, it } from 'vitest';
import { LOCAL_WEIGHTS, LOCAL_WEIGHT_IDS, formatWeightSize } from '../src/services/localModelCatalog';

describe('local model catalog', () => {
  it('saves files under the names Whisper and llama.cpp already look for', () => {
    expect(LOCAL_WEIGHTS['whisper-multilingual'].file).toBe('ggml-large-v3-turbo-official.bin');
    expect(LOCAL_WEIGHTS['whisper-hebrew'].file).toBe('ggml-large-v3-turbo.bin');
    expect(LOCAL_WEIGHTS['qwen-translator'].file).toBe('Qwen2.5-7B-Instruct-Q4_K_M.gguf');
    expect(LOCAL_WEIGHTS['whisper-tiny'].file).toBe('ggml-tiny.bin');
    expect(LOCAL_WEIGHTS['qwen-translator-3b'].file).toBe('Qwen2.5-3B-Instruct-Q4_K_M.gguf');
  });

  it('points at Hugging Face resolve URLs', () => {
    for (const id of LOCAL_WEIGHT_IDS) {
      expect(LOCAL_WEIGHTS[id].url).toMatch(/^https:\/\/huggingface\.co\//);
      expect(LOCAL_WEIGHTS[id].url).toContain('/resolve/');
    }
  });

  it('formats sizes for the download buttons', () => {
    expect(formatWeightSize(1_624_555_275)).toBe('1.6 GB');
    expect(formatWeightSize(4_682_123_264)).toBe('4.7 GB');
  });
});
