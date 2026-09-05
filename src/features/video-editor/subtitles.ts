import type { SubtitleCue, SubtitleStyle } from "../../api/losslessVideo";

export type EditorSubtitleTrack = {
  id: string;
  laneId: string;
  name: string;
  language: string;
  enabled: boolean;
  sourceId: string;
  linkedVideoClipId?: string;
  linkedAudioTrackId?: string;
  style: SubtitleStyle;
  cues: SubtitleCue[];
};

export const defaultSubtitleStyle: SubtitleStyle = {
  fontFamily: "Arial",
  fontSize: 48,
  bold: true,
  italic: false,
  underline: false,
  color: "#FFFFFF",
  outlineColor: "#000000",
  outlineWidth: 2,
  backgroundColor: "#000000",
  backgroundAlpha: 0,
  backgroundBlur: 16,
  backgroundX: 50,
  backgroundY: 88,
  backgroundWidth: 72,
  backgroundHeight: 8,
  x: 50,
  position: 88,
  width: 72,
  alignment: "center"
};

export function cloneSubtitleCue(cue: SubtitleCue): SubtitleCue {
  return {
    ...cue,
    words: cue.words?.map((word) => ({ ...word }))
  };
}

export function cloneSubtitleTrack(track: EditorSubtitleTrack): EditorSubtitleTrack {
  return {
    ...track,
    style: { ...track.style },
    cues: track.cues.map(cloneSubtitleCue)
  };
}

export function normalizeSubtitleCueLane(cues: SubtitleCue[], frameRate = 60) {
  const fps = Math.max(1, Number.isFinite(frameRate) ? frameRate : 60);
  const minimumDuration = 1 / fps;
  const roundFrame = (value: number) => Math.round(Math.max(0, value) * fps) / fps;
  const sorted = cues
    .map(cloneSubtitleCue)
    .sort((left, right) => left.start - right.start || left.end - right.end || left.id.localeCompare(right.id));
  const normalized: SubtitleCue[] = [];

  sorted.forEach((candidate) => {
    let current: SubtitleCue = {
      ...candidate,
      start: roundFrame(candidate.start),
      end: Math.max(roundFrame(candidate.end), roundFrame(candidate.start) + minimumDuration)
    };
    const previousIndex = normalized.length - 1;
    const previous = normalized[previousIndex];
    if (previous && current.start < previous.end - 0.0005) {
      const minimumBoundary = previous.start + minimumDuration;
      const maximumBoundary = current.end - minimumDuration;
      const requestedBoundary = roundFrame((previous.end + current.start) / 2);
      const boundary = maximumBoundary >= minimumBoundary
        ? Math.min(maximumBoundary, Math.max(minimumBoundary, requestedBoundary))
        : minimumBoundary;
      normalized[previousIndex] = { ...previous, end: boundary };
      current = {
        ...current,
        start: boundary,
        end: Math.max(current.end, boundary + minimumDuration)
      };
    }
    normalized.push(current);
  });

  return normalized;
}

export function subtitleCueAtTime(tracks: EditorSubtitleTrack[], time: number) {
  for (let trackIndex = tracks.length - 1; trackIndex >= 0; trackIndex -= 1) {
    const track = tracks[trackIndex];
    if (!track.enabled) continue;
    const cue = track.cues.find((item) => time >= item.start - 0.001 && time < item.end - 0.001);
    if (cue) return { track, cue };
  }
  return undefined;
}

export function layoutSubtitleText(text: string, maxCharsPerLine = 16, maxLines = 2) {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  if (!normalized) return "";
  if (normalized.includes("\n")) return normalized;
  const containsCJK = /[\u3400-\u9fff\uf900-\ufaff]/.test(normalized);
  const units = containsCJK ? Array.from(normalized.replace(/\s+/g, "")) : normalized.split(" ");
  const lines: string[] = [];
  let current: string[] = [];
  const length = (items: string[]) => containsCJK ? items.join("").length : items.join(" ").length;
  units.forEach((unit) => {
    const candidate = [...current, unit];
    if (current.length && length(candidate) > maxCharsPerLine && lines.length < maxLines - 1) {
      lines.push(containsCJK ? current.join("") : current.join(" "));
      current = [unit];
    } else {
      current = candidate;
    }
  });
  if (current.length) lines.push(containsCJK ? current.join("") : current.join(" "));
  return lines.slice(0, maxLines).join("\n");
}

function srtTimestamp(value: number) {
  const millis = Math.max(0, Math.round(value * 1000));
  const hours = Math.floor(millis / 3_600_000);
  const minutes = Math.floor(millis / 60_000) % 60;
  const seconds = Math.floor(millis / 1000) % 60;
  const fraction = millis % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(fraction).padStart(3, "0")}`;
}

function assTimestamp(value: number) {
  const centis = Math.max(0, Math.round(value * 100));
  const hours = Math.floor(centis / 360_000);
  const minutes = Math.floor(centis / 6_000) % 60;
  const seconds = Math.floor(centis / 100) % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centis % 100).padStart(2, "0")}`;
}

export function serializeSubtitleSRT(tracks: EditorSubtitleTrack[]) {
  const cues = tracks
    .filter((track) => track.enabled)
    .flatMap((track) => track.cues)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  return cues.map((cue, index) => `${index + 1}\n${srtTimestamp(cue.start)} --> ${srtTimestamp(cue.end)}\n${cue.text.trim()}\n`).join("\n");
}

function assColor(value: string, alpha = 0) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1).toUpperCase() : "FFFFFF";
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255)));
  return `&H${a.toString(16).padStart(2, "0").toUpperCase()}${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`;
}

function escapeASS(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("{", "\\{").replaceAll("}", "\\}").replace(/\r?\n/g, "\\N");
}

function subtitleCharsPerLine(text: string, style: SubtitleStyle, canvasWidth: number) {
  const containsCJK = /[\u3400-\u9fff\uf900-\ufaff]/.test(text);
  const averageGlyphWidth = Math.max(1, style.fontSize * (containsCJK ? 1 : 0.56));
  const boxWidth = Math.max(1, canvasWidth * Math.max(5, Math.min(100, style.width)) / 100);
  const contentWidth = Math.max(1, boxWidth - style.fontSize * 0.52 - 2);
  return Math.max(4, Math.min(80, Math.floor(contentWidth / averageGlyphWidth)));
}

export function layoutSubtitleForCanvas(text: string, style: SubtitleStyle, canvasWidth: number) {
  return layoutSubtitleText(text, subtitleCharsPerLine(text, style, canvasWidth), 20);
}

export function subtitleBackgroundHeightPercent(text: string, style: SubtitleStyle, canvasWidth: number, canvasHeight: number) {
  if (Number.isFinite(style.backgroundHeight) && style.backgroundHeight >= 2) {
    return Math.max(2, Math.min(100, style.backgroundHeight));
  }
  const lineCount = Math.max(1, layoutSubtitleForCanvas(text, style, canvasWidth).split("\n").length);
  // Keep this geometry in lockstep with the preview box and the native export renderer.
  const heightPixels = lineCount * style.fontSize * 1.28 + style.fontSize * 0.16 + 2;
  return Math.max(2, Math.min(60, heightPixels / Math.max(1, canvasHeight) * 100));
}

export function serializeSubtitleASS(tracks: EditorSubtitleTrack[], width = 1920, height = 1080) {
  const enabledTracks = tracks.filter((track) => track.enabled && track.cues.length);
  const styles = enabledTracks.map((track, index) => {
    const style = track.style;
    return `Style: Track${index + 1},${style.fontFamily.replaceAll(",", " ")},${style.fontSize},${assColor(style.color)},&H000000FF,${assColor(style.outlineColor)},${assColor(style.backgroundColor, 1 - style.backgroundAlpha)},${style.bold ? -1 : 0},${style.italic ? -1 : 0},${style.underline ? -1 : 0},0,100,100,0,0,${style.backgroundAlpha > 0 ? 3 : 1},${style.outlineWidth},0,5,0,0,0,1`;
  });
  const events = enabledTracks.flatMap((track, index) => {
    const legacyX = track.style.alignment === "left" ? 6 : track.style.alignment === "right" ? 94 : 50;
    const xPercent = Number.isFinite(track.style.x) ? track.style.x : legacyX;
    const x = Math.round(Math.max(0, Math.min(100, xPercent)) / 100 * width);
    const y = Math.round(Math.max(0, Math.min(100, track.style.position)) / 100 * height);
    return track.cues.map((cue) => {
      const text = layoutSubtitleForCanvas(cue.text, track.style, width);
      return `Dialogue: ${index},${assTimestamp(cue.start)},${assTimestamp(cue.end)},Track${index + 1},${(cue.speaker || "").replaceAll(",", " ")},0,0,0,,{\\an5\\pos(${x},${y})}${escapeASS(text)}`;
    });
  });
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${Math.round(width)}\nPlayResY: ${Math.round(height)}\nScaledBorderAndShadow: yes\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${styles.join("\n")}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join("\n")}\n`;
}

function parseTimestamp(value: string) {
  const match = value.trim().replace(",", ".").match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!match) return undefined;
  const fraction = Number(`0.${(match[4] || "0").padEnd(3, "0").slice(0, 3)}`);
  return Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + fraction;
}

export function parseSubtitleText(text: string, extension: string): SubtitleCue[] {
  const ext = extension.toLowerCase();
  const cues: SubtitleCue[] = [];
  if (ext === ".ass" || ext === ".ssa") {
    text.split(/\r?\n/).forEach((line) => {
      if (!/^Dialogue:/i.test(line)) return;
      const fields = line.slice(line.indexOf(":") + 1).split(",");
      if (fields.length < 10) return;
      const start = parseTimestamp(fields[1]);
      const end = parseTimestamp(fields[2]);
      if (start === undefined || end === undefined || end <= start) return;
      const value = fields.slice(9).join(",").replace(/\{[^}]*\}/g, "").replace(/\\N/gi, "\n").trim();
      if (value) cues.push({ id: `subtitle-import-${cues.length + 1}`, start, end, sourceStart: start, sourceEnd: end, text: value, confidence: 1 });
    });
    return cues;
  }
  const normalized = text.replace(/^WEBVTT[^\n]*\n/i, "").replace(/\r/g, "");
  normalized.split(/\n{2,}/).forEach((block) => {
    const lines = block.split("\n").filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) return;
    const [rawStart, rawEnd] = lines[timingIndex].split("-->");
    const start = parseTimestamp(rawStart);
    const end = parseTimestamp(rawEnd.split(/\s+/)[0]);
    const value = lines.slice(timingIndex + 1).join("\n").replace(/<[^>]+>/g, "").trim();
    if (start === undefined || end === undefined || end <= start || !value) return;
    cues.push({ id: `subtitle-import-${cues.length + 1}`, start, end, sourceStart: start, sourceEnd: end, text: value, confidence: 1 });
  });
  return cues;
}

export function downloadSubtitleText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
