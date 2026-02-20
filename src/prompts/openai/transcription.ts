import { BASE_TRANSCRIPTION_RULES } from '../shared/base';

/**
 * Prompt for standard full-file transcription when using OpenAI gpt-4o models.
 */
export function getOpenAITranscriptionPrompt(languageInstruction: string): string {
    return `Transcribe this audio file into text with timestamps. ${languageInstruction}

${BASE_TRANSCRIPTION_RULES}

Transcribe the audio now:`;
}
