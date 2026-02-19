/**
 * Centralized store for LLM prompts to separate logic from prompt engineering.
 * Each use case should have its own specific prompt function.
 */

const BASE_TRANSCRIPTION_RULES = `
Format your response as:
[MM:SS] Transcribed text for this segment
[MM:SS] Next segment of text
...

Rules:
- Transcribe all speech accurately and completely. Do not summarize or omit any words.
- Capture every word spoken, including distinct fillers.
- Add proper written punctuation: end sentences with periods, use commas for natural pauses and clause boundaries, use question marks for questions, and exclamation marks where appropriate.
- START A NEW SUBTITLE SEGMENT IMMEDIATELY WHEN THE SPEAKER CHANGES.
- Each subtitle should contain a complete thought or natural phrase. Do NOT create very short fragments under 3 words.
- Aim for 1-4 seconds of speech per subtitle segment. Group short phrases together.
- Max 2 lines of text per subtitle.
- Max 8 words per line.
- Keep natural phrases together. Do not break mid-phrase.
- Timestamps should be relative to the start of this audio clip (starting at 00:00).
- If there's silence, skip to the next speech segment.
`;

/**
 * Prompt for standard full-file transcription
 */
export function getStandardTranscriptionPrompt(languageInstruction: string): string {
    return `Transcribe this audio file into text with timestamps. ${languageInstruction}

${BASE_TRANSCRIPTION_RULES}

Transcribe the audio now:`;
}

/**
 * Prompt for healing missing gaps in subtitles.
 * Currently shares the same rules as standard transcription but allows for future divergence
 * (e.g. maybe we want to be more aggressive with finding speech in noise).
 */
export function getHealingTranscriptionPrompt(languageInstruction: string): string {
    return `Transcribe this short audio clip into text with timestamps to fill a gap in subtitles. ${languageInstruction}

${BASE_TRANSCRIPTION_RULES}

Transcribe the audio clip now:`;
}
