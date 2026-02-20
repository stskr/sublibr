import { getBaseTranscriptionRules } from '../shared/base';

/**
 * Prompt for healing missing gaps in subtitles.
 * Currently shares the same rules as standard transcription but allows for future divergence
 * (e.g. maybe we want to be more aggressive with finding speech in noise).
 */
export function getHealingTranscriptionPrompt(languageInstruction: string, maxLines: number, maxCharsPerLine: number): string {
    return `Transcribe this short audio clip into text with timestamps to fill a gap in subtitles. ${languageInstruction}

${getBaseTranscriptionRules(maxLines, maxCharsPerLine)}

Transcribe the audio clip now:`;
}
