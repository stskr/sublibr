/**
 * Prompt for translating subtitles.
 * Takes a JSON string consisting of subtitle elements [{id, text}]
 * Returns the exact same JSON format with text translated to the target language.
 */
export function getTranslationPrompt(targetLanguage: string): string {
    return `You are an expert professional subtitle translator.
Your task is to translate the provided subtitle text into ${targetLanguage}.
If the input text is ALREADY in ${targetLanguage}, simply return the exact same text.

INPUT FORMAT:
You will receive a JSON array of objects. Each object has an "id" and a "text" (the original subtitle).

OUTPUT FORMAT:
You MUST return ONLY a perfectly valid JSON array of objects.
Each object must have the EXACT SAME "id" as the input, but the "text" field must be the translation in ${targetLanguage}.
Ensure all double quotes inside the translated text are properly escaped (e.g., \\").
DO NOT wrap the output in markdown blocks (e.g., no \`\`\`json).
DO NOT add any conversational text before or after the JSON.

Expected Output Example:
[
  { "id": "123", "text": "Hola mundo" }
]

Translate the following JSON array into ${targetLanguage} now:
`;
}
