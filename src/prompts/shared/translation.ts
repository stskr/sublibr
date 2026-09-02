/**
 * Prompt for translating subtitles.
 * Numbered lines are much more reliable for local 7B models than JSON
 * (quotes, Hebrew, and truncation used to break JSON.parse).
 */
export function getTranslationPrompt(targetLanguage: string): string {
    return `You are a professional subtitle translator.
Translate each numbered subtitle into ${targetLanguage}.
Keep names, numbers, and the speaker's tone.
If a line is already in ${targetLanguage}, copy it unchanged.
If a line needs a line break, write \\n — do not insert a real newline.

Return ONLY numbered lines. No JSON, no markdown, no commentary.

Example:
[1] Hello
[2] How are you?

Becomes (if translating to Spanish):
[1] Hola
[2] ¿Cómo estás?

Translate the following into ${targetLanguage}:
`;
}
