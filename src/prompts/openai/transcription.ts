import { getBaseTranscriptionRules } from '../shared/base';

/**
 * Prompt for standard full-file transcription when using OpenAI gpt-4o models.
 */
export function getOpenAITranscriptionPrompt(languageInstruction: string, maxLines: number, maxCharsPerLine: number): string {
    return `Transcribe this audio file into text with timestamps. ${languageInstruction}

${getBaseTranscriptionRules(maxLines, maxCharsPerLine)}

Transcribe the audio now:`;
}
