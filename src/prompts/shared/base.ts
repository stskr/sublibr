export function getBaseTranscriptionRules(_maxLines: number, _maxCharsPerLine: number): string {
    return `Format your response as:
[MM:SS] Transcribed text for this segment
[MM:SS] Next segment of text
...

Rules:
- Transcribe all speech accurately and completely. Do not summarize or omit any words.
- START A NEW SUBTITLE SEGMENT IMMEDIATELY WHEN THE SPEAKER CHANGES. This rule takes precedence over segment duration and phrase grouping.
- Ensure that speech from two different speakers NEVER appears within the same timestamped segment.
- Capture every word spoken, do not include distinct fillers.
- Max 2 lines of text per subtitle.
- About 7–9 words per line (never more than 9).
- If a subtitle needs two lines, keep them similar in length. Do not put a full line over a 1–2 word leftover.
- Each subtitle should contain a complete thought or natural phrase. Do NOT create very short fragments under 3 words.
- Add proper written punctuation: end sentences with periods, use commas for natural pauses and clause boundaries, use question marks for questions, and exclamation marks where appropriate.
- Within a single speaker's turn, aim for 1-4 seconds of speech per segment, grouping short phrases together.
- Keep natural phrases together. Do not break mid-phrase.
- Timestamps should be relative to the start of this audio clip (starting at 00:00).
- If there's silence, skip to the next speech segment.`;
}
