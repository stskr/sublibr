import { getBaseTranscriptionRules } from '../shared/base';

/**
 * Prompt for healing missing gaps in subtitles using OpenAI gpt-4o models.
 */
export function getOpenAIHealingPrompt(languageInstruction: string, maxLines: number, maxCharsPerLine: number): string {
    return `Transcribe this short audio clip into text with timestamps to fill a gap in subtitles. ${languageInstruction}

${getBaseTranscriptionRules(maxLines, maxCharsPerLine)}

Transcribe the audio clip now:`;
}
