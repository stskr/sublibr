import { BASE_TRANSCRIPTION_RULES } from '../shared/base';

/**
 * Prompt for healing missing gaps in subtitles using OpenAI gpt-4o models.
 */
export function getOpenAIHealingPrompt(languageInstruction: string): string {
    return `Transcribe this short audio clip into text with timestamps to fill a gap in subtitles. ${languageInstruction}

${BASE_TRANSCRIPTION_RULES}

Transcribe the audio clip now:`;
}
