import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  Diamond,
  Download,
  Eye,
  FileVideo,
  FolderOpen,
  Layers3,
  ListChecks,
  Loader2,
  Maximize2,
  Move,
  Music2,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Scissors,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Sticker,
  Target,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  ZoomIn,
  XCircle
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  cancelVideoTask,
  createVideoTaskId,
  detectDuplicateSegments,
  downloadVideoOutput,
  exportCleanVideo,
  getAudioSeparationStatus,
  getVideoTaskInfo,
  type AudioSeparationMode,
  type AudioSeparationOptions,
  type AudioSeparationQuality,
  type AudioSeparationStatus,
  type DetectParams,
  type DialogueStrength,
  type DuplicateSegment,
  type ExportMediaTrack,
  type ExportVideoClip,
  type LosslessCutMode,
  type MediaKeyframe,
  type VideoInput
} from "../api/losslessVideo";
import AppSelect from "../components/AppSelect";
import AppSwitch from "../components/AppSwitch";
import SegmentedControl from "../components/SegmentedControl";
import { notify } from "../utils/notify";

type TaskStatus = "idle" | "detecting" | "detected" | "exporting" | "done" | "error" | "cancelled";

type ProgressState = {
  percent: number;
  label: string;
  detail: string;
};

type InspectorTab = "detect" | "tracks" | "export";
type SegmentFilter = "settings" | "repeat" | "transition";

type EditorTrackBase = {
  id: string;
  sourceId: string;
  laneId: string;
  name: string;
  file: File;
  previewUrl: string;
  start: number;
  end: number;
  enabled: boolean;
};

type AudioEditorTrack = EditorTrackBase & {
  type: "audio";
  sourceDuration: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  loop: boolean;
};

type ImageEditorTrack = EditorTrackBase & {
  type: "image";
  animated: boolean;
  opacity: number;
  sourceWidth: number;
  sourceHeight: number;
  videoAspectRatio: number;
  staticTransform: MediaKeyframe;
  keyframes: MediaKeyframe[];
};

type EditorTrack = AudioEditorTrack | ImageEditorTrack;
type ImageEasing = NonNullable<MediaKeyframe["easing"]>;

type VideoEditorSource = {
  id: string;
  type: "video";
  name: string;
  file: File;
  previewUrl: string;
  thumbnailUrl?: string;
  duration: number;
  width: number;
  height: number;
  primary: boolean;
};

type ImportedAudioResource = {
  id: string;
  type: "audio";
  name: string;
  file: File;
  previewUrl: string;
  duration: number;
};

type ImportedImageResource = {
  id: string;
  type: "image";
  name: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
};

type ImportedMediaResource = ImportedAudioResource | ImportedImageResource;
type ImportedResource = VideoEditorSource | ImportedMediaResource;

type VideoEditorClip = {
  id: string;
  sourceId: string;
  laneId: string;
  name: string;
  start: number;
  end: number;
  sourceStart: number;
  sourceEnd: number;
};

type TimelineLane = {
  id: string;
  type: "video" | EditorTrack["type"];
  clips: EditorTrack[];
  videoClips: VideoEditorClip[];
};

type PendingEditorMedia =
  | { type: "audio"; sourceId: string; file: File; previewUrl: string; sourceDuration: number }
  | { type: "image"; sourceId: string; file: File; previewUrl: string; sourceWidth: number; sourceHeight: number };

type PreviewSize = {
  width: number;
  height: number;
};

type TimelineViewport = {
  width: number;
  scrollLeft: number;
};

type TimelineTick = {
  index: number;
  kind: "major" | "medium" | "minor" | "frame";
  percent: number;
  time: number;
};

type FrameSyncedVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const imageResizeHandles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type ImageResizeHandle = (typeof imageResizeHandles)[number];
type ImageTransformAction = "move" | "rotate" | `resize-${ImageResizeHandle}`;

const defaultParams: DetectParams = {
  maxSearchWindowSec: 30,
  minRepeatSec: 2,
  audioSimilarity: 95,
  videoSimilarity: 97,
  frameSampleFps: 2,
  confirmPaddingMs: 300,
  preferAudioFirst: true,
  autoCropBlackBars: false,
  autoDetectSlideTransitions: true
};

const defaultAudioSeparation: AudioSeparationOptions = {
  enabled: false,
  mode: "dialogue",
  quality: "high",
  dialogueStrength: "strong",
  backgroundVolume: 0
};

const settingsStorageKey = "wse.losslessVideo.settings.v1";
const audioSettingsVersion = 2;
const dialogueModeMigrationKey = "wse.losslessVideo.tigerDialogue.v1";
const timelineFps = 60;
const timelineEdgeSpacePx = 7;
const timelineMinZoom = 0.25;
const timelineMinZoomExponent = Math.log2(timelineMinZoom);
const timelineMaxFrameWidthPx = 48;
const timelineMaxCanvasWidthPx = 16_000_000;
const timelineAbsoluteMaxZoom = 16_384;
const resourceDragMime = "application/x-wse-video-resource";
const playbackRateOptions = [
  { label: "0.5x", value: 0.5 },
  { label: "0.75x", value: 0.75 },
  { label: "1x", value: 1 },
  { label: "1.25x", value: 1.25 },
  { label: "1.5x", value: 1.5 },
  { label: "1.75x", value: 1.75 },
  { label: "2x", value: 2 }
];
const segmentFilterOptions: { label: string; value: SegmentFilter }[] = [
  { label: "基础设置", value: "settings" },
  { label: "重复", value: "repeat" },
  { label: "转场", value: "transition" }
];
const audioSeparationQualityOptions: { label: string; value: AudioSeparationQuality }[] = [
  { label: "快速", value: "fast" },
  { label: "标准", value: "standard" },
  { label: "高质量", value: "high" }
];
const audioSeparationModeOptions: { label: string; value: AudioSeparationMode }[] = [
  { label: "全部人声（含演唱）", value: "vocals" },
  { label: "仅对白（去演唱）", value: "dialogue" }
];
const dialogueStrengthOptions: { label: string; value: DialogueStrength }[] = [
  { label: "保留优先", value: "conservative" },
  { label: "平衡", value: "standard" },
  { label: "去歌优先", value: "strong" }
];
const imageEasingOptions: { label: string; value: ImageEasing }[] = [
  { label: "匀速", value: "linear" },
  { label: "缓入", value: "ease-in" },
  { label: "缓出", value: "ease-out" },
  { label: "平滑", value: "ease-in-out" }
];

const cutModeOptions: { label: string; value: LosslessCutMode }[] = [
  { label: "关键帧无损", value: "keyframe-copy" },
  { label: "混合裁剪", value: "hybrid" },
  { label: "精确重编码", value: "precise-reencode" }
];

function readNumberSetting(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBooleanSetting(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function isCutMode(value: unknown): value is LosslessCutMode {
  return typeof value === "string" && cutModeOptions.some((option) => option.value === value);
}

function isAudioSeparationQuality(value: unknown): value is AudioSeparationQuality {
  return value === "fast" || value === "standard" || value === "high";
}

function isAudioSeparationMode(value: unknown): value is AudioSeparationMode {
  return value === "vocals" || value === "dialogue";
}

function isDialogueStrength(value: unknown): value is DialogueStrength {
  return value === "conservative" || value === "standard" || value === "strong";
}

function loadStoredSettings() {
  if (typeof window === "undefined") {
    return { params: defaultParams, mode: "keyframe-copy" as LosslessCutMode, audioSeparation: defaultAudioSeparation };
  }
  try {
    const rawValue = window.localStorage.getItem(settingsStorageKey);
    if (!rawValue) {
      return { params: defaultParams, mode: "keyframe-copy" as LosslessCutMode, audioSeparation: defaultAudioSeparation };
    }
    const stored = JSON.parse(rawValue) as {
      params?: Partial<DetectParams>;
      mode?: unknown;
      audioSeparation?: Partial<AudioSeparationOptions> & { settingsVersion?: number };
    };
    const storedParams = stored.params || {};
    const storedAudioSeparation = stored.audioSeparation || {};
    const hasCurrentAudioSettings = storedAudioSeparation.settingsVersion === audioSettingsVersion;
    return {
      params: {
        maxSearchWindowSec: readNumberSetting(storedParams.maxSearchWindowSec, defaultParams.maxSearchWindowSec),
        minRepeatSec: readNumberSetting(storedParams.minRepeatSec, defaultParams.minRepeatSec),
        audioSimilarity: readNumberSetting(storedParams.audioSimilarity, defaultParams.audioSimilarity),
        videoSimilarity: readNumberSetting(storedParams.videoSimilarity, defaultParams.videoSimilarity),
        frameSampleFps: readNumberSetting(storedParams.frameSampleFps, defaultParams.frameSampleFps),
        confirmPaddingMs: readNumberSetting(storedParams.confirmPaddingMs, defaultParams.confirmPaddingMs),
        preferAudioFirst: readBooleanSetting(storedParams.preferAudioFirst, defaultParams.preferAudioFirst),
        autoCropBlackBars: false,
        autoDetectSlideTransitions: readBooleanSetting(storedParams.autoDetectSlideTransitions, defaultParams.autoDetectSlideTransitions)
      },
      mode: isCutMode(stored.mode) ? stored.mode : "keyframe-copy",
      audioSeparation: {
        enabled: readBooleanSetting(storedAudioSeparation.enabled, defaultAudioSeparation.enabled),
        mode: hasCurrentAudioSettings && isAudioSeparationMode(storedAudioSeparation.mode)
          ? storedAudioSeparation.mode
          : defaultAudioSeparation.mode,
        quality: hasCurrentAudioSettings && isAudioSeparationQuality(storedAudioSeparation.quality)
          ? storedAudioSeparation.quality
          : defaultAudioSeparation.quality,
        dialogueStrength: hasCurrentAudioSettings && isDialogueStrength(storedAudioSeparation.dialogueStrength)
          ? storedAudioSeparation.dialogueStrength
          : defaultAudioSeparation.dialogueStrength,
        backgroundVolume: clampValue(readNumberSetting(storedAudioSeparation.backgroundVolume, defaultAudioSeparation.backgroundVolume), 0, 1)
      }
    };
  } catch {
    return { params: defaultParams, mode: "keyframe-copy" as LosslessCutMode, audioSeparation: defaultAudioSeparation };
  }
}

function formatSeconds(value: number) {
  if (!Number.isFinite(value)) return "--:--";
  const safeValue = Math.max(0, value);
  const hours = Math.floor(safeValue / 3600);
  const minutes = Math.floor((safeValue % 3600) / 60);
  const seconds = safeValue % 60;
  const secondText = seconds.toFixed(2).padStart(5, "0");
  if (hours > 0) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${secondText}`;
  return `${String(minutes).padStart(2, "0")}:${secondText}`;
}

function formatCompactDuration(value: number) {
  if (!Number.isFinite(value)) return "--";
  return `${Number(Math.max(0, value).toFixed(2))}s`;
}

function formatTimelineTimecode(value: number, fps: number) {
  const safeFps = Math.max(1, Math.round(fps));
  const totalFrames = Math.max(0, Math.round(value * safeFps));
  const frames = totalFrames % safeFps;
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pickTimelineMajorStep(targetSeconds: number, fps: number) {
  const safeFps = Math.max(1, Math.round(fps));
  const candidates = [
    1 / safeFps,
    2 / safeFps,
    5 / safeFps,
    10 / safeFps,
    15 / safeFps,
    30 / safeFps,
    1,
    2,
    3,
    5,
    10,
    15,
    30,
    60,
    120,
    180,
    300,
    600,
    1800,
    3600,
    7200,
    10800,
    21600,
    43200,
    86400
  ];
  const safeTarget = Math.max(1 / safeFps, Number.isFinite(targetSeconds) ? targetSeconds : 1);
  const matched = candidates.find((candidate) => candidate >= safeTarget - 0.000001);
  if (matched) return matched;
  return Math.ceil(safeTarget / 86400) * 86400;
}

function pickTimelineSubdivisionCount(majorStep: number, fps: number) {
  const frameCount = Math.max(1, Math.round(majorStep * Math.max(1, fps)));
  if (frameCount < 5) return frameCount;
  return frameCount % 10 === 0 ? 10 : 5;
}

function formatTimelineRulerLabel(value: number, majorStep: number, fps: number) {
  if (majorStep < 1) return formatTimelineTimecode(value, fps);
  const totalSeconds = Math.max(0, Math.round(value));
  if (totalSeconds === 0) return "00:00";
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${String(totalMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function calculateImageHeightPercent(width: number, sourceWidth: number, sourceHeight: number, videoAspectRatio: number) {
  const sourceAspectRatio = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 1;
  return clampValue(width * Math.max(0.01, videoAspectRatio) / Math.max(0.01, sourceAspectRatio), 1, 200);
}

function resolveImageHeight(track: ImageEditorTrack, keyframe: MediaKeyframe) {
  return clampValue(
    keyframe.height ?? calculateImageHeightPercent(keyframe.width, track.sourceWidth, track.sourceHeight, track.videoAspectRatio),
    1,
    200
  );
}

function createEditorId(prefix: string) {
  return `${prefix}-${createVideoTaskId()}`;
}

function readImageEasing(value: unknown): ImageEasing {
  return imageEasingOptions.some((option) => option.value === value) ? value as ImageEasing : "linear";
}

function applyImageEasing(progress: number, easing: ImageEasing) {
  const value = clampValue(progress, 0, 1);
  if (easing === "ease-in") return value * value;
  if (easing === "ease-out") return 1 - (1 - value) * (1 - value);
  if (easing === "ease-in-out") return value * value * (3 - 2 * value);
  return value;
}

function getTrackLaneId(track: EditorTrack) {
  return track.laneId || track.id;
}

function findAvailableClipStart(clips: Array<{ start: number; end: number }>, preferredStart: number, clipDuration: number, timelineEnd: number) {
  const maxStart = Number.isFinite(timelineEnd) ? Math.max(0, timelineEnd - clipDuration) : Number.POSITIVE_INFINITY;
  let cursor = clampValue(preferredStart, 0, maxStart);
  const sorted = [...clips].sort((left, right) => left.start - right.start);
  for (const clip of sorted) {
    if (clip.end <= cursor + 0.001) continue;
    if (clip.start - cursor >= clipDuration - 0.001) return cursor;
    cursor = Math.max(cursor, clip.end);
    if (cursor > maxStart + 0.001) return undefined;
  }
  return cursor <= maxStart + 0.001 ? cursor : undefined;
}

function getLaneClipBounds(tracks: EditorTrack[], track: EditorTrack, timelineEnd: number) {
  let minimumStart = 0;
  let maximumEnd = Math.max(track.end, timelineEnd);
  const laneId = getTrackLaneId(track);

  tracks.forEach((candidate) => {
    if (candidate.id === track.id || getTrackLaneId(candidate) !== laneId) return;
    if (candidate.end <= track.start + 0.001) minimumStart = Math.max(minimumStart, candidate.end);
    if (candidate.start >= track.end - 0.001) maximumEnd = Math.min(maximumEnd, candidate.start);
  });

  return { minimumStart, maximumEnd };
}

function getVideoProjectDuration(clips: VideoEditorClip[]) {
  return clips.reduce((maximum, clip) => Math.max(maximum, clip.end), 0);
}

function getTimelineProjectDuration(videoClips: VideoEditorClip[], tracks: EditorTrack[]) {
  return Math.max(
    getVideoProjectDuration(videoClips),
    tracks.reduce((maximum, track) => Math.max(maximum, track.end), 0)
  );
}

function mergeTimelineLaneOrder(current: string[], videoClips: VideoEditorClip[], tracks: EditorTrack[]) {
  const available = new Set([
    ...videoClips.map((clip) => clip.laneId),
    ...tracks.map(getTrackLaneId)
  ]);
  const next = current.filter((laneId) => available.has(laneId));
  available.forEach((laneId) => {
    if (!next.includes(laneId)) next.push(laneId);
  });
  return next;
}

function findVideoClipAtTime(clips: VideoEditorClip[], time: number, laneOrder: string[] = []) {
  const safeTime = Math.max(0, time);
  const lanePosition = new Map(laneOrder.map((laneId, index) => [laneId, index]));
  return clips
    .filter((clip) => safeTime >= clip.start - 0.0005 && safeTime < clip.end - 0.0005)
    .sort((left, right) => (lanePosition.get(left.laneId) ?? Number.MAX_SAFE_INTEGER) - (lanePosition.get(right.laneId) ?? Number.MAX_SAFE_INTEGER))[0];
}

function isVideoTimelineEdited(clips: VideoEditorClip[], sources: VideoEditorSource[], primaryDuration: number) {
  if (!clips.length) return true;
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  if (clips.some((clip) => sourceById.get(clip.sourceId)?.primary === false)) return true;
  const primarySource = sources.find((source) => source.primary);
  if (!primarySource || primaryDuration <= 0) return false;
  const sorted = [...clips].sort((left, right) => left.start - right.start);
  let timelineCursor = 0;
  let sourceCursor = 0;
  for (const clip of sorted) {
    if (clip.sourceId !== primarySource.id) return true;
    if (Math.abs(clip.start - timelineCursor) > 0.03 || Math.abs(clip.sourceStart - sourceCursor) > 0.03) return true;
    const timelineLength = clip.end - clip.start;
    const sourceLength = clip.sourceEnd - clip.sourceStart;
    if (Math.abs(timelineLength - sourceLength) > 0.03) return true;
    timelineCursor = clip.end;
    sourceCursor = clip.sourceEnd;
  }
  return Math.abs(timelineCursor - primaryDuration) > 0.03 || Math.abs(sourceCursor - primaryDuration) > 0.03;
}

function videoTimelineNeedsComposition(clips: VideoEditorClip[]) {
  if (!clips.length) return false;
  const laneId = clips[0].laneId;
  const sorted = [...clips].sort((left, right) => left.start - right.start);
  let cursor = 0;
  for (const clip of sorted) {
    if (clip.laneId !== laneId || Math.abs(clip.start - cursor) > 0.03) return true;
    cursor = clip.end;
  }
  return false;
}

function mapPrimarySourceRangeToProject(
  clips: VideoEditorClip[],
  sources: VideoEditorSource[],
  sourceStart: number,
  sourceEnd: number
) {
  const primarySourceIds = new Set(sources.filter((source) => source.primary).map((source) => source.id));
  const primaryClips = clips
    .filter((clip) => primarySourceIds.has(clip.sourceId))
    .sort((left, right) => left.sourceStart - right.sourceStart);
  let sourceCursor = sourceStart;
  let projectStart: number | undefined;
  let projectEnd: number | undefined;
  while (sourceCursor < sourceEnd - 0.0005) {
    const clip = primaryClips.find((item) => sourceCursor >= item.sourceStart - 0.0005 && sourceCursor < item.sourceEnd - 0.0005);
    if (!clip) return undefined;
    const partProjectStart = clip.start + sourceCursor - clip.sourceStart;
    if (projectStart === undefined) projectStart = partProjectStart;
    if (projectEnd !== undefined && Math.abs(partProjectStart - projectEnd) > 0.03) return undefined;
    const partSourceEnd = Math.min(sourceEnd, clip.sourceEnd);
    projectEnd = clip.start + partSourceEnd - clip.sourceStart;
    sourceCursor = partSourceEnd;
  }
  if (projectStart === undefined || projectEnd === undefined || projectEnd-projectStart <= 0.001) return undefined;
  return { start: projectStart, end: projectEnd };
}

function interpolateImageKeyframe(track: ImageEditorTrack, time: number): MediaKeyframe {
  const keyframes = [...track.keyframes].sort((left, right) => left.time - right.time);
  const fallbackWidth = 18;
  const fallback: MediaKeyframe = {
    id: `${track.id}-preview`,
    time,
    x: 85,
    y: 15,
    width: fallbackWidth,
    height: calculateImageHeightPercent(fallbackWidth, track.sourceWidth, track.sourceHeight, track.videoAspectRatio),
    rotation: 0,
    opacity: track.opacity,
    easing: "linear"
  };
  if (!track.animated) {
    const transform = track.staticTransform || keyframes[0] || fallback;
    return {
      ...transform,
      time,
      height: resolveImageHeight(track, transform),
      opacity: transform.opacity ?? track.opacity,
      easing: "linear"
    };
  }
  if (!keyframes.length) return fallback;
  if (time <= keyframes[0].time) {
    return { ...keyframes[0], time, height: resolveImageHeight(track, keyframes[0]), opacity: keyframes[0].opacity ?? track.opacity, easing: readImageEasing(keyframes[0].easing) };
  }
  if (time >= keyframes[keyframes.length - 1].time) {
    const last = keyframes[keyframes.length - 1];
    return { ...last, time, height: resolveImageHeight(track, last), opacity: last.opacity ?? track.opacity, easing: readImageEasing(last.easing) };
  }
  const nextIndex = keyframes.findIndex((keyframe) => keyframe.time >= time);
  const next = keyframes[nextIndex];
  const previous = keyframes[nextIndex - 1];
  const ratio = applyImageEasing(
    (time - previous.time) / Math.max(0.001, next.time - previous.time),
    readImageEasing(next.easing)
  );
  const interpolate = (start: number, end: number) => start + (end - start) * ratio;
  return {
    id: `${track.id}-preview`,
    time,
    x: interpolate(previous.x, next.x),
    y: interpolate(previous.y, next.y),
    width: interpolate(previous.width, next.width),
    height: interpolate(resolveImageHeight(track, previous), resolveImageHeight(track, next)),
    rotation: interpolate(previous.rotation, next.rotation),
    opacity: interpolate(previous.opacity ?? track.opacity, next.opacity ?? track.opacity),
    easing: readImageEasing(next.easing)
  };
}

function paintImageTransform(element: HTMLElement, keyframe: MediaKeyframe, track: ImageEditorTrack) {
  const left = `${keyframe.x.toFixed(4)}%`;
  const top = `${keyframe.y.toFixed(4)}%`;
  const width = `${keyframe.width.toFixed(4)}%`;
  const height = `${resolveImageHeight(track, keyframe).toFixed(4)}%`;
  const opacity = (keyframe.opacity ?? track.opacity).toFixed(4);
  const transform = `translate3d(-50%, -50%, 0) rotate(${keyframe.rotation.toFixed(4)}deg)`;
  if (element.style.left !== left) element.style.left = left;
  if (element.style.top !== top) element.style.top = top;
  if (element.style.width !== width) element.style.width = width;
  if (element.style.height !== height) element.style.height = height;
  if (element.style.opacity !== opacity) element.style.opacity = opacity;
  if (element.style.transform !== transform) element.style.transform = transform;
}

function buildImageMotionPathPoints(keyframes: MediaKeyframe[], width: number, height: number) {
  return [...keyframes]
    .sort((left, right) => left.time - right.time)
    .map((keyframe) => `${(keyframe.x / 100 * width).toFixed(2)},${(keyframe.y / 100 * height).toFixed(2)}`)
    .join(" ");
}

function clampImageKeyframesToRange(track: ImageEditorTrack, start: number, end: number) {
  const clamped = track.keyframes
    .map((keyframe) => ({ ...keyframe, time: clampValue(keyframe.time, start, end) }))
    .sort((left, right) => left.time - right.time);
  return clamped.reduce<MediaKeyframe[]>((result, keyframe) => {
    const previous = result[result.length - 1];
    if (previous && Math.abs(previous.time - keyframe.time) < 0.001) {
      result[result.length - 1] = keyframe;
    } else {
      result.push(keyframe);
    }
    return result;
  }, []);
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function createInputFromFile(file: File): VideoInput {
  return {
    name: file.name,
    size: file.size
  };
}

function mediaFileIdentity(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function isVideoFile(file: File) {
  return file.type.startsWith("video/") || /\.(mp4|mov|m4v|mkv|webm)$/i.test(file.name);
}

function isAudioFile(file: File) {
  return file.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(file.name);
}

function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
}

function readAudioDuration(url: string) {
  return new Promise<number>((resolve) => {
    const audio = document.createElement("audio");
    const finish = (value: number) => {
      audio.removeAttribute("src");
      audio.load();
      resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.onerror = () => finish(0);
    audio.src = url;
  });
}

function readVideoMetadata(url: string) {
  return new Promise<{ duration: number; width: number; height: number }>((resolve) => {
    const video = document.createElement("video");
    const finish = (value: { duration: number; width: number; height: number }) => {
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => finish({
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      width: video.videoWidth || 16,
      height: video.videoHeight || 9
    });
    video.onerror = () => finish({ duration: 0, width: 16, height: 9 });
    video.src = url;
  });
}

function createVideoThumbnail(url: string, duration: number) {
  return new Promise<string>((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const timeoutId = window.setTimeout(() => finish(""), 8000);
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    const capture = () => {
      const sourceWidth = video.videoWidth || 16;
      const sourceHeight = video.videoHeight || 9;
      const scale = Math.min(1, 240 / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      try {
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.76));
      } catch {
        finish("");
      }
    };
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onerror = () => finish("");
    video.onloadeddata = () => {
      const sampleTime = duration > 0.2 ? Math.min(0.5, duration * 0.08) : 0;
      if (sampleTime <= 0.01) {
        capture();
        return;
      }
      video.onseeked = capture;
      video.currentTime = sampleTime;
    };
    video.src = url;
  });
}

function readImageSize(url: string) {
  return new Promise<PreviewSize>((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => resolve({ width: 1, height: 1 });
    image.src = url;
  });
}

function normalizeSegment(segment: DuplicateSegment, index: number): DuplicateSegment {
  const duration = segment.duration || Math.max(0, segment.secondEnd - segment.secondStart);
  const deleteStart = Number(segment.deleteStart ?? segment.secondStart);
  const deleteEnd = Number(segment.deleteEnd ?? segment.secondEnd);
  return {
    ...segment,
    id: segment.id || `dup-${index + 1}`,
    kind: segment.kind || "repeat",
    duration,
    deleteStart,
    deleteEnd,
    deleteDuration: Number(segment.deleteDuration ?? Math.max(0, deleteEnd - deleteStart)),
    audioSimilarity: Number(segment.audioSimilarity || 0),
    videoSimilarity: Number(segment.videoSimilarity || 0),
    confidence: Number(segment.confidence || Math.max(segment.audioSimilarity || 0, segment.videoSimilarity || 0)),
    deleteSecond: segment.deleteSecond ?? true,
    keyframeAligned: Boolean(segment.keyframeAligned)
  };
}

export default function LosslessVideoPage() {
  const storedSettingsRef = useRef(loadStoredSettings());
  const resourceInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const timelinePlayheadRef = useRef<HTMLElement | null>(null);
  const audioPreviewRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const imageOverlayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const imageMotionPathRef = useRef<SVGPolylineElement | null>(null);
  const tracksRef = useRef<EditorTrack[]>([]);
  const videoSourcesRef = useRef<VideoEditorSource[]>([]);
  const videoClipsRef = useRef<VideoEditorClip[]>([]);
  const timelineLaneOrderRef = useRef<string[]>([]);
  const mediaResourcesRef = useRef<ImportedMediaResource[]>([]);
  const activeVideoClipIdRef = useRef("");
  const pendingVideoSeekRef = useRef<{ time: number; shouldPlay: boolean } | null>(null);
  const playbackAnchorRef = useRef({ time: 0, startedAt: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const selectionUndoRef = useRef<boolean[][]>([]);
  const selectionRedoRef = useRef<boolean[][]>([]);
  const trackDragMovedRef = useRef(false);
  const audioSeparationStatusRequestRef = useRef(0);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoInput, setVideoInput] = useState<VideoInput | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [videoSources, setVideoSources] = useState<VideoEditorSource[]>([]);
  const [videoClips, setVideoClips] = useState<VideoEditorClip[]>([]);
  const [mediaResources, setMediaResources] = useState<ImportedMediaResource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const [activeVideoClipId, setActiveVideoClipId] = useState("");
  const [selectedVideoClipId, setSelectedVideoClipId] = useState("");
  const [timelineLaneOrder, setTimelineLaneOrder] = useState<string[]>([]);
  const [duration, setDuration] = useState(0);
  const [videoSize, setVideoSize] = useState<PreviewSize>({ width: 1920, height: 1080 });
  const [previewSize, setPreviewSize] = useState<PreviewSize>({ width: 0, height: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [timelineViewport, setTimelineViewport] = useState<TimelineViewport>({ width: 0, scrollLeft: 0 });
  const [tracks, setTracks] = useState<EditorTrack[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [selectedLaneId, setSelectedLaneId] = useState("");
  const [selectedKeyframeId, setSelectedKeyframeId] = useState("");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("tracks");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("settings");
  const [, setHistoryVersion] = useState(0);
  const [params, setParams] = useState<DetectParams>(storedSettingsRef.current.params);
  const [mode, setMode] = useState<LosslessCutMode>(storedSettingsRef.current.mode);
  const [audioSeparation, setAudioSeparation] = useState<AudioSeparationOptions>(storedSettingsRef.current.audioSeparation);
  const [audioSeparationStatus, setAudioSeparationStatus] = useState<AudioSeparationStatus | null>(null);
  const [audioSeparationStatusLoading, setAudioSeparationStatusLoading] = useState(false);
  const [status, setStatus] = useState<TaskStatus>("idle");
  const [progress, setProgress] = useState<ProgressState>({ percent: 0, label: "等待视频", detail: "选择合成长视频后开始检测" });
  const [segments, setSegments] = useState<DuplicateSegment[]>([]);
  const [taskId, setTaskId] = useState<string>();
  const [error, setError] = useState("");
  const [resourceDropActive, setResourceDropActive] = useState(false);
  const [timelineDropActive, setTimelineDropActive] = useState(false);
  const [stepStartedAt, setStepStartedAt] = useState(0);
  const [stepFinishedAt, setStepFinishedAt] = useState(0);
  const [clockNow, setClockNow] = useState(Date.now());

  const checkAudioSeparationStatus = async () => {
    const requestId = audioSeparationStatusRequestRef.current + 1;
    audioSeparationStatusRequestRef.current = requestId;
    setAudioSeparationStatusLoading(true);
    try {
      const nextStatus = await getAudioSeparationStatus(audioSeparation.quality, audioSeparation.mode);
      if (audioSeparationStatusRequestRef.current === requestId) {
        setAudioSeparationStatus(nextStatus);
      }
    } catch (statusError) {
      if (audioSeparationStatusRequestRef.current === requestId) {
        setAudioSeparationStatus({
          available: false,
          modelReady: false,
          message: statusError instanceof Error ? statusError.message : "无法连接声音处理引擎"
        });
      }
    } finally {
      if (audioSeparationStatusRequestRef.current === requestId) {
        setAudioSeparationStatusLoading(false);
      }
    }
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    videoSourcesRef.current = videoSources;
  }, [videoSources]);

  useEffect(() => {
    videoClipsRef.current = videoClips;
  }, [videoClips]);

  useEffect(() => {
    timelineLaneOrderRef.current = timelineLaneOrder;
  }, [timelineLaneOrder]);

  useEffect(() => {
    mediaResourcesRef.current = mediaResources;
  }, [mediaResources]);

  useEffect(() => {
    activeVideoClipIdRef.current = activeVideoClipId;
  }, [activeVideoClipId]);

  useEffect(() => {
    return () => {
      tracksRef.current.forEach((track) => URL.revokeObjectURL(track.previewUrl));
      videoSourcesRef.current.forEach((source) => URL.revokeObjectURL(source.previewUrl));
      mediaResourcesRef.current.forEach((resource) => URL.revokeObjectURL(resource.previewUrl));
      audioPreviewRefs.current.forEach((audio) => audio.pause());
    };
  }, []);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const updateSize = () => setPreviewSize({ width: preview.clientWidth, height: preview.clientHeight });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(preview);
    return () => observer.disconnect();
  }, [previewUrl]);

  useEffect(() => {
    const viewport = timelineScrollRef.current;
    if (!viewport) return;
    const updateViewport = () => {
      setTimelineViewport({ width: viewport.clientWidth, scrollLeft: viewport.scrollLeft });
    };
    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(dialogueModeMigrationKey) === "1") return;
      setAudioSeparation((current) => ({
        ...current,
        mode: "dialogue",
        quality: "high",
        dialogueStrength: "strong"
      }));
      window.localStorage.setItem(dialogueModeMigrationKey, "1");
    } catch {
      // 浏览器禁用本地存储时仍使用本次会话的默认值。
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(settingsStorageKey, JSON.stringify({
        params,
        mode,
        audioSeparation: { ...audioSeparation, settingsVersion: audioSettingsVersion }
      }));
    } catch {
      // 浏览器禁用本地存储时不影响视频处理。
    }
  }, [audioSeparation, params, mode]);

  useEffect(() => {
    if (audioSeparation.enabled) {
      void checkAudioSeparationStatus();
    }
  }, [audioSeparation.enabled, audioSeparation.mode, audioSeparation.quality]);

  useEffect(() => {
    const isRunning = status === "detecting" || status === "exporting";
    if (isRunning) {
      const now = Date.now();
      setStepStartedAt(now);
      setStepFinishedAt(0);
      setClockNow(now);
      return;
    }
    if (stepStartedAt) {
      setStepFinishedAt(Date.now());
    }
  }, [progress.label, status]);

  useEffect(() => {
    if (status !== "detecting" && status !== "exporting") return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const removableSegments = useMemo(() => segments.filter((segment) => segment.deleteSecond), [segments]);
  const removeDuration = useMemo(
    () => removableSegments.reduce((sum, segment) => sum + (segment.deleteDuration ?? Math.max(0, (segment.deleteEnd ?? segment.secondEnd) - (segment.deleteStart ?? segment.secondStart))), 0),
    [removableSegments]
  );
  const keyframeWarnings = useMemo(
    () => removableSegments.filter((segment) => !segment.keyframeAligned).length,
    [removableSegments]
  );
  const enabledTracks = useMemo(() => tracks.filter((track) => track.enabled), [tracks]);
  const importedResources = useMemo<ImportedResource[]>(() => [...videoSources, ...mediaResources], [mediaResources, videoSources]);
  const usedVideoSourceIds = useMemo(() => new Set(videoClips.map((clip) => clip.sourceId)), [videoClips]);
  const usedMediaSourceIds = useMemo(() => new Set(tracks.map((track) => track.sourceId)), [tracks]);
  const projectVideoDuration = useMemo(() => getTimelineProjectDuration(videoClips, tracks), [tracks, videoClips]);
  const activeVideoClip = useMemo(() => {
    const selected = videoClips.find((clip) => clip.id === activeVideoClipId);
    if (selected && currentTime >= selected.start - 0.0005 && currentTime < selected.end - 0.0005) return selected;
    return findVideoClipAtTime(videoClips, currentTime, timelineLaneOrder);
  }, [activeVideoClipId, currentTime, timelineLaneOrder, videoClips]);
  const activeVideoSource = useMemo(
    () => videoSources.find((source) => source.id === activeVideoClip?.sourceId) || videoSources.find((source) => source.primary),
    [activeVideoClip?.sourceId, videoSources]
  );
  const selectedVideoClip = useMemo(
    () => videoClips.find((clip) => clip.id === selectedVideoClipId),
    [selectedVideoClipId, videoClips]
  );
  const canSplitSelectedVideoClip = Boolean(
    selectedVideoClip
      && currentTime > selectedVideoClip.start + 1 / timelineFps
      && currentTime < selectedVideoClip.end - 1 / timelineFps
  );
  const hasVideoEdits = useMemo(
    () => isVideoTimelineEdited(videoClips, videoSources, duration),
    [duration, videoClips, videoSources]
  );
  const needsVideoComposition = useMemo(() => videoTimelineNeedsComposition(videoClips), [videoClips]);
  const hasExternalVideoSources = useMemo(
    () => videoSources.some((source) => !source.primary && usedVideoSourceIds.has(source.id)),
    [usedVideoSourceIds, videoSources]
  );
  const hasImageTracks = useMemo(() => enabledTracks.some((track) => track.type === "image"), [enabledTracks]);
  const selectedTrack = useMemo(() => tracks.find((track) => track.id === selectedTrackId), [selectedTrackId, tracks]);
  const selectedImageTrack = selectedTrack?.type === "image" ? selectedTrack : undefined;
  const sortedSelectedKeyframes = useMemo(
    () => selectedImageTrack?.animated ? [...selectedImageTrack.keyframes].sort((left, right) => left.time - right.time) : [],
    [selectedImageTrack]
  );
  const currentImageKeyframe = useMemo(() => {
    if (!selectedImageTrack?.animated) return undefined;
    const tolerance = Math.max(0.02, 0.5 / timelineFps);
    return selectedImageTrack.keyframes.find((keyframe) => Math.abs(keyframe.time - currentTime) <= tolerance);
  }, [currentTime, selectedImageTrack, timelineFps]);
  const currentImageTransform = useMemo(
    () => selectedImageTrack ? interpolateImageKeyframe(selectedImageTrack, currentTime) : undefined,
    [currentTime, selectedImageTrack]
  );
  const hasPreviousImageKeyframe = useMemo(() => {
    const tolerance = Math.max(0.02, 0.5 / timelineFps);
    return sortedSelectedKeyframes.some((keyframe) => keyframe.time < currentTime - tolerance);
  }, [currentTime, sortedSelectedKeyframes, timelineFps]);
  const hasNextImageKeyframe = useMemo(() => {
    const tolerance = Math.max(0.02, 0.5 / timelineFps);
    return sortedSelectedKeyframes.some((keyframe) => keyframe.time > currentTime + tolerance);
  }, [currentTime, sortedSelectedKeyframes, timelineFps]);
  const timelineLanes = useMemo(() => {
    const lanes = new Map<string, TimelineLane>();
    videoClips.forEach((clip) => {
      const lane = lanes.get(clip.laneId);
      if (lane) lane.videoClips.push(clip);
      else lanes.set(clip.laneId, { id: clip.laneId, type: "video", clips: [], videoClips: [clip] });
    });
    tracks.forEach((track) => {
      const laneId = track.laneId || track.id;
      const lane = lanes.get(laneId);
      if (lane) lane.clips.push(track);
      else lanes.set(laneId, { id: laneId, type: track.type, clips: [track], videoClips: [] });
    });
    const laneIds = [
      ...timelineLaneOrder.filter((laneId) => lanes.has(laneId)),
      ...Array.from(lanes.keys()).filter((laneId) => !timelineLaneOrder.includes(laneId))
    ];
    return laneIds.map((laneId) => lanes.get(laneId)!).map((lane) => ({
      ...lane,
      clips: [...lane.clips].sort((left, right) => left.start - right.start),
      videoClips: [...lane.videoClips].sort((left, right) => left.start - right.start)
    }));
  }, [timelineLaneOrder, tracks, videoClips]);
  const timelineLayerByLane = useMemo(
    () => new Map(timelineLanes.map((lane, index) => [lane.id, index])),
    [timelineLanes]
  );
  const activeVideoLayer = activeVideoClip
    ? timelineLayerByLane.get(activeVideoClip.laneId) ?? Number.POSITIVE_INFINITY
    : Number.POSITIVE_INFINITY;
  const selectedImageVisible = selectedImageTrack
    ? (timelineLayerByLane.get(getTrackLaneId(selectedImageTrack)) ?? Number.POSITIVE_INFINITY) < activeVideoLayer
    : false;
  const filteredSegments = useMemo(
    () =>
      segments
        .map((segment, index) => ({ segment, index }))
        .filter(({ segment }) => {
          if (segmentFilter === "settings") return false;
          if (segmentFilter === "repeat") return segment.kind !== "slide-transition";
          return segment.kind === "slide-transition";
        }),
    [segmentFilter, segments]
  );
  const dominantConfidence = useMemo(() => {
    const counts = new Map<number, number>();
    filteredSegments.forEach(({ segment }) => {
      const confidence = Math.round(segment.confidence);
      counts.set(confidence, (counts.get(confidence) || 0) + 1);
    });
    return [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0])[0]?.[0];
  }, [filteredSegments]);
  const timelineDuration = useMemo(
    () =>
      Math.max(
        projectVideoDuration,
        ...segments.map((segment) => Math.max(segment.deleteEnd ?? segment.secondEnd, segment.secondEnd, segment.firstEnd)),
        ...tracks.map((track) => track.end),
        10
      ),
    [projectVideoDuration, segments, tracks]
  );
  const timelineDisplayDuration = timelineDuration / Math.min(1, timelineZoom);
  const timelineCanvasZoom = Math.max(1, timelineZoom);
  const selectedTrackLaneBounds = useMemo(
    () => selectedTrack ? getLaneClipBounds(tracks, selectedTrack, timelineDisplayDuration) : undefined,
    [selectedTrack, timelineDisplayDuration, tracks]
  );
  const timelineMaxZoom = useMemo(() => {
    const viewportWidth = Math.max(1, timelineViewport.width || 1000);
    const usableViewportWidth = Math.max(1, viewportWidth - timelineEdgeSpacePx * 2);
    const frameCount = Math.max(1, timelineDuration * timelineFps);
    const frameWidthLimitedZoom = timelineMaxFrameWidthPx * frameCount / usableViewportWidth;
    const canvasLimitedZoom = timelineMaxCanvasWidthPx / viewportWidth;
    return clampValue(frameWidthLimitedZoom, 1, Math.min(timelineAbsoluteMaxZoom, canvasLimitedZoom));
  }, [timelineDuration, timelineFps, timelineViewport.width]);
  const timelineMaxZoomExponent = Math.log2(timelineMaxZoom);
  const timelineScale = useMemo(() => {
    const viewportWidth = Math.max(1, timelineViewport.width || 1000);
    const canvasWidth = Math.max(1, viewportWidth * timelineCanvasZoom - timelineEdgeSpacePx * 2);
    const pixelsPerSecond = canvasWidth / Math.max(0.001, timelineDisplayDuration);
    const frameStep = 1 / timelineFps;
    const majorStep = pickTimelineMajorStep(110 / Math.max(0.000001, pixelsPerSecond), timelineFps);
    const subdivisionCount = pickTimelineSubdivisionCount(majorStep, timelineFps);
    const minorStep = majorStep / subdivisionCount;
    const buffer = viewportWidth * 0.5;
    const visibleStart = clampValue(((timelineViewport.scrollLeft - timelineEdgeSpacePx - buffer) / canvasWidth) * timelineDisplayDuration, 0, timelineDisplayDuration);
    const visibleEnd = clampValue(((timelineViewport.scrollLeft + viewportWidth - timelineEdgeSpacePx + buffer) / canvasWidth) * timelineDisplayDuration, 0, timelineDisplayDuration);
    const firstIndex = Math.max(0, Math.floor(visibleStart / minorStep));
    const lastIndex = Math.max(firstIndex, Math.ceil(visibleEnd / minorStep));
    const ticks: TimelineTick[] = [];
    const renderedLastIndex = Math.min(lastIndex, firstIndex + 2400);
    for (let index = firstIndex; index <= renderedLastIndex; index += 1) {
      const subdivisionIndex = index % subdivisionCount;
      const time = Math.min(timelineDisplayDuration, index * minorStep);
      const kind = subdivisionIndex === 0
        ? "major"
        : subdivisionCount === 10 && subdivisionIndex === 5
          ? "medium"
          : minorStep <= frameStep + 0.000001
            ? "frame"
            : "minor";
      ticks.push({ index, kind, time, percent: (time / timelineDisplayDuration) * 100 });
    }
    return { ticks, frameStep, majorStep };
  }, [timelineCanvasZoom, timelineDisplayDuration, timelineFps, timelineViewport]);
  const timelineTicks = timelineScale.ticks;

  useEffect(() => {
    setTimelineZoom((current) => Math.min(current, timelineMaxZoom));
  }, [timelineMaxZoom]);

  const canRunTask = Boolean(videoInput) && videoClips.length > 0 && status !== "detecting" && status !== "exporting";
  const videoOutputReencoded = hasImageTracks
    || hasExternalVideoSources
    || needsVideoComposition
    || videoClips.length === 0
    || mode === "precise-reencode"
    || (mode === "hybrid" && (keyframeWarnings > 0 || hasVideoEdits));
  const canUseAudioSeparation = !audioSeparation.enabled
    || (!audioSeparationStatusLoading && audioSeparationStatus?.available === true);
  const canExport = projectVideoDuration > 0
    && status !== "detecting"
    && status !== "exporting"
    && canUseAudioSeparation
    && (videoClips.length > 0 || enabledTracks.length > 0);
  const stepElapsed = stepStartedAt ? formatElapsed((stepFinishedAt || clockNow) - stepStartedAt) : "";
  const showStepElapsed = Boolean(stepElapsed) && status !== "idle";
  const canUndoSelection = selectionUndoRef.current.length > 0;
  const canRedoSelection = selectionRedoRef.current.length > 0;
  const previewVideoRect = useMemo(() => {
    if (!previewSize.width || !previewSize.height || !videoSize.width || !videoSize.height) {
      return { left: 0, top: 0, width: previewSize.width, height: previewSize.height };
    }
    const containerRatio = previewSize.width / previewSize.height;
    const sourceRatio = videoSize.width / videoSize.height;
    if (containerRatio > sourceRatio) {
      const height = previewSize.height;
      const width = height * sourceRatio;
      return { left: (previewSize.width - width) / 2, top: 0, width, height };
    }
    const width = previewSize.width;
    const height = width / sourceRatio;
    return { left: 0, top: (previewSize.height - height) / 2, width, height };
  }, [previewSize, videoSize]);
  const selectedImageMotionKeyframes = useMemo(
    () => selectedImageTrack?.animated ? [...selectedImageTrack.keyframes].sort((left, right) => left.time - right.time) : [],
    [selectedImageTrack]
  );
  const selectedImageMotionPoints = useMemo(
    () => selectedImageMotionKeyframes.length > 1
      ? buildImageMotionPathPoints(selectedImageMotionKeyframes, previewVideoRect.width, previewVideoRect.height)
      : "",
    [previewVideoRect.height, previewVideoRect.width, selectedImageMotionKeyframes]
  );

  useEffect(() => {
    const video = videoRef.current as FrameSyncedVideo | null;
    if (!video || !previewUrl) return;
    let stopped = false;
    let videoFrameHandle = 0;
    let animationFrameHandle = 0;
    let lastReactUpdate = Number.NEGATIVE_INFINITY;

    const paintFrame = (mediaTime: number, now: number) => {
      const clip = videoClipsRef.current.find((item) => item.id === activeVideoClipIdRef.current);
      const projectTime = clip
        ? clampValue(clip.start + mediaTime - clip.sourceStart, clip.start, clip.end)
        : mediaTime;
      tracksRef.current.forEach((track) => {
        if (track.type !== "image") return;
        const element = imageOverlayRefs.current.get(track.id);
        if (!element) return;
        const active = track.enabled && projectTime >= track.start && projectTime <= track.end;
        const visibility = active ? "visible" : "hidden";
        const pointerEvents = active ? "auto" : "none";
        if (element.style.visibility !== visibility) element.style.visibility = visibility;
        if (element.style.pointerEvents !== pointerEvents) element.style.pointerEvents = pointerEvents;
        if (active) paintImageTransform(element, interpolateImageKeyframe(track, projectTime), track);
      });

      const playhead = timelinePlayheadRef.current;
      if (playhead) {
        const playheadPercent = Math.min(projectTime, timelineDisplayDuration) / Math.max(0.001, timelineDisplayDuration) * 100;
        const left = `${playheadPercent.toFixed(5)}%`;
        if (playhead.style.left !== left) playhead.style.left = left;
      }

      if (now - lastReactUpdate >= 100) {
        lastReactUpdate = now;
        setCurrentTime((previous) => Math.abs(previous - projectTime) > 0.001 ? projectTime : previous);
      }
    };

    const paintPausedFrame = () => paintFrame(video.currentTime, performance.now());
    if (video.requestVideoFrameCallback) {
      const onVideoFrame = (now: number, metadata: { mediaTime: number }) => {
        if (stopped) return;
        paintFrame(metadata.mediaTime, now);
        videoFrameHandle = video.requestVideoFrameCallback?.(onVideoFrame) ?? 0;
      };
      videoFrameHandle = video.requestVideoFrameCallback(onVideoFrame);
    } else {
      const onAnimationFrame = (now: number) => {
        if (stopped) return;
        if (!video.paused) paintFrame(video.currentTime, now);
        animationFrameHandle = window.requestAnimationFrame(onAnimationFrame);
      };
      animationFrameHandle = window.requestAnimationFrame(onAnimationFrame);
    }
    video.addEventListener("loadeddata", paintPausedFrame);
    video.addEventListener("seeked", paintPausedFrame);
    paintPausedFrame();

    return () => {
      stopped = true;
      video.removeEventListener("loadeddata", paintPausedFrame);
      video.removeEventListener("seeked", paintPausedFrame);
      if (videoFrameHandle) video.cancelVideoFrameCallback?.(videoFrameHandle);
      if (animationFrameHandle) window.cancelAnimationFrame(animationFrameHandle);
    };
  }, [activeVideoClipId, previewUrl, timelineDisplayDuration]);

  const setNumberParam = (key: keyof DetectParams, value: number) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const resetResult = () => {
    setSegments([]);
    selectionUndoRef.current = [];
    selectionRedoRef.current = [];
    setHistoryVersion((value) => value + 1);
    setTaskId(undefined);
    setError("");
    setSegmentFilter("settings");
    setProgress({ percent: 0, label: "等待检测", detail: "参数确认后开始扫描重复片段" });
    setStatus("idle");
  };

  const pickResourceFiles = () => resourceInputRef.current?.click();

  const acceptVideoTracks = async (files: File[]) => {
    const existingFiles = new Set([
      ...videoSourcesRef.current.map((source) => mediaFileIdentity(source.file)),
      ...mediaResourcesRef.current.map((resource) => mediaFileIdentity(resource.file))
    ]);
    const validFiles = files.filter((file) => isVideoFile(file) && !existingFiles.has(mediaFileIdentity(file)));
    if (!validFiles.length) {
      notify({ type: "warning", title: "没有可导入的新视频" });
      return;
    }
    const loadedSources = await Promise.all(validFiles.map(async (file) => {
      const sourcePreviewUrl = URL.createObjectURL(file);
      const metadata = await readVideoMetadata(sourcePreviewUrl);
      const thumbnailUrl = await createVideoThumbnail(sourcePreviewUrl, metadata.duration);
      return {
        id: createEditorId("video-source"),
        type: "video",
        name: file.name,
        file,
        previewUrl: sourcePreviewUrl,
        thumbnailUrl,
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        primary: false
      } satisfies VideoEditorSource;
    }));
    const usableSources = loadedSources.filter((source) => {
      if (source.duration > 0.05) return true;
      URL.revokeObjectURL(source.previewUrl);
      notify({ type: "warning", title: "无法读取视频素材", message: source.name });
      return false;
    });
    if (!usableSources.length) return;
    const nextSources = [...videoSourcesRef.current, ...usableSources];
    videoSourcesRef.current = nextSources;
    setVideoSources(nextSources);
    setSelectedResourceId(usableSources[usableSources.length - 1].id);
    setInspectorTab("tracks");
    notify({ type: "success", title: "视频已导入", message: `${usableSources.length} 个资源` });
  };

  const splitSelectedVideoClip = () => {
    const clip = videoClipsRef.current.find((item) => item.id === selectedVideoClipId)
      || findVideoClipAtTime(videoClipsRef.current, currentTime);
    if (!clip) {
      notify({ type: "warning", title: "请先选择视频片段" });
      return;
    }
    const splitTime = Math.round(clampValue(currentTime, clip.start, clip.end) * timelineFps) / timelineFps;
    if (splitTime <= clip.start + 1 / timelineFps || splitTime >= clip.end - 1 / timelineFps) {
      notify({ type: "warning", title: "播放头需要位于片段内部" });
      return;
    }
    const sourceSplitTime = clip.sourceStart + splitTime - clip.start;
    const rightClip: VideoEditorClip = {
      ...clip,
      id: createEditorId("video-clip"),
      start: splitTime,
      sourceStart: sourceSplitTime
    };
    const nextClips = videoClipsRef.current
      .flatMap((item) => item.id === clip.id ? [{ ...item, end: splitTime, sourceEnd: sourceSplitTime }, rightClip] : [item])
      .sort((left, right) => left.start - right.start);
    videoClipsRef.current = nextClips;
    setVideoClips(nextClips);
    setSelectedVideoClipId(rightClip.id);
    setSelectedTrackId("");
    setSelectedLaneId(clip.laneId);
    notify({ type: "success", title: "已在播放头处分割" });
  };

  const removeVideoClip = (clipId: string) => {
    const clip = videoClipsRef.current.find((item) => item.id === clipId);
    if (!clip) return;
    const nextClips = videoClipsRef.current
      .filter((item) => item.id !== clip.id)
      .sort((left, right) => left.start - right.start);
    videoClipsRef.current = nextClips;
    setVideoClips(nextClips);
    setTimelineLaneOrder((current) => mergeTimelineLaneOrder(current, nextClips, tracksRef.current));
    setSelectedVideoClipId("");
    setSelectedKeyframeId("");
    if (activeVideoClipIdRef.current === clip.id) {
      videoRef.current?.pause();
      activeVideoClipIdRef.current = "";
      setActiveVideoClipId("");
    }
    resetResult();
    seekPreview(Math.min(currentTime, getTimelineProjectDuration(nextClips, tracksRef.current)), false);
    notify({ type: "success", title: "已删除视频片段", message: "时间轴位置保持不变" });
  };

  const appendMediaClips = (media: PendingEditorMedia[], requestedStart = currentTime, requestedLaneId = "") => {
    if (!media.length) return;
    const type = media[0].type;
    const hadVisualTrack = videoClipsRef.current.length > 0 || tracksRef.current.some((track) => track.type === "image");
    const insertionStart = Math.max(0, requestedStart);
    const timelineEnd = Number.POSITIVE_INFINITY;
    const nextTracks = [...tracksRef.current];
    const selectedClip = nextTracks.find((track) => track.id === selectedTrackId);
    const selectedLaneType = nextTracks.find((track) => getTrackLaneId(track) === selectedLaneId)?.type;
    const firstCompatibleClip = nextTracks.find((track) => track.type === type);
    const requestedLaneType = nextTracks.find((track) => getTrackLaneId(track) === requestedLaneId)?.type;
    let preferredLaneId =
      requestedLaneId && requestedLaneType === type
        ? requestedLaneId
        : selectedLaneId && selectedLaneType === type
        ? selectedLaneId
        : selectedClip?.type === type
          ? getTrackLaneId(selectedClip)
          : firstCompatibleClip
            ? getTrackLaneId(firstCompatibleClip)
            : "";
    let laneCursor = insertionStart;
    let lastAdded: EditorTrack | undefined;

    media.forEach((item) => {
      const sourceDuration = item.type === "audio" && item.sourceDuration > 0 ? item.sourceDuration : 5;
      const availableFromInsertion = Number.isFinite(timelineEnd) ? Math.max(0.05, timelineEnd - insertionStart) : sourceDuration;
      const clipDuration = Math.max(0.05, Math.min(sourceDuration, availableFromInsertion));
      const laneIds = Array.from(new Set(nextTracks.filter((track) => track.type === type).map(getTrackLaneId)));
      const orderedLaneIds = preferredLaneId
        ? [preferredLaneId, ...laneIds.filter((laneId) => laneId !== preferredLaneId)]
        : laneIds;
      let laneId = "";
      let start: number | undefined;
      for (const candidateLaneId of orderedLaneIds) {
        const clips = nextTracks.filter((track) => getTrackLaneId(track) === candidateLaneId);
        const candidateStart = findAvailableClipStart(
          clips,
          candidateLaneId === preferredLaneId ? laneCursor : insertionStart,
          clipDuration,
          timelineEnd
        );
        if (candidateStart !== undefined) {
          laneId = candidateLaneId;
          start = candidateStart;
          break;
        }
      }
      if (start === undefined) {
        laneId = createEditorId(`${type}-lane`);
        start = clampValue(insertionStart, 0, Number.isFinite(timelineEnd) ? Math.max(0, timelineEnd - clipDuration) : insertionStart);
      }
      const end = start + clipDuration;
      const clipId = createEditorId(type);
      const imageStartsVisualProject = !hadVisualTrack && item.type === "image";
      const sourceImageAspectRatio = item.type === "image"
        ? item.sourceWidth / Math.max(1, item.sourceHeight)
        : 16 / 9;
      const videoAspectRatio = imageStartsVisualProject
        ? sourceImageAspectRatio
        : videoSize.width > 0 && videoSize.height > 0
          ? videoSize.width / videoSize.height
          : 16 / 9;
      const defaultImageWidth = imageStartsVisualProject ? 100 : 18;
      const defaultImageHeight = item.type === "image"
        ? calculateImageHeightPercent(defaultImageWidth, item.sourceWidth, item.sourceHeight, videoAspectRatio)
        : 18;
      const defaultImageTransform: MediaKeyframe = {
        id: createEditorId("static-transform"),
        time: start,
        x: imageStartsVisualProject ? 50 : 85,
        y: imageStartsVisualProject ? 50 : 15,
        width: defaultImageWidth,
        height: defaultImageHeight,
        rotation: 0,
        opacity: imageStartsVisualProject ? 1 : 0.85,
        easing: "linear"
      };
      const track: EditorTrack = item.type === "audio"
          ? {
            id: clipId,
            sourceId: item.sourceId,
            laneId,
            type: "audio",
            name: item.file.name,
            file: item.file,
            previewUrl: item.previewUrl,
            sourceDuration: item.sourceDuration,
            start,
            end,
            enabled: true,
            volume: 0.8,
            fadeIn: 0,
            fadeOut: 0,
            loop: false
          }
          : {
            id: clipId,
            sourceId: item.sourceId,
            laneId,
            type: "image",
            name: item.file.name,
            file: item.file,
            previewUrl: item.previewUrl,
            start,
            end,
            enabled: true,
            animated: false,
            opacity: imageStartsVisualProject ? 1 : 0.85,
            sourceWidth: item.sourceWidth,
            sourceHeight: item.sourceHeight,
            videoAspectRatio,
            staticTransform: defaultImageTransform,
            keyframes: [{ ...defaultImageTransform, id: createEditorId("keyframe") }]
          };
      nextTracks.push(track);
      preferredLaneId = laneId;
      laneCursor = end;
      lastAdded = track;
    });

    tracksRef.current = nextTracks;
    setTracks(nextTracks);
    if (!hadVisualTrack && media[0].type === "image") {
      setVideoSize({ width: media[0].sourceWidth, height: media[0].sourceHeight });
    }
    setTimelineLaneOrder((current) => mergeTimelineLaneOrder(current, videoClipsRef.current, nextTracks));
    if (lastAdded) {
      setSelectedVideoClipId("");
      setSelectedTrackId(lastAdded.id);
      setSelectedLaneId(getTrackLaneId(lastAdded));
      setSelectedKeyframeId(lastAdded.type === "image" && lastAdded.animated ? lastAdded.keyframes[0]?.id || "" : "");
    }
    setInspectorTab("tracks");
  };

  const acceptAudioTracks = async (files: File[]) => {
    const existingFiles = new Set([
      ...videoSourcesRef.current.map((source) => mediaFileIdentity(source.file)),
      ...mediaResourcesRef.current.map((resource) => mediaFileIdentity(resource.file))
    ]);
    const validFiles = files.filter((file) => isAudioFile(file) && !existingFiles.has(mediaFileIdentity(file)));
    if (!validFiles.length) {
      notify({ type: "warning", title: "没有可导入的新音频" });
      return;
    }
    const resources = await Promise.all(
      validFiles.map(async (file): Promise<ImportedAudioResource> => {
        const previewUrl = URL.createObjectURL(file);
        return {
          id: createEditorId("audio-source"),
          type: "audio",
          name: file.name,
          file,
          previewUrl,
          duration: await readAudioDuration(previewUrl)
        };
      })
    );
    const nextResources = [...mediaResourcesRef.current, ...resources];
    mediaResourcesRef.current = nextResources;
    setMediaResources(nextResources);
    setSelectedResourceId(resources[resources.length - 1].id);
    setInspectorTab("tracks");
    notify({ type: "success", title: "音频已导入", message: `${resources.length} 个资源` });
  };

  const acceptImageTracks = async (files: File[]) => {
    const existingFiles = new Set([
      ...videoSourcesRef.current.map((source) => mediaFileIdentity(source.file)),
      ...mediaResourcesRef.current.map((resource) => mediaFileIdentity(resource.file))
    ]);
    const validFiles = files.filter((file) => isImageFile(file) && !existingFiles.has(mediaFileIdentity(file)));
    if (!validFiles.length) {
      notify({ type: "warning", title: "没有可导入的新图片" });
      return;
    }
    const resources = await Promise.all(
      validFiles.map(async (file): Promise<ImportedImageResource> => {
        const previewUrl = URL.createObjectURL(file);
        const size = await readImageSize(previewUrl);
        return {
          id: createEditorId("image-source"),
          type: "image",
          name: file.name,
          file,
          previewUrl,
          width: size.width,
          height: size.height
        };
      })
    );
    const nextResources = [...mediaResourcesRef.current, ...resources];
    mediaResourcesRef.current = nextResources;
    setMediaResources(nextResources);
    setSelectedResourceId(resources[resources.length - 1].id);
    setInspectorTab("tracks");
    notify({ type: "success", title: "图片已导入", message: `${resources.length} 个资源` });
  };

  const importResourceFiles = async (files: File[]) => {
    const videos = files.filter(isVideoFile);
    const audios = files.filter(isAudioFile);
    const images = files.filter(isImageFile);
    if (!videos.length && !audios.length && !images.length) {
      notify({ type: "warning", title: "不支持这些文件" });
      return;
    }
    if (videos.length) await acceptVideoTracks(videos);
    if (audios.length) await acceptAudioTracks(audios);
    if (images.length) await acceptImageTracks(images);
  };

  const removeImportedResource = (resource: ImportedResource) => {
    const inUse = resource.type === "video"
      ? videoClipsRef.current.some((clip) => clip.sourceId === resource.id)
      : tracksRef.current.some((track) => track.sourceId === resource.id);
    if (inUse) {
      notify({ type: "warning", title: "资源正在时间轴中使用", message: "请先删除对应片段" });
      return;
    }
    URL.revokeObjectURL(resource.previewUrl);
    setSelectedResourceId((current) => current === resource.id ? "" : current);
    if (resource.type === "video") {
      const remainingSources = videoSourcesRef.current.filter((source) => source.id !== resource.id);
      const nextPrimarySource = resource.primary
        ? remainingSources.find((source) => videoClipsRef.current.some((clip) => clip.sourceId === source.id))
        : remainingSources.find((source) => source.primary);
      const nextSources = remainingSources.map((source) => ({ ...source, primary: source.id === nextPrimarySource?.id }));
      videoSourcesRef.current = nextSources;
      setVideoSources(nextSources);
      if (resource.primary) {
        videoRef.current?.pause();
        setVideoFile(nextPrimarySource?.file || null);
        setVideoInput(nextPrimarySource ? createInputFromFile(nextPrimarySource.file) : null);
        setPreviewUrl(nextPrimarySource?.previewUrl || "");
        setDuration(nextPrimarySource?.duration || 0);
        if (!nextPrimarySource && !tracksRef.current.some((track) => track.type === "image")) {
          setVideoSize({ width: 1920, height: 1080 });
        }
        setCurrentTime((value) => Math.min(value, getTimelineProjectDuration(videoClipsRef.current, tracksRef.current)));
        resetResult();
      }
    } else {
      const nextResources = mediaResourcesRef.current.filter((item) => item.id !== resource.id);
      mediaResourcesRef.current = nextResources;
      setMediaResources(nextResources);
    }
  };

  const insertVideoResourceOnTimeline = (source: VideoEditorSource, requestedTime: number, requestedLaneId = "") => {
    if (source.duration <= 0.05) {
      notify({ type: "warning", title: "视频资源时长无效", message: source.name });
      return;
    }
    if (!videoInput) {
      const promotedSources = videoSourcesRef.current.map((item) => ({ ...item, primary: item.id === source.id }));
      const promotedSource = promotedSources.find((item) => item.id === source.id) || { ...source, primary: true };
      videoSourcesRef.current = promotedSources;
      setVideoSources(promotedSources);
      setVideoFile(promotedSource.file);
      setVideoInput(createInputFromFile(promotedSource.file));
      setPreviewUrl(promotedSource.previewUrl);
      setDuration(promotedSource.duration);
      if (!videoClipsRef.current.length && !tracksRef.current.some((track) => track.type === "image")) {
        setVideoSize({ width: promotedSource.width, height: promotedSource.height });
      }
    }

    const insertionTime = Math.max(0, requestedTime);
    const insertionDuration = source.duration;
    const videoLaneIds = Array.from(new Set(videoClipsRef.current.map((clip) => clip.laneId)));
    const selectedLaneIsVideo = videoClipsRef.current.some((clip) => clip.laneId === selectedLaneId);
    const requestedLaneIsVideo = videoClipsRef.current.some((clip) => clip.laneId === requestedLaneId);
    const preferredLaneId = requestedLaneIsVideo
      ? requestedLaneId
      : selectedLaneIsVideo
        ? selectedLaneId
        : videoLaneIds[0] || "";
    const laneId = preferredLaneId || createEditorId("video-lane");
    const insertionStart = preferredLaneId
      ? findAvailableClipStart(
          videoClipsRef.current.filter((clip) => clip.laneId === preferredLaneId),
          insertionTime,
          insertionDuration,
          Number.POSITIVE_INFINITY
        ) ?? insertionTime
      : insertionTime;
    const insertedClip: VideoEditorClip = {
      id: createEditorId("video-clip"),
      sourceId: source.id,
      laneId,
      name: source.name,
      start: insertionStart,
      end: insertionStart + insertionDuration,
      sourceStart: 0,
      sourceEnd: insertionDuration
    };
    const nextClips = [...videoClipsRef.current, insertedClip].sort((left, right) => left.start - right.start);
    videoClipsRef.current = nextClips;
    setVideoClips(nextClips);
    setTimelineLaneOrder((current) => mergeTimelineLaneOrder(current, nextClips, tracksRef.current));
    activeVideoClipIdRef.current = insertedClip.id;
    setActiveVideoClipId(insertedClip.id);
    setPreviewUrl(source.previewUrl);
    setSelectedVideoClipId(insertedClip.id);
    setSelectedTrackId("");
    setSelectedLaneId(laneId);
    setSelectedKeyframeId("");
    setInspectorTab("tracks");
    resetResult();
    seekPreview(insertionStart, false);
  };

  const addImportedResourceToTimeline = (resourceId: string, requestedTime = currentTime, requestedLaneId = "") => {
    const resource = importedResources.find((item) => item.id === resourceId);
    if (!resource) return;
    if (resource.type === "video") {
      insertVideoResourceOnTimeline(resource, requestedTime, requestedLaneId);
      return;
    }
    const clipPreviewUrl = URL.createObjectURL(resource.file);
    appendMediaClips([
      resource.type === "audio"
        ? {
            type: "audio",
            sourceId: resource.id,
            file: resource.file,
            previewUrl: clipPreviewUrl,
            sourceDuration: resource.duration
          }
        : {
            type: "image",
            sourceId: resource.id,
            file: resource.file,
            previewUrl: clipPreviewUrl,
            sourceWidth: resource.width,
            sourceHeight: resource.height
          }
    ], requestedTime, requestedLaneId);
  };

  const handleResourceBinDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setResourceDropActive(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length) void importResourceFiles(files);
  };

  const handleTimelineResourceDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const resourceId = event.dataTransfer.getData(resourceDragMime);
    if (!resourceId) return;
    event.preventDefault();
    event.stopPropagation();
    setTimelineDropActive(false);
    const rect = event.currentTarget.getBoundingClientRect();
    const targetRow = (event.target as HTMLElement).closest<HTMLElement>(".lossless-media-track-row");
    const dropTime = clampValue(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * timelineDisplayDuration,
      0,
      timelineDisplayDuration
    );
    addImportedResourceToTimeline(resourceId, dropTime, targetRow?.dataset.laneId || "");
  };

  const updateTrack = (trackId: string, updater: (track: EditorTrack) => EditorTrack) => {
    setTracks((current) => current.map((track) => (track.id === trackId ? updater(track) : track)));
  };

  const removeTrack = (trackId: string) => {
    const track = tracksRef.current.find((item) => item.id === trackId);
    if (track) URL.revokeObjectURL(track.previewUrl);
    audioPreviewRefs.current.get(trackId)?.pause();
    audioPreviewRefs.current.delete(trackId);
    const nextTracks = tracksRef.current.filter((item) => item.id !== trackId);
    tracksRef.current = nextTracks;
    setTracks(nextTracks);
    setTimelineLaneOrder((current) => mergeTimelineLaneOrder(current, videoClipsRef.current, nextTracks));
    if (selectedTrackId === trackId) {
      setSelectedTrackId("");
      setSelectedKeyframeId("");
    }
    if (track && !nextTracks.some((item) => getTrackLaneId(item) === getTrackLaneId(track))) {
      setSelectedLaneId("");
    }
  };

  const updateTrackBoundary = (trackId: string, boundary: "start" | "end", value: number) => {
    setTracks((current) => current.map((track) => {
      if (track.id !== trackId) return track;
      const timelineEnd = projectVideoDuration > 0 ? projectVideoDuration : Math.max(track.end, value);
      const laneBounds = getLaneClipBounds(current, track, timelineEnd);
      if (boundary === "start") {
        const start = clampValue(value, laneBounds.minimumStart, Math.max(laneBounds.minimumStart, track.end - 0.05));
        return track.type === "image"
          ? {
              ...track,
              start,
              staticTransform: { ...track.staticTransform, time: start },
              keyframes: clampImageKeyframesToRange(track, start, track.end)
            }
          : { ...track, start };
      }
      const end = clampValue(value, track.start + 0.05, Math.max(track.start + 0.05, laneBounds.maximumEnd));
      return track.type === "image"
        ? {
            ...track,
            end,
            staticTransform: { ...track.staticTransform, time: track.start },
            keyframes: clampImageKeyframesToRange(track, track.start, end)
          }
        : { ...track, end };
    }));
  };

  const timelineTimeAtPointer = (target: HTMLElement, clientX: number) => {
    const row = target.closest(".lossless-media-track-row") as HTMLElement | null;
    if (!row) return currentTime;
    const rect = row.getBoundingClientRect();
    return clampValue(((clientX - rect.left) / Math.max(1, rect.width)) * timelineDisplayDuration, 0, timelineDisplayDuration);
  };

  const selectVideoClipAtPointer = (event: ReactMouseEvent<HTMLElement>, clip: VideoEditorClip) => {
    setSelectedVideoClipId(clip.id);
    setSelectedTrackId("");
    setSelectedLaneId(clip.laneId);
    setSelectedKeyframeId("");
    setInspectorTab("tracks");
    if (trackDragMovedRef.current) {
      trackDragMovedRef.current = false;
      return;
    }
    seekPreview(clampValue(timelineTimeAtPointer(event.currentTarget, event.clientX), clip.start, clip.end), false);
  };

  const startVideoClipTimelineDrag = (
    event: ReactPointerEvent<HTMLElement>,
    clip: VideoEditorClip,
    action: "move" | "trim-start" | "trim-end"
  ) => {
    event.preventDefault();
    const row = event.currentTarget.closest(".lossless-media-track-row") as HTMLElement | null;
    if (!row) return;
    const rowRect = row.getBoundingClientRect();
    const pointerStart = event.clientX;
    const originalStart = clip.start;
    const originalEnd = clip.end;
    const originalSourceStart = clip.sourceStart;
    const originalSourceEnd = clip.sourceEnd;
    const sourceDuration = videoSourcesRef.current.find((source) => source.id === clip.sourceId)?.duration || originalSourceEnd;
    const duration = originalEnd - originalStart;
    trackDragMovedRef.current = false;
    setSelectedVideoClipId(clip.id);
    setSelectedTrackId("");
    setSelectedLaneId(clip.laneId);
    setSelectedKeyframeId("");
    setInspectorTab("tracks");

    const handleMove = (moveEvent: PointerEvent) => {
      const pixelDelta = moveEvent.clientX - pointerStart;
      if (Math.abs(pixelDelta) > 2 || Math.abs(moveEvent.clientY - event.clientY) > 2) trackDragMovedRef.current = true;
      const timeDelta = (pixelDelta / Math.max(1, rowRect.width)) * timelineDisplayDuration;
      setVideoClips((current) => {
        let nextLaneId = clip.laneId;
        const targetRow = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest<HTMLElement>(".lossless-media-track-row");
        if (action === "move" && targetRow?.dataset.laneType === "video" && targetRow.dataset.laneId) {
          nextLaneId = targetRow.dataset.laneId;
        }
        if (action === "move") {
          const start = Math.max(0, originalStart + timeDelta);
          const end = start + duration;
          const overlaps = current.some((item) => item.id !== clip.id
            && item.laneId === nextLaneId
            && start < item.end - 0.001
            && end > item.start + 0.001);
          if (overlaps) nextLaneId = clip.laneId;
          if (nextLaneId !== clip.laneId) {
            const next = current.map((item) => item.id === clip.id
              ? { ...item, laneId: nextLaneId, start, end }
              : item);
            videoClipsRef.current = next;
            setSelectedLaneId(nextLaneId);
            return next;
          }
          const sameLaneClips = current.filter((item) => item.id !== clip.id && item.laneId === nextLaneId);
          const laneStart = sameLaneClips
            .filter((item) => item.end <= originalStart + 0.001)
            .reduce((maximum, item) => Math.max(maximum, item.end), 0);
          const laneEnd = sameLaneClips
            .filter((item) => item.start >= originalEnd - 0.001)
            .reduce((minimum, item) => Math.min(minimum, item.start), Number.POSITIVE_INFINITY);
          const delta = clampValue(timeDelta, laneStart - originalStart, laneEnd - originalEnd);
          const next = current.map((item) => item.id === clip.id
            ? { ...item, laneId: nextLaneId, start: originalStart + delta, end: originalEnd + delta }
            : item);
          videoClipsRef.current = next;
          setSelectedLaneId(nextLaneId);
          return next;
        }
        if (action === "trim-start") {
          const previousEnd = current
            .filter((item) => item.id !== clip.id && item.laneId === clip.laneId && item.end <= originalStart + 0.001)
            .reduce((maximum, item) => Math.max(maximum, item.end), 0);
          const start = clampValue(originalStart + timeDelta, previousEnd, originalEnd - 0.05);
          const sourceStart = clampValue(originalSourceStart + start - originalStart, 0, originalSourceEnd - 0.05);
          const adjustedStart = originalStart + sourceStart - originalSourceStart;
          const next = current.map((item) => item.id === clip.id ? { ...item, start: adjustedStart, sourceStart } : item);
          videoClipsRef.current = next;
          return next;
        }
        const nextStart = current
          .filter((item) => item.id !== clip.id && item.laneId === clip.laneId && item.start >= originalEnd - 0.001)
          .reduce((minimum, item) => Math.min(minimum, item.start), Number.POSITIVE_INFINITY);
        const end = clampValue(originalEnd + timeDelta, originalStart + 0.05, nextStart);
        const sourceEnd = clampValue(originalSourceEnd + end - originalEnd, originalSourceStart + 0.05, sourceDuration);
        const adjustedEnd = originalEnd + sourceEnd - originalSourceEnd;
        const next = current.map((item) => item.id === clip.id ? { ...item, end: adjustedEnd, sourceEnd } : item);
        videoClipsRef.current = next;
        return next;
      });
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setTimelineLaneOrder((current) => mergeTimelineLaneOrder(current, videoClipsRef.current, tracksRef.current));
      if (trackDragMovedRef.current) resetResult();
      window.setTimeout(() => {
        trackDragMovedRef.current = false;
      }, 120);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  const selectTrackAtPointer = (event: ReactMouseEvent<HTMLElement>, track: EditorTrack) => {
    setSelectedVideoClipId("");
    setSelectedTrackId(track.id);
    setSelectedLaneId(getTrackLaneId(track));
    setSelectedKeyframeId(track.type === "image" && track.animated ? track.keyframes[0]?.id || "" : "");
    setInspectorTab("tracks");
    if (trackDragMovedRef.current) {
      trackDragMovedRef.current = false;
      return;
    }
    seekPreview(clampValue(timelineTimeAtPointer(event.currentTarget, event.clientX), track.start, track.end), false);
  };

  const addTrackKeyframeAtPointer = (event: ReactMouseEvent<HTMLElement>, track: EditorTrack) => {
    if (track.type !== "image" || !track.animated) return;
    const time = clampValue(timelineTimeAtPointer(event.currentTarget, event.clientX), track.start, track.end);
    setSelectedTrackId(track.id);
    setSelectedLaneId(getTrackLaneId(track));
    setInspectorTab("tracks");
    addImageKeyframe(track, time);
    seekPreview(time, false);
  };

  const startTrackTimelineDrag = (event: ReactPointerEvent<HTMLElement>, track: EditorTrack, action: "move" | "trim-start" | "trim-end") => {
    event.preventDefault();
    const row = event.currentTarget.closest(".lossless-media-track-row") as HTMLElement | null;
    if (!row) return;
    const rowRect = row.getBoundingClientRect();
    const pointerStart = event.clientX;
    const pointerStartY = event.clientY;
    const originalStart = track.start;
    const originalEnd = track.end;
    const originalLaneId = getTrackLaneId(track);
    const trackDuration = originalEnd - originalStart;
    const maxDuration = timelineDisplayDuration;
    const laneBounds = getLaneClipBounds(tracksRef.current, track, maxDuration);
    trackDragMovedRef.current = false;
    setSelectedVideoClipId("");
    setSelectedTrackId(track.id);
    setSelectedLaneId(getTrackLaneId(track));
    setSelectedKeyframeId(track.type === "image" && track.animated ? track.keyframes[0]?.id || "" : "");
    setInspectorTab("tracks");

    const handleMove = (moveEvent: PointerEvent) => {
      const pixelDelta = moveEvent.clientX - pointerStart;
      if (Math.abs(pixelDelta) > 2 || Math.abs(moveEvent.clientY - pointerStartY) > 2) trackDragMovedRef.current = true;
      const timeDelta = (pixelDelta / Math.max(1, rowRect.width)) * timelineDisplayDuration;
      setTracks((current) => {
        let targetLaneId = originalLaneId;
        if (action === "move") {
          const targetRow = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest<HTMLElement>(".lossless-media-track-row");
          if (targetRow?.dataset.laneType === track.type && targetRow.dataset.laneId) {
            targetLaneId = targetRow.dataset.laneId;
          }
          const proposedStart = clampValue(originalStart + timeDelta, 0, Math.max(0, maxDuration - trackDuration));
          const proposedEnd = proposedStart + trackDuration;
          const overlaps = current.some((item) => item.id !== track.id
            && getTrackLaneId(item) === targetLaneId
            && proposedStart < item.end - 0.001
            && proposedEnd > item.start + 0.001);
          if (overlaps) targetLaneId = originalLaneId;
          if (targetLaneId !== originalLaneId) {
            setSelectedLaneId(targetLaneId);
            const next = current.map((item) => {
              if (item.id !== track.id) return item;
              const delta = proposedStart - originalStart;
              return item.type === "image"
                ? {
                    ...item,
                    laneId: targetLaneId,
                    start: proposedStart,
                    end: proposedEnd,
                    staticTransform: { ...item.staticTransform, time: proposedStart },
                    keyframes: item.keyframes.map((keyframe) => ({ ...keyframe, time: keyframe.time + delta }))
                  }
                : { ...item, laneId: targetLaneId, start: proposedStart, end: proposedEnd };
            });
            tracksRef.current = next;
            return next;
          }
        }
        const next = current.map((item) => {
          if (item.id !== track.id) return item;
          if (action === "move") {
            const delta = clampValue(
              timeDelta,
              laneBounds.minimumStart - originalStart,
              Math.max(laneBounds.minimumStart - originalStart, laneBounds.maximumEnd - originalEnd)
            );
            return item.type === "image"
              ? {
                  ...item,
                  start: originalStart + delta,
                  end: originalEnd + delta,
                  staticTransform: { ...item.staticTransform, time: originalStart + delta },
                  keyframes: track.type === "image" ? track.keyframes.map((keyframe) => ({ ...keyframe, time: keyframe.time + delta })) : item.keyframes
                }
              : { ...item, start: originalStart + delta, end: originalEnd + delta };
          }
          if (action === "trim-start") {
            const start = clampValue(originalStart + timeDelta, laneBounds.minimumStart, originalEnd - 0.05);
            return item.type === "image"
              ? {
                  ...item,
                  start,
                  staticTransform: { ...item.staticTransform, time: start },
                  keyframes: clampImageKeyframesToRange(track as ImageEditorTrack, start, originalEnd)
                }
              : { ...item, start };
          }
          const end = clampValue(originalEnd + timeDelta, originalStart + 0.05, laneBounds.maximumEnd);
          return item.type === "image"
            ? {
                ...item,
                end,
                staticTransform: { ...item.staticTransform, time: originalStart },
                keyframes: clampImageKeyframesToRange(track as ImageEditorTrack, originalStart, end)
              }
            : { ...item, end };
        });
        tracksRef.current = next;
        return next;
      });
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setTimelineLaneOrder((current) => mergeTimelineLaneOrder(current, videoClipsRef.current, tracksRef.current));
      window.setTimeout(() => {
        trackDragMovedRef.current = false;
      }, 120);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  const upsertImageKeyframe = (track: ImageEditorTrack, time = currentTime, patch: Partial<MediaKeyframe> = {}) => {
    const tolerance = Math.max(0.02, 0.5 / timelineFps);
    const keyframeTime = clampValue(Math.round(clampValue(time, track.start, track.end) * timelineFps) / timelineFps, track.start, track.end);
    const nearby = track.keyframes.find((keyframe) => Math.abs(keyframe.time - keyframeTime) <= tolerance);
    const keyframeId = nearby?.id || createEditorId("keyframe");
    updateTrack(track.id, (current) => {
      if (current.type !== "image") return current;
      const existingIndex = current.keyframes.findIndex((keyframe) => Math.abs(keyframe.time - keyframeTime) <= tolerance);
      const snapshot = existingIndex >= 0 ? current.keyframes[existingIndex] : interpolateImageKeyframe(current, keyframeTime);
      const nextKeyframe: MediaKeyframe = {
        ...snapshot,
        ...patch,
        id: existingIndex >= 0 ? current.keyframes[existingIndex].id : keyframeId,
        time: keyframeTime,
        x: clampValue(patch.x ?? snapshot.x, -100, 200),
        y: clampValue(patch.y ?? snapshot.y, -100, 200),
        width: clampValue(patch.width ?? snapshot.width, 1, 200),
        height: clampValue(patch.height ?? resolveImageHeight(current, snapshot), 1, 200),
        rotation: clampValue(patch.rotation ?? snapshot.rotation, -720, 720),
        opacity: clampValue(patch.opacity ?? snapshot.opacity ?? current.opacity, 0, 1),
        easing: readImageEasing(patch.easing ?? (existingIndex >= 0 ? snapshot.easing : "ease-in-out"))
      };
      const keyframes = existingIndex >= 0
        ? current.keyframes.map((keyframe, index) => index === existingIndex ? nextKeyframe : keyframe)
        : [...current.keyframes, nextKeyframe];
      return { ...current, keyframes: keyframes.sort((left, right) => left.time - right.time) };
    });
    setSelectedKeyframeId(nearby?.id || keyframeId);
    return nearby?.id || keyframeId;
  };

  const addImageKeyframe = (track: ImageEditorTrack, time = currentTime) => upsertImageKeyframe(track, time);

  const updateImageAtPlayhead = (track: ImageEditorTrack, patch: Partial<MediaKeyframe>) => {
    if (!track.animated) {
      updateTrack(track.id, (current) => {
        if (current.type !== "image") return current;
        const snapshot = current.staticTransform || interpolateImageKeyframe(current, current.start);
        return {
          ...current,
          staticTransform: {
            ...snapshot,
            ...patch,
            id: snapshot.id || createEditorId("static-transform"),
            time: current.start,
            x: clampValue(patch.x ?? snapshot.x, -100, 200),
            y: clampValue(patch.y ?? snapshot.y, -100, 200),
            width: clampValue(patch.width ?? snapshot.width, 1, 200),
            height: clampValue(patch.height ?? resolveImageHeight(current, snapshot), 1, 200),
            rotation: clampValue(patch.rotation ?? snapshot.rotation, -720, 720),
            opacity: clampValue(patch.opacity ?? snapshot.opacity ?? current.opacity, 0, 1),
            easing: "linear"
          }
        };
      });
      setSelectedKeyframeId("");
      return;
    }
    upsertImageKeyframe(track, videoRef.current?.currentTime ?? currentTime, patch);
  };

  const setImageTrackAnimated = (track: ImageEditorTrack, animated: boolean) => {
    const playheadTime = videoRef.current?.currentTime ?? currentTime;
    const staticSnapshot = animated ? undefined : interpolateImageKeyframe(track, playheadTime);
    updateTrack(track.id, (current) => {
      if (current.type !== "image") return current;
      if (!animated && staticSnapshot) {
        const storedStaticTransform = current.staticTransform || current.keyframes[0] || staticSnapshot;
        return {
          ...current,
          animated: false,
          staticTransform: {
            ...staticSnapshot,
            id: storedStaticTransform.id || createEditorId("static-transform"),
            time: current.start,
            easing: "linear"
          }
        };
      }
      const firstKeyframe = current.keyframes[0];
      const storedStaticTransform = current.staticTransform || firstKeyframe || interpolateImageKeyframe(current, current.start);
      return {
        ...current,
        animated: true,
        keyframes: current.keyframes.length > 1
          ? current.keyframes
          : [{
              ...storedStaticTransform,
              id: firstKeyframe?.id || createEditorId("keyframe"),
              time: current.start,
              easing: "linear"
            }]
      };
    });
    setSelectedKeyframeId(animated ? track.keyframes[0]?.id || "" : "");
  };

  const updateImageKeyframe = (trackId: string, keyframeId: string, patch: Partial<MediaKeyframe>) => {
    updateTrack(trackId, (track) =>
      track.type === "image"
        ? {
            ...track,
            keyframes: track.keyframes
              .map((keyframe) =>
                keyframe.id === keyframeId
                  ? {
                      ...keyframe,
                      ...patch,
                      time: clampValue(patch.time ?? keyframe.time, track.start, track.end),
                      x: clampValue(patch.x ?? keyframe.x, -100, 200),
                      y: clampValue(patch.y ?? keyframe.y, -100, 200),
                      width: clampValue(patch.width ?? keyframe.width, 1, 200),
                      height: clampValue(patch.height ?? resolveImageHeight(track, keyframe), 1, 200),
                      rotation: clampValue(patch.rotation ?? keyframe.rotation, -720, 720),
                      opacity: clampValue(patch.opacity ?? keyframe.opacity ?? track.opacity, 0, 1),
                      easing: readImageEasing(patch.easing ?? keyframe.easing)
                    }
                  : keyframe
              )
              .sort((left, right) => left.time - right.time)
          }
        : track
    );
  };

  const startKeyframeTimelineDrag = (event: ReactPointerEvent<HTMLButtonElement>, track: ImageEditorTrack, keyframe: MediaKeyframe) => {
    event.preventDefault();
    event.stopPropagation();
    const row = event.currentTarget.closest(".lossless-media-track-row") as HTMLElement | null;
    if (!row) return;
    const rowRect = row.getBoundingClientRect();
    const pointerStart = event.clientX;
    trackDragMovedRef.current = false;
    setSelectedTrackId(track.id);
    setSelectedLaneId(getTrackLaneId(track));
    setSelectedKeyframeId(keyframe.id);
    setInspectorTab("tracks");

    const handleMove = (moveEvent: PointerEvent) => {
      const pixelDelta = moveEvent.clientX - pointerStart;
      if (Math.abs(pixelDelta) > 2) trackDragMovedRef.current = true;
      const time = clampValue(keyframe.time + (pixelDelta / Math.max(1, rowRect.width)) * timelineDisplayDuration, track.start, track.end);
      updateImageKeyframe(track.id, keyframe.id, { time });
      if (videoRef.current) {
        videoRef.current.currentTime = time;
        setCurrentTime(time);
      }
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.setTimeout(() => {
        trackDragMovedRef.current = false;
      }, 120);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  const removeImageKeyframe = (track: ImageEditorTrack, keyframeId: string) => {
    if (track.keyframes.length <= 1) return;
    const remaining = track.keyframes.filter((keyframe) => keyframe.id !== keyframeId);
    updateTrack(track.id, (current) => (current.type === "image" ? { ...current, keyframes: remaining } : current));
    setSelectedKeyframeId(remaining[0]?.id || "");
  };

  const seekAdjacentImageKeyframe = (direction: -1 | 1) => {
    if (!sortedSelectedKeyframes.length) return;
    const tolerance = Math.max(0.02, 0.5 / timelineFps);
    const target = direction > 0
      ? sortedSelectedKeyframes.find((keyframe) => keyframe.time > currentTime + tolerance)
      : [...sortedSelectedKeyframes].reverse().find((keyframe) => keyframe.time < currentTime - tolerance);
    if (!target) return;
    setSelectedKeyframeId(target.id);
    seekPreview(target.time, false);
  };

  const addImageKeyframeAtPlayhead = (track: ImageEditorTrack) => {
    const playheadTime = videoRef.current?.currentTime ?? currentTime;
    addImageKeyframe(track, playheadTime);
  };

  const addImageMotionPointOnPath = (event: ReactMouseEvent<SVGPolylineElement>, track: ImageEditorTrack) => {
    event.preventDefault();
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg || track.keyframes.length < 2) return;
    const rect = svg.getBoundingClientRect();
    const pointer = {
      x: clampValue(event.clientX - rect.left, 0, rect.width),
      y: clampValue(event.clientY - rect.top, 0, rect.height)
    };
    const keyframes = [...track.keyframes].sort((left, right) => left.time - right.time);
    let nearest: { index: number; progress: number; distance: number } | undefined;

    for (let index = 0; index < keyframes.length - 1; index += 1) {
      const start = keyframes[index];
      const end = keyframes[index + 1];
      const startX = start.x / 100 * rect.width;
      const startY = start.y / 100 * rect.height;
      const deltaX = (end.x - start.x) / 100 * rect.width;
      const deltaY = (end.y - start.y) / 100 * rect.height;
      const lengthSquared = deltaX * deltaX + deltaY * deltaY;
      const progress = lengthSquared > 0
        ? clampValue(((pointer.x - startX) * deltaX + (pointer.y - startY) * deltaY) / lengthSquared, 0, 1)
        : 0.5;
      const projectedX = startX + deltaX * progress;
      const projectedY = startY + deltaY * progress;
      const distance = Math.hypot(pointer.x - projectedX, pointer.y - projectedY);
      if (!nearest || distance < nearest.distance) nearest = { index, progress, distance };
    }

    if (!nearest) return;
    const previous = keyframes[nearest.index];
    const next = keyframes[nearest.index + 1];
    const time = previous.time + (next.time - previous.time) * nearest.progress;
    videoRef.current?.pause();
    upsertImageKeyframe(track, time, {
      x: pointer.x / Math.max(1, rect.width) * 100,
      y: pointer.y / Math.max(1, rect.height) * 100
    });
    seekPreview(time, false);
  };

  const startImageTransform = (event: ReactPointerEvent<HTMLElement>, track: ImageEditorTrack, action: ImageTransformAction) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedTrackId(track.id);
    setSelectedLaneId(getTrackLaneId(track));
    setInspectorTab("tracks");
    const overlay = event.currentTarget.closest(".lossless-image-overlay") as HTMLElement | null;
    const layer = overlay?.parentElement;
    if (!layer || !overlay) return;
    const video = videoRef.current;
    const playheadTime = video?.currentTime ?? currentTime;
    video?.pause();
    setCurrentTime(playheadTime);
    const rect = layer.getBoundingClientRect();
    const snapshot = interpolateImageKeyframe(track, playheadTime);
    const snapshotHeight = resolveImageHeight(track, snapshot);
    const pointerStartX = event.clientX;
    const pointerStartY = event.clientY;
    const centerX = rect.left + (snapshot.x / 100) * rect.width;
    const centerY = rect.top + (snapshot.y / 100) * rect.height;
    const grabOffsetX = event.clientX - (rect.left + (snapshot.x / 100) * rect.width);
    const grabOffsetY = event.clientY - (rect.top + (snapshot.y / 100) * rect.height);
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
    const rotationRadians = snapshot.rotation * Math.PI / 180;
    const rotationCosine = Math.cos(rotationRadians);
    const rotationSine = Math.sin(rotationRadians);
    const startWidthPixels = snapshot.width / 100 * rect.width;
    const startHeightPixels = snapshotHeight / 100 * rect.height;
    let animationFrame = 0;
    let moved = false;
    let latestPatch: Partial<MediaKeyframe> = {};
    let latestPointer = { x: event.clientX, y: event.clientY, preserveRatio: event.shiftKey };
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const updatePosition = (clientX: number, clientY: number, preserveRatio: boolean) => {
      if (Math.hypot(clientX - pointerStartX, clientY - pointerStartY) < 2) return;
      let patch: Partial<MediaKeyframe>;
      if (action === "rotate") {
        let angleDelta = ((Math.atan2(clientY - centerY, clientX - centerX) - startAngle) * 180) / Math.PI;
        if (angleDelta > 180) angleDelta -= 360;
        if (angleDelta < -180) angleDelta += 360;
        patch = { rotation: clampValue(snapshot.rotation + angleDelta, -720, 720) };
      } else if (action === "move") {
        patch = {
          x: clampValue(((clientX - grabOffsetX - rect.left) / Math.max(1, rect.width)) * 100, -100, 200),
          y: clampValue(((clientY - grabOffsetY - rect.top) / Math.max(1, rect.height)) * 100, -100, 200)
        };
      } else {
        const handle = action.slice("resize-".length) as ImageResizeHandle;
        const pointerDeltaX = clientX - pointerStartX;
        const pointerDeltaY = clientY - pointerStartY;
        const localDeltaX = pointerDeltaX * rotationCosine + pointerDeltaY * rotationSine;
        const localDeltaY = -pointerDeltaX * rotationSine + pointerDeltaY * rotationCosine;
        const horizontalDirection = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
        const verticalDirection = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
        let nextWidthPixels = startWidthPixels + horizontalDirection * localDeltaX;
        let nextHeightPixels = startHeightPixels + verticalDirection * localDeltaY;
        const minWidthPixels = Math.max(8, rect.width * 0.01);
        const minHeightPixels = Math.max(8, rect.height * 0.01);
        nextWidthPixels = clampValue(nextWidthPixels, minWidthPixels, rect.width * 2);
        nextHeightPixels = clampValue(nextHeightPixels, minHeightPixels, rect.height * 2);

        if ((handle === "se" || preserveRatio) && horizontalDirection && verticalDirection) {
          const widthScale = nextWidthPixels / Math.max(1, startWidthPixels);
          const heightScale = nextHeightPixels / Math.max(1, startHeightPixels);
          const scale = Math.abs(widthScale - 1) >= Math.abs(heightScale - 1) ? widthScale : heightScale;
          nextWidthPixels = clampValue(startWidthPixels * scale, minWidthPixels, rect.width * 2);
          nextHeightPixels = clampValue(startHeightPixels * scale, minHeightPixels, rect.height * 2);
        }

        const centerLocalX = horizontalDirection * (nextWidthPixels - startWidthPixels) / 2;
        const centerLocalY = verticalDirection * (nextHeightPixels - startHeightPixels) / 2;
        const centerShiftX = centerLocalX * rotationCosine - centerLocalY * rotationSine;
        const centerShiftY = centerLocalX * rotationSine + centerLocalY * rotationCosine;
        patch = {
          x: clampValue(snapshot.x + centerShiftX / Math.max(1, rect.width) * 100, -100, 200),
          y: clampValue(snapshot.y + centerShiftY / Math.max(1, rect.height) * 100, -100, 200),
          width: clampValue(nextWidthPixels / Math.max(1, rect.width) * 100, 1, 200),
          height: clampValue(nextHeightPixels / Math.max(1, rect.height) * 100, 1, 200)
        };
      }
      moved = true;
      latestPatch = patch;
      paintImageTransform(overlay, { ...snapshot, ...patch }, track);
      const motionPath = imageMotionPathRef.current;
      if (motionPath?.dataset.trackId === track.id && (patch.x !== undefined || patch.y !== undefined)) {
        const tolerance = Math.max(0.02, 0.5 / timelineFps);
        const nearbyIndex = track.keyframes.findIndex((keyframe) => Math.abs(keyframe.time - playheadTime) <= tolerance);
        const previewKeyframe = { ...snapshot, ...patch, time: playheadTime };
        const previewKeyframes = nearbyIndex >= 0
          ? track.keyframes.map((keyframe, index) => index === nearbyIndex ? previewKeyframe : keyframe)
          : [...track.keyframes, previewKeyframe];
        motionPath.setAttribute("points", buildImageMotionPathPoints(previewKeyframes, rect.width, rect.height));
      }
    };
    const handleMove = (moveEvent: PointerEvent) => {
      latestPointer = { x: moveEvent.clientX, y: moveEvent.clientY, preserveRatio: moveEvent.shiftKey };
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        updatePosition(latestPointer.x, latestPointer.y, latestPointer.preserveRatio);
      });
    };
    const handleUp = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        updatePosition(latestPointer.x, latestPointer.y, latestPointer.preserveRatio);
      }
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      document.body.style.userSelect = previousUserSelect;
      if (moved) updateImageAtPlayhead(track, latestPatch);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleUp, { once: true });
  };

  const startImageMotionPointDrag = (event: ReactPointerEvent<HTMLButtonElement>, track: ImageEditorTrack, keyframe: MediaKeyframe) => {
    event.preventDefault();
    event.stopPropagation();
    const layer = event.currentTarget.closest(".lossless-media-overlay") as HTMLElement | null;
    if (!layer) return;
    const point = event.currentTarget;
    const rect = layer.getBoundingClientRect();
    const pointerStartX = event.clientX;
    const pointerStartY = event.clientY;
    const grabOffsetX = event.clientX - (rect.left + keyframe.x / 100 * rect.width);
    const grabOffsetY = event.clientY - (rect.top + keyframe.y / 100 * rect.height);
    let animationFrame = 0;
    let moved = false;
    let latestPosition = { x: keyframe.x, y: keyframe.y };
    let latestPointer = { x: event.clientX, y: event.clientY };
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    setSelectedTrackId(track.id);
    setSelectedLaneId(getTrackLaneId(track));
    setSelectedKeyframeId(keyframe.id);
    setInspectorTab("tracks");
    videoRef.current?.pause();
    seekPreview(keyframe.time, false);

    const paintPosition = (clientX: number, clientY: number) => {
      if (Math.hypot(clientX - pointerStartX, clientY - pointerStartY) < 2) return;
      const position = {
        x: clampValue((clientX - grabOffsetX - rect.left) / Math.max(1, rect.width) * 100, -100, 200),
        y: clampValue((clientY - grabOffsetY - rect.top) / Math.max(1, rect.height) * 100, -100, 200)
      };
      moved = true;
      latestPosition = position;
      point.style.left = `${position.x.toFixed(4)}%`;
      point.style.top = `${position.y.toFixed(4)}%`;
      const previewKeyframes = track.keyframes.map((item) => item.id === keyframe.id ? { ...item, ...position } : item);
      imageMotionPathRef.current?.setAttribute("points", buildImageMotionPathPoints(previewKeyframes, rect.width, rect.height));
      const imageOverlay = imageOverlayRefs.current.get(track.id);
      if (imageOverlay) paintImageTransform(imageOverlay, { ...keyframe, ...position }, track);
    };
    const handleMove = (moveEvent: PointerEvent) => {
      latestPointer = { x: moveEvent.clientX, y: moveEvent.clientY };
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        paintPosition(latestPointer.x, latestPointer.y);
      });
    };
    const handleUp = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        paintPosition(latestPointer.x, latestPointer.y);
      }
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      document.body.style.userSelect = previousUserSelect;
      if (moved) updateImageKeyframe(track.id, keyframe.id, latestPosition);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleUp, { once: true });
  };

  const runDetect = async () => {
    if (!videoInput) {
      notify({ type: "warning", title: "请先选择视频" });
      return;
    }
    setStatus("detecting");
    setError("");
    setProgress({ percent: 1, label: "上传视频", detail: "正在把视频交给本地处理器" });
    const nextTaskId = createVideoTaskId();
    setTaskId(nextTaskId);
    abortRef.current = new AbortController();
    let pollingStopped = false;
    let pollBusy = false;
    let pollTimer: number | undefined;
    const pollTask = async () => {
      if (pollingStopped || pollBusy) return;
      pollBusy = true;
      try {
        const info = await getVideoTaskInfo(nextTaskId);
        if (pollingStopped) return;
        if (info.duration) setDuration(info.duration);
        if (info.status === "failed") {
          const message = info.message || "检测失败";
          setError(message);
          setProgress({ percent: clampPercent(info.progress), label: info.stage || "检测失败", detail: message });
          return;
        }
        if (info.status === "cancelled") {
          setProgress({ percent: clampPercent(info.progress), label: "已取消", detail: info.message || "当前任务已停止" });
          return;
        }
        setProgress({
          percent: clampPercent(info.progress),
          label: info.stage || "检测中",
          detail: info.message || "本地处理器正在检测视频"
        });
      } catch {
        // 上传刚结束时任务状态可能尚未可读，下一次轮询会继续。
      } finally {
        pollBusy = false;
      }
    };
    const startPolling = () => {
      if (pollingStopped || pollTimer !== undefined) return;
      void pollTask();
      pollTimer = window.setInterval(() => void pollTask(), 500);
    };
    const pollingFallback = window.setTimeout(startPolling, 1500);
    try {
      const response = await detectDuplicateSegments(
        { taskId: nextTaskId, file: videoFile ?? undefined, input: videoInput, params },
        abortRef.current.signal,
        (fraction) => {
          const uploadPercent = 1 + Math.round(fraction * 6);
          setProgress((current) =>
            current.percent > 7
              ? current
              : {
                  percent: uploadPercent,
                  label: "上传视频",
                  detail: `正在上传视频 ${Math.round(fraction * 100)}%`
                }
          );
          if (fraction >= 0.999) startPolling();
        }
      );
      const normalizedSegments = response.segments.map(normalizeSegment);
      const nextSegments = isVideoTimelineEdited(videoClipsRef.current, videoSourcesRef.current, response.duration || duration)
        ? normalizedSegments.flatMap((segment): DuplicateSegment[] => {
            const first = mapPrimarySourceRangeToProject(videoClipsRef.current, videoSourcesRef.current, segment.firstStart, segment.firstEnd);
            const second = mapPrimarySourceRangeToProject(videoClipsRef.current, videoSourcesRef.current, segment.secondStart, segment.secondEnd);
            const deletion = mapPrimarySourceRangeToProject(
              videoClipsRef.current,
              videoSourcesRef.current,
              segment.deleteStart ?? segment.secondStart,
              segment.deleteEnd ?? segment.secondEnd
            );
            if (!first || !second || !deletion) return [];
            return [{
              ...segment,
              firstStart: first.start,
              firstEnd: first.end,
              secondStart: second.start,
              secondEnd: second.end,
              deleteStart: deletion.start,
              deleteEnd: deletion.end,
              duration: second.end - second.start,
              deleteDuration: deletion.end - deletion.start
            }];
          })
        : normalizedSegments;
      const nextRepeats = nextSegments.filter((segment) => segment.kind !== "slide-transition").length;
      const nextTransitions = nextSegments.filter((segment) => segment.kind === "slide-transition").length;
      setSegments(nextSegments);
      selectionUndoRef.current = [];
      selectionRedoRef.current = [];
      setHistoryVersion((value) => value + 1);
      setTaskId(response.taskId || nextTaskId);
      if (response.duration) setDuration(response.duration);
      setSegmentFilter(nextRepeats > 0 ? "repeat" : nextTransitions > 0 ? "transition" : "settings");
      setStatus("detected");
      setProgress({
        percent: 100,
        label: "检测完成",
        detail: response.message || (nextSegments.length ? `发现 ${nextRepeats} 段重复，${nextTransitions} 段上滑转场` : "没有发现满足阈值的重复或上滑转场")
      });
      notify({ type: "success", title: "检测完成", message: `重复 ${nextRepeats} 段，上滑转场 ${nextTransitions} 段` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "检测失败";
      setStatus(abortRef.current?.signal.aborted ? "cancelled" : "error");
      setError(message);
      setProgress({ percent: 0, label: "检测未完成", detail: message });
      notify({ type: "error", title: "检测失败", message });
    } finally {
      pollingStopped = true;
      window.clearTimeout(pollingFallback);
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      abortRef.current = null;
    }
  };

  const runExport = async () => {
    if (projectVideoDuration <= 0 || (!videoClips.length && !enabledTracks.length)) {
      notify({ type: "warning", title: "时间轴没有可导出的素材" });
      return;
    }
    if (audioSeparation.enabled && audioSeparationStatus?.available !== true) {
      notify({
        type: "error",
        title: audioSeparationStatusLoading ? "正在检查声音处理引擎" : "声音处理不可用",
        message: audioSeparationStatus?.message || "请等待本地运行环境与模型检查完成"
      });
      return;
    }
    setStatus("exporting");
    setError("");
    setProgress({ percent: 15, label: "导出中", detail: mode === "keyframe-copy" ? "按关键帧边界生成流拷贝切割方案" : "准备精确裁剪方案" });
    if (enabledTracks.length || hasVideoEdits) {
      setProgress({ percent: 15, label: "导出中", detail: `正在准备 ${videoClips.length + enabledTracks.length} 个时间轴素材` });
    }
    if (audioSeparation.enabled) {
      setProgress({
        percent: 8,
        label: audioSeparation.mode === "dialogue" ? "准备电影对白分离" : "准备人声分离",
        detail: audioSeparationStatus?.modelReady
          ? audioSeparation.mode === "dialogue" ? "正在载入电影对白与演唱复核模型" : "正在载入本地高质量模型"
          : "首次使用会先下载所需模型"
      });
    }
    abortRef.current = new AbortController();
    let pollingStopped = false;
    let pollBusy = false;
    let pollTimer: number | undefined;
    try {
      const exportTaskId = taskId || createVideoTaskId();
      if (!taskId) setTaskId(exportTaskId);
      const pollTask = async () => {
        if (pollingStopped || pollBusy) return;
        pollBusy = true;
        try {
          const info = await getVideoTaskInfo(exportTaskId);
          if (!pollingStopped && (info.status === "exporting" || info.status === "done" || info.status === "failed")) {
            setProgress({
              percent: clampPercent(info.progress),
              label: info.stage || "导出中",
              detail: info.message || "正在生成 MP4"
            });
          }
        } catch {
          // 首次直接导出时，原视频上传完成后才会建立任务。
        } finally {
          pollBusy = false;
        }
      };
      pollTimer = window.setInterval(() => void pollTask(), 500);
      const outputSuffix = audioSeparation.enabled
        ? audioSeparation.mode === "dialogue"
          ? enabledTracks.length || hasVideoEdits ? "_edited_dialogue.mp4" : "_dialogue.mp4"
          : enabledTracks.length || hasVideoEdits ? "_edited_voice.mp4" : "_voice.mp4"
        : enabledTracks.length || hasVideoEdits ? "_edited.mp4" : "_clean.mp4";
      const projectSourceName = videoInput?.name || importedResources[0]?.name || "timeline.mp4";
      const outputName = projectSourceName.replace(/\.[^.]+$/, outputSuffix);
      const laneLayer = (laneId: string) => {
        const orderedIndex = timelineLaneOrder.indexOf(laneId);
        if (orderedIndex >= 0) return orderedIndex;
        const visibleIndex = timelineLanes.findIndex((lane) => lane.id === laneId);
        return visibleIndex >= 0 ? visibleIndex : timelineLanes.length;
      };
      const exportTracks: ExportMediaTrack[] = enabledTracks.map((track) =>
        track.type === "audio"
          ? {
              id: track.id,
              laneId: getTrackLaneId(track),
              layer: laneLayer(getTrackLaneId(track)),
              type: track.type,
              name: track.name,
              start: track.start,
              end: track.end,
              enabled: track.enabled,
              volume: track.volume,
              fadeIn: track.fadeIn,
              fadeOut: track.fadeOut,
              loop: track.loop
            }
          : {
              id: track.id,
              laneId: getTrackLaneId(track),
              layer: laneLayer(getTrackLaneId(track)),
              type: track.type,
              name: track.name,
              start: track.start,
              end: track.end,
              enabled: track.enabled,
              opacity: track.opacity,
              keyframes: track.animated
                ? track.keyframes
                : [{ ...track.staticTransform, time: track.start, easing: "linear" }]
            }
      );
      const exportVideoClips: ExportVideoClip[] | undefined = videoClips.length
        ? videoClips.map((clip) => {
            const source = videoSources.find((item) => item.id === clip.sourceId);
            return {
              id: clip.id,
              sourceId: clip.sourceId,
              laneId: clip.laneId,
              layer: laneLayer(clip.laneId),
              name: clip.name,
              start: clip.start,
              end: clip.end,
              sourceStart: clip.sourceStart,
              sourceEnd: clip.sourceEnd,
              primary: Boolean(source?.primary)
            };
          })
        : undefined;
      const response = await exportCleanVideo(
        {
          taskId: exportTaskId,
          input: videoInput || { name: "timeline.mp4" },
          projectDuration: projectVideoDuration,
          canvasWidth: Math.max(2, Math.round(videoSize.width)),
          canvasHeight: Math.max(2, Math.round(videoSize.height)),
          frameRate: timelineFps,
          segments,
          tracks: exportTracks,
          videoClips: exportVideoClips,
          mode,
          outputName,
          audioSeparation
        },
        abortRef.current.signal,
        enabledTracks.map((track) => ({ trackId: track.id, file: track.file })),
        videoClips.length
          ? videoSources
              .filter((source) => !source.primary && usedVideoSourceIds.has(source.id))
              .map((source) => ({ sourceId: source.id, file: source.file }))
          : [],
        taskId ? undefined : videoFile || undefined,
        (fraction) => {
          setProgress((current) =>
            current.percent > 18
              ? current
              : {
                  percent: 3 + Math.round(fraction * 15),
                  label: "上传导出素材",
                  detail: `正在上传原视频与时间轴素材 ${Math.round(fraction * 100)}%`
                }
          );
        }
      );
      downloadVideoOutput(response.taskId || exportTaskId, outputName);
      if (audioSeparation.enabled) {
        setAudioSeparationStatus((current) => current ? {
          ...current,
          modelReady: true,
          dialogueReady: audioSeparation.mode === "dialogue" ? true : current.dialogueReady,
          message: audioSeparation.mode === "dialogue" ? "电影对白分离与演唱复核模型已就绪" : "人声分离引擎与模型已就绪"
        } : current);
      }
      setStatus("done");
      setProgress({ percent: 100, label: "导出完成", detail: `${response.message || "已输出无重复 MP4"}，文件已开始保存：${outputName}` });
      notify({ type: "success", title: "导出完成", message: `${outputName} 已开始保存` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "导出失败";
      setStatus(abortRef.current?.signal.aborted ? "cancelled" : "error");
      setError(message);
      setProgress({ percent: 0, label: "导出未完成", detail: message });
      notify({ type: "error", title: "导出失败", message });
    } finally {
      pollingStopped = true;
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      abortRef.current = null;
    }
  };

  const cancelTask = async () => {
    abortRef.current?.abort();
    await cancelVideoTask(taskId);
    setStatus("cancelled");
    setProgress({ percent: 0, label: "已取消", detail: "当前任务已停止" });
  };

  const commitSegmentSelection = (nextValues: boolean[]) => {
    const currentValues = segments.map((segment) => segment.deleteSecond);
    if (currentValues.every((value, index) => value === nextValues[index])) return;
    selectionUndoRef.current = [...selectionUndoRef.current.slice(-49), currentValues];
    selectionRedoRef.current = [];
    setSegments((current) => current.map((segment, index) => ({ ...segment, deleteSecond: nextValues[index] ?? segment.deleteSecond })));
    setHistoryVersion((value) => value + 1);
  };

  const toggleSegment = (index: number) => {
    commitSegmentSelection(segments.map((segment, segmentIndex) => (segmentIndex === index ? !segment.deleteSecond : segment.deleteSecond)));
  };

  const setAllSegments = (checked: boolean) => {
    commitSegmentSelection(segments.map(() => checked));
  };

  const setFilteredSegments = (checked: boolean) => {
    if (segmentFilter === "settings") return;
    commitSegmentSelection(
      segments.map((segment) => {
        const matches =
          segmentFilter === "repeat"
            ? segment.kind !== "slide-transition"
            : segment.kind === "slide-transition";
        return matches ? checked : segment.deleteSecond;
      })
    );
  };

  const undoSelection = () => {
    const previous = selectionUndoRef.current.pop();
    if (!previous) return;
    selectionRedoRef.current.push(segments.map((segment) => segment.deleteSecond));
    setSegments((current) => current.map((segment, index) => ({ ...segment, deleteSecond: previous[index] ?? segment.deleteSecond })));
    setHistoryVersion((value) => value + 1);
  };

  const redoSelection = () => {
    const next = selectionRedoRef.current.pop();
    if (!next) return;
    selectionUndoRef.current.push(segments.map((segment) => segment.deleteSecond));
    setSegments((current) => current.map((segment, index) => ({ ...segment, deleteSecond: next[index] ?? segment.deleteSecond })));
    setHistoryVersion((value) => value + 1);
  };

  const syncAudioPreviews = (time: number, shouldPlay: boolean) => {
    tracks.forEach((track) => {
      if (track.type !== "audio") return;
      const audio = audioPreviewRefs.current.get(track.id);
      if (!audio) return;
      const localTime = time - track.start;
      const active = track.enabled && time >= track.start && time < track.end;
      const hasSourceDuration = track.sourceDuration > 0;
      const playable = active && (track.loop || !hasSourceDuration || localTime < track.sourceDuration);
      if (!playable) {
        audio.pause();
        return;
      }
      const sourceTime = track.loop && hasSourceDuration ? localTime % track.sourceDuration : Math.max(0, localTime);
      const remaining = Math.max(0, track.end - time);
      const fadeInGain = track.fadeIn > 0 ? clampValue(localTime / track.fadeIn, 0, 1) : 1;
      const fadeOutGain = track.fadeOut > 0 ? clampValue(remaining / track.fadeOut, 0, 1) : 1;
      audio.volume = clampValue(track.volume * fadeInGain * fadeOutGain, 0, 1);
      audio.muted = isMuted;
      audio.playbackRate = playbackRate;
      if (Math.abs(audio.currentTime - sourceTime) > 0.2) audio.currentTime = sourceTime;
      if (shouldPlay) {
        if (audio.paused) void audio.play().catch(() => undefined);
      } else {
        audio.pause();
      }
    });
  };

  const applyPendingVideoSeek = (video: HTMLVideoElement) => {
    const pending = pendingVideoSeekRef.current;
    const clip = videoClipsRef.current.find((item) => item.id === activeVideoClipIdRef.current);
    if (!pending || !clip) return;
    const sourceTime = clampValue(clip.sourceStart + pending.time - clip.start, clip.sourceStart, clip.sourceEnd);
    if (Number.isFinite(video.duration)) video.currentTime = Math.min(sourceTime, video.duration);
    video.playbackRate = playbackRate;
    video.muted = isMuted;
    pendingVideoSeekRef.current = null;
    syncAudioPreviews(pending.time, pending.shouldPlay);
    if (pending.shouldPlay) void video.play().catch(() => undefined);
  };

  const seekPreview = (seconds: number, shouldPlay = true) => {
    const clips = videoClipsRef.current;
    const projectDuration = getTimelineProjectDuration(clips, tracksRef.current);
    const nextTime = clampValue(seconds, 0, Math.max(0, projectDuration));
    const clip = findVideoClipAtTime(clips, nextTime, timelineLaneOrderRef.current);
    const video = videoRef.current;
    const continuePlayback = shouldPlay || isPlaying;
    playbackAnchorRef.current = { time: nextTime, startedAt: performance.now() };
    pendingVideoSeekRef.current = { time: nextTime, shouldPlay: continuePlayback };
    setCurrentTime(nextTime);
    syncAudioPreviews(nextTime, continuePlayback);
    if (shouldPlay && !isPlaying) setIsPlaying(true);
    if (!clip) {
      video?.pause();
      activeVideoClipIdRef.current = "";
      setActiveVideoClipId("");
      pendingVideoSeekRef.current = null;
      return;
    }
    if (activeVideoClipIdRef.current !== clip.id) {
      const previousClip = videoClipsRef.current.find((item) => item.id === activeVideoClipIdRef.current);
      if (previousClip?.sourceId !== clip.sourceId) video?.pause();
      activeVideoClipIdRef.current = clip.id;
      setActiveVideoClipId(clip.id);
      if (video && previousClip?.sourceId === clip.sourceId) applyPendingVideoSeek(video);
      return;
    }
    if (video) applyPendingVideoSeek(video);
  };

  const togglePlayback = () => {
    const projectDuration = getTimelineProjectDuration(videoClipsRef.current, tracksRef.current);
    if (projectDuration <= 0.001) return;
    if (isPlaying) {
      videoRef.current?.pause();
      setIsPlaying(false);
      syncAudioPreviews(currentTime, false);
      return;
    }
    seekPreview(currentTime >= projectDuration - 0.001 ? 0 : currentTime, true);
  };

  const changeTimelineZoom = (exponent: number) => {
    const nextZoom = 2 ** clampValue(exponent, timelineMinZoomExponent, timelineMaxZoomExponent);
    const viewport = timelineScrollRef.current;
    if (!viewport || !timelineDuration) {
      setTimelineZoom(nextZoom);
      return;
    }
    const oldCanvasWidth = Math.max(viewport.clientWidth, viewport.scrollWidth);
    const oldContentWidth = Math.max(1, oldCanvasWidth - timelineEdgeSpacePx * 2);
    const oldDisplayDuration = timelineDuration / Math.min(1, timelineZoom);
    const playheadPosition = timelineEdgeSpacePx + (currentTime / oldDisplayDuration) * oldContentWidth;
    const playheadViewportX = playheadPosition - viewport.scrollLeft;
    const playheadIsVisible = playheadViewportX >= 0 && playheadViewportX <= viewport.clientWidth;
    const anchorViewportX = playheadIsVisible ? playheadViewportX : viewport.clientWidth / 2;
    const anchorTime = playheadIsVisible
      ? currentTime
      : clampValue((viewport.scrollLeft + anchorViewportX - timelineEdgeSpacePx) / oldContentWidth, 0, 1) * oldDisplayDuration;
    setTimelineZoom(nextZoom);
    window.requestAnimationFrame(() => {
      const newCanvasWidth = Math.max(viewport.clientWidth, viewport.scrollWidth);
      const newContentWidth = Math.max(1, newCanvasWidth - timelineEdgeSpacePx * 2);
      const newDisplayDuration = timelineDuration / Math.min(1, nextZoom);
      const nextScrollLeft = clampValue(
        timelineEdgeSpacePx + (anchorTime / newDisplayDuration) * newContentWidth - anchorViewportX,
        0,
        Math.max(0, newCanvasWidth - viewport.clientWidth)
      );
      viewport.scrollLeft = nextScrollLeft;
      setTimelineViewport({ width: viewport.clientWidth, scrollLeft: nextScrollLeft });
    });
  };

  const startTimelineScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const ruler = event.currentTarget;
    const seekAtPointer = (clientX: number) => {
      const rect = ruler.getBoundingClientRect();
      const time = clampValue(((clientX - rect.left) / Math.max(1, rect.width)) * timelineDisplayDuration, 0, timelineDisplayDuration);
      seekPreview(time, false);
    };
    seekAtPointer(event.clientX);
    const handleMove = (moveEvent: PointerEvent) => seekAtPointer(moveEvent.clientX);
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  const handleTimelineRulerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const frameStep = 1 / timelineFps;
    const jumpStep = event.shiftKey ? 1 : frameStep;
    const target = event.key === "ArrowLeft"
      ? currentTime - jumpStep
      : event.key === "ArrowRight"
        ? currentTime + jumpStep
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? projectVideoDuration
            : undefined;
    if (target === undefined) return;
    event.preventDefault();
    seekPreview(target, false);
  };

  const stepFrame = (direction: -1 | 1) => {
    videoRef.current?.pause();
    setIsPlaying(false);
    seekPreview(currentTime + direction / timelineFps, false);
  };

  const seekCandidate = (direction: -1 | 1) => {
    if (!segments.length) return;
    const points = segments
      .map((segment) => segment.deleteStart ?? segment.secondStart)
      .sort((left, right) => left - right);
    const activeTime = currentTime;
    const target =
      direction > 0
        ? points.find((time) => time > activeTime + 0.05) ?? points[0]
        : [...points].reverse().find((time) => time < activeTime - 0.05) ?? points[points.length - 1];
    seekPreview(target, false);
  };

  const changePlaybackRate = (value: number) => {
    setPlaybackRate(value);
    if (videoRef.current) videoRef.current.playbackRate = value;
    audioPreviewRefs.current.forEach((audio) => {
      audio.playbackRate = value;
    });
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) videoRef.current.muted = nextMuted;
    audioPreviewRefs.current.forEach((audio) => {
      audio.muted = nextMuted;
    });
  };

  const handlePreviewLoadedMetadata = (video: HTMLVideoElement) => {
    const currentClip = videoClipsRef.current.find((clip) => clip.id === activeVideoClipIdRef.current);
    const source = videoSourcesRef.current.find((item) => item.id === currentClip?.sourceId)
      || videoSourcesRef.current.find((item) => item.primary);
    if (!source) return;
    const metadata = {
      duration: Number.isFinite(video.duration) ? video.duration : source.duration,
      width: video.videoWidth || source.width || 16,
      height: video.videoHeight || source.height || 9
    };
    const nextSources = videoSourcesRef.current.map((item) => item.id === source.id ? { ...item, ...metadata } : item);
    videoSourcesRef.current = nextSources;
    setVideoSources(nextSources);
    video.playbackRate = playbackRate;
    video.muted = isMuted;

    if (source.primary) {
      setDuration(metadata.duration);
    }
    window.requestAnimationFrame(() => applyPendingVideoSeek(video));
  };

  useEffect(() => {
    if (!isPlaying) return;
    playbackAnchorRef.current = { time: currentTime, startedAt: performance.now() };
    let frameId = 0;
    const tick = (now: number) => {
      const projectDuration = getTimelineProjectDuration(videoClipsRef.current, tracksRef.current);
      const anchor = playbackAnchorRef.current;
      const nextTime = anchor.time + (now - anchor.startedAt) / 1000 * playbackRate;
      if (nextTime >= projectDuration - 0.0005) {
        setCurrentTime(projectDuration);
        setIsPlaying(false);
        videoRef.current?.pause();
        syncAudioPreviews(projectDuration, false);
        return;
      }
      setCurrentTime(nextTime);
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [isPlaying, playbackRate]);

  useEffect(() => {
    const clip = findVideoClipAtTime(videoClips, currentTime, timelineLaneOrder);
    const video = videoRef.current;
    if (!clip) {
      video?.pause();
      if (activeVideoClipIdRef.current) {
        activeVideoClipIdRef.current = "";
        setActiveVideoClipId("");
      }
      return;
    }
    if (activeVideoClipIdRef.current !== clip.id) {
      pendingVideoSeekRef.current = { time: currentTime, shouldPlay: isPlaying };
      activeVideoClipIdRef.current = clip.id;
      setActiveVideoClipId(clip.id);
      return;
    }
    if (!video || !Number.isFinite(video.duration)) return;
    const sourceTime = clampValue(clip.sourceStart + currentTime - clip.start, clip.sourceStart, clip.sourceEnd);
    if (Math.abs(video.currentTime - sourceTime) > 0.18) video.currentTime = Math.min(sourceTime, video.duration);
    video.playbackRate = playbackRate;
    video.muted = isMuted;
    if (isPlaying) {
      if (video.paused) void video.play().catch(() => undefined);
    } else if (!video.paused) {
      video.pause();
    }
  }, [activeVideoClipId, currentTime, isMuted, isPlaying, playbackRate, timelineLaneOrder, videoClips]);

  useEffect(() => {
    syncAudioPreviews(currentTime, isPlaying);
  }, [currentTime, isMuted, isPlaying, playbackRate, tracks]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, button")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoSelection();
        else undoSelection();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        splitSelectedVideoClip();
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        if (selectedVideoClipId) {
          event.preventDefault();
          removeVideoClip(selectedVideoClipId);
        } else if (selectedTrackId) {
          event.preventDefault();
          removeTrack(selectedTrackId);
        }
        return;
      }
      if (event.code === "Space" || event.key.toLowerCase() === "k") {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === ",") {
        stepFrame(-1);
      } else if (event.key === ".") {
        stepFrame(1);
      } else if (event.key.toLowerCase() === "p") {
        seekCandidate(-1);
      } else if (event.key.toLowerCase() === "n") {
        seekCandidate(1);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  const statusIcon = status === "detecting" || status === "exporting" ? <Loader2 className="spin" size={18} /> : status === "done" || status === "detected" ? <CheckCircle2 size={18} /> : status === "error" ? <XCircle size={18} /> : <ShieldCheck size={18} />;

  return (
    <section className="workspace module-workspace lossless-video-page">
      <section className="data-panel data-panel-full data-panel-compact lossless-video-panel">
        <header className="table-toolbar lossless-video-toolbar">
          <div className="lossless-toolbar-group">
            <button className="lossless-icon-button" type="button" title="撤销片段选择" aria-label="撤销片段选择" onClick={undoSelection} disabled={!canUndoSelection}>
              <Undo2 size={16} />
            </button>
            <button className="lossless-icon-button" type="button" title="重做片段选择" aria-label="重做片段选择" onClick={redoSelection} disabled={!canRedoSelection}>
              <Redo2 size={16} />
            </button>
            <button className="lossless-icon-button" type="button" title="全选待删除片段" aria-label="全选待删除片段" onClick={() => setAllSegments(true)} disabled={!segments.length}>
              <ListChecks size={16} />
            </button>
            <button className="lossless-icon-button" type="button" title="重置检测结果" aria-label="重置检测结果" onClick={resetResult} disabled={status === "detecting" || status === "exporting"}>
              <RotateCcw size={16} />
            </button>
            <button className="lossless-icon-button text-danger" type="button" title="取消当前任务" aria-label="取消当前任务" onClick={cancelTask} disabled={status !== "detecting" && status !== "exporting"}>
              <CircleStop size={16} />
            </button>
          </div>
          <nav className="lossless-header-menu" role="tablist" aria-label="视频编辑功能">
            <button className={inspectorTab === "tracks" ? "is-active" : ""} type="button" role="tab" aria-selected={inspectorTab === "tracks"} onClick={() => setInspectorTab("tracks")}>
              <FolderOpen size={16} />
              导入资源
            </button>
            <button className={inspectorTab === "detect" ? "is-active" : ""} type="button" role="tab" aria-selected={inspectorTab === "detect"} onClick={() => setInspectorTab("detect")}>
              <Target size={16} />
              检测
            </button>
            <button className={inspectorTab === "export" ? "is-active" : ""} type="button" role="tab" aria-selected={inspectorTab === "export"} onClick={() => setInspectorTab("export")}>
              <Download size={16} />
              导出
            </button>
          </nav>
          <div className="lossless-file-chip" title={importedResources.map((resource) => resource.name).join("\n")}>
            <FileVideo size={16} />
            <strong>{importedResources.length ? `${importedResources.length} 个已导入资源` : "未导入资源"}</strong>
            {videoClips.length + tracks.length > 0 ? <span>{videoClips.length + tracks.length} 个时间轴素材</span> : null}
          </div>
        </header>

        <input
          ref={resourceInputRef}
          className="lossless-file-input"
          type="file"
          multiple
          accept="video/*,audio/*,image/*,.mp4,.mov,.m4v,.mkv,.webm,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.png,.jpg,.jpeg,.webp,.bmp"
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            if (files.length) void importResourceFiles(files);
            event.currentTarget.value = "";
          }}
        />
        {tracks.map((track) =>
          track.type === "audio" ? (
            <audio
              key={`${track.id}-preview-audio`}
              ref={(node) => {
                if (node) audioPreviewRefs.current.set(track.id, node);
                else audioPreviewRefs.current.delete(track.id);
              }}
              className="lossless-file-input"
              src={track.previewUrl}
              preload="auto"
              loop={track.loop}
            />
          ) : null
        )}

        <div className="lossless-video-body">
          <div className="lossless-editing-layout">
            <main className="lossless-editor">
              <section className="lossless-viewer">
                <div className="lossless-viewer-titlebar">
                  <span>预览</span>
                  <span>{projectVideoDuration ? formatSeconds(projectVideoDuration) : "--:--"}</span>
                </div>
                <div className="lossless-preview" ref={previewRef}>
                  {projectVideoDuration > 0 ? (
                    <>
                      {activeVideoSource && activeVideoClip ? (
                        <video
                          ref={videoRef}
                          src={activeVideoSource.previewUrl}
                          playsInline
                          muted={isMuted}
                          onClick={togglePlayback}
                          onLoadedMetadata={(event) => handlePreviewLoadedMetadata(event.currentTarget)}
                        />
                      ) : <div className="lossless-preview-canvas" onClick={togglePlayback} />}
                      <div
                        className="lossless-media-overlay"
                        style={{
                          left: previewVideoRect.left,
                          top: previewVideoRect.top,
                          width: previewVideoRect.width,
                          height: previewVideoRect.height
                        }}
                      >
                        {selectedImageTrack && selectedImageVisible && selectedImageMotionPoints && currentTime >= selectedImageTrack.start && currentTime <= selectedImageTrack.end ? (
                          <svg
                            className="lossless-image-motion-path"
                            viewBox={`0 0 ${Math.max(1, previewVideoRect.width)} ${Math.max(1, previewVideoRect.height)}`}
                            preserveAspectRatio="none"
                            aria-hidden="true"
                          >
                            <polyline
                              className="lossless-image-motion-hitarea"
                              points={selectedImageMotionPoints}
                              vectorEffect="non-scaling-stroke"
                              role="button"
                              aria-label="双击插入轨迹关键点"
                              onDoubleClick={(event) => addImageMotionPointOnPath(event, selectedImageTrack)}
                            />
                            <polyline
                              ref={imageMotionPathRef}
                              data-track-id={selectedImageTrack.id}
                              points={selectedImageMotionPoints}
                              vectorEffect="non-scaling-stroke"
                            />
                          </svg>
                        ) : null}
                        {tracks.map((track) => {
                          if (track.type !== "image") return null;
                          const keyframe = interpolateImageKeyframe(track, currentTime);
                          const isSelected = selectedTrackId === track.id;
                          const trackLayer = timelineLayerByLane.get(getTrackLaneId(track)) ?? Number.POSITIVE_INFINITY;
                          const isActive = track.enabled
                            && trackLayer < activeVideoLayer
                            && currentTime >= track.start
                            && currentTime <= track.end;
                          return (
                            <div
                              className={`lossless-image-overlay ${isSelected ? "is-selected" : ""}`}
                              key={track.id}
                              ref={(element) => {
                                if (element) {
                                  imageOverlayRefs.current.set(track.id, element);
                                  paintImageTransform(element, interpolateImageKeyframe(track, currentTime), track);
                                } else {
                                  imageOverlayRefs.current.delete(track.id);
                                }
                              }}
                              title={track.animated ? "拖动移动动态图片" : "拖动移动图片"}
                              role="button"
                              tabIndex={0}
                              aria-label={`编辑图片 ${track.name}`}
                              onPointerDown={(event) => startImageTransform(event, track, "move")}
                              onKeyDown={(event) => {
                                const step = event.shiftKey ? 1 : 0.2;
                                const patch = event.key === "ArrowLeft"
                                  ? { x: keyframe.x - step }
                                  : event.key === "ArrowRight"
                                    ? { x: keyframe.x + step }
                                    : event.key === "ArrowUp"
                                      ? { y: keyframe.y - step }
                                      : event.key === "ArrowDown"
                                        ? { y: keyframe.y + step }
                                        : undefined;
                                if (!patch) return;
                                event.preventDefault();
                                setSelectedTrackId(track.id);
                                setSelectedLaneId(getTrackLaneId(track));
                                setInspectorTab("tracks");
                                updateImageAtPlayhead(track, patch);
                              }}
                              style={{
                                visibility: isActive ? "visible" : "hidden",
                                pointerEvents: isActive ? "auto" : "none",
                                zIndex: Math.max(1, timelineLanes.length - trackLayer)
                              }}
                            >
                              <img src={track.previewUrl} alt="" draggable={false} />
                              {isSelected ? (
                                <>
                                  {imageResizeHandles.map((handle) => (
                                    <button
                                      className={`lossless-image-transform-handle is-${handle}`}
                                      type="button"
                                      key={handle}
                                      title={handle === "se" ? "等比例缩放图片" : handle.length === 2 ? "自由拉伸，按住 Shift 等比例缩放" : "拉伸图片"}
                                      aria-label={handle === "se" ? "从右下角等比例缩放图片" : `从 ${handle} 方向拉伸图片`}
                                      onPointerDown={(event) => startImageTransform(event, track, `resize-${handle}`)}
                                    />
                                  ))}
                                  <button
                                    className="lossless-image-rotation-handle"
                                    type="button"
                                    title="旋转标签"
                                    aria-label="旋转标签"
                                    onPointerDown={(event) => startImageTransform(event, track, "rotate")}
                                  >
                                    <RotateCw size={11} />
                                  </button>
                                </>
                              ) : null}
                            </div>
                          );
                        })}
                        {selectedImageTrack && currentTime >= selectedImageTrack.start && currentTime <= selectedImageTrack.end
                          ? selectedImageMotionKeyframes.map((keyframe) => (
                              <button
                                className={`lossless-image-motion-point ${selectedKeyframeId === keyframe.id ? "is-selected" : ""}`}
                                type="button"
                                key={`${keyframe.id}-motion-point`}
                                title={`拖动关键帧位置 · ${formatSeconds(keyframe.time)}`}
                                aria-label={`移动 ${formatSeconds(keyframe.time)} 的位置关键帧`}
                                style={{ left: `${keyframe.x}%`, top: `${keyframe.y}%` }}
                                onPointerDown={(event) => startImageMotionPointDrag(event, selectedImageTrack, keyframe)}
                                onKeyDown={(event) => {
                                  const step = event.shiftKey ? 1 : 0.2;
                                  const position = event.key === "ArrowLeft"
                                    ? { x: keyframe.x - step, y: keyframe.y }
                                    : event.key === "ArrowRight"
                                      ? { x: keyframe.x + step, y: keyframe.y }
                                      : event.key === "ArrowUp"
                                        ? { x: keyframe.x, y: keyframe.y - step }
                                        : event.key === "ArrowDown"
                                          ? { x: keyframe.x, y: keyframe.y + step }
                                          : undefined;
                                  if (!position) return;
                                  event.preventDefault();
                                  setSelectedKeyframeId(keyframe.id);
                                  seekPreview(keyframe.time, false);
                                  updateImageKeyframe(selectedImageTrack.id, keyframe.id, position);
                                }}
                              >
                                <Diamond size={13} fill={selectedKeyframeId === keyframe.id ? "currentColor" : "var(--card-bg)"} />
                              </button>
                            ))
                          : null}
                      </div>
                    </>
                  ) : (
                    <div className="lossless-drop lossless-viewer-empty">
                      <FileVideo size={34} />
                      <strong>时间轴暂无视频</strong>
                    </div>
                  )}
                </div>
              </section>

              <section className="lossless-task-strip">
                <div className={`lossless-status status-${status}`}>
                  {statusIcon}
                  <strong>{progress.label}</strong>
                  <span>{progress.detail}</span>
                  <em>{Math.round(clampPercent(progress.percent))}%</em>
                  {showStepElapsed ? <em>{stepElapsed}</em> : null}
                </div>
                <div className="lossless-progress-bar">
                  <i style={{ width: `${clampPercent(progress.percent)}%` }} />
                </div>
                {error ? <div className="lossless-error">{error}</div> : null}
              </section>

              <section className="lossless-timeline">
                <header className="lossless-timeline-toolbar">
                  <div className="lossless-timeline-track-actions">
                    <strong>时间轴</strong>
                    <button type="button" title="在播放头处分割选中视频" aria-label="分割视频片段" onClick={splitSelectedVideoClip} disabled={!canSplitSelectedVideoClip}>
                      <Scissors size={15} />
                    </button>
                    <button type="button" title="删除选中视频片段" aria-label="删除视频片段" onClick={() => selectedVideoClip && removeVideoClip(selectedVideoClip.id)} disabled={!selectedVideoClip}>
                      <Trash2 size={15} />
                    </button>
                    <span>{videoClips.length + tracks.length} 个素材 · {timelineLanes.length} 条轨道</span>
                  </div>
                  <div className="lossless-timeline-transport" aria-label="预览控制">
                    <span className="lossless-timecode" title={`${formatSeconds(currentTime)} / ${projectVideoDuration ? formatSeconds(projectVideoDuration) : "--:--"}`}>
                      {formatTimelineTimecode(currentTime, timelineFps)} / {projectVideoDuration ? formatTimelineTimecode(projectVideoDuration, timelineFps) : "--:--:--:--"}
                    </span>
                    <div className="lossless-transport-buttons">
                      <button type="button" title="上一个候选片段" aria-label="上一个候选片段" onClick={() => seekCandidate(-1)} disabled={projectVideoDuration <= 0 || !segments.length}>
                        <SkipBack size={15} />
                      </button>
                      <button type="button" title="上一帧" aria-label="上一帧" onClick={() => stepFrame(-1)} disabled={projectVideoDuration <= 0}>
                        <ChevronLeft size={15} />
                      </button>
                      <button className="lossless-play-button" type="button" title={isPlaying ? "暂停" : "播放"} aria-label={isPlaying ? "暂停" : "播放"} onClick={togglePlayback} disabled={projectVideoDuration <= 0}>
                        {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                      </button>
                      <button type="button" title="下一帧" aria-label="下一帧" onClick={() => stepFrame(1)} disabled={projectVideoDuration <= 0}>
                        <ChevronRight size={15} />
                      </button>
                      <button type="button" title="下一个候选片段" aria-label="下一个候选片段" onClick={() => seekCandidate(1)} disabled={projectVideoDuration <= 0 || !segments.length}>
                        <SkipForward size={15} />
                      </button>
                    </div>
                    <AppSelect
                      className="lossless-transport-select"
                      value={playbackRate}
                      options={playbackRateOptions}
                      menuClassName="lossless-transport-menu"
                      matchTriggerWidth
                      maxMenuHeight={232}
                      onChange={changePlaybackRate}
                      ariaLabel="播放速度"
                      disabled={projectVideoDuration <= 0}
                    />
                    <button className="lossless-timeline-mute" type="button" title={isMuted ? "打开声音" : "静音"} aria-label={isMuted ? "打开声音" : "静音"} onClick={toggleMute} disabled={projectVideoDuration <= 0}>
                      {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                    </button>
                  </div>
                  <div className="lossless-timeline-toolbar-end">
                    <label className="lossless-timeline-zoom-control">
                      <ZoomIn size={15} />
                      <input
                        type="range"
                        min={timelineMinZoomExponent}
                        max={timelineMaxZoomExponent}
                        step={0.125}
                        value={Math.min(Math.log2(timelineZoom), timelineMaxZoomExponent)}
                        onChange={(event) => changeTimelineZoom(Number(event.target.value))}
                        aria-label="时间轴缩放"
                      />
                      <em>{timelineZoom < 10 ? `${Math.round(timelineZoom * 100)}%` : `${Math.round(timelineZoom)}×`}</em>
                    </label>
                  </div>
                </header>
                <div
                  ref={timelineScrollRef}
                  className="lossless-timeline-scroll"
                  onScroll={(event) => setTimelineViewport({ width: event.currentTarget.clientWidth, scrollLeft: event.currentTarget.scrollLeft })}
                >
                  <div className="lossless-timeline-canvas" style={{ width: `${timelineCanvasZoom * 100}%`, minHeight: `${74 + timelineLanes.length * 34}px` }}>
                    <div
                      className={`lossless-timeline-content ${timelineDropActive ? "is-resource-dragging" : ""}`}
                      onDragEnter={(event) => {
                        if (!Array.from(event.dataTransfer.types).includes(resourceDragMime)) return;
                        event.preventDefault();
                        event.stopPropagation();
                        setTimelineDropActive(true);
                      }}
                      onDragOver={(event) => {
                        if (!Array.from(event.dataTransfer.types).includes(resourceDragMime)) return;
                        event.preventDefault();
                        event.stopPropagation();
                        event.dataTransfer.dropEffect = "copy";
                        setTimelineDropActive(true);
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTimelineDropActive(false);
                      }}
                      onDrop={handleTimelineResourceDrop}
                    >
                      <div
                        className="lossless-timeline-ruler"
                        title="点击或拖动定位播放头"
                        role="slider"
                        tabIndex={projectVideoDuration > 0 ? 0 : -1}
                        aria-label="播放进度"
                        aria-valuemin={0}
                        aria-valuemax={timelineDisplayDuration}
                        aria-valuenow={Math.min(currentTime, timelineDisplayDuration)}
                        aria-valuetext={formatTimelineTimecode(currentTime, timelineFps)}
                        onPointerDown={startTimelineScrub}
                        onKeyDown={handleTimelineRulerKeyDown}
                      >
                        <i
                          className="lossless-timeline-ruler-progress"
                          style={{ width: `${(Math.min(currentTime, timelineDisplayDuration) / timelineDisplayDuration) * 100}%` }}
                        />
                        {timelineTicks.map((tick) => (
                          <span className={`is-${tick.kind}`} key={`${tick.kind}-${tick.index}`} style={{ left: `${tick.percent}%` }}>
                            {tick.kind === "major" ? <time>{formatTimelineRulerLabel(tick.time, timelineScale.majorStep, timelineFps)}</time> : null}
                          </span>
                        ))}
                      </div>
                      <div className="lossless-timeline-grid-lines" aria-hidden="true">
                        {timelineTicks.map((tick) => (
                          <i className={`is-${tick.kind}`} key={`grid-${tick.kind}-${tick.index}`} style={{ left: `${tick.percent}%` }} />
                        ))}
                      </div>
                      <div className="lossless-candidate-track">
                        {segments.map((segment, index) => {
                          const start = segment.deleteStart ?? segment.secondStart;
                          const end = segment.deleteEnd ?? segment.secondEnd;
                          return (
                            <button
                              key={`${segment.id}-timeline-${index}`}
                              type="button"
                              className={`${segment.kind === "slide-transition" ? "is-transition" : "is-repeat"} ${segment.deleteSecond ? "is-selected" : "is-kept"}`}
                              style={{ left: `${(start / timelineDisplayDuration) * 100}%`, width: `${Math.max(((end - start) / timelineDisplayDuration) * 100, 0.08)}%` }}
                              title={`${segment.kind === "slide-transition" ? "上滑转场" : "重复片段"} ${formatSeconds(start)} - ${formatSeconds(end)}`}
                              aria-label={`定位到 ${formatSeconds(start)}`}
                              onClick={() => seekPreview(start, false)}
                              disabled={projectVideoDuration <= 0}
                            />
                          );
                        })}
                      </div>
                      {timelineLanes.map((lane, laneIndex) => (
                        <div
                          className={`lossless-media-track-row is-${lane.type} ${selectedLaneId === lane.id && (lane.type === "video" ? !selectedVideoClipId : !selectedTrackId) ? "is-selected" : ""}`}
                          key={`${lane.id}-timeline`}
                          style={{ top: `${68 + laneIndex * 34}px` }}
                          data-lane-id={lane.id}
                          data-lane-type={lane.type}
                          aria-label={`${lane.type === "video" ? "视频" : lane.type === "audio" ? "音频" : "图片"}轨道，${lane.type === "video" ? lane.videoClips.length : lane.clips.length} 个素材`}
                          onPointerDown={(event) => {
                            setSelectedLaneId(lane.id);
                            if (event.target === event.currentTarget) {
                              setSelectedVideoClipId("");
                              setSelectedTrackId("");
                              setSelectedKeyframeId("");
                              setInspectorTab("tracks");
                            }
                          }}
                        >
                        {lane.type === "video" ? lane.videoClips.map((clip) => (
                          <button
                            className={`lossless-media-track-clip ${selectedVideoClipId === clip.id ? "is-selected" : ""}`}
                            type="button"
                            key={`${clip.id}-timeline`}
                            aria-pressed={selectedVideoClipId === clip.id}
                            style={{
                              left: `${(clip.start / timelineDisplayDuration) * 100}%`,
                              width: `${Math.max(((clip.end - clip.start) / timelineDisplayDuration) * 100, 0.35)}%`
                            }}
                            title={`${clip.name} · 拖动调整轨道和位置，拖动两端裁切`}
                            onPointerDown={(event) => startVideoClipTimelineDrag(event, clip, "move")}
                            onClick={(event) => selectVideoClipAtPointer(event, clip)}
                          >
                            <i
                              className="lossless-media-track-handle is-start"
                              title="调整入点"
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                startVideoClipTimelineDrag(event, clip, "trim-start");
                              }}
                            />
                            <FileVideo size={13} />
                            <span>{clip.name}</span>
                            <i
                              className="lossless-media-track-handle is-end"
                              title="调整出点"
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                startVideoClipTimelineDrag(event, clip, "trim-end");
                              }}
                            />
                          </button>
                        )) : lane.clips.map((track) => (
                          <Fragment key={`${track.id}-timeline`}>
                            <button
                              className={`lossless-media-track-clip ${selectedTrackId === track.id ? "is-selected" : ""} ${track.enabled ? "" : "is-disabled"}`}
                              type="button"
                              aria-pressed={selectedTrackId === track.id}
                              style={{
                                left: `${(track.start / timelineDisplayDuration) * 100}%`,
                                width: `${Math.max(((track.end - track.start) / timelineDisplayDuration) * 100, 0.35)}%`
                              }}
                              title={`${track.name} · 拖动调整位置，拖动两端调整时长${track.type === "image" && track.animated ? "，双击添加关键帧" : ""}`}
                              onPointerDown={(event) => startTrackTimelineDrag(event, track, "move")}
                              onClick={(event) => selectTrackAtPointer(event, track)}
                              onDoubleClick={(event) => addTrackKeyframeAtPointer(event, track)}
                            >
                              <i
                                className="lossless-media-track-handle is-start"
                                title="调整开始时间"
                                onPointerDown={(event) => {
                                  event.stopPropagation();
                                  startTrackTimelineDrag(event, track, "trim-start");
                                }}
                              />
                              {track.type === "audio" ? <Music2 size={13} /> : <Sticker size={13} />}
                              <span>{track.name}</span>
                              <i
                                className="lossless-media-track-handle is-end"
                                title="调整结束时间"
                                onPointerDown={(event) => {
                                  event.stopPropagation();
                                  startTrackTimelineDrag(event, track, "trim-end");
                                }}
                              />
                            </button>
                            {track.type === "image" && track.animated
                              ? track.keyframes.map((keyframe) => (
                                  <button
                                    className={`lossless-keyframe-point ${selectedKeyframeId === keyframe.id ? "is-selected" : ""}`}
                                    type="button"
                                    key={keyframe.id}
                                    title={`关键帧 ${formatSeconds(keyframe.time)}`}
                                    aria-label={`定位关键帧 ${formatSeconds(keyframe.time)}`}
                                    style={{ left: `${(keyframe.time / timelineDisplayDuration) * 100}%` }}
                                    onPointerDown={(event) => startKeyframeTimelineDrag(event, track, keyframe)}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (trackDragMovedRef.current) {
                                        trackDragMovedRef.current = false;
                                        return;
                                      }
                                      setSelectedTrackId(track.id);
                                      setSelectedLaneId(getTrackLaneId(track));
                                      setSelectedKeyframeId(keyframe.id);
                                      setInspectorTab("tracks");
                                      seekPreview(keyframe.time, false);
                                    }}
                                  >
                                    <Diamond size={10} fill="currentColor" />
                                  </button>
                                ))
                              : null}
                          </Fragment>
                        ))}
                        </div>
                      ))}
                      <i ref={timelinePlayheadRef} className="lossless-playhead" style={{ left: `${(Math.min(currentTime, timelineDisplayDuration) / timelineDisplayDuration) * 100}%` }} />
                    </div>
                  </div>
                </div>
              </section>
            </main>

            <aside className="lossless-inspector">
              {inspectorTab === "detect" ? (
                <div className="lossless-inspector-content lossless-detect-inspector">
                  <button className="primary-button lossless-inspector-action" type="button" onClick={runDetect} disabled={!canRunTask}>
                    {status === "detecting" ? <Loader2 className="spin" size={17} /> : <Target size={17} />}
                    开始检测
                  </button>
                  <section className="lossless-inspector-section lossless-detect-tabs">
                    <SegmentedControl
                      className="lossless-result-filters"
                      value={segmentFilter}
                      options={segmentFilterOptions}
                      onChange={setSegmentFilter}
                    />
                  </section>
                  <div className={`lossless-detect-body ${segmentFilter === "settings" ? "is-settings" : "is-results"}`}>
                    {segmentFilter === "settings" ? (
                      <>
                      <section className="lossless-inspector-section">
                        <h3>检测参数</h3>
                        <label className="lossless-inspector-field">
                          <span>相邻搜索窗口</span>
                          <span><input type="number" min={5} max={300} value={params.maxSearchWindowSec} onChange={(event) => setNumberParam("maxSearchWindowSec", Number(event.target.value || 30))} /><em>秒</em></span>
                        </label>
                        <label className="lossless-inspector-field">
                          <span>最短重复时长</span>
                          <span><input type="number" min={0.5} step={0.5} max={30} value={params.minRepeatSec} onChange={(event) => setNumberParam("minRepeatSec", Number(event.target.value || 2))} /><em>秒</em></span>
                        </label>
                        <label className="lossless-inspector-field">
                          <span>音频相似度</span>
                          <span><input type="number" min={80} max={100} value={params.audioSimilarity} onChange={(event) => setNumberParam("audioSimilarity", Number(event.target.value || 95))} /><em>%</em></span>
                        </label>
                        <label className="lossless-inspector-field">
                          <span>画面相似度</span>
                          <span><input type="number" min={80} max={100} value={params.videoSimilarity} onChange={(event) => setNumberParam("videoSimilarity", Number(event.target.value || 97))} /><em>%</em></span>
                        </label>
                        <label className="lossless-inspector-field">
                          <span>抽帧频率</span>
                          <span><input type="number" min={1} max={8} value={params.frameSampleFps} onChange={(event) => setNumberParam("frameSampleFps", Number(event.target.value || 2))} /><em>fps</em></span>
                        </label>
                        <label className="lossless-inspector-field">
                          <span>确认缓冲</span>
                          <span><input type="number" min={0} max={2000} step={100} value={params.confirmPaddingMs} onChange={(event) => setNumberParam("confirmPaddingMs", Number(event.target.value || 300))} /><em>ms</em></span>
                        </label>
                      </section>
                      <section className="lossless-inspector-section">
                        <h3>基础处理</h3>
                        <div className="lossless-switch-row">
                          <span>音频优先初筛</span>
                          <AppSwitch checked={params.preferAudioFirst} onChange={(checked) => setParams((prev) => ({ ...prev, preferAudioFirst: checked }))} ariaLabel="音频优先初筛" />
                        </div>
                      </section>
                      <section className="lossless-inspector-section lossless-inspector-summary">
                        <h3>处理汇总</h3>
                        <dl><dt>待删除</dt><dd>{removableSegments.length}</dd></dl>
                        <dl><dt>预计缩短</dt><dd>{formatSeconds(removeDuration)}</dd></dl>
                        <dl><dt>画面尺寸</dt><dd>原始画幅</dd></dl>
                      </section>
                      </>
                    ) : (
                      <>
                      {segmentFilter === "transition" ? (
                        <section className="lossless-inspector-section">
                          <h3>转场设置</h3>
                          <div className="lossless-switch-row">
                            <span>检测并删除上滑转场</span>
                            <AppSwitch checked={params.autoDetectSlideTransitions} onChange={(checked) => setParams((prev) => ({ ...prev, autoDetectSlideTransitions: checked }))} ariaLabel="检测并删除上滑转场" />
                          </div>
                        </section>
                      ) : null}
                      <section className="lossless-inspector-section lossless-result-section">
                        <div className="lossless-section-title-row">
                          <h3>{segmentFilter === "repeat" ? "重复片段" : "上滑转场"}</h3>
                          <span>{filteredSegments.length}</span>
                        </div>
                        <div className="lossless-result-actions">
                          <button type="button" onClick={() => setFilteredSegments(true)} disabled={!filteredSegments.length}>本页删除</button>
                          <button type="button" onClick={() => setFilteredSegments(false)} disabled={!filteredSegments.length}>本页保留</button>
                        </div>
                        <div className="lossless-result-list">
                          {filteredSegments.length ? (
                            filteredSegments.map(({ segment, index }) => {
                              const start = segment.deleteStart ?? segment.secondStart;
                              const end = segment.deleteEnd ?? segment.secondEnd;
                              const confidence = Math.round(segment.confidence);
                              const confidenceDifference = dominantConfidence === undefined ? 0 : confidence - dominantConfidence;
                              const confidenceClass = confidenceDifference === 0
                                ? ""
                                : confidenceDifference > 0
                                  ? "is-higher"
                                  : confidenceDifference <= -4
                                    ? "is-much-lower"
                                    : "is-lower";
                              return (
                                <div className={`lossless-result-item ${segment.deleteSecond ? "is-selected" : "is-kept"}`} key={`${segment.id}-inspector-${index}`}>
                                  <label title={segment.deleteSecond ? "导出时删除" : "导出时保留"}>
                                    <input type="checkbox" checked={segment.deleteSecond} onChange={() => toggleSegment(index)} />
                                  </label>
                                  <b className={segment.kind === "slide-transition" ? "is-transition" : "is-repeat"}>
                                    {segment.kind === "slide-transition" ? "上滑" : "重复"}
                                  </b>
                                  <strong title={`${formatSeconds(start)} - ${formatSeconds(end)}`}>{formatSeconds(start)} - {formatSeconds(end)}</strong>
                                  <small>
                                    {formatCompactDuration(segment.deleteDuration ?? segment.duration)} · <span
                                      className={`lossless-result-confidence ${confidenceClass}`.trim()}
                                      title={confidenceDifference === 0 || dominantConfidence === undefined ? undefined : `常见相似度 ${dominantConfidence}%`}
                                    >{confidence}%</span>
                                    {segment.kind === "slide-transition" ? "" : segment.keyframeAligned ? " · 流拷贝" : " · 需重编"}
                                  </small>
                                  <button type="button" title="播放处理范围" aria-label={`从 ${formatSeconds(start)} 开始播放`} disabled={projectVideoDuration <= 0} onClick={() => seekPreview(start, true)}>
                                    <Play size={14} />
                                  </button>
                                </div>
                              );
                            })
                          ) : (
                            <div className="lossless-result-empty">
                              <Scissors size={19} />
                              <span>{segmentFilter === "repeat" ? "暂无重复片段" : "暂无上滑转场"}</span>
                            </div>
                          )}
                        </div>
                      </section>
                      </>
                    )}
                  </div>
                </div>
              ) : inspectorTab === "tracks" ? (
                <div className="lossless-inspector-content">
                  <section className="lossless-inspector-section">
                    <div className="lossless-section-title-row">
                      <h3>导入资源</h3>
                      <span>{importedResources.length}</span>
                    </div>
                    <div
                      className={`lossless-resource-bin ${resourceDropActive ? "is-dragging" : ""}`}
                      onDragEnter={(event) => {
                        if (!Array.from(event.dataTransfer.types).includes("Files")) return;
                        event.preventDefault();
                        event.stopPropagation();
                        setResourceDropActive(true);
                      }}
                      onDragOver={(event) => {
                        if (!Array.from(event.dataTransfer.types).includes("Files")) return;
                        event.preventDefault();
                        event.stopPropagation();
                        event.dataTransfer.dropEffect = "copy";
                        setResourceDropActive(true);
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setResourceDropActive(false);
                      }}
                      onDrop={handleResourceBinDrop}
                    >
                      <div className="lossless-resource-library-bar">
                        <strong>全部</strong>
                        <button type="button" onClick={pickResourceFiles} disabled={status === "detecting" || status === "exporting"}>
                          <Plus size={14} />
                          导入
                        </button>
                      </div>
                      {importedResources.length ? (
                        <div className="lossless-resource-grid">
                          {importedResources.map((resource) => {
                            const inUse = resource.type === "video"
                              ? usedVideoSourceIds.has(resource.id)
                              : usedMediaSourceIds.has(resource.id);
                            const metadata = resource.type === "image"
                              ? `${resource.width} × ${resource.height}`
                              : formatCompactDuration(resource.duration);
                            return (
                              <div
                                className={`lossless-resource-card is-${resource.type} ${inUse ? "is-used" : ""} ${selectedResourceId === resource.id ? "is-selected" : ""}`}
                                key={`${resource.id}-resource`}
                                draggable={status !== "detecting" && status !== "exporting"}
                                tabIndex={0}
                                title={`${resource.name} · 拖到时间轴，或双击添加到播放头`}
                                onClick={() => setSelectedResourceId(resource.id)}
                                onDoubleClick={(event) => {
                                  if ((event.target as HTMLElement).closest("button")) return;
                                  addImportedResourceToTimeline(resource.id);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter") return;
                                  event.preventDefault();
                                  addImportedResourceToTimeline(resource.id);
                                }}
                                onDragStart={(event) => {
                                  setSelectedResourceId(resource.id);
                                  event.dataTransfer.effectAllowed = "copy";
                                  event.dataTransfer.setData(resourceDragMime, resource.id);
                                  event.dataTransfer.setData("text/plain", resource.id);
                                }}
                                onDragEnd={() => setTimelineDropActive(false)}
                              >
                                <div className="lossless-resource-preview">
                                  {resource.type === "image"
                                    ? <img src={resource.previewUrl} alt="" draggable={false} />
                                    : resource.type === "video"
                                      ? resource.thumbnailUrl
                                        ? <img src={resource.thumbnailUrl} alt="" draggable={false} />
                                        : <FileVideo size={24} />
                                      : <span className="lossless-resource-audio-preview"><Music2 size={24} /></span>}
                                  {inUse ? <span className="lossless-resource-used-badge">已添加</span> : null}
                                  {resource.type !== "image" ? <time>{metadata}</time> : null}
                                  <div className="lossless-resource-card-actions">
                                    <button
                                      type="button"
                                      title="添加到当前播放头"
                                      aria-label={`把 ${resource.name} 添加到当前播放头`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        addImportedResourceToTimeline(resource.id);
                                      }}
                                      disabled={status === "detecting" || status === "exporting"}
                                    >
                                      <Plus size={13} />
                                    </button>
                                    <button
                                      className="lossless-remove-track"
                                      type="button"
                                      title={inUse ? "资源正在时间轴中使用" : "从资源库移除"}
                                      aria-label={`从资源库移除 ${resource.name}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        removeImportedResource(resource);
                                      }}
                                      disabled={inUse || status === "detecting" || status === "exporting"}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                                <strong>{resource.name}</strong>
                                <small>{resource.type === "video" ? "视频" : resource.type === "audio" ? "音频" : metadata}</small>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="lossless-resource-empty">
                          <Layers3 size={20} />
                          <span>拖入视频、图片或音频</span>
                        </div>
                      )}
                    </div>
                  </section>

                  {selectedVideoClip ? (
                    <section className="lossless-inspector-section">
                      <div className="lossless-selected-track is-video">
                        <div>
                          <FileVideo size={16} />
                          <span>
                            <strong>{selectedVideoClip.name}</strong>
                            <small>{formatSeconds(selectedVideoClip.start)} - {formatSeconds(selectedVideoClip.end)}</small>
                          </span>
                        </div>
                        <button className="lossless-remove-track" type="button" title="删除视频片段" aria-label={`删除视频片段 ${selectedVideoClip.name}`} onClick={() => removeVideoClip(selectedVideoClip.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <h3>视频片段</h3>
                      <label className="lossless-inspector-field">
                        <span>时间轴范围</span>
                        <span><b>{formatSeconds(selectedVideoClip.start)} - {formatSeconds(selectedVideoClip.end)}</b></span>
                      </label>
                      <label className="lossless-inspector-field">
                        <span>源素材范围</span>
                        <span><b>{formatSeconds(selectedVideoClip.sourceStart)} - {formatSeconds(selectedVideoClip.sourceEnd)}</b></span>
                      </label>
                      <div className="lossless-track-add-actions">
                        <button type="button" onClick={splitSelectedVideoClip} disabled={!canSplitSelectedVideoClip}>
                          <Scissors size={15} />
                          播放头分割
                        </button>
                        <button type="button" onClick={() => removeVideoClip(selectedVideoClip.id)}>
                          <Trash2 size={15} />
                          删除片段
                        </button>
                      </div>
                      <div className="lossless-export-boundary is-lossless">
                        <ShieldCheck size={18} />
                        <span>分割只记录源入点和出点，不会修改或复制原素材。</span>
                      </div>
                    </section>
                  ) : selectedTrack ? (
                    <>
                      <section className="lossless-inspector-section">
                        <div className="lossless-selected-track">
                          <div>
                            {selectedTrack.type === "audio" ? <Music2 size={16} /> : <Sticker size={16} />}
                            <span>
                              <strong>{selectedTrack.name}</strong>
                              <small>{formatSeconds(selectedTrack.start)} - {formatSeconds(selectedTrack.end)}</small>
                            </span>
                          </div>
                          <AppSwitch
                            checked={selectedTrack.enabled}
                            onChange={(checked) => updateTrack(selectedTrack.id, (track) => ({ ...track, enabled: checked }))}
                            ariaLabel={selectedTrack.enabled ? "停用素材" : "启用素材"}
                          />
                          <button className="lossless-remove-track" type="button" title="删除素材" aria-label={`删除素材 ${selectedTrack.name}`} onClick={() => removeTrack(selectedTrack.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <h3>{selectedTrack.type === "audio" ? "声音属性" : "图片属性"}</h3>
                        <label className="lossless-inspector-field">
                          <span>开始时间</span>
                          <span><input type="number" min={selectedTrackLaneBounds?.minimumStart ?? 0} max={Math.max(selectedTrackLaneBounds?.minimumStart ?? 0, selectedTrack.end - 0.05)} step={0.01} value={Number(selectedTrack.start.toFixed(2))} onChange={(event) => updateTrackBoundary(selectedTrack.id, "start", Number(event.target.value || 0))} /><em>秒</em></span>
                        </label>
                        <label className="lossless-inspector-field">
                          <span>结束时间</span>
                          <span><input type="number" min={selectedTrack.start + 0.05} max={selectedTrackLaneBounds?.maximumEnd ?? (projectVideoDuration || undefined)} step={0.01} value={Number(selectedTrack.end.toFixed(2))} onChange={(event) => updateTrackBoundary(selectedTrack.id, "end", Number(event.target.value || selectedTrack.end))} /><em>秒</em></span>
                        </label>
                        {selectedTrack.type === "image" ? (
                          <div className="lossless-switch-row">
                            <span>动态</span>
                            <AppSwitch checked={selectedTrack.animated} onChange={(checked) => setImageTrackAnimated(selectedTrack, checked)} ariaLabel="图片动态" />
                          </div>
                        ) : null}
                        {selectedTrack.type === "audio" ? (
                          <>
                            <label className="lossless-slider-field">
                              <span>音量</span>
                              <input type="range" min={0} max={2} step={0.01} value={selectedTrack.volume} onChange={(event) => updateTrack(selectedTrack.id, (track) => track.type === "audio" ? { ...track, volume: Number(event.target.value) } : track)} />
                              <em>{Math.round(selectedTrack.volume * 100)}%</em>
                            </label>
                            <label className="lossless-inspector-field">
                              <span>淡入</span>
                              <span><input type="number" min={0} max={selectedTrack.end - selectedTrack.start} step={0.1} value={selectedTrack.fadeIn} onChange={(event) => updateTrack(selectedTrack.id, (track) => track.type === "audio" ? { ...track, fadeIn: Math.max(0, Number(event.target.value || 0)) } : track)} /><em>秒</em></span>
                            </label>
                            <label className="lossless-inspector-field">
                              <span>淡出</span>
                              <span><input type="number" min={0} max={selectedTrack.end - selectedTrack.start} step={0.1} value={selectedTrack.fadeOut} onChange={(event) => updateTrack(selectedTrack.id, (track) => track.type === "audio" ? { ...track, fadeOut: Math.max(0, Number(event.target.value || 0)) } : track)} /><em>秒</em></span>
                            </label>
                            <div className="lossless-switch-row">
                              <span>循环播放</span>
                              <AppSwitch checked={selectedTrack.loop} onChange={(checked) => updateTrack(selectedTrack.id, (track) => track.type === "audio" ? { ...track, loop: checked } : track)} ariaLabel="循环播放" />
                            </div>
                          </>
                        ) : null}
                      </section>

                      {selectedImageTrack && currentImageTransform ? (
                        <section className="lossless-inspector-section">
                          <div className="lossless-section-title-row">
                            <h3>{selectedImageTrack.animated ? "动态变换" : "画面变换"}</h3>
                            <span>{selectedImageTrack.animated ? `${sortedSelectedKeyframes.length} 个关键帧` : "静态"}</span>
                          </div>
                          {selectedImageTrack.animated ? <div className="lossless-keyframe-toolbar">
                            <span>
                              <strong>{currentImageKeyframe ? "当前关键帧" : "当前画面"}</strong>
                              <small>{formatTimelineTimecode(currentTime, timelineFps)}</small>
                            </span>
                            <div>
                              <button type="button" title="上一个关键帧" aria-label="上一个关键帧" disabled={!hasPreviousImageKeyframe} onClick={() => seekAdjacentImageKeyframe(-1)}>
                                <ChevronLeft size={15} />
                              </button>
                              <button
                                type="button"
                                title={currentImageKeyframe ? "当前时间已有关键点" : "在当前播放头添加关键点"}
                                aria-label="添加当前关键点"
                                disabled={Boolean(currentImageKeyframe)}
                                onClick={() => addImageKeyframeAtPlayhead(selectedImageTrack)}
                              >
                                <span className="lossless-add-keyframe-icon"><Diamond size={12} /><Plus size={9} /></span>
                              </button>
                              <button
                                type="button"
                                title="删除当前关键点"
                                aria-label="删除当前关键点"
                                disabled={!currentImageKeyframe || selectedImageTrack.keyframes.length <= 1}
                                onClick={() => currentImageKeyframe && removeImageKeyframe(selectedImageTrack, currentImageKeyframe.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                              <button type="button" title="下一个关键帧" aria-label="下一个关键帧" disabled={!hasNextImageKeyframe} onClick={() => seekAdjacentImageKeyframe(1)}>
                                <ChevronRight size={15} />
                              </button>
                            </div>
                          </div> : null}
                          <div className="lossless-transform-controls">
                            <div className="lossless-transform-row is-position">
                              <span className="lossless-transform-label"><Move size={15} /><b>位置</b></span>
                              <label><span>X</span><input type="number" min={-100} max={200} step={0.1} value={Number(currentImageTransform.x.toFixed(1))} onChange={(event) => updateImageAtPlayhead(selectedImageTrack, { x: Number(event.target.value || 0) })} /><em>%</em></label>
                              <label><span>Y</span><input type="number" min={-100} max={200} step={0.1} value={Number(currentImageTransform.y.toFixed(1))} onChange={(event) => updateImageAtPlayhead(selectedImageTrack, { y: Number(event.target.value || 0) })} /><em>%</em></label>
                            </div>
                            <div className="lossless-transform-row is-size">
                              <span className="lossless-transform-label"><Maximize2 size={15} /><b>尺寸</b></span>
                              <label><span>宽</span><input type="number" min={1} max={200} step={0.1} value={Number(currentImageTransform.width.toFixed(1))} onChange={(event) => updateImageAtPlayhead(selectedImageTrack, { width: Number(event.target.value || 1) })} /><em>%</em></label>
                              <label><span>高</span><input type="number" min={1} max={200} step={0.1} value={Number(resolveImageHeight(selectedImageTrack, currentImageTransform).toFixed(1))} onChange={(event) => updateImageAtPlayhead(selectedImageTrack, { height: Number(event.target.value || 1) })} /><em>%</em></label>
                            </div>
                            <div className="lossless-transform-row">
                              <span className="lossless-transform-label"><RotateCw size={15} /><b>旋转</b></span>
                              <label><input type="number" min={-720} max={720} step={1} value={Number(currentImageTransform.rotation.toFixed(1))} onChange={(event) => updateImageAtPlayhead(selectedImageTrack, { rotation: Number(event.target.value || 0) })} /><em>°</em></label>
                            </div>
                            <div className="lossless-transform-row is-opacity">
                              <span className="lossless-transform-label"><Eye size={15} /><b>透明度</b></span>
                              <input type="range" min={0} max={1} step={0.01} value={currentImageTransform.opacity ?? selectedImageTrack.opacity} onChange={(event) => updateImageAtPlayhead(selectedImageTrack, { opacity: Number(event.target.value) })} />
                              <em>{Math.round((currentImageTransform.opacity ?? selectedImageTrack.opacity) * 100)}%</em>
                            </div>
                            {selectedImageTrack.animated ? <div className="lossless-transform-row is-easing">
                              <span className="lossless-transform-label"><Diamond size={13} /><b>到此缓动</b></span>
                              <AppSelect
                                value={readImageEasing(currentImageKeyframe?.easing ?? currentImageTransform.easing)}
                                options={imageEasingOptions}
                                onChange={(value) => updateImageAtPlayhead(selectedImageTrack, { easing: readImageEasing(value) })}
                                ariaLabel="关键帧缓动"
                              />
                            </div> : null}
                          </div>
                          <button
                            className="lossless-reset-transform"
                            type="button"
                            title={selectedImageTrack.animated ? "在当前播放头恢复默认变换" : "恢复默认变换"}
                            onClick={() => updateImageAtPlayhead(selectedImageTrack, {
                              x: 50,
                              y: 50,
                              width: 18,
                              height: calculateImageHeightPercent(18, selectedImageTrack.sourceWidth, selectedImageTrack.sourceHeight, selectedImageTrack.videoAspectRatio),
                              rotation: 0,
                              opacity: 1
                            })}
                          >
                            <RotateCcw size={14} />
                            {selectedImageTrack.animated ? "重置当前变换" : "重置变换"}
                          </button>
                        </section>
                      ) : null}
                    </>
                  ) : videoClips.length + tracks.length > 0 || importedResources.length > 0 ? (
                    <section className="lossless-inspector-section">
                      <div className="lossless-track-empty">
                        <Layers3 size={21} />
                        <span>{videoClips.length + tracks.length ? "未选择时间轴片段" : "将资源拖到时间轴"}</span>
                      </div>
                    </section>
                  ) : null}
                </div>
              ) : (
                <div className="lossless-inspector-content lossless-export-inspector">
                  <button className="primary-button lossless-inspector-action" type="button" onClick={runExport} disabled={!canExport}>
                    {status === "exporting" ? <Loader2 className="spin" size={17} /> : <Download size={17} />}
                    {status === "exporting" ? "导出中" : "导出 MP4"}
                  </button>
                  <div className="lossless-export-body">
                    <section className="lossless-inspector-section">
                    <h3>声音处理</h3>
                    <div className="lossless-switch-row">
                      <span>去除背景音乐</span>
                      <AppSwitch
                        checked={audioSeparation.enabled}
                        disabled={status === "exporting"}
                        ariaLabel="去除背景音乐"
                        onChange={(checked) => {
                          if (checked) setAudioSeparationStatus(null);
                          setAudioSeparation((current) => ({ ...current, enabled: checked }));
                        }}
                      />
                    </div>
                    {audioSeparation.enabled ? (
                      <div className="lossless-audio-separation-controls">
                        <div className="lossless-audio-option-row">
                          <span>保留内容</span>
                          <AppSelect
                            value={audioSeparation.mode}
                            options={audioSeparationModeOptions}
                            menuClassName="lossless-audio-select-menu"
                            matchTriggerWidth
                            disabled={status === "exporting"}
                            ariaLabel="声音处理保留内容"
                            onChange={(mode) => {
                              setAudioSeparationStatus(null);
                              setAudioSeparation((current) => ({ ...current, mode }));
                            }}
                          />
                        </div>
                        <div className="lossless-audio-option-row">
                          <span>处理质量</span>
                          <AppSelect
                            value={audioSeparation.quality}
                            options={audioSeparationQualityOptions}
                            menuClassName="lossless-audio-select-menu"
                            matchTriggerWidth
                            disabled={status === "exporting"}
                            ariaLabel="人声分离处理质量"
                            onChange={(quality) => {
                              setAudioSeparationStatus(null);
                              setAudioSeparation((current) => ({
                                ...current,
                                quality
                              }));
                            }}
                          />
                        </div>
                        {audioSeparation.mode === "dialogue" ? (
                          <div className="lossless-audio-option-row">
                            <span>演唱过滤</span>
                            <AppSelect
                              value={audioSeparation.dialogueStrength}
                              options={dialogueStrengthOptions}
                              menuClassName="lossless-audio-select-menu"
                              matchTriggerWidth
                              disabled={status === "exporting"}
                              ariaLabel="演唱过滤强度"
                              onChange={(dialogueStrength) => setAudioSeparation((current) => ({
                                ...current,
                                dialogueStrength
                              }))}
                            />
                          </div>
                        ) : (
                          <label className="lossless-audio-option-row is-range">
                            <span>背景保留</span>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={audioSeparation.backgroundVolume}
                              disabled={status === "exporting"}
                              onChange={(event) => setAudioSeparation((current) => ({
                                ...current,
                                backgroundVolume: Number(event.target.value)
                              }))}
                            />
                            <em>{Math.round(audioSeparation.backgroundVolume * 100)}%</em>
                          </label>
                        )}
                        <div className={`lossless-audio-engine-status ${audioSeparationStatusLoading ? "is-loading" : audioSeparationStatus?.available ? "is-ready" : "is-unavailable"}`}>
                          {audioSeparationStatusLoading
                            ? <Loader2 className="spin" size={16} />
                            : audioSeparationStatus?.available
                              ? <CheckCircle2 size={16} />
                              : <AlertTriangle size={16} />}
                          <span>
                            <strong>
                              {audioSeparationStatusLoading
                                ? "检查本地引擎"
                                : audioSeparationStatus?.available
                                  ? audioSeparationStatus.device || audioSeparationStatus.engine || "本地引擎"
                                  : "引擎不可用"}
                            </strong>
                            <small>
                              {audioSeparationStatus?.message || "正在读取运行环境与模型状态"}
                              {audioSeparationStatus?.videoEncoder ? ` · 视频：${audioSeparationStatus.videoEncoder}` : ""}
                            </small>
                          </span>
                          <button
                            className="lossless-icon-button"
                            type="button"
                            title="重新检查声音处理引擎"
                            aria-label="重新检查声音处理引擎"
                            disabled={audioSeparationStatusLoading || status === "exporting"}
                            onClick={() => void checkAudioSeparationStatus()}
                          >
                            <RotateCw size={14} />
                          </button>
                        </div>
                      </div>
                    ) : null}
                    </section>

                    <section className="lossless-inspector-section">
                    <h3>输出策略</h3>
                    <SegmentedControl className="lossless-mode-control" value={mode} options={cutModeOptions} onChange={setMode} disabled={status === "exporting"} />
                    <div className={`lossless-export-boundary ${!audioSeparation.enabled && !videoOutputReencoded ? "is-lossless" : "is-reencode"}`}>
                      {!audioSeparation.enabled && !videoOutputReencoded ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
                      <span>
                        {audioSeparation.enabled
                          ? audioSeparation.mode === "dialogue"
                            ? videoOutputReencoded
                              ? "仅保留对白会直接分离电影对白轨，再复核演唱、哼唱和说唱；当前画面设置也需要高质量重编码。"
                              : "仅保留对白会直接分离电影对白轨，再复核演唱、哼唱和说唱；视频轨仍按关键帧流拷贝。"
                            : videoOutputReencoded
                              ? "人声分离会重建并编码一次音频轨；当前画面设置也需要高质量重编码。"
                              : "人声分离会重建并编码一次音频轨；视频轨仍按关键帧流拷贝。"
                          : hasImageTracks
                          ? "图片素材需要写入画面，视频轨将高质量重编码；音频轨会一并混合。"
                          : needsVideoComposition
                            ? "多视频轨或时间轴空档会按项目画布合成，并使用硬件加速高质量编码。"
                          : hasExternalVideoSources
                            ? "多个视频来源会统一到项目画布并使用硬件加速高质量编码，避免不同编码参数直接拼接造成损坏。"
                          : videoClips.length === 0
                            ? "当前没有视频素材，将生成项目画布并混合时间轴声音后高质量编码。"
                          : enabledTracks.length && mode === "keyframe-copy"
                            ? "仅合成声音轨时，视频画面保持流拷贝，音频会重新混合编码。"
                          : mode === "keyframe-copy"
                            ? "仅在关键帧边界流拷贝，切点可能有少量偏差。"
                            : mode === "hybrid"
                              ? "非关键帧附近局部重编码，其余内容流拷贝。"
                              : "按精确时间重编码输出，不属于严格无损。"}
                      </span>
                    </div>
                    </section>

                    <section className="lossless-inspector-section lossless-inspector-summary">
                    <h3>输出检查</h3>
                    <dl><dt>删除片段</dt><dd>{removableSegments.length}</dd></dl>
                    <dl><dt>非关键帧</dt><dd>{keyframeWarnings}</dd></dl>
                    <dl><dt>输出时长</dt><dd>{projectVideoDuration ? formatSeconds(Math.max(0, projectVideoDuration - removeDuration)) : "--:--"}</dd></dl>
                    <dl><dt>画面尺寸</dt><dd>{`${Math.round(videoSize.width)} × ${Math.round(videoSize.height)}`}</dd></dl>
                    <dl><dt>导入资源</dt><dd>{videoClips.length + enabledTracks.length}</dd></dl>
                    <dl><dt>声音处理</dt><dd>{audioSeparation.enabled ? audioSeparation.mode === "dialogue" ? "仅对白（去演唱）" : "全部人声（含演唱）" : "关闭"}</dd></dl>
                    {audioSeparation.enabled ? <dl><dt>处理质量</dt><dd>{audioSeparation.quality === "high" ? "高质量" : audioSeparation.quality === "fast" ? "快速" : "标准"}</dd></dl> : null}
                    {audioSeparation.enabled && audioSeparation.mode === "dialogue"
                      ? <dl><dt>演唱过滤</dt><dd>{audioSeparation.dialogueStrength === "strong" ? "去歌优先" : audioSeparation.dialogueStrength === "conservative" ? "保留优先" : "平衡"}</dd></dl>
                      : null}
                    {audioSeparation.enabled && audioSeparation.mode === "vocals" ? <dl><dt>背景保留</dt><dd>{Math.round(audioSeparation.backgroundVolume * 100)}%</dd></dl> : null}
                    <dl><dt>封装格式</dt><dd>MP4</dd></dl>
                    </section>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      </section>
    </section>
  );
}
