import type { Subtitle } from '../types';
import { generateId, parseSrtTime } from '../utils';

// Parse SRT timecode (also works for VTT since parseSrtTime accepts both , and . separators)
function parseTimecode(timecode: string): number {
    // Try standard SRT/VTT format: HH:MM:SS,mmm or HH:MM:SS.mmm
    const standard = parseSrtTime(timecode);
    if (standard > 0) return standard;

    // Handle MM:SS,mmm or MM:SS.mmm (no hours)
    const shortMatch = timecode.match(/(\d{1,2}):(\d{2})[,.](\d{3})/);
    if (shortMatch) {
        const [, minutes, seconds, ms] = shortMatch;
        return parseInt(minutes) * 60 + parseInt(seconds) + parseInt(ms) / 1000;
    }

    return 0;
}

// Parse ASS timecode: H:MM:SS.cc (centiseconds)
function parseAssTime(timecode: string): number {
    const match = timecode.match(/(\d+):(\d{2}):(\d{2})\.(\d{2})/);
    if (!match) return 0;
    const [, hours, minutes, seconds, cs] = match;
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(cs) / 100;
}

export function parseSrt(text: string): Subtitle[] {
    const subtitles: Subtitle[] = [];
    // Normalize line endings and split into blocks
    const blocks = text.replace(/\r\n/g, '\n').trim().split(/\n\n+/);

    for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length < 2) continue;

        // Find the timecode line (contains -->)
        let timecodeLineIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('-->')) {
                timecodeLineIdx = i;
                break;
            }
        }
        if (timecodeLineIdx === -1) continue;

        const timeParts = lines[timecodeLineIdx].split('-->').map(s => s.trim());
        if (timeParts.length !== 2) continue;

        const startTime = parseTimecode(timeParts[0]);
        const endTime = parseTimecode(timeParts[1]);
        if (endTime <= startTime) continue;

        // Text is everything after the timecode line
        const textLines = lines.slice(timecodeLineIdx + 1).join('\n').trim();
        if (!textLines) continue;

        subtitles.push({
            id: generateId(),
            index: subtitles.length + 1,
            startTime,
            endTime,
            text: textLines,
        });
    }

    return subtitles;
}

export function parseVtt(text: string): Subtitle[] {
    // Remove the WEBVTT header and any metadata before the first cue
    let content = text.replace(/\r\n/g, '\n').trim();
    // Strip the WEBVTT header line and any following header block
    const headerEnd = content.indexOf('\n\n');
    if (headerEnd !== -1) {
        content = content.substring(headerEnd).trim();
    } else {
        // No cues found
        return [];
    }

    // VTT format is very similar to SRT, reuse the SRT parser
    return parseSrt(content);
}

export function parseAss(text: string): Subtitle[] {
    const subtitles: Subtitle[] = [];
    const lines = text.replace(/\r\n/g, '\n').split('\n');

    // Find [Events] section and its Format line
    let inEvents = false;
    let formatFields: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.toLowerCase() === '[events]') {
            inEvents = true;
            continue;
        }

        // Exit events section if another section starts
        if (inEvents && trimmed.startsWith('[') && trimmed.endsWith(']')) {
            break;
        }

        if (!inEvents) continue;

        if (trimmed.toLowerCase().startsWith('format:')) {
            formatFields = trimmed.substring(7).split(',').map(f => f.trim().toLowerCase());
            continue;
        }

        if (trimmed.toLowerCase().startsWith('dialogue:')) {
            const data = trimmed.substring(9);
            // Split by commas, but the Text field (last) may contain commas
            const fields = data.split(',');

            const startIdx = formatFields.indexOf('start');
            const endIdx = formatFields.indexOf('end');
            const textIdx = formatFields.indexOf('text');

            if (startIdx === -1 || endIdx === -1 || textIdx === -1) continue;
            if (fields.length <= textIdx) continue;

            const startTime = parseAssTime(fields[startIdx].trim());
            const endTime = parseAssTime(fields[endIdx].trim());
            // Text field is everything from textIdx onward (may contain commas)
            const rawText = fields.slice(textIdx).join(',').trim();
            // Convert ASS line breaks (\N, \n) to actual newlines and strip style overrides
            const cleanText = rawText
                .replace(/\\N/g, '\n')
                .replace(/\\n/g, '\n')
                .replace(/\{[^}]*\}/g, '');

            if (endTime <= startTime || !cleanText) continue;

            subtitles.push({
                id: generateId(),
                index: subtitles.length + 1,
                startTime,
                endTime,
                text: cleanText,
            });
        }
    }

    return subtitles;
}

export function parseSubtitleFile(text: string, ext: string): Subtitle[] {
    const normalizedExt = ext.toLowerCase().replace(/^\./, '');

    switch (normalizedExt) {
        case 'srt':
            return parseSrt(text);
        case 'vtt':
        case 'webvtt':
            return parseVtt(text);
        case 'ass':
        case 'ssa':
            return parseAss(text);
        default:
            throw new Error(`Unsupported subtitle format: .${normalizedExt}`);
    }
}
