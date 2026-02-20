/**
 * Extracted punctuation injection prompt for OpenAI's Whisper acoustic model.
 * 
 * We can't pass the full complex prompt to Whisper in the same way, 
 * but we can pass a "prompt" for context/style. 
 * By passing properly punctuated sentences, we strongly coerce Whisper 
 * to return punctuated sentences instead of long unpunctuated blocks.
 */
export const WHISPER_PUNCTUATION_PROMPT = 'Transcribe accurately. Use proper punctuation. For example: Hello, world! How are you doing today?';
