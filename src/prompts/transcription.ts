import { BASE_TRANSCRIPTION_RULES } from './base';

/**
 * Prompt for standard full-file transcription
 */
export function getStandardTranscriptionPrompt(languageInstruction: string): string {
    return `Transcribe this audio file into text with timestamps. ${languageInstruction}

${BASE_TRANSCRIPTION_RULES}

Transcribe the audio now:`;
}
