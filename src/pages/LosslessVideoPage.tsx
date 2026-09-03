import {
  AudioLines,
  AlertTriangle,
  Captions,
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
  MousePointer2,
  Music2,
  Pause,
  Palette,
  Play,
  Plus,
  Redo2,
  Ratio,
  RotateCcw,
  RotateCw,
  Scissors,
  Settings2,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Snowflake,
  Sparkles,
  Sticker,
  Target,
  Trash2,
  Type,
  Undo2,
  Volume2,
  VolumeX,
  ZoomIn,
  XCircle
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type InputHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  applyAudioSeparationToAsset,
  cancelVideoTask,
  createVideoTaskId,
  detectDuplicateSegments,
  downloadVideoOutputBlob,
  downloadVideoOutput,
  exportCleanVideo,
  getAudioSeparationStatus,
  getSubtitleEngineStatus,
  transcribeSubtitles,
  watchVideoTask,
  type AudioSeparationMode,
  type AudioSeparationOptions,
  type AudioSeparationQuality,
  type AudioSeparationStatus,
  type DetectParams,
  type DialogueStrength,
  type DuplicateSegment,
  type ExportMediaTrack,
  type ExportSubtitleTrack,
  type ExportVideoEffect,
  type ExportVideoClip,
  type ColorWheelValue,
  type LosslessCutMode,
  type MediaKeyframe,
  type SubtitleCue,
  type SubtitleEngineStatus,
  type SubtitleExportMode,
  type SubtitleQuality,
  type SubtitleStyle,
  type VideoColorAdjustments,
  type VideoEffectKind,
  type VideoEffectMask,
  type VideoInput
} from "../api/losslessVideo";
import AppSelect from "../components/AppSelect";
import AppSwitch from "../components/AppSwitch";
import SegmentedControl from "../components/SegmentedControl";
import { notify } from "../utils/notify";
import {
  cloneSubtitleTrack,
  defaultSubtitleStyle,
  downloadSubtitleText,
  layoutSubtitleForCanvas,
  normalizeSubtitleCueLane,
  parseSubtitleText,
  serializeSubtitleASS,
  serializeSubtitleSRT,
  subtitleCueAtTime,
  subtitleBackgroundHeightPercent,
  type EditorSubtitleTrack
} from "../features/video-editor/subtitles";

type TaskStatus = "idle" | "detecting" | "detected" | "transcribing" | "separating" | "exporting" | "done" | "error" | "cancelled";

type ProgressState = {
  percent: number;
  label: string;
  detail: string;
};

type InspectorTab = "detect" | "tracks" | "subtitles" | "effects" | "export" | "settings";
type SegmentFilter = "settings" | "repeat" | "transition";
type TimelineTool = "select" | "blade";
type ProjectAspectPreset = "source" | "16:9" | "4:3" | "2.35:1" | "2:1" | "1.85:1" | "9:16" | "3:4" | "1:1";

type SubtitlePreferences = {
  language: string;
  quality: SubtitleQuality;
  maxCharsPerLine: number;
  maxLines: number;
  hotwords: string;
  style: SubtitleStyle;
};

type SubtitleRecognitionSource = {
  id: string;
  label: string;
  file: File;
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
  laneId: string;
  linkedVideoClipId?: string;
  linkedAudioTrackId?: string;
};

type MediaContextMenu = {
  x: number;
  y: number;
  target:
    | { kind: "resource"; resourceId: string }
    | { kind: "video-clip"; clipId: string; time: number }
    | { kind: "track"; trackId: string; time: number }
    | { kind: "subtitle-cue"; trackId: string; cueId: string; time: number };
};

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
  sourceStart: number;
  sourceEnd: number;
  audioPeaks: number[];
  detachedFromVideoClipId?: string;
  sourceVideoSourceId?: string;
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
  hasAudio: boolean;
  audioPeaks: number[];
  primary: boolean;
};

type ImportedAudioResource = {
  id: string;
  type: "audio";
  name: string;
  file: File;
  previewUrl: string;
  duration: number;
  audioPeaks: number[];
  detachedFromVideoSourceId?: string;
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

type VideoTransform = {
  x: number;
  y: number;
  width: number;
  customized: boolean;
};

const videoResizeHandles = ["nw", "ne", "se", "sw"] as const;
type VideoResizeHandle = (typeof videoResizeHandles)[number];
type VideoTransformAction = "move" | `resize-${VideoResizeHandle}`;
const subtitleResizeHandles = ["nw", "ne", "e", "se", "sw", "w"] as const;
type SubtitleResizeHandle = (typeof subtitleResizeHandles)[number];
type SubtitleTransformAction = "move" | `resize-${SubtitleResizeHandle}`;

type VideoEditorClip = {
  id: string;
  sourceId: string;
  laneId: string;
  name: string;
  start: number;
  end: number;
  sourceStart: number;
  sourceEnd: number;
  sourceMin: number;
  sourceMax: number;
  volume: number;
  audioDetached?: boolean;
  transform?: VideoTransform;
  color?: VideoColorAdjustments;
};

type EditorEffect = ExportVideoEffect & {
  laneId: string;
  name: string;
};

type EffectDropPreview = {
  kind: VideoEffectKind;
  start: number;
  end: number;
  valid: boolean;
};

type TimelineLane = {
  id: string;
  type: "video" | "effect" | "subtitle" | EditorTrack["type"];
  clips: EditorTrack[];
  videoClips: VideoEditorClip[];
  effects: EditorEffect[];
  subtitleTrack?: EditorSubtitleTrack;
  subtitleCues: SubtitleCue[];
};

type TimelineLaneDrop = {
  laneId: string;
  insertionIndex: number;
  kind: "source" | "existing" | "create";
};

type PendingEditorMedia =
  | {
      type: "audio";
      sourceId: string;
      name?: string;
      file: File;
      previewUrl: string;
      sourceDuration: number;
      sourceStart?: number;
      sourceEnd?: number;
      audioPeaks?: number[];
      detachedFromVideoClipId?: string;
      sourceVideoSourceId?: string;
    }
  | { type: "image"; sourceId: string; file: File; previewUrl: string; sourceWidth: number; sourceHeight: number };

type PreviewSize = {
  width: number;
  height: number;
};

type EditorHistorySnapshot = {
  videoSources: VideoEditorSource[];
  mediaResources: ImportedMediaResource[];
  videoClips: VideoEditorClip[];
  tracks: EditorTrack[];
  effects: EditorEffect[];
  subtitleTracks: EditorSubtitleTrack[];
  timelineLaneOrder: string[];
  selectedResourceId: string;
  selectedVideoClipId: string;
  selectedTrackId: string;
  selectedEffectId: string;
  selectedSubtitleTrackId: string;
  selectedSubtitleCueId: string;
  selectedLaneId: string;
  selectedKeyframeId: string;
  currentTime: number;
  videoSize: PreviewSize;
  projectSourceSize?: PreviewSize;
  projectAspectPreset?: ProjectAspectPreset;
};

type EditHistoryEntry =
  | { kind: "editor"; snapshot: EditorHistorySnapshot }
  | { kind: "selection"; values: boolean[] };

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

type TimelineRemovalRange = {
  start: number;
  end: number;
};

type FrameSyncedVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

type VideoAudioGraph = {
  element: HTMLVideoElement;
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
};

function cloneEditorTrack(track: EditorTrack): EditorTrack {
  return track.type === "image"
    ? {
        ...track,
        staticTransform: { ...track.staticTransform },
        keyframes: track.keyframes.map((keyframe) => ({ ...keyframe }))
      }
    : { ...track };
}

function cloneVideoEditorClip(clip: VideoEditorClip): VideoEditorClip {
  return {
    ...clip,
    transform: clip.transform ? { ...clip.transform } : undefined,
    color: clip.color ? cloneVideoColor(clip.color) : undefined
  };
}

function cloneColorWheel(wheel: ColorWheelValue): ColorWheelValue {
  return { x: wheel.x, y: wheel.y, master: wheel.master };
}

function cloneVideoColor(color: VideoColorAdjustments): VideoColorAdjustments {
  return {
    lift: cloneColorWheel(color.lift),
    gamma: cloneColorWheel(color.gamma),
    gain: cloneColorWheel(color.gain),
    offset: cloneColorWheel(color.offset),
    saturation: color.saturation
  };
}

function cloneEditorEffect(effect: EditorEffect): EditorEffect {
  return { ...effect, mask: effect.mask ? { ...effect.mask } : undefined };
}

function cloneEditorSnapshot(snapshot: EditorHistorySnapshot): EditorHistorySnapshot {
  return {
    ...snapshot,
    videoSources: snapshot.videoSources.map((source) => ({ ...source })),
    mediaResources: snapshot.mediaResources.map((resource) => ({ ...resource })),
    videoClips: snapshot.videoClips.map(cloneVideoEditorClip),
    tracks: snapshot.tracks.map(cloneEditorTrack),
    effects: (snapshot.effects || []).map(cloneEditorEffect),
    subtitleTracks: (snapshot.subtitleTracks || []).map(cloneSubtitleTrack),
    timelineLaneOrder: [...snapshot.timelineLaneOrder],
    videoSize: { ...snapshot.videoSize },
    projectSourceSize: { ...(snapshot.projectSourceSize || snapshot.videoSize) }
  };
}

function editorSnapshotFingerprint(snapshot: EditorHistorySnapshot) {
  return JSON.stringify({
    videoSources: snapshot.videoSources.map(({ file: _file, ...source }) => source),
    mediaResources: snapshot.mediaResources.map(({ file: _file, ...resource }) => resource),
    videoClips: snapshot.videoClips,
    tracks: snapshot.tracks.map(({ file: _file, ...track }) => track),
    effects: snapshot.effects,
    subtitleTracks: snapshot.subtitleTracks,
    timelineLaneOrder: snapshot.timelineLaneOrder,
    videoSize: snapshot.videoSize,
    projectSourceSize: snapshot.projectSourceSize,
    projectAspectPreset: snapshot.projectAspectPreset
  });
}

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
  autoDetectSlideTransitions: true
};

type AudioSeparationSettings = Omit<AudioSeparationOptions, "enabled">;

const defaultAudioSeparation: AudioSeparationSettings = {
  mode: "dialogue",
  quality: "high",
  dialogueStrength: "strong",
  backgroundVolume: 0
};

const defaultSubtitlePreferences: SubtitlePreferences = {
  language: "auto",
  quality: "high",
  maxCharsPerLine: 16,
  maxLines: 2,
  hotwords: "",
  style: { ...defaultSubtitleStyle }
};

const settingsStorageKey = "wse.losslessVideo.settings.v1";
const audioSettingsVersion = 2;
const dialogueModeMigrationKey = "wse.losslessVideo.tigerDialogue.v1";
const timelineFps = 60;
const allSubtitleCuesSelectionId = "__all_subtitle_cues__";
const timelineEdgeSpacePx = 7;
const timelineSnapDistancePx = 8;
const timelineVerticalDragThresholdPx = 8;
const timelineVerticalDropMarginPx = 18;
const timelineLaneTopPx = 34;
const timelineLanePitchPx = 62;
const timelineCanvasBaseHeightPx = 44;
const minimumTimelineClipDuration = 1 / timelineFps;
const videoGainMinDb = -60;
const videoGainMaxDb = 20;
const effectLaneId = "video-effects-lane";
const defaultVideoColor: VideoColorAdjustments = {
  lift: { x: 0, y: 0, master: 0 },
  gamma: { x: 0, y: 0, master: 0 },
  gain: { x: 0, y: 0, master: 0 },
  offset: { x: 0, y: 0, master: 0 },
  saturation: 1
};
const videoEffectDefinitions: Array<{
  kind: VideoEffectKind;
  name: string;
  scope: "global" | "local";
}> = [
  { kind: "particles", name: "粒子", scope: "global" },
  { kind: "snow", name: "雪花", scope: "global" },
  { kind: "blur", name: "局部模糊", scope: "local" },
  { kind: "mosaic", name: "局部马赛克", scope: "local" }
];
const timelineMinZoom = 0.25;
const timelineMinZoomExponent = Math.log2(timelineMinZoom);
const timelineMaxFrameWidthPx = 48;
const timelineMaxCanvasWidthPx = 16_000_000;
const timelineAbsoluteMaxZoom = 16_384;
const resourceDragMime = "application/x-wse-video-resource";
const effectDragMime = "application/x-wse-video-effect";
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
const subtitleLanguageOptions = [
  { label: "自动识别", value: "auto" },
  { label: "中文普通话", value: "zh" },
  { label: "粤语", value: "yue" },
  { label: "英语", value: "en" },
  { label: "日语", value: "ja" },
  { label: "韩语", value: "ko" }
];
const subtitleFontOptions = [
  { label: "系统", value: "Arial" },
  { label: "LXGW WenKai TC", value: "LXGW WenKai TC" },
  { label: "苹方", value: "PingFang SC" },
  { label: "微软雅黑", value: "Microsoft YaHei" },
  { label: "黑体", value: "SimHei" },
  { label: "Helvetica", value: "Helvetica" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Courier New", value: "Courier New" }
];
const imageEasingOptions: { label: string; value: ImageEasing }[] = [
  { label: "匀速", value: "linear" },
  { label: "缓入", value: "ease-in" },
  { label: "缓出", value: "ease-out" },
  { label: "平滑", value: "ease-in-out" }
];

const projectAspectRatios: Record<Exclude<ProjectAspectPreset, "source">, number> = {
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "2.35:1": 2.35,
  "2:1": 2,
  "1.85:1": 1.85,
  "9:16": 9 / 16,
  "3:4": 3 / 4,
  "1:1": 1
};

const fixedProjectAspectOptions: Array<{ label: string; value: Exclude<ProjectAspectPreset, "source"> }> = [
  { label: "16:9", value: "16:9" },
  { label: "4:3", value: "4:3" },
  { label: "2.35:1", value: "2.35:1" },
  { label: "2:1", value: "2:1" },
  { label: "1.85:1", value: "1.85:1" },
  { label: "9:16", value: "9:16" },
  { label: "3:4", value: "3:4" },
  { label: "1:1", value: "1:1" }
];

function evenCanvasDimension(value: number) {
  const rounded = Math.max(2, Math.round(value));
  return rounded - rounded % 2;
}

function calculateProjectCanvasSize(source: PreviewSize, ratio: number): PreviewSize {
  const sourceWidth = Math.max(2, source.width || 1920);
  const sourceHeight = Math.max(2, source.height || 1080);
  const longEdge = Math.max(sourceWidth, sourceHeight);
  const shortEdge = Math.min(sourceWidth, sourceHeight);
  const bounds = ratio > 1
    ? { width: longEdge, height: shortEdge }
    : ratio < 1
      ? { width: shortEdge, height: longEdge }
      : { width: shortEdge, height: shortEdge };
  const boundsRatio = bounds.width / bounds.height;
  const width = ratio >= boundsRatio ? bounds.width : bounds.height * ratio;
  const height = ratio >= boundsRatio ? bounds.width / ratio : bounds.height;
  return { width: evenCanvasDimension(width), height: evenCanvasDimension(height) };
}

function formatProjectAspect(size: PreviewSize) {
  const ratio = Math.max(0.001, size.width) / Math.max(0.001, size.height);
  const matched = fixedProjectAspectOptions.find((option) => Math.abs(projectAspectRatios[option.value] - ratio) < 0.015);
  if (matched) return matched.label;
  return ratio >= 1 ? `${ratio.toFixed(2)}:1` : `1:${(1 / ratio).toFixed(2)}`;
}

function createDefaultVideoTransform(source: PreviewSize, canvas: PreviewSize): VideoTransform {
  const sourceRatio = Math.max(0.01, source.width) / Math.max(0.01, source.height);
  const canvasRatio = Math.max(0.01, canvas.width) / Math.max(0.01, canvas.height);
  return {
    x: 50,
    y: 50,
    width: sourceRatio >= canvasRatio ? 100 : 100 * sourceRatio / canvasRatio,
    customized: false
  };
}

function normalizeVideoTransform(transform: VideoTransform): VideoTransform {
  return {
    x: clampValue(transform.x, -200, 300),
    y: clampValue(transform.y, -200, 300),
    width: clampValue(transform.width, 2, 400),
    customized: Boolean(transform.customized)
  };
}

function resolveVideoTransform(clip: VideoEditorClip, source: PreviewSize, canvas: PreviewSize) {
  return clip.transform ? normalizeVideoTransform(clip.transform) : createDefaultVideoTransform(source, canvas);
}

function videoTransformHeightPercent(transform: VideoTransform, source: PreviewSize, canvas: PreviewSize) {
  const sourceRatio = Math.max(0.01, source.width) / Math.max(0.01, source.height);
  const canvasRatio = Math.max(0.01, canvas.width) / Math.max(0.01, canvas.height);
  return transform.width * canvasRatio / sourceRatio;
}

function timelineDurationWithTail(value: number) {
  const duration = Math.max(0, Number.isFinite(value) ? value : 0);
  return Math.max(10, duration + Math.max(2, duration * 0.05));
}

function calculateTimelineGeometry(viewportWidth: number, baseDuration: number, requiredDuration: number, zoom: number) {
  const safeViewportWidth = Math.max(1, viewportWidth || 1000);
  const usableViewportWidth = Math.max(1, safeViewportWidth - timelineEdgeSpacePx * 2);
  const safeBaseDuration = Math.max(0.001, baseDuration);
  const safeZoom = Math.max(0.001, zoom);
  const requestedPixelsPerSecond = usableViewportWidth / safeBaseDuration * safeZoom;
  const visibleDuration = usableViewportWidth / requestedPixelsPerSecond;
  const displayDuration = Math.max(requiredDuration, visibleDuration);
  const maximumContentWidth = Math.max(1, timelineMaxCanvasWidthPx - timelineEdgeSpacePx * 2);
  const contentWidth = Math.min(
    maximumContentWidth,
    Math.max(usableViewportWidth, displayDuration * requestedPixelsPerSecond)
  );
  return {
    canvasWidth: contentWidth + timelineEdgeSpacePx * 2,
    contentWidth,
    displayDuration,
    pixelsPerSecond: contentWidth / Math.max(0.001, displayDuration)
  };
}

function readNumberSetting(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBooleanSetting(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
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

function readSubtitleStyle(value: Partial<SubtitleStyle> | undefined): SubtitleStyle {
  const style = value || {};
  const alignment = style.alignment === "left" || style.alignment === "right" ? style.alignment : "center";
  const legacyX = alignment === "left" ? 6 : alignment === "right" ? 94 : defaultSubtitleStyle.x;
  const color = (candidate: unknown, fallback: string) => typeof candidate === "string" && /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;
  const legacyMask = style as Partial<SubtitleStyle> & { originalMaskEnabled?: boolean; originalMaskBlur?: number };
  const migratedBackgroundBlur = legacyMask.originalMaskEnabled
    ? 1 + clampValue(readNumberSetting(legacyMask.originalMaskBlur, 0.7), 0.05, 1) * 22
    : defaultSubtitleStyle.backgroundBlur;
  return {
    fontFamily: typeof style.fontFamily === "string" && style.fontFamily.trim() ? style.fontFamily.trim() : defaultSubtitleStyle.fontFamily,
    fontSize: clampValue(readNumberSetting(style.fontSize, defaultSubtitleStyle.fontSize), 12, 160),
    bold: readBooleanSetting(style.bold, defaultSubtitleStyle.bold),
    italic: readBooleanSetting(style.italic, defaultSubtitleStyle.italic),
    underline: readBooleanSetting(style.underline, defaultSubtitleStyle.underline),
    color: color(style.color, defaultSubtitleStyle.color),
    outlineColor: color(style.outlineColor, defaultSubtitleStyle.outlineColor),
    outlineWidth: clampValue(readNumberSetting(style.outlineWidth, defaultSubtitleStyle.outlineWidth), 0, 10),
    backgroundColor: color(style.backgroundColor, defaultSubtitleStyle.backgroundColor),
    backgroundAlpha: clampValue(readNumberSetting(style.backgroundAlpha, defaultSubtitleStyle.backgroundAlpha), 0, 1),
    backgroundBlur: clampValue(readNumberSetting(style.backgroundBlur, migratedBackgroundBlur), 0, 23),
    x: clampValue(readNumberSetting(style.x, legacyX), 0, 100),
    position: clampValue(readNumberSetting(style.position, defaultSubtitleStyle.position), 0, 100),
    width: clampValue(readNumberSetting(style.width, defaultSubtitleStyle.width), 5, 100),
    alignment
  };
}

function normalizeRecognizedSubtitleText(value: string) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  const text = lines.join("");
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(text) ? text : lines.join(" ");
}

function defaultStoredSettings() {
  return {
    params: { ...defaultParams },
    audioSeparation: { ...defaultAudioSeparation },
    subtitle: { ...defaultSubtitlePreferences, style: { ...defaultSubtitleStyle } }
  };
}

function loadStoredSettings() {
  if (typeof window === "undefined") {
    return defaultStoredSettings();
  }
  try {
    const rawValue = window.localStorage.getItem(settingsStorageKey);
    if (!rawValue) {
      return defaultStoredSettings();
    }
    const stored = JSON.parse(rawValue) as {
      params?: Partial<DetectParams>;
      audioSeparation?: Partial<AudioSeparationSettings> & { settingsVersion?: number };
      subtitle?: Partial<SubtitlePreferences> & { style?: Partial<SubtitleStyle> };
    };
    const storedParams = stored.params || {};
    const storedAudioSeparation = stored.audioSeparation || {};
    const storedSubtitle = stored.subtitle || {};
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
        autoDetectSlideTransitions: readBooleanSetting(storedParams.autoDetectSlideTransitions, defaultParams.autoDetectSlideTransitions)
      },
      audioSeparation: {
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
      },
      subtitle: {
        language: typeof storedSubtitle.language === "string" && storedSubtitle.language.trim() ? storedSubtitle.language.trim() : defaultSubtitlePreferences.language,
        quality: "high" as SubtitleQuality,
        maxCharsPerLine: 60,
        maxLines: 3,
        hotwords: "",
        style: readSubtitleStyle(storedSubtitle.style)
      }
    };
  } catch {
    return defaultStoredSettings();
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

function normalizeColorWheel(wheel: ColorWheelValue): ColorWheelValue {
  return {
    x: clampValue(Number.isFinite(wheel.x) ? wheel.x : 0, -1, 1),
    y: clampValue(Number.isFinite(wheel.y) ? wheel.y : 0, -1, 1),
    master: clampValue(Number.isFinite(wheel.master) ? wheel.master : 0, -1, 1)
  };
}

function normalizeVideoColor(color: VideoColorAdjustments): VideoColorAdjustments {
  return {
    lift: normalizeColorWheel(color.lift),
    gamma: normalizeColorWheel(color.gamma),
    gain: normalizeColorWheel(color.gain),
    offset: normalizeColorWheel(color.offset),
    saturation: clampValue(Number.isFinite(color.saturation) ? color.saturation : 1, 0, 2)
  };
}

function readVideoColor(clip: Pick<VideoEditorClip, "color">): VideoColorAdjustments {
  return normalizeVideoColor(clip.color ? cloneVideoColor(clip.color) : cloneVideoColor(defaultVideoColor));
}

function videoColorIsDefault(color: VideoColorAdjustments) {
  const normalized = normalizeVideoColor(color);
  return [normalized.lift, normalized.gamma, normalized.gain, normalized.offset].every(
    (wheel) => Math.abs(wheel.x) < 0.0001 && Math.abs(wheel.y) < 0.0001 && Math.abs(wheel.master) < 0.0001
  ) && Math.abs(normalized.saturation - 1) < 0.0001;
}

function colorWheelChannels(wheel: ColorWheelValue): [number, number, number] {
  const radius = Math.min(1, Math.hypot(wheel.x, wheel.y));
  if (radius < 0.000001) return [0, 0, 0];
  let hue = Math.atan2(-wheel.y, wheel.x) / (Math.PI * 2);
  if (hue < 0) hue += 1;
  const sector = hue * 6;
  const index = Math.floor(sector) % 6;
  const fraction = sector - Math.floor(sector);
  const colors: Array<[number, number, number]> = [
    [1, fraction, 0],
    [1 - fraction, 1, 0],
    [0, 1, fraction],
    [0, 1 - fraction, 1],
    [fraction, 0, 1],
    [1, 0, 1 - fraction]
  ];
  const [red, green, blue] = colors[index];
  const average = (red + green + blue) / 3;
  return [
    (red - average) * radius * 1.5,
    (green - average) * radius * 1.5,
    (blue - average) * radius * 1.5
  ];
}

function videoColorChannelTables(color: VideoColorAdjustments) {
  const normalized = normalizeVideoColor(color);
  const lift = colorWheelChannels(normalized.lift);
  const gamma = colorWheelChannels(normalized.gamma);
  const gain = colorWheelChannels(normalized.gain);
  const offset = colorWheelChannels(normalized.offset);
  return [0, 1, 2].map((channel) => {
    const liftValue = normalized.lift.master * 0.10 + lift[channel] * 0.12;
    const gammaValue = Math.exp(-(normalized.gamma.master * 0.75 + gamma[channel] * 0.45));
    const gainValue = Math.exp(normalized.gain.master * 0.50 + gain[channel] * 0.35);
    const offsetValue = normalized.offset.master * 0.12 + offset[channel] * 0.10;
    return Array.from({ length: 33 }, (_, index) => {
      const input = index / 32;
      const output = Math.pow(Math.max(0, input + liftValue), gammaValue) * gainValue + offsetValue;
      return clampValue(output, 0, 1).toFixed(5);
    }).join(" ");
  }) as [string, string, string];
}

function effectIsLocal(effect: Pick<EditorEffect, "kind">) {
  return effect.kind === "blur" || effect.kind === "mosaic";
}

function isVideoEffectKind(value: string): value is VideoEffectKind {
  return videoEffectDefinitions.some((definition) => definition.kind === value);
}

function normalizeEffectMask(mask: VideoEffectMask): VideoEffectMask {
  const width = clampValue(Number.isFinite(mask.width) ? mask.width : 35, 2, 100);
  const height = clampValue(Number.isFinite(mask.height) ? mask.height : 35, 2, 100);
  return {
    x: clampValue(Number.isFinite(mask.x) ? mask.x : 50, width / 2, 100 - width / 2),
    y: clampValue(Number.isFinite(mask.y) ? mask.y : 50, height / 2, 100 - height / 2),
    width,
    height
  };
}

function normalizeEditorEffect(effect: EditorEffect, projectDuration: number): EditorEffect {
  const maximumDuration = Math.max(minimumTimelineClipDuration, projectDuration);
  const start = clampValue(Number.isFinite(effect.start) ? effect.start : 0, 0, Math.max(0, maximumDuration - minimumTimelineClipDuration));
  const end = clampValue(Number.isFinite(effect.end) ? effect.end : maximumDuration, start + minimumTimelineClipDuration, maximumDuration);
  return {
    ...effect,
    start,
    end,
    intensity: clampValue(Number.isFinite(effect.intensity) ? effect.intensity : 0.5, 0, 1),
    opacity: clampValue(Number.isFinite(effect.opacity) ? effect.opacity : 0.8, 0, 1),
    speed: clampValue(Number.isFinite(effect.speed) ? effect.speed : 1, 0.1, 4),
    density: clampValue(Number.isFinite(effect.density) ? effect.density : 50, 0, 100),
    mask: effectIsLocal(effect)
      ? normalizeEffectMask(effect.mask || { x: 50, y: 50, width: 35, height: 35 })
      : undefined
  };
}

function seededEffectRandom(seed: number, index: number, salt: number) {
  let value = (Math.trunc(seed) ^ Math.imul(index + 1, 0x45d9f3b) ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

type EditorRangeProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

function EditorRange({ min = 0, max = 100, value, defaultValue, style, ...props }: EditorRangeProps) {
  const minimum = Number(min);
  const maximum = Number(max);
  const current = Number(value ?? defaultValue ?? minimum);
  const progress = maximum > minimum
    ? clampValue(((current - minimum) / (maximum - minimum)) * 100, 0, 100)
    : 0;

  return (
    <input
      {...props}
      type="range"
      min={min}
      max={max}
      value={value}
      defaultValue={defaultValue}
      style={{ ...style, "--lossless-range-progress": `${progress}%` } as CSSProperties}
    />
  );
}

function ColorWheelControl({
  label,
  value,
  onChange,
  onEditStart,
  onEditEnd
}: {
  label: string;
  value: ColorWheelValue;
  onChange: (value: ColorWheelValue) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const updateFromPointer = (clientX: number, clientY: number) => {
    const rect = wheelRef.current?.getBoundingClientRect();
    if (!rect) return;
    let x = (clientX - (rect.left + rect.width / 2)) / Math.max(1, rect.width / 2);
    let y = (clientY - (rect.top + rect.height / 2)) / Math.max(1, rect.height / 2);
    const radius = Math.hypot(x, y);
    if (radius > 1) {
      x /= radius;
      y /= radius;
    }
    onChange({ ...value, x, y });
  };
  const startWheelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    onEditStart();
    updateFromPointer(event.clientX, event.clientY);
    const move = (moveEvent: PointerEvent) => updateFromPointer(moveEvent.clientX, moveEvent.clientY);
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      onEditEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };
  return (
    <div className="lossless-color-wheel-control">
      <div className="lossless-color-wheel-title">
        <strong>{label}</strong>
        <button type="button" title={`重置${label}`} aria-label={`重置${label}`} onClick={() => {
          onEditStart();
          onChange({ x: 0, y: 0, master: 0 });
          onEditEnd();
        }}>
          <RotateCcw size={12} />
        </button>
      </div>
      <div
        ref={wheelRef}
        className="lossless-color-wheel"
        role="slider"
        tabIndex={0}
        aria-label={`${label}色彩偏移`}
        aria-valuetext={`横向 ${value.x.toFixed(2)}，纵向 ${value.y.toFixed(2)}`}
        onFocus={onEditStart}
        onBlur={onEditEnd}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.01 : 0.05;
          const patch = event.key === "ArrowLeft"
            ? { x: value.x - step }
            : event.key === "ArrowRight"
              ? { x: value.x + step }
              : event.key === "ArrowUp"
                ? { y: value.y - step }
                : event.key === "ArrowDown"
                  ? { y: value.y + step }
                  : undefined;
          if (!patch) return;
          event.preventDefault();
          onChange(normalizeColorWheel({ ...value, ...patch }));
        }}
        onPointerDown={startWheelDrag}
        onDoubleClick={() => {
          onEditStart();
          onChange({ ...value, x: 0, y: 0 });
          onEditEnd();
        }}
      >
        <i style={{ left: `${50 + value.x * 44}%`, top: `${50 + value.y * 44}%` }} />
      </div>
      <label className="lossless-color-master">
        <span>亮度</span>
        <EditorRange
          min={-1}
          max={1}
          step={0.01}
          value={value.master}
          onFocus={onEditStart}
          onBlur={onEditEnd}
          onPointerDown={onEditStart}
          onPointerUp={onEditEnd}
          onPointerCancel={onEditEnd}
          onChange={(event) => onChange({ ...value, master: Number(event.target.value) })}
        />
        <em>{value.master.toFixed(2)}</em>
      </label>
    </div>
  );
}

function GlobalEffectPreview({ effect, time }: { effect: EditorEffect; time: number }) {
  const count = clampValue(Math.round(8 + effect.density * 0.24), 4, 32);
  const elapsed = Math.max(0, time - effect.start);
  const points = Array.from({ length: count }, (_, index) => {
    const baseX = seededEffectRandom(effect.seed, index, 31) * 100;
    const baseY = seededEffectRandom(effect.seed, index, 47) * 110;
    const phase = seededEffectRandom(effect.seed, index, 59) * Math.PI * 2;
    const drift = (0.8 + seededEffectRandom(effect.seed, index, 83) * 2.4) * (0.5 + effect.intensity);
    const speed = (2.5 + effect.speed * (2.5 + seededEffectRandom(effect.seed, index, 97) * 5.5));
    const x = ((baseX + Math.sin(elapsed * (0.35 + seededEffectRandom(effect.seed, index, 71) * 0.8) + phase) * drift) % 104 + 104) % 104 - 2;
    const travelled = (baseY + elapsed * speed) % 110;
    const y = effect.kind === "snow" ? travelled - 5 : 105 - travelled;
    const radius = (0.18 + effect.intensity * 0.42) * (0.55 + seededEffectRandom(effect.seed, index, 17) * 0.9);
    return { x, y, radius };
  });
  return (
    <svg className={`lossless-global-effect-preview is-${effect.kind}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={{ opacity: effect.opacity }}>
      {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={point.radius} />)}
    </svg>
  );
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

function resizeImageTrackForProjectAspect(track: ImageEditorTrack, nextAspectRatio: number) {
  const previousAspectRatio = Math.max(0.01, track.videoAspectRatio || nextAspectRatio);
  const heightScale = nextAspectRatio / previousAspectRatio;
  const resizeKeyframe = (keyframe: MediaKeyframe): MediaKeyframe => {
    let width = keyframe.width;
    let height = resolveImageHeight(track, keyframe) * heightScale;
    if (height > 200) {
      const fitScale = 200 / height;
      width *= fitScale;
      height = 200;
    }
    return {
      ...keyframe,
      width: clampValue(width, 1, 200),
      height: clampValue(height, 1, 200)
    };
  };
  return {
    ...track,
    videoAspectRatio: nextAspectRatio,
    staticTransform: resizeKeyframe(track.staticTransform),
    keyframes: track.keyframes.map(resizeKeyframe)
  };
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

function mergeTimelineRemovalRanges(ranges: TimelineRemovalRange[], timelineEnd: number) {
  const normalized = ranges
    .map((range) => ({
      start: clampValue(Math.min(range.start, range.end), 0, timelineEnd),
      end: clampValue(Math.max(range.start, range.end), 0, timelineEnd)
    }))
    .filter((range) => range.end - range.start >= minimumTimelineClipDuration - 0.001)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  return normalized.reduce<TimelineRemovalRange[]>((merged, range) => {
    const previous = merged[merged.length - 1];
    if (!previous || range.start > previous.end + 0.001) {
      merged.push({ ...range });
    } else {
      previous.end = Math.max(previous.end, range.end);
    }
    return merged;
  }, []);
}

function timelineTimeAfterRemovals(time: number, ranges: TimelineRemovalRange[]) {
  let removed = 0;
  for (const range of ranges) {
    if (time >= range.end - 0.001) {
      removed += range.end - range.start;
      continue;
    }
    if (time > range.start) removed += time - range.start;
    break;
  }
  return Math.max(0, time - removed);
}

function timelineRangePieces(start: number, end: number, ranges: TimelineRemovalRange[]) {
  let cursor = start;
  const pieces: TimelineRemovalRange[] = [];
  for (const range of ranges) {
    if (range.end <= cursor + 0.001) continue;
    if (range.start >= end - 0.001) break;
    if (range.start > cursor + 0.001) pieces.push({ start: cursor, end: Math.min(end, range.start) });
    cursor = Math.max(cursor, range.end);
    if (cursor >= end - 0.001) break;
  }
  if (cursor < end - 0.001) pieces.push({ start: cursor, end });
  return pieces.filter((piece) => piece.end - piece.start >= minimumTimelineClipDuration - 0.001);
}

function findNearestAvailableClipStart(
  clips: Array<{ start: number; end: number }>,
  preferredStart: number,
  clipDuration: number,
  timelineEnd: number,
  direction = 0
) {
  const maxStart = Math.max(0, timelineEnd - clipDuration);
  const sorted = [...clips].sort((left, right) => left.start - right.start);
  const slots: Array<{ minimum: number; maximum: number }> = [];
  let cursor = 0;

  for (const clip of sorted) {
    const maximum = Math.min(maxStart, clip.start - clipDuration);
    if (maximum >= cursor - 0.001) slots.push({ minimum: cursor, maximum: Math.max(cursor, maximum) });
    cursor = Math.max(cursor, clip.end);
    if (cursor > maxStart + 0.001) break;
  }
  if (cursor <= maxStart + 0.001) slots.push({ minimum: cursor, maximum: maxStart });
  if (!slots.length) return undefined;

  return slots.reduce((nearest, slot) => {
    const candidate = clampValue(preferredStart, slot.minimum, slot.maximum);
    const candidateDistance = Math.abs(candidate - preferredStart);
    const nearestDistance = Math.abs(nearest - preferredStart);
    if (candidateDistance < nearestDistance - 0.001) return candidate;
    if (Math.abs(candidateDistance - nearestDistance) <= 0.001) {
      if (direction > 0 && candidate > nearest) return candidate;
      if (direction < 0 && candidate < nearest) return candidate;
    }
    return nearest;
  }, clampValue(preferredStart, slots[0].minimum, slots[0].maximum));
}

function timelineRangeOverlaps(
  clips: Array<{ id: string; start: number; end: number }>,
  start: number,
  end: number,
  excludedId: string
) {
  return clips.some((clip) => clip.id !== excludedId && start < clip.end - 0.001 && end > clip.start + 0.001);
}

function resolveEffectDropSlot(
  effects: EditorEffect[],
  kind: VideoEffectKind,
  requestedStart: number,
  projectDuration: number
): EffectDropPreview {
  const minimumDuration = Math.min(0.5, projectDuration);
  const start = roundTimelineFrame(clampValue(requestedStart, 0, Math.max(0, projectDuration - minimumDuration)));
  const nextEffectStart = effects
    .filter((effect) => effect.start >= start + 0.001)
    .reduce((nearest, effect) => Math.min(nearest, effect.start), projectDuration);
  const end = roundTimelineFrame(Math.min(projectDuration, start + 5, nextEffectStart));
  const valid = end - start >= minimumDuration - 0.001
    && !timelineRangeOverlaps(effects, start, end, "");
  return { kind, start, end, valid };
}

function getTimelineRangeBounds(
  clips: Array<{ id: string; start: number; end: number }>,
  clip: { id: string; start: number; end: number },
  timelineEnd: number
) {
  let minimumStart = 0;
  let maximumEnd = Math.max(clip.end, timelineEnd);
  clips.forEach((candidate) => {
    if (candidate.id === clip.id) return;
    if (candidate.end <= clip.start + 0.001) minimumStart = Math.max(minimumStart, candidate.end);
    if (candidate.start >= clip.end - 0.001) maximumEnd = Math.min(maximumEnd, candidate.start);
  });
  return { minimumStart, maximumEnd };
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

function getVideoClipLaneBounds(clips: VideoEditorClip[], clip: VideoEditorClip, laneId = clip.laneId) {
  let minimumStart = 0;
  let maximumEnd = Number.POSITIVE_INFINITY;
  clips.forEach((candidate) => {
    if (candidate.id === clip.id || candidate.laneId !== laneId) return;
    if (candidate.end <= clip.start + 0.001) minimumStart = Math.max(minimumStart, candidate.end);
    if (candidate.start >= clip.end - 0.001) maximumEnd = Math.min(maximumEnd, candidate.start);
  });
  return { minimumStart, maximumEnd };
}

function roundTimelineFrame(value: number) {
  return Math.round(Math.max(0, value) * timelineFps) / timelineFps;
}

function snapTimelineValue(value: number, targets: number[], threshold: number) {
  const frameValue = roundTimelineFrame(value);
  let snappedValue = frameValue;
  let closestDistance = Math.max(0, threshold);
  targets.forEach((target) => {
    if (!Number.isFinite(target)) return;
    const distance = Math.abs(target - frameValue);
    if (distance <= closestDistance) {
      closestDistance = distance;
      snappedValue = target;
    }
  });
  return roundTimelineFrame(snappedValue);
}

function snapTimelineClipStart(start: number, duration: number, targets: number[], threshold: number) {
  const snappedStart = snapTimelineValue(start, targets, threshold);
  const snappedByEnd = snapTimelineValue(start + duration, targets, threshold) - duration;
  return Math.abs(snappedByEnd - start) < Math.abs(snappedStart - start)
    ? roundTimelineFrame(snappedByEnd)
    : snappedStart;
}

type CanvasSnapResult = {
  x: number;
  y: number;
  verticalGuide?: number;
  horizontalGuide?: number;
};

function snapCanvasPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  stageWidth: number,
  stageHeight: number,
  thresholdPixels = 7
): CanvasSnapResult {
  const snapAxis = (value: number, size: number, stageSize: number) => {
    const candidates = [
      { value: 50, guide: 50 },
      { value: size / 2, guide: 0 },
      { value: 100 - size / 2, guide: 100 }
    ];
    let result: { value: number; guide?: number } = { value };
    let nearest = Math.max(0, thresholdPixels) / Math.max(1, stageSize) * 100 + 0.000001;
    candidates.forEach((candidate) => {
      const distance = Math.abs(candidate.value - value);
      if (distance < nearest) {
        nearest = distance;
        result = candidate;
      }
    });
    return result;
  };
  const horizontal = snapAxis(x, Math.max(0, width), stageWidth);
  const vertical = snapAxis(y, Math.max(0, height), stageHeight);
  return {
    x: horizontal.value,
    y: vertical.value,
    verticalGuide: horizontal.guide,
    horizontalGuide: vertical.guide
  };
}

function getVideoProjectDuration(clips: VideoEditorClip[]) {
  return clips.reduce((maximum, clip) => Math.max(maximum, clip.end), 0);
}

function getTimelineProjectDuration(videoClips: VideoEditorClip[], tracks: EditorTrack[], subtitleTracks: EditorSubtitleTrack[] = []) {
  return Math.max(
    getVideoProjectDuration(videoClips),
    tracks.reduce((maximum, track) => Math.max(maximum, track.end), 0),
    subtitleTracks.reduce(
      (maximum, track) => track.cues.reduce((cueMaximum, cue) => Math.max(cueMaximum, cue.end), maximum),
      0
    )
  );
}

function mergeTimelineLaneOrder(
  current: string[],
  videoClips: VideoEditorClip[],
  tracks: EditorTrack[],
  effects: EditorEffect[] = [],
  subtitleTracks: EditorSubtitleTrack[] = []
) {
  const available = new Set([
    ...videoClips.map((clip) => clip.laneId),
    ...tracks.map(getTrackLaneId),
    ...effects.map((effect) => effect.laneId || effectLaneId),
    ...subtitleTracks.map((track) => track.laneId)
  ]);
  const next = current.filter((laneId) => available.has(laneId));
  available.forEach((laneId) => {
    if (!next.includes(laneId)) next.push(laneId);
  });
  return next;
}

function subtitleCueLaneBounds(track: EditorSubtitleTrack, cueId: string, projectDuration: number) {
  const cues = [...track.cues].sort((left, right) => left.start - right.start);
  const index = cues.findIndex((cue) => cue.id === cueId);
  return {
    minimumStart: index > 0 ? cues[index - 1].end : 0,
    maximumEnd: index >= 0 && index < cues.length - 1 ? cues[index + 1].start : Math.max(projectDuration, cues[index]?.end || 0)
  };
}

function hexColorWithAlpha(hex: string, alpha: number) {
  const safeHex = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "000000";
  const channels = [0, 2, 4].map((offset) => Number.parseInt(safeHex.slice(offset, offset + 2), 16));
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${clampValue(alpha, 0, 1)})`;
}

function moveTimelineLaneInOrder(current: string[], visibleLaneIds: string[], laneId: string, insertionIndex: number) {
  const available = new Set([...visibleLaneIds, laneId]);
  const ordered = [
    ...current.filter((currentLaneId) => available.has(currentLaneId)),
    ...visibleLaneIds.filter((visibleLaneId) => !current.includes(visibleLaneId))
  ];
  if (!ordered.includes(laneId)) ordered.push(laneId);
  const previousIndex = ordered.indexOf(laneId);
  const withoutLane = ordered.filter((currentLaneId) => currentLaneId !== laneId);
  const adjustedIndex = previousIndex >= 0 && previousIndex < insertionIndex
    ? insertionIndex - 1
    : insertionIndex;
  withoutLane.splice(clampValue(adjustedIndex, 0, withoutLane.length), 0, laneId);
  return withoutLane;
}

function findVideoClipAtTime(clips: VideoEditorClip[], time: number, laneOrder: string[] = []) {
  const safeTime = Math.max(0, time);
  const lanePosition = new Map(laneOrder.map((laneId, index) => [laneId, index]));
  const byLaneOrder = (left: VideoEditorClip, right: VideoEditorClip) =>
    (lanePosition.get(left.laneId) ?? Number.MAX_SAFE_INTEGER) - (lanePosition.get(right.laneId) ?? Number.MAX_SAFE_INTEGER);
  const activeClip = clips
    .filter((clip) => safeTime >= clip.start - 0.0005 && safeTime < clip.end - 0.0005)
    .sort(byLaneOrder)[0];
  if (activeClip) return activeClip;
  return clips
    .filter((clip) => Math.abs(safeTime - clip.end) <= 0.0005)
    .sort(byLaneOrder)[0];
}

function resolveVideoPreviewSourceTime(clip: VideoEditorClip, timelineTime: number, mediaDuration: number) {
  const sourceEnd = Number.isFinite(mediaDuration)
    ? Math.min(clip.sourceEnd, Math.max(0, mediaDuration))
    : clip.sourceEnd;
  const sourceStart = clampValue(clip.sourceStart, 0, sourceEnd);
  const sourceRange = Math.max(0, sourceEnd - sourceStart);
  if (sourceRange <= 0.0001) return sourceStart;
  const startInset = Math.min(0.001, sourceRange / 4);
  const endInset = Math.min(0.5 / timelineFps, sourceRange / 4);
  if (timelineTime <= clip.start + 0.0005) return sourceStart + startInset;
  if (timelineTime >= clip.end - 0.0005) return sourceEnd - endInset;
  return clampValue(
    clip.sourceStart + timelineTime - clip.start,
    sourceStart + startInset,
    sourceEnd - endInset
  );
}

function isVideoTimelineEdited(clips: VideoEditorClip[], sources: VideoEditorSource[], primaryDuration: number) {
  if (!clips.length) return true;
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  if (clips.some((clip) => sourceById.get(clip.sourceId)?.primary === false)) return true;
  const primarySource = sources.find((source) => source.primary);
  if (!primarySource || primaryDuration <= 0) return false;
  const sourceDuration = primarySource.duration > 0 ? primarySource.duration : primaryDuration;
  const tolerance = Math.max(0.001, 0.5 / timelineFps);
  const sorted = [...clips].sort((left, right) => left.start - right.start);
  let timelineCursor = 0;
  let sourceCursor = 0;
  for (const clip of sorted) {
    if (clip.sourceId !== primarySource.id) return true;
    if (Math.abs(clip.start - timelineCursor) > tolerance || Math.abs(clip.sourceStart - sourceCursor) > tolerance) return true;
    const timelineLength = clip.end - clip.start;
    const sourceLength = clip.sourceEnd - clip.sourceStart;
    if (Math.abs(timelineLength - sourceLength) > tolerance) return true;
    timelineCursor = clip.end;
    sourceCursor = clip.sourceEnd;
  }
  return Math.abs(timelineCursor - sourceDuration) > tolerance || Math.abs(sourceCursor - sourceDuration) > tolerance;
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

function readVideoClipVolume(clip: Pick<VideoEditorClip, "volume">) {
  return clampValue(Number.isFinite(clip.volume) ? clip.volume : 1, 0, 10);
}

function videoGainToDb(gain: number) {
  if (!Number.isFinite(gain) || gain <= 0) return videoGainMinDb;
  return clampValue(20 * Math.log10(gain), videoGainMinDb, videoGainMaxDb);
}

function videoDbToGain(db: number) {
  const normalizedDb = clampValue(Number.isFinite(db) ? db : 0, videoGainMinDb, videoGainMaxDb);
  return 10 ** (normalizedDb / 20);
}

function formatVideoGainDb(gain: number) {
  return `${videoGainToDb(gain).toFixed(1)} dB`;
}

function videoGainLinePosition(gain: number) {
  const ratio = (videoGainMaxDb - videoGainToDb(gain)) / (videoGainMaxDb - videoGainMinDb);
  return 8 + ratio * 84;
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

function paintVideoTransform(
  element: HTMLElement,
  transformValue: VideoTransform,
  source: PreviewSize,
  canvas: PreviewSize
) {
  const transform = normalizeVideoTransform(transformValue);
  const left = `${transform.x.toFixed(4)}%`;
  const top = `${transform.y.toFixed(4)}%`;
  const width = `${transform.width.toFixed(4)}%`;
  const height = `${videoTransformHeightPercent(transform, source, canvas).toFixed(4)}%`;
  const translate = "translate3d(-50%, -50%, 0)";
  if (element.style.left !== left) element.style.left = left;
  if (element.style.top !== top) element.style.top = top;
  if (element.style.width !== width) element.style.width = width;
  if (element.style.height !== height) element.style.height = height;
  if (element.style.transform !== translate) element.style.transform = translate;
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

type AudioInspectableVideo = HTMLVideoElement & {
  audioTracks?: { length: number };
  mozHasAudio?: boolean;
  webkitAudioDecodedByteCount?: number;
  captureStream?: () => MediaStream;
  webkitCaptureStream?: () => MediaStream;
};

function inspectVideoHasAudio(video: HTMLVideoElement): boolean | undefined {
  const inspectable = video as AudioInspectableVideo;
  if (inspectable.audioTracks && Number.isFinite(inspectable.audioTracks.length)) {
    return inspectable.audioTracks.length > 0;
  }
  if (typeof inspectable.mozHasAudio === "boolean") return inspectable.mozHasAudio;
  if ((inspectable.webkitAudioDecodedByteCount || 0) > 0) return true;
  const capture = inspectable.captureStream || inspectable.webkitCaptureStream;
  if (!capture || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return undefined;
  try {
    const stream = capture.call(video);
    const hasAudio = stream.getAudioTracks().length > 0;
    stream.getTracks().forEach((track) => track.stop());
    return hasAudio;
  } catch {
    return undefined;
  }
}

function createAudioPresencePeaks(seedText: string, count = 256) {
  let state = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    state ^= seedText.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  const peaks: number[] = [];
  let previous = 0.46;
  for (let index = 0; index < count; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const random = (state >>> 0) / 0xffffffff;
    const next = clampValue(previous * 0.42 + (0.18 + random * 0.82) * 0.58, 0.16, 1);
    peaks.push(next);
    previous = next;
  }
  return peaks;
}

function buildAudioPresencePath(peaks: number[]) {
  if (!peaks.length) return "";
  const step = 100 / Math.max(1, peaks.length - 1);
  const center = 12;
  const amplitude = 10.5;
  const top = peaks.map((peak, index) => `${(index * step).toFixed(2)},${(center - clampValue(peak, 0, 1) * amplitude).toFixed(2)}`);
  const bottom = peaks
    .map((peak, index) => `${(index * step).toFixed(2)},${(center + clampValue(peak, 0, 1) * amplitude).toFixed(2)}`)
    .reverse();
  return `M${top.join(" L")} L${bottom.join(" L")} Z`;
}

function buildAudioWaveformLine(peaks: number[], direction: -1 | 1) {
  if (!peaks.length) return "";
  const step = 100 / Math.max(1, peaks.length - 1);
  const center = 12;
  const amplitude = 10.5;
  return peaks.map((peak, index) => {
    const x = (index * step).toFixed(3);
    const y = (center + direction * clampValue(peak, 0, 1) * amplitude).toFixed(3);
    return `${index === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ");
}

function normalizeAudioPeaks(peaks: number[] | undefined) {
  if (!Array.isArray(peaks)) return [];
  return peaks.map((peak) => clampValue(Number.isFinite(peak) ? peak : 0, 0, 1));
}

function audioPeaksForSourceRange(peaks: number[], sourceDuration: number, requestedStart: number, requestedEnd: number) {
  if (peaks.length < 2 || sourceDuration <= 0) return peaks;
  const sourceStart = clampValue(requestedStart, 0, sourceDuration);
  const sourceEnd = clampValue(requestedEnd, sourceStart, sourceDuration);
  const startIndex = Math.floor(sourceStart / sourceDuration * peaks.length);
  const endIndex = Math.ceil(sourceEnd / sourceDuration * peaks.length);
  return peaks.slice(
    clampValue(startIndex, 0, peaks.length - 1),
    clampValue(Math.max(startIndex + 2, endIndex), 1, peaks.length)
  );
}

function audioPeaksForVideoClip(source: VideoEditorSource, clip: VideoEditorClip) {
  return audioPeaksForSourceRange(source.audioPeaks, source.duration, clip.sourceStart, clip.sourceEnd);
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
  return new Promise<{ duration: number; width: number; height: number; hasAudio: boolean }>((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    let fallbackTimer = 0;
    const finish = (value: { duration: number; width: number; height: number; hasAudio: boolean }) => {
      if (settled) return;
      settled = true;
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    const finishFromVideo = (fallbackAudio = true) => finish({
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      width: video.videoWidth || 16,
      height: video.videoHeight || 9,
      hasAudio: inspectVideoHasAudio(video) ?? fallbackAudio
    });
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const hasAudio = inspectVideoHasAudio(video);
      if (hasAudio !== undefined) {
        finishFromVideo(hasAudio);
        return;
      }
      fallbackTimer = window.setTimeout(() => finishFromVideo(true), 900);
    };
    video.onloadeddata = () => finishFromVideo(true);
    video.onerror = () => finish({ duration: 0, width: 16, height: 9, hasAudio: false });
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
  const subtitleInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoAudioGraphRef = useRef<VideoAudioGraph | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const videoTransformOverlayRef = useRef<HTMLDivElement | null>(null);
  const canvasVerticalGuideRef = useRef<HTMLDivElement | null>(null);
  const canvasHorizontalGuideRef = useRef<HTMLDivElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const timelinePlayheadRef = useRef<HTMLElement | null>(null);
  const timelineLaneDropIndicatorRef = useRef<HTMLDivElement | null>(null);
  const timelineBladeGuideRef = useRef<HTMLDivElement | null>(null);
  const audioPreviewRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const imageOverlayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const imageMotionPathRef = useRef<SVGPolylineElement | null>(null);
  const tracksRef = useRef<EditorTrack[]>([]);
  const effectsRef = useRef<EditorEffect[]>([]);
  const subtitleTracksRef = useRef<EditorSubtitleTrack[]>([]);
  const videoSourcesRef = useRef<VideoEditorSource[]>([]);
  const videoClipsRef = useRef<VideoEditorClip[]>([]);
  const timelineLaneOrderRef = useRef<string[]>([]);
  const mediaResourcesRef = useRef<ImportedMediaResource[]>([]);
  const activeVideoClipIdRef = useRef("");
  const pendingVideoSeekRef = useRef<{ time: number; shouldPlay: boolean } | null>(null);
  const playbackAnchorRef = useRef({ time: 0, startedAt: 0 });
  const currentTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const timelineMaterialDragSequenceRef = useRef(0);
  const timelineMaterialDragLockRef = useRef<{ id: number; time: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reusableSourceTaskIdRef = useRef<string | undefined>(undefined);
  const editUndoRef = useRef<EditHistoryEntry[]>([]);
  const editRedoRef = useRef<EditHistoryEntry[]>([]);
  const videoVolumeHistoryRef = useRef<EditorHistorySnapshot | null>(null);
  const videoColorHistoryRef = useRef<EditorHistorySnapshot | null>(null);
  const effectPropertyHistoryRef = useRef<EditorHistorySnapshot | null>(null);
  const subtitlePropertyHistoryRef = useRef<EditorHistorySnapshot | null>(null);
  const draggedEffectKindRef = useRef<VideoEffectKind | null>(null);
  const trackDragMovedRef = useRef(false);
  const audioSeparationStatusRequestRef = useRef(0);
  const projectSourceInitializedRef = useRef(false);
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
  const [projectSourceSize, setProjectSourceSize] = useState<PreviewSize>({ width: 1920, height: 1080 });
  const [projectAspectPreset, setProjectAspectPreset] = useState<ProjectAspectPreset>("source");
  const [previewSize, setPreviewSize] = useState<PreviewSize>({ width: 0, height: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [timelineBaseDuration, setTimelineBaseDuration] = useState(10);
  const [timelineViewport, setTimelineViewport] = useState<TimelineViewport>({ width: 0, scrollLeft: 0 });
  const [tracks, setTracks] = useState<EditorTrack[]>([]);
  const [effects, setEffects] = useState<EditorEffect[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<EditorSubtitleTrack[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [selectedEffectId, setSelectedEffectId] = useState("");
  const [selectedSubtitleTrackId, setSelectedSubtitleTrackId] = useState("");
  const [selectedSubtitleCueId, setSelectedSubtitleCueId] = useState("");
  const [selectedLaneId, setSelectedLaneId] = useState("");
  const [selectedKeyframeId, setSelectedKeyframeId] = useState("");
  const [timelineTool, setTimelineTool] = useState<TimelineTool>("select");
  const [mediaContextMenu, setMediaContextMenu] = useState<MediaContextMenu | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("tracks");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("settings");
  const [, setHistoryVersion] = useState(0);
  const [params, setParams] = useState<DetectParams>(storedSettingsRef.current.params);
  const [audioSeparation, setAudioSeparation] = useState<AudioSeparationSettings>(storedSettingsRef.current.audioSeparation);
  const [audioSeparationStatus, setAudioSeparationStatus] = useState<AudioSeparationStatus | null>(null);
  const [audioSeparationStatusLoading, setAudioSeparationStatusLoading] = useState(false);
  const [subtitlePreferences, setSubtitlePreferences] = useState<SubtitlePreferences>(storedSettingsRef.current.subtitle);
  const [subtitleEngineStatus, setSubtitleEngineStatus] = useState<SubtitleEngineStatus | null>(null);
  const [subtitleEngineStatusLoading, setSubtitleEngineStatusLoading] = useState(false);
  const [status, setStatus] = useState<TaskStatus>("idle");
  const [progress, setProgress] = useState<ProgressState>({ percent: 0, label: "等待视频", detail: "选择合成长视频后开始检测" });
  const [segments, setSegments] = useState<DuplicateSegment[]>([]);
  const [taskId, setTaskId] = useState<string>();
  const [error, setError] = useState("");
  const [resourceDropActive, setResourceDropActive] = useState(false);
  const [timelineDropActive, setTimelineDropActive] = useState(false);
  const [effectDropPreview, setEffectDropPreview] = useState<EffectDropPreview | null>(null);
  const [stepStartedAt, setStepStartedAt] = useState(0);
  const [stepFinishedAt, setStepFinishedAt] = useState(0);
  const [clockNow, setClockNow] = useState(Date.now());

  const paintCanvasSnapGuides = (verticalGuide?: number, horizontalGuide?: number) => {
    const vertical = canvasVerticalGuideRef.current;
    const horizontal = canvasHorizontalGuideRef.current;
    if (vertical) {
      vertical.style.left = `${verticalGuide ?? 0}%`;
      vertical.classList.toggle("is-visible", verticalGuide !== undefined);
    }
    if (horizontal) {
      horizontal.style.top = `${horizontalGuide ?? 0}%`;
      horizontal.classList.toggle("is-visible", horizontalGuide !== undefined);
    }
  };

  const clearCanvasSnapGuides = () => paintCanvasSnapGuides();

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

  const checkSubtitleEngineStatus = async () => {
    setSubtitleEngineStatusLoading(true);
    try {
      setSubtitleEngineStatus(await getSubtitleEngineStatus("high"));
    } catch (statusError) {
      setSubtitleEngineStatus({
        available: false,
        modelReady: false,
        message: statusError instanceof Error ? statusError.message : "无法连接字幕识别引擎"
      });
    } finally {
      setSubtitleEngineStatusLoading(false);
    }
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => () => {
    const graph = videoAudioGraphRef.current;
    videoAudioGraphRef.current = null;
    if (!graph) return;
    graph.source.disconnect();
    graph.gain.disconnect();
    void graph.context.close();
  }, []);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    effectsRef.current = effects;
  }, [effects]);

  useEffect(() => {
    subtitleTracksRef.current = subtitleTracks;
  }, [subtitleTracks]);

  useEffect(() => {
    if (!selectedResourceId && !selectedVideoClipId && !selectedTrackId && !selectedEffectId) return;
    setSelectedSubtitleTrackId("");
    setSelectedSubtitleCueId("");
  }, [selectedEffectId, selectedResourceId, selectedTrackId, selectedVideoClipId]);

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
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (projectSourceInitializedRef.current) return;
    const lanePosition = new Map(timelineLaneOrder.map((laneId, index) => [laneId, index]));
    const candidates: Array<PreviewSize & { start: number; layer: number }> = [];
    videoClips.forEach((clip) => {
      const source = videoSources.find((item) => item.id === clip.sourceId);
      if (!source?.width || !source.height) return;
      candidates.push({
        width: source.width,
        height: source.height,
        start: clip.start,
        layer: lanePosition.get(clip.laneId) ?? Number.MAX_SAFE_INTEGER
      });
    });
    tracks.forEach((track) => {
      if (track.type !== "image" || !track.sourceWidth || !track.sourceHeight) return;
      candidates.push({
        width: track.sourceWidth,
        height: track.sourceHeight,
        start: track.start,
        layer: lanePosition.get(getTrackLaneId(track)) ?? Number.MAX_SAFE_INTEGER
      });
    });
    const firstVisual = candidates.sort((left, right) => left.start - right.start || left.layer - right.layer)[0];
    if (!firstVisual) return;
    const sourceSize = { width: firstVisual.width, height: firstVisual.height };
    projectSourceInitializedRef.current = true;
    setProjectSourceSize(sourceSize);
    setVideoSize(projectAspectPreset === "source"
      ? sourceSize
      : calculateProjectCanvasSize(sourceSize, projectAspectRatios[projectAspectPreset]));
  }, [projectAspectPreset, timelineLaneOrder, tracks, videoClips, videoSources]);

  useEffect(() => {
    if (!mediaContextMenu) return;
    const closeFromPointer = (event: PointerEvent) => {
      if ((event.target as HTMLElement | null)?.closest(".lossless-media-context-menu")) return;
      setMediaContextMenu(null);
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMediaContextMenu(null);
    };
    const close = () => setMediaContextMenu(null);
    window.addEventListener("pointerdown", closeFromPointer, true);
    window.addEventListener("keydown", closeFromKeyboard);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", closeFromPointer, true);
      window.removeEventListener("keydown", closeFromKeyboard);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [mediaContextMenu]);

  useEffect(() => {
    const primarySource = videoSources.find((source) => source.primary);
    const sourceDuration = primarySource?.duration || duration;
    if (sourceDuration > 0.001) {
      setTimelineBaseDuration(timelineDurationWithTail(sourceDuration));
      return;
    }
    if (!videoClips.length && !tracks.length) setTimelineBaseDuration(10);
  }, [duration, tracks.length, videoClips.length, videoSources]);

  useEffect(() => {
    return () => {
      const previewUrls = new Set<string>();
      const collectSnapshotUrls = (snapshot: EditorHistorySnapshot) => {
        snapshot.tracks.forEach((track) => previewUrls.add(track.previewUrl));
        snapshot.videoSources.forEach((source) => previewUrls.add(source.previewUrl));
        snapshot.mediaResources.forEach((resource) => previewUrls.add(resource.previewUrl));
      };
      tracksRef.current.forEach((track) => previewUrls.add(track.previewUrl));
      videoSourcesRef.current.forEach((source) => previewUrls.add(source.previewUrl));
      mediaResourcesRef.current.forEach((resource) => previewUrls.add(resource.previewUrl));
      editUndoRef.current.forEach((entry) => {
        if (entry.kind === "editor") collectSnapshotUrls(entry.snapshot);
      });
      editRedoRef.current.forEach((entry) => {
        if (entry.kind === "editor") collectSnapshotUrls(entry.snapshot);
      });
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
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
        audioSeparation: { ...audioSeparation, settingsVersion: audioSettingsVersion },
        subtitle: subtitlePreferences
      }));
    } catch {
      // 浏览器禁用本地存储时不影响视频处理。
    }
  }, [audioSeparation, params, subtitlePreferences]);

  useEffect(() => {
    const isRunning = status === "detecting" || status === "transcribing" || status === "separating" || status === "exporting";
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
    if (status !== "detecting" && status !== "transcribing" && status !== "exporting") return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const removableSegments = useMemo(() => segments.filter((segment) => segment.deleteSecond), [segments]);
  const removeDuration = useMemo(
    () => removableSegments.reduce((sum, segment) => sum + (segment.deleteDuration ?? Math.max(0, (segment.deleteEnd ?? segment.secondEnd) - (segment.deleteStart ?? segment.secondStart))), 0),
    [removableSegments]
  );
  const enabledTracks = useMemo(() => tracks.filter((track) => track.enabled), [tracks]);
  const enabledEffects = useMemo(() => effects.filter((effect) => effect.enabled), [effects]);
  const enabledSubtitleTracks = useMemo(() => subtitleTracks.filter((track) => track.enabled && track.cues.length), [subtitleTracks]);
  const importedResources = useMemo<ImportedResource[]>(() => [...videoSources, ...mediaResources], [mediaResources, videoSources]);
  const usedVideoSourceIds = useMemo(() => new Set(videoClips.map((clip) => clip.sourceId)), [videoClips]);
  const usedMediaSourceIds = useMemo(() => new Set(tracks.map((track) => track.sourceId)), [tracks]);
  const projectVideoDuration = useMemo(
    () => getTimelineProjectDuration(videoClips, tracks, subtitleTracks),
    [subtitleTracks, tracks, videoClips]
  );
  const safeCurrentTime = clampValue(currentTime, 0, projectVideoDuration);
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
  const selectedVideoSource = useMemo(
    () => videoSources.find((source) => source.id === selectedVideoClip?.sourceId),
    [selectedVideoClip?.sourceId, videoSources]
  );
  const selectedVideoColor = useMemo(
    () => selectedVideoClip ? readVideoColor(selectedVideoClip) : cloneVideoColor(defaultVideoColor),
    [selectedVideoClip]
  );
  const selectedEffect = useMemo(
    () => effects.find((effect) => effect.id === selectedEffectId),
    [effects, selectedEffectId]
  );
  const activeEffects = useMemo(
    () => enabledEffects
      .filter((effect) => currentTime >= effect.start - 0.0005 && currentTime < effect.end - 0.0005)
      .sort((left, right) => {
        const leftLayer = timelineLaneOrder.indexOf(left.laneId || effectLaneId);
        const rightLayer = timelineLaneOrder.indexOf(right.laneId || effectLaneId);
        return (rightLayer < 0 ? timelineLaneOrder.length : rightLayer)
          - (leftLayer < 0 ? timelineLaneOrder.length : leftLayer);
      }),
    [currentTime, enabledEffects, timelineLaneOrder]
  );
  const activeVideoColor = useMemo(
    () => activeVideoClip ? readVideoColor(activeVideoClip) : cloneVideoColor(defaultVideoColor),
    [activeVideoClip]
  );
  const activeVideoColorTables = useMemo(
    () => videoColorChannelTables(activeVideoColor),
    [activeVideoColor]
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
  const hasVideoColorAdjustments = useMemo(
    () => videoClips.some((clip) => !videoColorIsDefault(readVideoColor(clip))),
    [videoClips]
  );
  const hasVideoAudioAdjustments = useMemo(
    () => videoClips.some((clip) => Math.abs(readVideoClipVolume(clip) - 1) > 0.0001),
    [videoClips]
  );
  const projectAspectOptions = useMemo<Array<{ label: string; value: ProjectAspectPreset }>>(
    () => [
      { label: `原始 (${formatProjectAspect(projectSourceSize)})`, value: "source" },
      ...fixedProjectAspectOptions
    ],
    [projectSourceSize]
  );
  const projectCanvasChanged = Math.abs(videoSize.width - projectSourceSize.width) > 1
    || Math.abs(videoSize.height - projectSourceSize.height) > 1;
  const activeVideoTransform = useMemo(() => {
    if (!activeVideoClip || !activeVideoSource) return undefined;
    const sourceSize = { width: activeVideoSource.width, height: activeVideoSource.height };
    return projectCanvasChanged
      ? resolveVideoTransform(activeVideoClip, sourceSize, videoSize)
      : createDefaultVideoTransform(sourceSize, videoSize);
  }, [activeVideoClip, activeVideoSource, projectCanvasChanged, videoSize]);
  const activeVideoTransformHeight = useMemo(() => {
    if (!activeVideoTransform || !activeVideoSource) return 0;
    return videoTransformHeightPercent(
      activeVideoTransform,
      { width: activeVideoSource.width, height: activeVideoSource.height },
      videoSize
    );
  }, [activeVideoSource, activeVideoTransform, videoSize]);
  const activeVideoTransformSelected = Boolean(
    projectCanvasChanged
    && activeVideoClip
    && activeVideoClip.id === selectedVideoClipId
    && !selectedTrackId
  );
  const selectedTrack = useMemo(() => tracks.find((track) => track.id === selectedTrackId), [selectedTrackId, tracks]);
  const selectedImageTrack = selectedTrack?.type === "image" ? selectedTrack : undefined;
  const selectedSubtitleTrack = useMemo(
    () => subtitleTracks.find((track) => track.id === selectedSubtitleTrackId),
    [selectedSubtitleTrackId, subtitleTracks]
  );
  const selectedSubtitleCue = useMemo(
    () => selectedSubtitleTrack?.cues.find((cue) => cue.id === selectedSubtitleCueId),
    [selectedSubtitleCueId, selectedSubtitleTrack]
  );
  const activeSubtitle = useMemo(
    () => subtitleCueAtTime(subtitleTracks, currentTime),
    [currentTime, subtitleTracks]
  );
  const activeSubtitleStyle = useMemo(
    () => activeSubtitle ? readSubtitleStyle(activeSubtitle.track.style) : undefined,
    [activeSubtitle]
  );
  const subtitleRecognitionSources = useMemo<SubtitleRecognitionSource[]>(() => [
    ...videoClips.flatMap((clip) => {
      const source = videoSources.find((item) => item.id === clip.sourceId);
      if (!source?.hasAudio) return [];
      return [{
        id: `video:${clip.id}`,
        label: `视频 · ${clip.name} (${formatSeconds(clip.start)})`,
        file: source.file,
        sourceStart: clip.sourceStart,
        sourceEnd: clip.sourceEnd,
        timelineStart: clip.start,
        laneId: clip.laneId,
        linkedVideoClipId: clip.id
      }];
    }),
    ...tracks.flatMap((track) => track.type === "audio" ? [{
      id: `audio:${track.id}`,
      label: `音频 · ${track.name} (${formatSeconds(track.start)})`,
      file: track.file,
      sourceStart: track.sourceStart,
      sourceEnd: track.sourceEnd,
      timelineStart: track.start,
      laneId: getTrackLaneId(track),
      linkedAudioTrackId: track.id
    }] : [])
  ], [tracks, videoClips, videoSources]);
  const editableSubtitleStyle = readSubtitleStyle(selectedSubtitleTrack?.style || subtitlePreferences.style);
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
      else lanes.set(clip.laneId, { id: clip.laneId, type: "video", clips: [], videoClips: [clip], effects: [], subtitleCues: [] });
    });
    tracks.forEach((track) => {
      const laneId = track.laneId || track.id;
      const lane = lanes.get(laneId);
      if (lane) lane.clips.push(track);
      else lanes.set(laneId, { id: laneId, type: track.type, clips: [track], videoClips: [], effects: [], subtitleCues: [] });
    });
    effects.forEach((effect) => {
      const laneId = effect.laneId || effectLaneId;
      const lane = lanes.get(laneId);
      if (lane) lane.effects.push(effect);
      else lanes.set(laneId, { id: laneId, type: "effect", clips: [], videoClips: [], effects: [effect], subtitleCues: [] });
    });
    subtitleTracks.forEach((track) => {
      lanes.set(track.laneId, {
        id: track.laneId,
        type: "subtitle",
        clips: [],
        videoClips: [],
        effects: [],
        subtitleTrack: track,
        subtitleCues: [...track.cues]
      });
    });
    if (effectDropPreview && !lanes.has(effectLaneId)) {
      lanes.set(effectLaneId, { id: effectLaneId, type: "effect", clips: [], videoClips: [], effects: [], subtitleCues: [] });
    }
    const previewLaneIds = effectDropPreview && !timelineLaneOrder.includes(effectLaneId) ? [effectLaneId] : [];
    const laneIds = [
      ...previewLaneIds,
      ...timelineLaneOrder.filter((laneId) => lanes.has(laneId)),
      ...Array.from(lanes.keys()).filter((laneId) => !timelineLaneOrder.includes(laneId) && !previewLaneIds.includes(laneId))
    ];
    return laneIds.map((laneId) => lanes.get(laneId)!).map((lane) => ({
      ...lane,
      clips: [...lane.clips].sort((left, right) => left.start - right.start),
      videoClips: [...lane.videoClips].sort((left, right) => left.start - right.start),
      effects: [...lane.effects].sort((left, right) => left.start - right.start),
      subtitleCues: [...lane.subtitleCues].sort((left, right) => left.start - right.start)
    }));
  }, [effectDropPreview, effects, subtitleTracks, timelineLaneOrder, tracks, videoClips]);
  const readTimelineLaneRows = () => {
    const viewport = timelineScrollRef.current;
    if (!viewport) return [];
    return Array.from(viewport.querySelectorAll<HTMLElement>(".lossless-media-track-row"))
      .map((element) => ({
        id: element.dataset.laneId || "",
        type: element.dataset.laneType as TimelineLane["type"] | undefined,
        rect: element.getBoundingClientRect()
      }))
      .filter((item) => item.id)
      .sort((left, right) => left.rect.top - right.rect.top);
  };
  const resolveTimelineLanePlacement = (
    clientY: number,
    laneType: TimelineLane["type"],
    generatedLaneId: string
  ): TimelineLaneDrop => {
    const rows = readTimelineLaneRows();
    if (!rows.length) return { laneId: generatedLaneId, insertionIndex: 0, kind: "create" };
    let insertionIndex = rows.findIndex((item) => clientY < item.rect.top + item.rect.height / 2);
    if (insertionIndex < 0) insertionIndex = rows.length;
    const hovered = rows.find((item) => clientY >= item.rect.top && clientY <= item.rect.bottom);
    if (hovered?.type === laneType) {
      return { laneId: hovered.id, insertionIndex, kind: "existing" };
    }
    return { laneId: generatedLaneId, insertionIndex, kind: "create" };
  };
  const resolveTimelineLaneDrop = (
    clientY: number,
    laneType: TimelineLane["type"],
    sourceLaneId: string,
    generatedLaneId: string,
    verticalDistance: number
  ): TimelineLaneDrop => {
    const sourceIndex = Math.max(0, timelineLanes.findIndex((lane) => lane.id === sourceLaneId));
    const sourceDrop: TimelineLaneDrop = {
      laneId: sourceLaneId,
      insertionIndex: sourceIndex,
      kind: "source"
    };
    if (Math.abs(verticalDistance) < timelineVerticalDragThresholdPx) return sourceDrop;
    const viewport = timelineScrollRef.current;
    if (!viewport) return sourceDrop;
    const viewportRect = viewport.getBoundingClientRect();
    if (
      clientY < viewportRect.top - timelineVerticalDropMarginPx
      || clientY > viewportRect.bottom + timelineVerticalDropMarginPx
    ) return sourceDrop;
    const placement = resolveTimelineLanePlacement(clientY, laneType, generatedLaneId);
    if (placement.laneId !== sourceLaneId) return placement;

    const adjacentLaneThreshold = timelineLanePitchPx * 0.28;
    if (verticalDistance <= -adjacentLaneThreshold) {
      const upperLane = timelineLanes[sourceIndex - 1];
      if (upperLane?.type === laneType) {
        return { laneId: upperLane.id, insertionIndex: sourceIndex, kind: "existing" };
      }
      return { laneId: generatedLaneId, insertionIndex: sourceIndex, kind: "create" };
    }
    if (verticalDistance >= adjacentLaneThreshold) {
      const lowerLane = timelineLanes[sourceIndex + 1];
      if (lowerLane?.type === laneType) {
        return { laneId: lowerLane.id, insertionIndex: sourceIndex + 1, kind: "existing" };
      }
      return { laneId: generatedLaneId, insertionIndex: sourceIndex + 1, kind: "create" };
    }
    return sourceDrop;
  };
  const positionTimelineLane = (laneId: string, insertionIndex: number) => {
    const visibleLaneIds = timelineLanes.map((lane) => lane.id);
    if (!visibleLaneIds.includes(laneId)) visibleLaneIds.push(laneId);
    const next = moveTimelineLaneInOrder(timelineLaneOrderRef.current, visibleLaneIds, laneId, insertionIndex);
    if (
      next.length === timelineLaneOrderRef.current.length
      && next.every((currentLaneId, index) => currentLaneId === timelineLaneOrderRef.current[index])
    ) return;
    timelineLaneOrderRef.current = next;
    setTimelineLaneOrder(next);
  };
  const markTimelineLaneDropTarget = (laneId = "", insertionIndex?: number) => {
    timelineScrollRef.current?.querySelectorAll<HTMLElement>(".lossless-media-track-row").forEach((laneRow) => {
      laneRow.classList.toggle("is-drop-target", Boolean(laneId) && laneRow.dataset.laneId === laneId);
    });
    const indicator = timelineLaneDropIndicatorRef.current;
    if (!indicator) return;
    if (insertionIndex === undefined) {
      indicator.style.display = "none";
      return;
    }
    const laneCount = Math.max(timelineLanes.length, readTimelineLaneRows().length);
    indicator.style.display = "block";
    indicator.style.top = `${timelineLaneTopPx - 3 + clampValue(insertionIndex, 0, laneCount) * timelineLanePitchPx}px`;
  };
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
  const timelineContentDuration = useMemo(
    () =>
      Math.max(
        projectVideoDuration,
        ...segments.map((segment) => Math.max(segment.deleteEnd ?? segment.secondEnd, segment.secondEnd, segment.firstEnd)),
        ...tracks.map((track) => track.end),
        ...effects.map((effect) => effect.end)
      ),
    [effects, projectVideoDuration, segments, tracks]
  );
  const timelineDuration = timelineDurationWithTail(timelineContentDuration);
  const timelineGeometry = useMemo(
    () => calculateTimelineGeometry(timelineViewport.width, timelineBaseDuration, timelineDuration, timelineZoom),
    [timelineBaseDuration, timelineDuration, timelineViewport.width, timelineZoom]
  );
  const timelineDisplayDuration = timelineGeometry.displayDuration;
  const selectedTrackLaneBounds = useMemo(
    () => selectedTrack ? getLaneClipBounds(tracks, selectedTrack, timelineDisplayDuration) : undefined,
    [selectedTrack, timelineDisplayDuration, tracks]
  );
  const selectedEffectLaneBounds = useMemo(
    () => selectedEffect
      ? getTimelineRangeBounds(
          effects.filter((effect) => (effect.laneId || effectLaneId) === (selectedEffect.laneId || effectLaneId)),
          selectedEffect,
          projectVideoDuration
        )
      : undefined,
    [effects, projectVideoDuration, selectedEffect]
  );
  const timelineMaxZoom = useMemo(() => {
    const viewportWidth = Math.max(1, timelineViewport.width || 1000);
    const usableViewportWidth = Math.max(1, viewportWidth - timelineEdgeSpacePx * 2);
    const frameWidthLimitedZoom = timelineMaxFrameWidthPx * timelineFps * timelineBaseDuration / usableViewportWidth;
    const canvasLimitedZoom = Math.max(
      1,
      (timelineMaxCanvasWidthPx - timelineEdgeSpacePx * 2) * timelineBaseDuration
        / Math.max(1, usableViewportWidth * timelineDuration)
    );
    return clampValue(frameWidthLimitedZoom, 1, Math.min(timelineAbsoluteMaxZoom, canvasLimitedZoom));
  }, [timelineBaseDuration, timelineDuration, timelineFps, timelineViewport.width]);
  const timelineMaxZoomExponent = Math.log2(timelineMaxZoom);
  const timelineScale = useMemo(() => {
    const viewportWidth = Math.max(1, timelineViewport.width || 1000);
    const canvasWidth = timelineGeometry.contentWidth;
    const pixelsPerSecond = timelineGeometry.pixelsPerSecond;
    const frameStep = 1 / timelineFps;
    const majorStep = pickTimelineMajorStep(96 / Math.max(0.000001, pixelsPerSecond), timelineFps);
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
    return { ticks, frameStep, majorStep, minorStep };
  }, [timelineDisplayDuration, timelineFps, timelineGeometry.contentWidth, timelineGeometry.pixelsPerSecond, timelineViewport]);
  const timelineTicks = timelineScale.ticks;

  useEffect(() => {
    setTimelineZoom((current) => Math.min(current, timelineMaxZoom));
  }, [timelineMaxZoom]);

  const taskRunning = status === "detecting" || status === "transcribing" || status === "separating" || status === "exporting";
  const canRunTask = Boolean(videoInput) && videoClips.length > 0 && !taskRunning;
  const automaticSubtitleMode: SubtitleExportMode = enabledSubtitleTracks.length ? "burn" : "none";
  const automaticExportMode: LosslessCutMode = hasImageTracks
    || hasVideoColorAdjustments
    || enabledEffects.length > 0
    || hasExternalVideoSources
    || needsVideoComposition
    || projectCanvasChanged
    || enabledSubtitleTracks.length > 0
    || videoClips.length === 0
    || hasVideoEdits
    ? "precise-reencode"
    : "keyframe-copy";
  const videoOutputReencoded = hasImageTracks
    || hasVideoColorAdjustments
    || enabledEffects.length > 0
    || hasExternalVideoSources
    || needsVideoComposition
    || projectCanvasChanged
    || enabledSubtitleTracks.length > 0
    || videoClips.length === 0
    || automaticExportMode === "precise-reencode";

  const canExport = projectVideoDuration > 0
    && !taskRunning
    && (videoClips.length > 0 || enabledTracks.length > 0);
  const stepElapsed = stepStartedAt ? formatElapsed((stepFinishedAt || clockNow) - stepStartedAt) : "";
  const showStepElapsed = Boolean(stepElapsed) && status !== "idle";
  const canUndoEdit = editUndoRef.current.length > 0;
  const canRedoEdit = editRedoRef.current.length > 0;
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

    const paintFrame = () => {
      const dragLock = timelineMaterialDragLockRef.current;
      const projectTime = dragLock?.time ?? currentTimeRef.current;
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
    };

    const paintPausedFrame = () => paintFrame();
    if (video.requestVideoFrameCallback) {
      const onVideoFrame = () => {
        if (stopped) return;
        paintFrame();
        videoFrameHandle = video.requestVideoFrameCallback?.(onVideoFrame) ?? 0;
      };
      videoFrameHandle = video.requestVideoFrameCallback(onVideoFrame);
    } else {
      const onAnimationFrame = () => {
        if (stopped) return;
        if (!video.paused) paintFrame();
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
  }, [activeVideoClipId, previewUrl]);

  const setNumberParam = (key: keyof DetectParams, value: number) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const resetResult = () => {
    setSegments([]);
    editUndoRef.current = editUndoRef.current.filter((entry) => entry.kind === "editor");
    editRedoRef.current = editRedoRef.current.filter((entry) => entry.kind === "editor");
    setHistoryVersion((value) => value + 1);
    setTaskId(undefined);
    reusableSourceTaskIdRef.current = undefined;
    setError("");
    setSegmentFilter("settings");
    setProgress({ percent: 0, label: "等待检测", detail: "参数确认后开始扫描重复片段" });
    setStatus("idle");
  };

  const captureEditorSnapshot = (): EditorHistorySnapshot => ({
    videoSources: videoSourcesRef.current.map((source) => ({ ...source })),
    mediaResources: mediaResourcesRef.current.map((resource) => ({ ...resource })),
    videoClips: videoClipsRef.current.map(cloneVideoEditorClip),
    tracks: tracksRef.current.map(cloneEditorTrack),
    effects: effectsRef.current.map(cloneEditorEffect),
    subtitleTracks: subtitleTracksRef.current.map(cloneSubtitleTrack),
    timelineLaneOrder: [...timelineLaneOrderRef.current],
    selectedResourceId,
    selectedVideoClipId,
    selectedTrackId,
    selectedEffectId,
    selectedSubtitleTrackId,
    selectedSubtitleCueId,
    selectedLaneId,
    selectedKeyframeId,
    currentTime: currentTimeRef.current,
    videoSize: { ...videoSize },
    projectSourceSize: { ...projectSourceSize },
    projectAspectPreset
  });

  const pushHistoryEntry = (entry: EditHistoryEntry) => {
    editUndoRef.current = [...editUndoRef.current.slice(-49), entry];
    editRedoRef.current = [];
    setHistoryVersion((value) => value + 1);
  };

  const pushEditorHistory = (previous: EditorHistorySnapshot) => {
    const current = captureEditorSnapshot();
    if (editorSnapshotFingerprint(previous) === editorSnapshotFingerprint(current)) return false;
    pushHistoryEntry({ kind: "editor", snapshot: cloneEditorSnapshot(previous) });
    return true;
  };

  const restoreEditorSnapshot = (requestedSnapshot: EditorHistorySnapshot) => {
    const snapshot = cloneEditorSnapshot(requestedSnapshot);
    snapshot.subtitleTracks = snapshot.subtitleTracks.map((track) => ({
      ...track,
      style: readSubtitleStyle(track.style)
    }));
    videoRef.current?.pause();
    audioPreviewRefs.current.forEach((audio) => audio.pause());
    isPlayingRef.current = false;
    setIsPlaying(false);
    setMediaContextMenu(null);

    videoSourcesRef.current = snapshot.videoSources;
    mediaResourcesRef.current = snapshot.mediaResources;
    videoClipsRef.current = snapshot.videoClips;
    tracksRef.current = snapshot.tracks;
    effectsRef.current = snapshot.effects;
    subtitleTracksRef.current = snapshot.subtitleTracks;
    timelineLaneOrderRef.current = snapshot.timelineLaneOrder;
    setVideoSources(snapshot.videoSources);
    setMediaResources(snapshot.mediaResources);
    setVideoClips(snapshot.videoClips);
    setTracks(snapshot.tracks);
    setEffects(snapshot.effects);
    setSubtitleTracks(snapshot.subtitleTracks);
    setTimelineLaneOrder(snapshot.timelineLaneOrder);
    setVideoSize(snapshot.videoSize);
    setProjectSourceSize(snapshot.projectSourceSize || snapshot.videoSize);
    setProjectAspectPreset(snapshot.projectAspectPreset || "source");
    projectSourceInitializedRef.current = snapshot.videoClips.length > 0
      || snapshot.tracks.some((track) => track.type === "image");

    const primarySource = snapshot.videoSources.find((source) => source.primary);
    const projectDuration = getTimelineProjectDuration(snapshot.videoClips, snapshot.tracks, snapshot.subtitleTracks);
    const nextTime = clampValue(snapshot.currentTime, 0, projectDuration);
    const activeClip = findVideoClipAtTime(snapshot.videoClips, nextTime, snapshot.timelineLaneOrder);
    const previewSource = snapshot.videoSources.find((source) => source.id === activeClip?.sourceId) || primarySource;
    activeVideoClipIdRef.current = activeClip?.id || "";
    currentTimeRef.current = nextTime;
    setActiveVideoClipId(activeClip?.id || "");
    setCurrentTime(nextTime);
    setVideoFile(primarySource?.file || null);
    setVideoInput(primarySource ? createInputFromFile(primarySource.file) : null);
    setDuration(primarySource?.duration || 0);
    setPreviewUrl(previewSource?.previewUrl || "");
    setSelectedResourceId(snapshot.selectedResourceId);
    setSelectedVideoClipId(snapshot.selectedVideoClipId);
    setSelectedTrackId(snapshot.selectedTrackId);
    setSelectedEffectId(snapshot.selectedEffectId || "");
    setSelectedSubtitleTrackId(snapshot.selectedSubtitleTrackId || "");
    setSelectedSubtitleCueId(snapshot.selectedSubtitleCueId || "");
    setSelectedLaneId(snapshot.selectedLaneId);
    setSelectedKeyframeId(snapshot.selectedKeyframeId);
    resetResult();
    window.requestAnimationFrame(() => seekPreview(nextTime, false, false));
  };

  const commitSubtitleTracks = (nextTracks: EditorSubtitleTrack[]) => {
    const normalized = nextTracks.map((track) => ({
      ...track,
      style: readSubtitleStyle(track.style),
      cues: normalizeSubtitleCueLane(track.cues, timelineFps)
    }));
    subtitleTracksRef.current = normalized;
    setSubtitleTracks(normalized);
  };

  const selectSubtitleCue = (trackId: string, cueId: string, seek = true) => {
    const track = subtitleTracksRef.current.find((item) => item.id === trackId);
    const cue = track?.cues.find((item) => item.id === cueId);
    if (!track || !cue) return;
    setSelectedResourceId("");
    setSelectedVideoClipId("");
    setSelectedTrackId("");
    setSelectedEffectId("");
    setSelectedSubtitleTrackId(track.id);
    setSelectedSubtitleCueId(cue.id);
    setSelectedLaneId(track.laneId);
    setSelectedKeyframeId("");
    setInspectorTab("subtitles");
    if (seek) seekPreview(cue.start, false);
  };

  const selectAllSubtitleCues = (trackId: string) => {
    const track = subtitleTracksRef.current.find((item) => item.id === trackId);
    if (!track?.cues.length) return;
    setSelectedResourceId("");
    setSelectedVideoClipId("");
    setSelectedTrackId("");
    setSelectedEffectId("");
    setSelectedSubtitleTrackId(track.id);
    setSelectedSubtitleCueId(allSubtitleCuesSelectionId);
    setSelectedLaneId(track.laneId);
    setSelectedKeyframeId("");
    setInspectorTab("subtitles");
  };

  const updateSubtitleTrack = (
    trackId: string,
    updater: (track: EditorSubtitleTrack) => EditorSubtitleTrack,
    recordHistory = false
  ) => {
    const historySnapshot = recordHistory ? captureEditorSnapshot() : undefined;
    const nextTracks = subtitleTracksRef.current.map((track) => track.id === trackId ? updater(cloneSubtitleTrack(track)) : track);
    commitSubtitleTracks(nextTracks);
    if (historySnapshot) pushEditorHistory(historySnapshot);
  };

  const updateSubtitleCue = (
    trackId: string,
    cueId: string,
    updater: (cue: SubtitleCue) => SubtitleCue,
    recordHistory = false
  ) => {
    updateSubtitleTrack(trackId, (track) => {
      const currentCue = track.cues.find((cue) => cue.id === cueId);
      if (!currentCue) return track;
      const requested = updater({ ...currentCue, words: currentCue.words?.map((word) => ({ ...word })) });
      const bounds = subtitleCueLaneBounds(track, cueId, projectVideoDuration);
      const start = clampValue(roundTimelineFrame(requested.start), bounds.minimumStart, Math.max(bounds.minimumStart, bounds.maximumEnd - minimumTimelineClipDuration));
      const end = clampValue(roundTimelineFrame(requested.end), start + minimumTimelineClipDuration, Math.max(start + minimumTimelineClipDuration, bounds.maximumEnd));
      return {
        ...track,
        cues: track.cues.map((cue) => cue.id === cueId ? { ...requested, start, end } : cue)
      };
    }, recordHistory);
  };

  const placeSubtitleLaneAboveSource = (laneId: string, sourceLaneId = "") => {
    const current = timelineLaneOrderRef.current.filter((item) => item !== laneId);
    const sourceIndex = sourceLaneId ? current.indexOf(sourceLaneId) : -1;
    current.splice(sourceIndex >= 0 ? sourceIndex : 0, 0, laneId);
    timelineLaneOrderRef.current = current;
    setTimelineLaneOrder(current);
  };

  const removeSubtitleTrack = (trackId: string) => {
    const historySnapshot = captureEditorSnapshot();
    const removed = subtitleTracksRef.current.find((track) => track.id === trackId);
    if (!removed) return;
    commitSubtitleTracks(subtitleTracksRef.current.filter((track) => track.id !== trackId));
    const nextLaneOrder = timelineLaneOrderRef.current.filter((laneId) => laneId !== removed.laneId);
    timelineLaneOrderRef.current = nextLaneOrder;
    setTimelineLaneOrder(nextLaneOrder);
    if (selectedSubtitleTrackId === trackId) {
      setSelectedSubtitleTrackId("");
      setSelectedSubtitleCueId("");
    }
    pushEditorHistory(historySnapshot);
  };

  const removeSubtitleCue = (trackId: string, cueId: string) => {
    const track = subtitleTracksRef.current.find((item) => item.id === trackId);
    if (!track) return;
    if (track.cues.length <= 1) {
      removeSubtitleTrack(trackId);
      return;
    }
    updateSubtitleTrack(trackId, (item) => ({ ...item, cues: item.cues.filter((cue) => cue.id !== cueId) }), true);
    if (selectedSubtitleCueId === cueId) setSelectedSubtitleCueId("");
  };

  const splitSubtitleCueAtTime = (trackId: string, cueId: string, requestedTime: number) => {
    const track = subtitleTracksRef.current.find((item) => item.id === trackId);
    const cue = track?.cues.find((item) => item.id === cueId);
    if (!track || !cue) return;
    const splitTime = roundTimelineFrame(requestedTime);
    if (splitTime <= cue.start + minimumTimelineClipDuration || splitTime >= cue.end - minimumTimelineClipDuration) return;
    const historySnapshot = captureEditorSnapshot();
    const words = cue.words || [];
    const leftWords = words.filter((word) => word.end <= splitTime + 0.001);
    const rightWords = words.filter((word) => word.start >= splitTime - 0.001);
    const characters = Array.from(cue.text.trim());
    const ratio = (splitTime - cue.start) / Math.max(0.001, cue.end - cue.start);
    const characterIndex = clampValue(Math.round(characters.length * ratio), 1, Math.max(1, characters.length - 1));
    const leftText = leftWords.length ? leftWords.map((word) => word.text).join("").trim() : characters.slice(0, characterIndex).join("").trim();
    const rightText = rightWords.length ? rightWords.map((word) => word.text).join("").trim() : characters.slice(characterIndex).join("").trim();
    const leftCue: SubtitleCue = { ...cue, end: splitTime, text: leftText || cue.text, words: leftWords.length ? leftWords : undefined };
    const rightCue: SubtitleCue = {
      ...cue,
      id: createEditorId("subtitle-cue"),
      start: splitTime,
      text: rightText || cue.text,
      words: rightWords.length ? rightWords : undefined
    };
    commitSubtitleTracks(subtitleTracksRef.current.map((item) => item.id === trackId
      ? { ...item, cues: item.cues.flatMap((candidate) => candidate.id === cueId ? [leftCue, rightCue] : [candidate]) }
      : item));
    setSelectedSubtitleTrackId(trackId);
    setSelectedSubtitleCueId(rightCue.id);
    pushEditorHistory(historySnapshot);
  };

  const addManualSubtitleCue = () => {
    const historySnapshot = captureEditorSnapshot();
    let track = selectedSubtitleTrack || subtitleTracksRef.current[0];
    let createdTrack = false;
    if (!track) {
      track = {
        id: createEditorId("subtitle-track"),
        laneId: createEditorId("subtitle-lane"),
        name: "字幕 1",
        language: subtitlePreferences.language,
        enabled: true,
        sourceId: "manual",
        style: { ...subtitlePreferences.style },
        cues: []
      };
      createdTrack = true;
    }
    const sortedCues = [...track.cues].sort((left, right) => left.start - right.start);
    let start = roundTimelineFrame(currentTimeRef.current);
    for (const cue of sortedCues) {
      if (start >= cue.end - 0.001) continue;
      if (start + 0.5 <= cue.start) break;
      start = cue.end;
    }
    const nextCueStart = sortedCues.find((cue) => cue.start > start + 0.001)?.start;
    const desiredEnd = start + 5;
    const availableEnd = nextCueStart ?? (projectVideoDuration > start ? projectVideoDuration : desiredEnd);
    const end = Math.max(start + minimumTimelineClipDuration, Math.min(desiredEnd, availableEnd));
    const cue: SubtitleCue = {
      id: createEditorId("subtitle-cue"),
      start,
      end,
      sourceStart: start,
      sourceEnd: end,
      text: "请输入字幕",
      confidence: 1
    };
    const nextTrack = { ...track, cues: [...track.cues, cue] };
    commitSubtitleTracks(createdTrack
      ? [...subtitleTracksRef.current, nextTrack]
      : subtitleTracksRef.current.map((item) => item.id === track!.id ? nextTrack : item));
    if (createdTrack) placeSubtitleLaneAboveSource(track.laneId);
    selectSubtitleCue(track.id, cue.id, false);
    seekPreview(start, false);
    pushEditorHistory(historySnapshot);
  };

  const updateSelectedSubtitleStyle = (patch: Partial<SubtitleStyle>, recordHistory = false) => {
    const style = readSubtitleStyle({ ...subtitlePreferences.style, ...patch });
    setSubtitlePreferences((current) => ({ ...current, style }));
    if (selectedSubtitleTrack) {
      updateSubtitleTrack(selectedSubtitleTrack.id, (track) => ({ ...track, style: readSubtitleStyle({ ...track.style, ...patch }) }), recordHistory);
    }
  };

  const startSubtitleCanvasTransform = (
    event: ReactPointerEvent<HTMLElement>,
    track: EditorSubtitleTrack,
    cue: SubtitleCue,
    action: SubtitleTransformAction
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget.closest(".lossless-subtitle-preview") as HTMLElement | null;
    const stage = element?.parentElement;
    if (!element || !stage) return;

    const historySnapshot = captureEditorSnapshot();
    videoRef.current?.pause();
    audioPreviewRefs.current.forEach((audio) => audio.pause());
    isPlayingRef.current = false;
    setIsPlaying(false);
    if (selectedSubtitleTrackId !== track.id || selectedSubtitleCueId !== allSubtitleCuesSelectionId) {
      selectSubtitleCue(track.id, cue.id, false);
    }

    const stageRect = stage.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const style = readSubtitleStyle(track.style);
    const pointerStartX = event.clientX;
    const pointerStartY = event.clientY;
    const centerX = stageRect.left + style.x / 100 * stageRect.width;
    const centerY = stageRect.top + style.position / 100 * stageRect.height;
    const grabOffsetX = pointerStartX - centerX;
    const grabOffsetY = pointerStartY - centerY;
    const widthPixels = Math.max(1, elementRect.width);
    const heightPixels = Math.max(1, elementRect.height);
    const widthPercent = widthPixels / Math.max(1, stageRect.width) * 100;
    const heightPercent = heightPixels / Math.max(1, stageRect.height) * 100;
    let latestPatch: Partial<SubtitleStyle> = {};
    let latestPointer = { x: pointerStartX, y: pointerStartY };
    let animationFrame = 0;
    let moved = false;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = action === "move"
      ? "grabbing"
      : action.endsWith("-e") || action.endsWith("-w") ? "ew-resize"
        : action.endsWith("nw") || action.endsWith("se") ? "nwse-resize" : "nesw-resize";

    const paint = (patch: Partial<SubtitleStyle>) => {
      const next = readSubtitleStyle({ ...style, ...patch });
      element.style.left = `${next.x}%`;
      element.style.top = `${next.position}%`;
      element.style.width = `${next.width}%`;
      element.style.transform = "translate3d(-50%, -50%, 0)";
      element.style.fontSize = `${Math.max(10, next.fontSize / Math.max(1, videoSize.height) * stageRect.height)}px`;
    };

    const updatePosition = (clientX: number, clientY: number) => {
      if (Math.hypot(clientX - pointerStartX, clientY - pointerStartY) < 2) return;
      if (action === "move") {
        const snapped = snapCanvasPosition(
          (clientX - grabOffsetX - stageRect.left) / Math.max(1, stageRect.width) * 100,
          (clientY - grabOffsetY - stageRect.top) / Math.max(1, stageRect.height) * 100,
          widthPercent,
          heightPercent,
          stageRect.width,
          stageRect.height
        );
        paintCanvasSnapGuides(snapped.verticalGuide, snapped.horizontalGuide);
        latestPatch = { x: snapped.x, position: snapped.y };
      } else {
        const handle = action.slice("resize-".length) as SubtitleResizeHandle;
        const horizontalDirection = handle.includes("e") ? 1 : -1;
        if (handle === "e" || handle === "w") {
          const nextWidthPixels = clampValue(
            widthPixels + horizontalDirection * (clientX - pointerStartX),
            stageRect.width * 0.05,
            stageRect.width
          );
          const nextCenterX = centerX + horizontalDirection * (nextWidthPixels - widthPixels) / 2;
          const nextWidth = nextWidthPixels / Math.max(1, stageRect.width) * 100;
          const snapped = snapCanvasPosition(
            (nextCenterX - stageRect.left) / Math.max(1, stageRect.width) * 100,
            style.position,
            nextWidth,
            heightPercent,
            stageRect.width,
            stageRect.height
          );
          paintCanvasSnapGuides(snapped.verticalGuide, snapped.horizontalGuide);
          latestPatch = { x: snapped.x, position: snapped.y, width: nextWidth };
          moved = true;
          paint(latestPatch);
          return;
        }
        const verticalDirection = handle.includes("s") ? 1 : -1;
        const anchorX = centerX - horizontalDirection * widthPixels / 2;
        const anchorY = centerY - verticalDirection * heightPixels / 2;
        const initialVectorX = pointerStartX - anchorX;
        const initialVectorY = pointerStartY - anchorY;
        const pointerVectorX = clientX - anchorX;
        const pointerVectorY = clientY - anchorY;
        const vectorLengthSquared = Math.max(1, initialVectorX * initialVectorX + initialVectorY * initialVectorY);
        const requestedScale = (pointerVectorX * initialVectorX + pointerVectorY * initialVectorY) / vectorLengthSquared;
        const nextFontSize = clampValue(style.fontSize * requestedScale, 12, 160);
        const scale = nextFontSize / Math.max(1, style.fontSize);
        const nextCenterX = anchorX + horizontalDirection * widthPixels * scale / 2;
        const nextCenterY = anchorY + verticalDirection * heightPixels * scale / 2;
        const snapped = snapCanvasPosition(
          (nextCenterX - stageRect.left) / Math.max(1, stageRect.width) * 100,
          (nextCenterY - stageRect.top) / Math.max(1, stageRect.height) * 100,
          widthPercent * scale,
          heightPercent * scale,
          stageRect.width,
          stageRect.height
        );
        paintCanvasSnapGuides(snapped.verticalGuide, snapped.horizontalGuide);
        latestPatch = {
          x: snapped.x,
          position: snapped.y,
          width: clampValue(style.width * scale, 5, 100),
          fontSize: nextFontSize
        };
      }
      moved = true;
      paint(latestPatch);
    };

    const handleMove = (moveEvent: PointerEvent) => {
      latestPointer = { x: moveEvent.clientX, y: moveEvent.clientY };
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        updatePosition(latestPointer.x, latestPointer.y);
      });
    };
    const handleUp = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        updatePosition(latestPointer.x, latestPointer.y);
      }
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      clearCanvasSnapGuides();
      if (!moved) return;
      const nextStyle = readSubtitleStyle({ ...track.style, ...latestPatch });
      commitSubtitleTracks(subtitleTracksRef.current.map((item) => item.id === track.id
        ? { ...item, style: nextStyle }
        : item));
      setSubtitlePreferences((current) => ({ ...current, style: nextStyle }));
      pushEditorHistory(historySnapshot);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleUp, { once: true });
  };

  const beginSubtitlePropertyEdit = () => {
    if (!subtitlePropertyHistoryRef.current) subtitlePropertyHistoryRef.current = captureEditorSnapshot();
  };

  const finishSubtitlePropertyEdit = () => {
    const historySnapshot = subtitlePropertyHistoryRef.current;
    subtitlePropertyHistoryRef.current = null;
    if (historySnapshot) pushEditorHistory(historySnapshot);
  };

  const importSubtitleFile = async (file: File) => {
    try {
      const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      const cues = parseSubtitleText(await file.text(), extension);
      if (!cues.length) throw new Error("没有读取到有效的字幕时间码");
      const historySnapshot = captureEditorSnapshot();
      const track: EditorSubtitleTrack = {
        id: createEditorId("subtitle-track"),
        laneId: createEditorId("subtitle-lane"),
        name: file.name.replace(/\.[^.]+$/, "") || "导入字幕",
        language: "und",
        enabled: true,
        sourceId: `subtitle-file:${file.name}`,
        style: { ...subtitlePreferences.style },
        cues: cues.map((cue) => ({ ...cue, id: createEditorId("subtitle-cue") }))
      };
      commitSubtitleTracks([...subtitleTracksRef.current, track]);
      placeSubtitleLaneAboveSource(track.laneId);
      selectAllSubtitleCues(track.id);
      pushEditorHistory(historySnapshot);
    } catch (importError) {
      notify({
        type: "error",
        title: "字幕导入失败",
        message: importError instanceof Error ? importError.message : "无法读取字幕文件"
      });
    }
  };

  const runSubtitleTranscription = async (requestedSourceId: string) => {
    const source = subtitleRecognitionSources.find((item) => item.id === requestedSourceId);
    if (!source || taskRunning) return;
    let engineStatus = subtitleEngineStatus;
    if (!engineStatus || engineStatus.model !== "large-v3-turbo") {
      setSubtitleEngineStatusLoading(true);
      try {
        engineStatus = await getSubtitleEngineStatus("high");
        setSubtitleEngineStatus(engineStatus);
      } catch (statusError) {
        engineStatus = { available: false, modelReady: false, message: statusError instanceof Error ? statusError.message : "字幕识别引擎不可用" };
        setSubtitleEngineStatus(engineStatus);
      } finally {
        setSubtitleEngineStatusLoading(false);
      }
    }
    if (!engineStatus?.available) {
      notify({ type: "error", title: "字幕识别不可用", message: engineStatus?.message || "请先安装本地字幕识别引擎" });
      setInspectorTab("subtitles");
      return;
    }

    const historySnapshot = captureEditorSnapshot();
    const nextTaskId = createVideoTaskId();
    const controller = new AbortController();
    abortRef.current = controller;
    setTaskId(nextTaskId);
    setStatus("transcribing");
    setError("");
    setProgress({ percent: 1, label: "上传识别素材", detail: source.label });
    const taskWatcher = watchVideoTask(nextTaskId, (info) => {
      if (["transcribing", "transcribed", "failed", "cancelled"].includes(info.status)) {
        setProgress({
          percent: clampPercent(info.progress),
          label: info.stage || "识别字幕",
          detail: info.message || "正在生成字幕时间轴"
        });
      }
    });
    try {
      const response = await transcribeSubtitles(nextTaskId, source.file, {
        language: subtitlePreferences.language,
        quality: "high",
        sourceStart: source.sourceStart,
        sourceEnd: source.sourceEnd,
        maxCharsPerLine: 60,
        maxLines: 3,
        hotwords: []
      }, controller.signal, (fraction) => {
        setProgress((current) => current.percent > 10 ? current : {
          percent: Math.max(1, Math.round(fraction * 10)),
          label: "上传识别素材",
          detail: `${source.label} · ${Math.round(fraction * 100)}%`
        });
      });
      if (!response.cues.length) {
        setStatus("done");
        setProgress({ percent: 100, label: "识别完成", detail: "所选范围内没有识别到清晰人声" });
        notify({ type: "warning", title: "未识别到字幕", message: "可以检查音轨内容或切换识别语言后重试" });
        return;
      }
      const cues = response.cues.map((cue) => ({
        ...cue,
        id: createEditorId("subtitle-cue"),
        start: source.timelineStart + cue.start,
        end: source.timelineStart + cue.end,
        text: normalizeRecognizedSubtitleText(cue.text),
        words: cue.words?.map((word) => ({
          ...word,
          start: source.timelineStart + word.start,
          end: source.timelineStart + word.end
        }))
      }));
      const existing = subtitleTracksRef.current.find((track) =>
        source.linkedVideoClipId ? track.linkedVideoClipId === source.linkedVideoClipId : track.linkedAudioTrackId === source.linkedAudioTrackId
      );
      const track: EditorSubtitleTrack = {
        id: existing?.id || createEditorId("subtitle-track"),
        laneId: existing?.laneId || createEditorId("subtitle-lane"),
        name: existing?.name || `${source.label.split(" (")[0]} 字幕`,
        language: response.language || subtitlePreferences.language,
        enabled: true,
        sourceId: source.id,
        linkedVideoClipId: source.linkedVideoClipId,
        linkedAudioTrackId: source.linkedAudioTrackId,
        style: existing ? { ...existing.style } : { ...subtitlePreferences.style },
        cues
      };
      const nextTracks = existing
        ? subtitleTracksRef.current.map((item) => item.id === existing.id ? track : item)
        : [...subtitleTracksRef.current, track];
      commitSubtitleTracks(nextTracks);
      if (!existing) placeSubtitleLaneAboveSource(track.laneId, source.laneId);
      selectAllSubtitleCues(track.id);
      setSubtitleEngineStatus((current) => ({
        ...(current || { available: true, modelReady: true }),
        available: true,
        modelReady: true,
        engine: response.engine,
        model: response.model,
        device: response.device,
        message: `已就绪 · ${response.model}`
      }));
      setStatus("done");
      setProgress({ percent: 100, label: "字幕识别完成", detail: `${cues.length} 条字幕已对齐到时间轴` });
      pushEditorHistory(historySnapshot);
    } catch (transcribeError) {
      const cancelled = controller.signal.aborted;
      const message = transcribeError instanceof Error ? transcribeError.message : "字幕识别失败";
      setStatus(cancelled ? "cancelled" : "error");
      setError(cancelled ? "" : message);
      setProgress({ percent: 0, label: cancelled ? "已取消" : "字幕识别失败", detail: cancelled ? "字幕识别已停止" : message });
      if (!cancelled) notify({ type: "error", title: "字幕识别失败", message });
    } finally {
      taskWatcher.close();
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const startSubtitleCueTimelineDrag = (
    event: ReactPointerEvent<HTMLElement>,
    track: EditorSubtitleTrack,
    cue: SubtitleCue,
    action: "move" | "trim-start" | "trim-end"
  ) => {
    if (event.button !== 0 || taskRunning) return;
    event.preventDefault();
    event.stopPropagation();
    const row = event.currentTarget.closest(".lossless-media-track-row") as HTMLElement | null;
    if (!row) return;
    const historySnapshot = captureEditorSnapshot();
    const playheadLock = action === "move" ? lockTimelinePlayheadForMaterialDrag() : null;
    const pointerStart = event.clientX;
    const originalStart = cue.start;
    const originalEnd = cue.end;
    const duration = originalEnd - originalStart;
    const bounds = subtitleCueLaneBounds(track, cue.id, projectVideoDuration);
    const clipElement = event.currentTarget.closest(".lossless-media-track-clip") as HTMLElement | null;
    let moved = false;
    clipElement?.classList.add("is-dragging", action === "move" ? "is-moving" : "is-trimming");
    selectSubtitleCue(track.id, cue.id, false);
    const handleMove = (moveEvent: PointerEvent) => {
      const delta = ((moveEvent.clientX - pointerStart) / Math.max(1, row.getBoundingClientRect().width)) * timelineDisplayDuration;
      if (Math.abs(moveEvent.clientX - pointerStart) > 2) {
        moved = true;
        trackDragMovedRef.current = true;
      }
      let start = originalStart;
      let end = originalEnd;
      if (action === "move") {
        const preferredStart = roundTimelineFrame(originalStart + delta);
        const availableStart = findNearestAvailableClipStart(
          track.cues.filter((itemCue) => itemCue.id !== cue.id),
          preferredStart,
          duration,
          Math.max(projectVideoDuration, originalEnd),
          Math.sign(delta)
        );
        if (availableStart === undefined) return;
        start = roundTimelineFrame(availableStart);
        end = start + duration;
      } else if (action === "trim-start") {
        start = clampValue(roundTimelineFrame(originalStart + delta), bounds.minimumStart, originalEnd - minimumTimelineClipDuration);
      } else {
        end = clampValue(roundTimelineFrame(originalEnd + delta), originalStart + minimumTimelineClipDuration, bounds.maximumEnd);
      }
      const nextTracks = subtitleTracksRef.current.map((item) => item.id === track.id ? {
        ...item,
        cues: item.cues.map((itemCue) => itemCue.id === cue.id ? { ...itemCue, start, end } : itemCue)
      } : item);
      commitSubtitleTracks(nextTracks);
    };
    const finish = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
      clipElement?.classList.remove("is-dragging", "is-moving", "is-trimming");
      releaseTimelinePlayheadAfterMaterialDrag(playheadLock);
      if (moved) pushEditorHistory(historySnapshot);
      window.setTimeout(() => {
        trackDragMovedRef.current = false;
      }, 120);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    window.addEventListener("blur", finish, { once: true });
  };

  const changeProjectAspect = (preset: ProjectAspectPreset) => {
    const nextSize = preset === "source"
      ? projectSourceSize
      : calculateProjectCanvasSize(projectSourceSize, projectAspectRatios[preset]);
    if (
      preset === projectAspectPreset
      && Math.abs(nextSize.width - videoSize.width) < 1
      && Math.abs(nextSize.height - videoSize.height) < 1
    ) return;
    const historySnapshot = captureEditorSnapshot();
    const nextAspectRatio = nextSize.width / Math.max(1, nextSize.height);
    const nextTracks = tracksRef.current.map((track) => track.type === "image"
      ? resizeImageTrackForProjectAspect(track, nextAspectRatio)
      : track);
    const nextVideoClips = videoClipsRef.current.map((clip) => {
      const source = videoSourcesRef.current.find((item) => item.id === clip.sourceId);
      if (!source) return clip;
      const sourceSize = { width: source.width, height: source.height };
      return {
        ...clip,
        transform: clip.transform?.customized
          ? normalizeVideoTransform(clip.transform)
          : createDefaultVideoTransform(sourceSize, nextSize)
      };
    });
    tracksRef.current = nextTracks;
    videoClipsRef.current = nextVideoClips;
    setTracks(nextTracks);
    setVideoClips(nextVideoClips);
    setProjectAspectPreset(preset);
    setVideoSize(nextSize);
    pushHistoryEntry({ kind: "editor", snapshot: cloneEditorSnapshot(historySnapshot) });
  };

  const undoEdit = () => {
    if (taskRunning) return;
    const previous = editUndoRef.current.pop();
    if (!previous) return;
    if (previous.kind === "editor") {
      editRedoRef.current.push({ kind: "editor", snapshot: captureEditorSnapshot() });
      restoreEditorSnapshot(previous.snapshot);
    } else {
      editRedoRef.current.push({ kind: "selection", values: segments.map((segment) => segment.deleteSecond) });
      setSegments((current) => current.map((segment, index) => ({ ...segment, deleteSecond: previous.values[index] ?? segment.deleteSecond })));
    }
    setHistoryVersion((value) => value + 1);
  };

  const redoEdit = () => {
    if (taskRunning) return;
    const next = editRedoRef.current.pop();
    if (!next) return;
    if (next.kind === "editor") {
      editUndoRef.current.push({ kind: "editor", snapshot: captureEditorSnapshot() });
      restoreEditorSnapshot(next.snapshot);
    } else {
      editUndoRef.current.push({ kind: "selection", values: segments.map((segment) => segment.deleteSecond) });
      setSegments((current) => current.map((segment, index) => ({ ...segment, deleteSecond: next.values[index] ?? segment.deleteSecond })));
    }
    setHistoryVersion((value) => value + 1);
  };

  const pickResourceFiles = () => resourceInputRef.current?.click();

  const selectImportedResource = (resourceId: string) => {
    setSelectedResourceId(resourceId);
    setSelectedVideoClipId("");
    setSelectedTrackId("");
    setSelectedEffectId("");
    setSelectedLaneId("");
    setSelectedKeyframeId("");
    setInspectorTab("tracks");
  };

  const applyPrimaryAudioPeaks = (requestedPeaks?: number[]) => {
    const audioPeaks = normalizeAudioPeaks(requestedPeaks);
    if (audioPeaks.length < 2) return;
    const primarySource = videoSourcesRef.current.find((source) => source.primary)
      || videoSourcesRef.current.find((source) => source.file === videoFile);
    if (!primarySource) return;
    const nextSources = videoSourcesRef.current.map((source) => source.id === primarySource.id
      ? { ...source, hasAudio: true, audioPeaks }
      : source);
    videoSourcesRef.current = nextSources;
    setVideoSources(nextSources);
  };

  const acceptVideoTracks = async (files: File[]) => {
    const existingFiles = new Set([
      ...videoSourcesRef.current.map((source) => mediaFileIdentity(source.file)),
      ...mediaResourcesRef.current.map((resource) => mediaFileIdentity(resource.file))
    ]);
    const validFiles = files.filter((file) => isVideoFile(file) && !existingFiles.has(mediaFileIdentity(file)));
    if (!validFiles.length) return;
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
        hasAudio: metadata.hasAudio,
        audioPeaks: createAudioPresencePeaks(mediaFileIdentity(file)),
        primary: false
      } satisfies VideoEditorSource;
    }));
    const usableSources = loadedSources.filter((source) => {
      if (source.duration > 0.05) return true;
      URL.revokeObjectURL(source.previewUrl);
      notify({ type: "error", title: "无法读取视频素材", message: source.name });
      return false;
    });
    if (!usableSources.length) return;
    const nextSources = [...videoSourcesRef.current, ...usableSources];
    videoSourcesRef.current = nextSources;
    setVideoSources(nextSources);
    selectImportedResource(usableSources[usableSources.length - 1].id);
  };

  const splitVideoClipAtTime = (
    clip: VideoEditorClip,
    requestedTime: number,
    options: { selectRight?: boolean } = {}
  ) => {
    const historySnapshot = captureEditorSnapshot();
    const splitTime = roundTimelineFrame(clampValue(requestedTime, clip.start, clip.end));
    if (splitTime <= clip.start + 1 / timelineFps || splitTime >= clip.end - 1 / timelineFps) return false;
    const sourceSplitTime = clip.sourceStart + splitTime - clip.start;
    const sourceMin = clip.sourceMin ?? clip.sourceStart;
    const sourceMax = clip.sourceMax ?? clip.sourceEnd;
    const rightClip: VideoEditorClip = {
      ...cloneVideoEditorClip(clip),
      id: createEditorId("video-clip"),
      start: splitTime,
      sourceStart: sourceSplitTime,
      sourceMin: sourceSplitTime,
      sourceMax
    };
    const nextClips = videoClipsRef.current
      .flatMap((item) => item.id === clip.id
        ? [{ ...cloneVideoEditorClip(item), end: splitTime, sourceEnd: sourceSplitTime, sourceMin, sourceMax: sourceSplitTime }, rightClip]
        : [item])
      .sort((left, right) => left.start - right.start);
    videoClipsRef.current = nextClips;
    setVideoClips(nextClips);
    if (subtitleTracksRef.current.some((track) => track.linkedVideoClipId === clip.id)) {
      commitSubtitleTracks(subtitleTracksRef.current.map((track) => track.linkedVideoClipId === clip.id
        ? { ...track, linkedVideoClipId: undefined }
        : track));
    }
    setSelectedVideoClipId(options.selectRight === false ? clip.id : rightClip.id);
    setSelectedTrackId("");
    setSelectedLaneId(clip.laneId);
    pushEditorHistory(historySnapshot);
    resetResult();
    seekPreview(splitTime, false, false);
    return true;
  };

  const splitAudioTrackAtTime = (
    track: AudioEditorTrack,
    requestedTime: number,
    options: { selectRight?: boolean } = {}
  ) => {
    const splitTime = roundTimelineFrame(clampValue(requestedTime, track.start, track.end));
    if (
      splitTime <= track.start + minimumTimelineClipDuration
      || splitTime >= track.end - minimumTimelineClipDuration
    ) return false;

    const historySnapshot = captureEditorSnapshot();
    const sourceSplitTime = track.loop
      ? track.sourceStart
      : clampValue(track.sourceStart + splitTime - track.start, track.sourceStart, track.sourceEnd);
    const leftTrack: AudioEditorTrack = {
      ...cloneEditorTrack(track) as AudioEditorTrack,
      end: splitTime,
      sourceEnd: track.loop ? track.sourceEnd : sourceSplitTime,
      fadeOut: 0
    };
    const rightTrack: AudioEditorTrack = {
      ...cloneEditorTrack(track) as AudioEditorTrack,
      id: createEditorId("audio-track"),
      start: splitTime,
      sourceStart: sourceSplitTime,
      fadeIn: 0
    };
    const nextTracks = tracksRef.current.flatMap((item) => item.id === track.id
      ? [leftTrack, rightTrack]
      : [item]);
    tracksRef.current = nextTracks;
    setTracks(nextTracks);
    if (subtitleTracksRef.current.some((subtitleTrack) => subtitleTrack.linkedAudioTrackId === track.id)) {
      commitSubtitleTracks(subtitleTracksRef.current.map((subtitleTrack) => subtitleTrack.linkedAudioTrackId === track.id
        ? { ...subtitleTrack, linkedAudioTrackId: undefined }
        : subtitleTrack));
    }
    setSelectedVideoClipId("");
    setSelectedTrackId(options.selectRight === false ? track.id : rightTrack.id);
    setSelectedLaneId(getTrackLaneId(track));
    setSelectedKeyframeId("");
    pushEditorHistory(historySnapshot);
    resetResult();
    seekPreview(splitTime, false, false);
    return true;
  };

  const splitSelectedTimelineMaterial = () => {
    const audioTrack = tracksRef.current.find((item): item is AudioEditorTrack => item.id === selectedTrackId && item.type === "audio");
    if (audioTrack) {
      splitAudioTrackAtTime(audioTrack, currentTime);
      return;
    }
    const clip = videoClipsRef.current.find((item) => item.id === selectedVideoClipId)
      || findVideoClipAtTime(videoClipsRef.current, currentTime);
    if (!clip) return;
    splitVideoClipAtTime(clip, currentTime);
  };

  const separateVideoClipAudio = (clipId: string) => {
    if (taskRunning) return;
    const clip = videoClipsRef.current.find((item) => item.id === clipId);
    const source = videoSourcesRef.current.find((item) => item.id === clip?.sourceId);
    if (!clip || !source?.hasAudio || clip.audioDetached) return;
    if (tracksRef.current.some((track) => track.type === "audio" && track.detachedFromVideoClipId === clip.id)) return;

    const historySnapshot = captureEditorSnapshot();
    const resourceName = `${source.name.replace(/\.[^.]+$/, "")} - 分离音频`;
    let audioResource = mediaResourcesRef.current.find(
      (resource): resource is ImportedAudioResource => resource.type === "audio" && resource.detachedFromVideoSourceId === source.id
    );
    if (!audioResource) {
      audioResource = {
        id: createEditorId("audio-source"),
        type: "audio",
        name: resourceName,
        file: source.file,
        previewUrl: URL.createObjectURL(source.file),
        duration: source.duration,
        audioPeaks: [...source.audioPeaks],
        detachedFromVideoSourceId: source.id
      };
      const nextResources = [...mediaResourcesRef.current, audioResource];
      mediaResourcesRef.current = nextResources;
      setMediaResources(nextResources);
    }

    const laneId = createEditorId("audio-lane");
    const trackId = createEditorId("audio");
    const track: AudioEditorTrack = {
      id: trackId,
      sourceId: audioResource.id,
      laneId,
      type: "audio",
      name: resourceName,
      file: source.file,
      previewUrl: URL.createObjectURL(source.file),
      sourceDuration: source.duration,
      sourceStart: clip.sourceStart,
      sourceEnd: clip.sourceEnd,
      audioPeaks: [...source.audioPeaks],
      detachedFromVideoClipId: clip.id,
      sourceVideoSourceId: source.id,
      start: clip.start,
      end: clip.end,
      enabled: true,
      volume: clampValue(readVideoClipVolume(clip) || 1, 0, 2),
      fadeIn: 0,
      fadeOut: 0,
      loop: false
    };
    const nextTracks = [...tracksRef.current, track];
    const nextVideoClips = videoClipsRef.current.map((item) => item.id === clip.id
      ? { ...item, volume: 0, audioDetached: true }
      : item);
    tracksRef.current = nextTracks;
    videoClipsRef.current = nextVideoClips;
    setTracks(nextTracks);
    setVideoClips(nextVideoClips);

    const mergedLaneOrder = mergeTimelineLaneOrder(
      timelineLaneOrderRef.current,
      nextVideoClips,
      nextTracks,
      effectsRef.current,
      subtitleTracksRef.current
    ).filter((item) => item !== laneId);
    const videoLaneIndex = mergedLaneOrder.indexOf(clip.laneId);
    mergedLaneOrder.splice(videoLaneIndex >= 0 ? videoLaneIndex + 1 : mergedLaneOrder.length, 0, laneId);
    timelineLaneOrderRef.current = mergedLaneOrder;
    setTimelineLaneOrder(mergedLaneOrder);

    setSelectedResourceId("");
    setSelectedVideoClipId("");
    setSelectedTrackId(trackId);
    setSelectedEffectId("");
    setSelectedLaneId(laneId);
    setSelectedKeyframeId("");
    setInspectorTab("tracks");
    pushEditorHistory(historySnapshot);
    resetResult();
    seekPreview(currentTimeRef.current, false, false);
  };

  const removeBgmFromTimelineMaterial = async (target: { kind: "video"; id: string } | { kind: "audio"; id: string }) => {
    if (taskRunning) return;
    const videoClip = target.kind === "video" ? videoClipsRef.current.find((clip) => clip.id === target.id) : undefined;
    const videoSource = videoClip ? videoSourcesRef.current.find((source) => source.id === videoClip.sourceId) : undefined;
    const audioTrack = target.kind === "audio"
      ? tracksRef.current.find((track): track is AudioEditorTrack => track.id === target.id && track.type === "audio")
      : undefined;
    if (target.kind === "video" && (!videoClip || !videoSource?.hasAudio || videoClip.audioDetached)) return;
    if (target.kind === "audio" && !audioTrack) return;

    const sourceFile = videoSource?.file || audioTrack!.file;
    const sourceStart = videoClip?.sourceStart ?? audioTrack!.sourceStart;
    const sourceEnd = videoClip?.sourceEnd ?? audioTrack!.sourceEnd;
    const sourceName = videoClip?.name || audioTrack!.name;
    const historySnapshot = captureEditorSnapshot();
    const nextTaskId = createVideoTaskId();
    setTaskId(nextTaskId);
    setStatus("separating");
    setError("");
    setProgress({ percent: 1, label: "上传声音素材", detail: `正在准备 ${sourceName}` });
    abortRef.current = new AbortController();
    const taskWatcher = watchVideoTask(nextTaskId, (info) => {
      if (info.status === "failed") {
        setError(info.message || "去除 BGM 失败");
      }
      setProgress({
        percent: clampPercent(info.progress),
        label: info.stage || "去除 BGM",
        detail: info.message || "正在处理声音素材"
      });
    });

    try {
      let engineStatus = audioSeparationStatus;
      if (!engineStatus?.available) {
        engineStatus = await getAudioSeparationStatus(audioSeparation.quality, audioSeparation.mode);
        setAudioSeparationStatus(engineStatus);
      }
      if (!engineStatus.available) throw new Error(engineStatus.message || "声音处理引擎不可用");
      const response = await applyAudioSeparationToAsset(
        nextTaskId,
        sourceFile,
        {
          ...audioSeparation,
          enabled: true,
          sourceStart,
          sourceEnd,
          outputName: sourceName
        },
        abortRef.current.signal,
        (fraction) => setProgress((current) => current.percent > 8 ? current : {
          percent: 1 + Math.round(fraction * 7),
          label: "上传声音素材",
          detail: `正在上传 ${Math.round(fraction * 100)}%`
        })
      );
      setProgress({ percent: 98, label: "载入处理音轨", detail: "正在把去除 BGM 的结果加入时间轴" });
      const outputBlob = await downloadVideoOutputBlob(response.taskId || nextTaskId, abortRef.current.signal);
      const baseName = sourceName.replace(/\.[^.]+$/, "");
      const outputName = `${baseName} - 去除BGM.flac`;
      const outputFile = new File([outputBlob], outputName, { type: outputBlob.type || "audio/flac", lastModified: Date.now() });
      const previewUrl = URL.createObjectURL(outputFile);
      const outputDuration = Math.max(minimumTimelineClipDuration, response.duration || sourceEnd - sourceStart);
      const resourceId = createEditorId("audio-source");
      const outputPeaks = createAudioPresencePeaks(mediaFileIdentity(outputFile));
      const outputResource: ImportedAudioResource = {
        id: resourceId,
        type: "audio",
        name: outputName,
        file: outputFile,
        previewUrl,
        duration: outputDuration,
        audioPeaks: outputPeaks
      };
      const nextResources = [...mediaResourcesRef.current, outputResource];
      mediaResourcesRef.current = nextResources;
      setMediaResources(nextResources);

      if (videoClip) {
        const currentClip = videoClipsRef.current.find((clip) => clip.id === videoClip.id);
        if (!currentClip) throw new Error("视频素材已不存在，请重新处理");
        const clipDuration = currentClip.end - currentClip.start;
        const trackDuration = Math.min(clipDuration, outputDuration);
        const laneId = createEditorId("audio-lane");
        const trackId = createEditorId("audio");
        const processedTrack: AudioEditorTrack = {
          id: trackId,
          sourceId: resourceId,
          laneId,
          type: "audio",
          name: outputName,
          file: outputFile,
          previewUrl,
          sourceDuration: outputDuration,
          sourceStart: 0,
          sourceEnd: trackDuration,
          audioPeaks: outputPeaks,
          start: currentClip.start,
          end: currentClip.start + trackDuration,
          enabled: true,
          volume: readVideoClipVolume(currentClip),
          fadeIn: 0,
          fadeOut: 0,
          loop: false
        };
        const nextTracks = [...tracksRef.current, processedTrack];
        const nextVideoClips = videoClipsRef.current.map((clip) => clip.id === currentClip.id
          ? { ...clip, volume: 0, audioDetached: true }
          : clip);
        tracksRef.current = nextTracks;
        videoClipsRef.current = nextVideoClips;
        setTracks(nextTracks);
        setVideoClips(nextVideoClips);
        const nextLaneOrder = mergeTimelineLaneOrder(
          timelineLaneOrderRef.current,
          nextVideoClips,
          nextTracks,
          effectsRef.current,
          subtitleTracksRef.current
        ).filter((lane) => lane !== laneId);
        const sourceLaneIndex = nextLaneOrder.indexOf(currentClip.laneId);
        nextLaneOrder.splice(sourceLaneIndex >= 0 ? sourceLaneIndex + 1 : nextLaneOrder.length, 0, laneId);
        timelineLaneOrderRef.current = nextLaneOrder;
        setTimelineLaneOrder(nextLaneOrder);
        setSelectedVideoClipId("");
        setSelectedTrackId(trackId);
        setSelectedLaneId(laneId);
      } else if (audioTrack) {
        const trackDuration = Math.min(audioTrack.end - audioTrack.start, outputDuration);
        const nextTracks = tracksRef.current.map((track) => track.id === audioTrack.id && track.type === "audio"
          ? {
              ...track,
              sourceId: resourceId,
              name: outputName,
              file: outputFile,
              previewUrl,
              sourceDuration: outputDuration,
              sourceStart: 0,
              sourceEnd: trackDuration,
              audioPeaks: outputPeaks,
              end: track.start + trackDuration,
              detachedFromVideoClipId: undefined,
              sourceVideoSourceId: undefined
            }
          : track);
        tracksRef.current = nextTracks;
        setTracks(nextTracks);
        setSelectedVideoClipId("");
        setSelectedTrackId(audioTrack.id);
        setSelectedLaneId(audioTrack.laneId);
      }

      setSelectedResourceId("");
      setSelectedEffectId("");
      setSelectedKeyframeId("");
      setInspectorTab("tracks");
      pushEditorHistory(historySnapshot);
      resetResult();
      setAudioSeparationStatus((current) => current ? {
        ...current,
        modelReady: true,
        dialogueReady: audioSeparation.mode === "dialogue" ? true : current.dialogueReady,
        message: response.message || current.message
      } : current);
      setStatus("done");
      setProgress({ percent: 100, label: "去除 BGM 完成", detail: `${outputName} 已加入时间轴` });
      window.requestAnimationFrame(() => seekPreview(currentTimeRef.current, false, false));
    } catch (processingError) {
      const cancelled = abortRef.current?.signal.aborted;
      const message = processingError instanceof Error ? processingError.message : "去除 BGM 失败";
      setStatus(cancelled ? "cancelled" : "error");
      setError(cancelled ? "" : message);
      setProgress({ percent: 0, label: cancelled ? "已取消" : "去除 BGM 失败", detail: cancelled ? "声音处理已停止" : message });
      if (!cancelled) notify({ type: "error", title: "去除 BGM 失败", message });
    } finally {
      taskWatcher.close();
      abortRef.current = null;
    }
  };

  const removeVideoClip = (clipId: string) => {
    const clip = videoClipsRef.current.find((item) => item.id === clipId);
    if (!clip) return;
    const historySnapshot = captureEditorSnapshot();
    const nextClips = videoClipsRef.current
      .filter((item) => item.id !== clip.id)
      .sort((left, right) => left.start - right.start);
    videoClipsRef.current = nextClips;
    setVideoClips(nextClips);
    commitSubtitleTracks(subtitleTracksRef.current.filter((track) => track.linkedVideoClipId !== clip.id));
    const nextLaneOrder = mergeTimelineLaneOrder(timelineLaneOrderRef.current, nextClips, tracksRef.current, effectsRef.current, subtitleTracksRef.current);
    timelineLaneOrderRef.current = nextLaneOrder;
    setTimelineLaneOrder(nextLaneOrder);
    setSelectedVideoClipId("");
    setSelectedKeyframeId("");
    if (activeVideoClipIdRef.current === clip.id) {
      videoRef.current?.pause();
      activeVideoClipIdRef.current = "";
      setActiveVideoClipId("");
    }
    pushEditorHistory(historySnapshot);
    resetResult();
    seekPreview(Math.min(currentTime, getTimelineProjectDuration(nextClips, tracksRef.current, subtitleTracksRef.current)), false);
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
    const requestedLaneType = timelineLanes.find((lane) => lane.id === requestedLaneId)?.type;
    let preferredLaneId =
      requestedLaneId && (!requestedLaneType || requestedLaneType === type)
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
      const sourceStart = item.type === "audio" ? clampValue(item.sourceStart ?? 0, 0, sourceDuration) : 0;
      const sourceEnd = item.type === "audio"
        ? clampValue(item.sourceEnd ?? sourceDuration, sourceStart, sourceDuration)
        : sourceDuration;
      const sourceRangeDuration = item.type === "audio" ? Math.max(0.05, sourceEnd - sourceStart) : sourceDuration;
      const availableFromInsertion = Number.isFinite(timelineEnd) ? Math.max(0.05, timelineEnd - insertionStart) : sourceDuration;
      const clipDuration = Math.max(0.05, Math.min(sourceRangeDuration, availableFromInsertion));
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
            name: item.name || item.file.name,
            file: item.file,
            previewUrl: item.previewUrl,
            sourceDuration: item.sourceDuration,
            sourceStart,
            sourceEnd: sourceStart + clipDuration,
            audioPeaks: normalizeAudioPeaks(item.audioPeaks),
            detachedFromVideoClipId: item.detachedFromVideoClipId,
            sourceVideoSourceId: item.sourceVideoSourceId,
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
      const sourceSize = { width: media[0].sourceWidth, height: media[0].sourceHeight };
      projectSourceInitializedRef.current = true;
      setProjectSourceSize(sourceSize);
      setVideoSize(projectAspectPreset === "source"
        ? sourceSize
        : calculateProjectCanvasSize(sourceSize, projectAspectRatios[projectAspectPreset]));
    }
    setTimelineLaneOrder((current) => mergeTimelineLaneOrder(current, videoClipsRef.current, nextTracks, effectsRef.current, subtitleTracksRef.current));
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
    if (!validFiles.length) return;
    const resources = await Promise.all(
      validFiles.map(async (file): Promise<ImportedAudioResource> => {
        const previewUrl = URL.createObjectURL(file);
        return {
          id: createEditorId("audio-source"),
          type: "audio",
          name: file.name,
          file,
          previewUrl,
          duration: await readAudioDuration(previewUrl),
          audioPeaks: createAudioPresencePeaks(mediaFileIdentity(file))
        };
      })
    );
    const nextResources = [...mediaResourcesRef.current, ...resources];
    mediaResourcesRef.current = nextResources;
    setMediaResources(nextResources);
    selectImportedResource(resources[resources.length - 1].id);
  };

  const acceptImageTracks = async (files: File[]) => {
    const existingFiles = new Set([
      ...videoSourcesRef.current.map((source) => mediaFileIdentity(source.file)),
      ...mediaResourcesRef.current.map((resource) => mediaFileIdentity(resource.file))
    ]);
    const validFiles = files.filter((file) => isImageFile(file) && !existingFiles.has(mediaFileIdentity(file)));
    if (!validFiles.length) return;
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
    selectImportedResource(resources[resources.length - 1].id);
  };

  const importResourceFiles = async (files: File[]) => {
    const videos = files.filter(isVideoFile);
    const audios = files.filter(isAudioFile);
    const images = files.filter(isImageFile);
    if (!videos.length && !audios.length && !images.length) {
      notify({ type: "error", title: "不支持这些文件", message: "请选择可读取的视频、音频或图片文件" });
      return;
    }
    const historySnapshot = captureEditorSnapshot();
    if (videos.length) await acceptVideoTracks(videos);
    if (audios.length) await acceptAudioTracks(audios);
    if (images.length) await acceptImageTracks(images);
    pushEditorHistory(historySnapshot);
  };

  const removeImportedResource = (resource: ImportedResource) => {
    if (taskRunning) return;
    const historySnapshot = captureEditorSnapshot();
    const removedVideoClips = videoClipsRef.current.filter((clip) => clip.sourceId === resource.id);
    const removedTracks = tracksRef.current.filter((track) => track.sourceId === resource.id);
    const removedVideoClipIds = new Set(removedVideoClips.map((clip) => clip.id));
    const removedTrackIds = new Set(removedTracks.map((track) => track.id));
    const nextClips = videoClipsRef.current.filter((clip) => clip.sourceId !== resource.id);
    const nextTracks = tracksRef.current.filter((track) => track.sourceId !== resource.id);
    removedTracks.forEach((track) => {
      audioPreviewRefs.current.get(track.id)?.pause();
      audioPreviewRefs.current.delete(track.id);
      imageOverlayRefs.current.delete(track.id);
    });
    videoClipsRef.current = nextClips;
    tracksRef.current = nextTracks;
    commitSubtitleTracks(subtitleTracksRef.current
      .filter((track) => !track.linkedVideoClipId || !removedVideoClipIds.has(track.linkedVideoClipId))
      .filter((track) => !track.linkedAudioTrackId || !removedTrackIds.has(track.linkedAudioTrackId)));
    setVideoClips(nextClips);
    setTracks(nextTracks);
    const nextLaneOrder = mergeTimelineLaneOrder(timelineLaneOrderRef.current, nextClips, nextTracks, effectsRef.current, subtitleTracksRef.current);
    timelineLaneOrderRef.current = nextLaneOrder;
    setTimelineLaneOrder(nextLaneOrder);
    setSelectedResourceId((current) => current === resource.id ? "" : current);
    if (removedVideoClips.some((clip) => clip.id === selectedVideoClipId)) setSelectedVideoClipId("");
    if (removedTracks.some((track) => track.id === selectedTrackId)) {
      setSelectedTrackId("");
      setSelectedKeyframeId("");
    }

    let nextSources = videoSourcesRef.current;
    if (resource.type === "video") {
      const remainingSources = videoSourcesRef.current.filter((source) => source.id !== resource.id);
      const nextPrimarySource = remainingSources.find((source) => source.primary)
        || remainingSources.find((source) => nextClips.some((clip) => clip.sourceId === source.id))
        || remainingSources[0];
      nextSources = remainingSources.map((source) => ({ ...source, primary: source.id === nextPrimarySource?.id }));
      videoSourcesRef.current = nextSources;
      setVideoSources(nextSources);
      setVideoFile(nextPrimarySource?.file || null);
      setVideoInput(nextPrimarySource ? createInputFromFile(nextPrimarySource.file) : null);
      setDuration(nextPrimarySource?.duration || 0);
    } else {
      const nextResources = mediaResourcesRef.current.filter((item) => item.id !== resource.id);
      mediaResourcesRef.current = nextResources;
      setMediaResources(nextResources);
    }

    const nextProjectDuration = getTimelineProjectDuration(nextClips, nextTracks, subtitleTracksRef.current);
    const nextTime = Math.min(currentTimeRef.current, nextProjectDuration);
    const nextActiveClip = findVideoClipAtTime(nextClips, nextTime, nextLaneOrder);
    const nextPrimarySource = nextSources.find((source) => source.primary);
    const nextPreviewSource = nextSources.find((source) => source.id === nextActiveClip?.sourceId) || nextPrimarySource;
    videoRef.current?.pause();
    activeVideoClipIdRef.current = nextActiveClip?.id || "";
    setActiveVideoClipId(nextActiveClip?.id || "");
    setPreviewUrl(nextPreviewSource?.previewUrl || "");
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
    pushEditorHistory(historySnapshot);
    resetResult();
    seekPreview(nextTime, false, false);
  };

  const showMediaContextMenu = (event: ReactMouseEvent<HTMLElement>, target: MediaContextMenu["target"]) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 120;
    const menuHeight = target.kind === "video-clip" ? 160 : target.kind === "track" ? 130 : target.kind === "subtitle-cue" ? 102 : 66;
    setMediaContextMenu({
      x: clampValue(event.clientX, 6, Math.max(6, window.innerWidth - menuWidth - 6)),
      y: clampValue(event.clientY, 6, Math.max(6, window.innerHeight - menuHeight - 6)),
      target
    });
  };

  const insertVideoResourceOnTimeline = (source: VideoEditorSource, requestedTime: number, requestedLaneId = "") => {
    if (source.duration <= 0.05) {
      notify({ type: "error", title: "视频资源时长无效", message: source.name });
      return;
    }
    const startsVisualProject = !videoClipsRef.current.length && !tracksRef.current.some((track) => track.type === "image");
    const sourceSize = { width: source.width, height: source.height };
    const targetCanvasSize = startsVisualProject
      ? projectAspectPreset === "source"
        ? sourceSize
        : calculateProjectCanvasSize(sourceSize, projectAspectRatios[projectAspectPreset])
      : videoSize;
    if (startsVisualProject) {
      projectSourceInitializedRef.current = true;
      setProjectSourceSize(sourceSize);
      setVideoSize(targetCanvasSize);
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
    }

    const insertionTime = Math.max(0, requestedTime);
    const insertionDuration = source.duration;
    const videoLaneIds = Array.from(new Set(videoClipsRef.current.map((clip) => clip.laneId)));
    const selectedLaneIsVideo = videoClipsRef.current.some((clip) => clip.laneId === selectedLaneId);
    const requestedLaneType = timelineLanes.find((lane) => lane.id === requestedLaneId)?.type;
    const requestedLaneIsVideo = Boolean(requestedLaneId && (!requestedLaneType || requestedLaneType === "video"));
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
      sourceEnd: insertionDuration,
      sourceMin: 0,
      sourceMax: insertionDuration,
      volume: 1,
      transform: createDefaultVideoTransform(sourceSize, targetCanvasSize)
    };
    const nextClips = [...videoClipsRef.current, insertedClip].sort((left, right) => left.start - right.start);
    videoClipsRef.current = nextClips;
    setVideoClips(nextClips);
    setTimelineLaneOrder((current) => mergeTimelineLaneOrder(current, nextClips, tracksRef.current, effectsRef.current, subtitleTracksRef.current));
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

  const addImportedResourceToTimeline = (
    resourceId: string,
    requestedTime = currentTime,
    requestedLaneId = "",
    previousSnapshot?: EditorHistorySnapshot
  ) => {
    const resource = importedResources.find((item) => item.id === resourceId);
    if (!resource) return;
    const historySnapshot = previousSnapshot || captureEditorSnapshot();
    if (resource.type === "video") {
      insertVideoResourceOnTimeline(resource, requestedTime, requestedLaneId);
      pushEditorHistory(historySnapshot);
      return;
    }
    const clipPreviewUrl = URL.createObjectURL(resource.file);
    appendMediaClips([
      resource.type === "audio"
        ? {
            type: "audio",
            sourceId: resource.id,
            name: resource.name,
            file: resource.file,
            previewUrl: clipPreviewUrl,
            sourceDuration: resource.duration,
            sourceStart: 0,
            sourceEnd: resource.duration,
            audioPeaks: resource.audioPeaks,
            sourceVideoSourceId: resource.detachedFromVideoSourceId
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
    pushEditorHistory(historySnapshot);
  };

  const handleResourceBinDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setResourceDropActive(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length) void importResourceFiles(files);
  };

  const updateEffectDropPreview = (target: HTMLElement, clientX: number, kind: VideoEffectKind) => {
    const rect = target.getBoundingClientRect();
    const requestedStart = ((clientX - rect.left) / Math.max(1, rect.width)) * timelineDisplayDuration;
    const preview = resolveEffectDropSlot(
      effectsRef.current.filter((effect) => (effect.laneId || effectLaneId) === effectLaneId),
      kind,
      requestedStart,
      projectVideoDuration
    );
    setEffectDropPreview((current) => current
      && current.kind === preview.kind
      && Math.abs(current.start - preview.start) < 0.0005
      && Math.abs(current.end - preview.end) < 0.0005
      && current.valid === preview.valid
      ? current
      : preview);
    return preview;
  };

  const clearEffectDrag = () => {
    draggedEffectKindRef.current = null;
    setEffectDropPreview(null);
    markTimelineLaneDropTarget();
  };

  const handleTimelineDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const requestedEffectKind = event.dataTransfer.getData(effectDragMime) || draggedEffectKindRef.current || "";
    if (isVideoEffectKind(requestedEffectKind)) {
      event.preventDefault();
      event.stopPropagation();
      setTimelineDropActive(false);
      const preview = updateEffectDropPreview(event.currentTarget, event.clientX, requestedEffectKind);
      clearEffectDrag();
      if (!preview.valid) {
        notify({ type: "warning", title: "这里放不下特效", message: "同一条特效轨不能重叠，请拖到长度至少 0.5 秒的空白位置" });
        return;
      }
      addVideoEffect(preview.kind, preview.start, preview.end);
      return;
    }
    const resourceId = event.dataTransfer.getData(resourceDragMime);
    const resource = importedResources.find((item) => item.id === resourceId);
    if (!resource) return;
    event.preventDefault();
    event.stopPropagation();
    const historySnapshot = captureEditorSnapshot();
    setTimelineDropActive(false);
    const rect = event.currentTarget.getBoundingClientRect();
    const dropTime = clampValue(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * timelineDisplayDuration,
      0,
      timelineDisplayDuration
    );
    const generatedLaneId = createEditorId(`${resource.type}-lane`);
    const laneDrop = resolveTimelineLanePlacement(event.clientY, resource.type, generatedLaneId);
    if (laneDrop.kind === "create") positionTimelineLane(laneDrop.laneId, laneDrop.insertionIndex);
    markTimelineLaneDropTarget();
    addImportedResourceToTimeline(resourceId, dropTime, laneDrop.laneId, historySnapshot);
  };

  const updateTrack = (trackId: string, updater: (track: EditorTrack) => EditorTrack, recordHistory = false) => {
    const historySnapshot = recordHistory ? captureEditorSnapshot() : undefined;
    const nextTracks = tracksRef.current.map((track) => (track.id === trackId ? updater(track) : track));
    tracksRef.current = nextTracks;
    setTracks(nextTracks);
    if (historySnapshot) pushEditorHistory(historySnapshot);
  };

  const ensureVideoAudioGraph = () => {
    const video = videoRef.current;
    if (!video) return undefined;
    const existing = videoAudioGraphRef.current;
    if (existing?.element === video) {
      void existing.context.resume().catch(() => undefined);
      return existing;
    }
    if (existing) {
      existing.source.disconnect();
      existing.gain.disconnect();
      void existing.context.close();
      videoAudioGraphRef.current = null;
    }
    const AudioContextConstructor = window.AudioContext
      || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return undefined;
    try {
      const context = new AudioContextConstructor();
      const source = context.createMediaElementSource(video);
      const gain = context.createGain();
      source.connect(gain);
      gain.connect(context.destination);
      const graph = { element: video, context, source, gain } satisfies VideoAudioGraph;
      videoAudioGraphRef.current = graph;
      video.volume = 1;
      video.muted = false;
      void context.resume().catch(() => undefined);
      return graph;
    } catch {
      return undefined;
    }
  };

  const applyVideoPreviewGain = (video: HTMLVideoElement, clip: VideoEditorClip, muted = isMuted) => {
    const volume = readVideoClipVolume(clip);
    const graph = videoAudioGraphRef.current;
    if (graph?.element === video) {
      video.volume = 1;
      video.muted = false;
      graph.gain.gain.cancelScheduledValues(graph.context.currentTime);
      graph.gain.gain.setTargetAtTime(muted ? 0 : volume, graph.context.currentTime, 0.008);
      return;
    }
    video.volume = clampValue(volume, 0, 1);
    video.muted = muted;
  };

  const updateVideoClipVolume = (clipId: string, requestedVolume: number, recordHistory = false) => {
    const volume = clampValue(Number.isFinite(requestedVolume) ? requestedVolume : 1, 0, 10);
    const clip = videoClipsRef.current.find((item) => item.id === clipId);
    if (!clip || Math.abs(readVideoClipVolume(clip) - volume) < 0.0001) return false;
    const historySnapshot = recordHistory ? captureEditorSnapshot() : undefined;
    const updatedClip = { ...clip, volume };
    const nextClips = videoClipsRef.current.map((item) => item.id === clipId ? updatedClip : item);
    videoClipsRef.current = nextClips;
    setVideoClips(nextClips);
    if (activeVideoClipIdRef.current === clipId && videoRef.current) applyVideoPreviewGain(videoRef.current, updatedClip);
    if (historySnapshot) pushEditorHistory(historySnapshot);
    return true;
  };

  const beginVideoVolumeEdit = () => {
    if (!videoVolumeHistoryRef.current) videoVolumeHistoryRef.current = captureEditorSnapshot();
    const graph = ensureVideoAudioGraph();
    const activeClip = videoClipsRef.current.find((clip) => clip.id === activeVideoClipIdRef.current);
    if (graph && activeClip) applyVideoPreviewGain(graph.element, activeClip);
  };

  const finishVideoVolumeEdit = () => {
    const historySnapshot = videoVolumeHistoryRef.current;
    videoVolumeHistoryRef.current = null;
    if (historySnapshot) pushEditorHistory(historySnapshot);
  };

  const updateVideoClipColor = (
    clipId: string,
    updater: (color: VideoColorAdjustments) => VideoColorAdjustments,
    recordHistory = false
  ) => {
    const clip = videoClipsRef.current.find((item) => item.id === clipId);
    if (!clip) return false;
    const historySnapshot = recordHistory ? captureEditorSnapshot() : undefined;
    const nextColor = normalizeVideoColor(updater(readVideoColor(clip)));
    const nextClip: VideoEditorClip = {
      ...clip,
      color: videoColorIsDefault(nextColor) ? undefined : nextColor
    };
    if (JSON.stringify(clip.color || defaultVideoColor) === JSON.stringify(nextClip.color || defaultVideoColor)) return false;
    const nextClips = videoClipsRef.current.map((item) => item.id === clipId ? nextClip : item);
    videoClipsRef.current = nextClips;
    setVideoClips(nextClips);
    if (historySnapshot) pushEditorHistory(historySnapshot);
    return true;
  };

  const beginVideoColorEdit = () => {
    if (!videoColorHistoryRef.current) videoColorHistoryRef.current = captureEditorSnapshot();
  };

  const finishVideoColorEdit = () => {
    const historySnapshot = videoColorHistoryRef.current;
    videoColorHistoryRef.current = null;
    if (historySnapshot) pushEditorHistory(historySnapshot);
  };

  const resetVideoClipColor = (clipId: string) => {
    const historySnapshot = captureEditorSnapshot();
    const nextClips = videoClipsRef.current.map((clip) => clip.id === clipId ? { ...clip, color: undefined } : clip);
    videoClipsRef.current = nextClips;
    setVideoClips(nextClips);
    pushEditorHistory(historySnapshot);
  };

  const startVideoClipVolumeDrag = (event: ReactPointerEvent<HTMLElement>, clip: VideoEditorClip) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const strip = event.currentTarget;
    const rect = strip.getBoundingClientRect();
    const historySnapshot = captureEditorSnapshot();
    const originalVolume = readVideoClipVolume(clip);
    let changed = false;
    let pendingY = event.clientY;
    let animationFrame = 0;
    setSelectedResourceId("");
    setSelectedVideoClipId(clip.id);
    setSelectedTrackId("");
    setSelectedEffectId("");
    setSelectedLaneId(clip.laneId);
    setSelectedKeyframeId("");
    setInspectorTab("tracks");
    const graph = ensureVideoAudioGraph();
    const activeClip = videoClipsRef.current.find((item) => item.id === activeVideoClipIdRef.current);
    if (graph && activeClip) applyVideoPreviewGain(graph.element, activeClip);
    try {
      strip.setPointerCapture(event.pointerId);
    } catch {
      // Window 级监听仍可完成拖动。
    }

    const applyVolume = () => {
      animationFrame = 0;
      const ratio = clampValue((pendingY - rect.top) / Math.max(1, rect.height), 0, 1);
      let gainDb = videoGainMaxDb - ratio * (videoGainMaxDb - videoGainMinDb);
      if (Math.abs(gainDb) < 0.3) gainDb = 0;
      changed = updateVideoClipVolume(clip.id, videoDbToGain(gainDb)) || changed;
    };
    const scheduleVolume = (clientY: number) => {
      pendingY = clientY;
      if (!animationFrame) animationFrame = window.requestAnimationFrame(applyVolume);
    };
    const handleMove = (moveEvent: PointerEvent) => scheduleVolume(moveEvent.clientY);
    const finish = (endEvent?: PointerEvent) => {
      if (endEvent) pendingY = endEvent.clientY;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      applyVolume();
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
      window.removeEventListener("blur", handleCancel);
      try {
        if (strip.hasPointerCapture(event.pointerId)) strip.releasePointerCapture(event.pointerId);
      } catch {
        // 元素结束拖动时可能已经释放捕获。
      }
      if (changed && Math.abs(readVideoClipVolume(videoClipsRef.current.find((item) => item.id === clip.id) || clip) - originalVolume) > 0.0001) {
        pushEditorHistory(historySnapshot);
      }
    };
    const handleUp = (upEvent: PointerEvent) => finish(upEvent);
    const handleCancel = () => finish();
    scheduleVolume(event.clientY);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleCancel, { once: true });
    window.addEventListener("blur", handleCancel, { once: true });
  };

  const updateEffect = (
    effectId: string,
    updater: (effect: EditorEffect) => EditorEffect,
    recordHistory = false
  ) => {
    const effect = effectsRef.current.find((item) => item.id === effectId);
    if (!effect) return false;
    const historySnapshot = recordHistory ? captureEditorSnapshot() : undefined;
    const nextEffect = normalizeEditorEffect(updater(cloneEditorEffect(effect)), projectVideoDuration);
    const timingChanged = Math.abs(nextEffect.start - effect.start) > 0.0005
      || Math.abs(nextEffect.end - effect.end) > 0.0005
      || (nextEffect.laneId || effectLaneId) !== (effect.laneId || effectLaneId);
    const nextLaneEffects = effectsRef.current.filter((item) => (item.laneId || effectLaneId) === (nextEffect.laneId || effectLaneId));
    if (timingChanged && timelineRangeOverlaps(nextLaneEffects, nextEffect.start, nextEffect.end, effect.id)) {
      return false;
    }
    if (JSON.stringify(effect) === JSON.stringify(nextEffect)) return false;
    const nextEffects = effectsRef.current.map((item) => item.id === effectId ? nextEffect : item);
    effectsRef.current = nextEffects;
    setEffects(nextEffects);
    if (historySnapshot) pushEditorHistory(historySnapshot);
    return true;
  };

  const beginEffectPropertyEdit = () => {
    if (!effectPropertyHistoryRef.current) effectPropertyHistoryRef.current = captureEditorSnapshot();
  };

  const finishEffectPropertyEdit = () => {
    const historySnapshot = effectPropertyHistoryRef.current;
    effectPropertyHistoryRef.current = null;
    if (historySnapshot) pushEditorHistory(historySnapshot);
  };

  const addVideoEffect = (kind: VideoEffectKind, requestedStart: number, requestedEnd: number) => {
    if (projectVideoDuration <= minimumTimelineClipDuration) {
      notify({ type: "warning", title: "无法添加特效", message: "请先把视频或图片素材添加到时间轴" });
      return false;
    }
    const definition = videoEffectDefinitions.find((item) => item.kind === kind)!;
    const start = roundTimelineFrame(clampValue(requestedStart, 0, projectVideoDuration - minimumTimelineClipDuration));
    const end = roundTimelineFrame(clampValue(requestedEnd, start + minimumTimelineClipDuration, projectVideoDuration));
    const defaultLaneEffects = effectsRef.current.filter((effect) => (effect.laneId || effectLaneId) === effectLaneId);
    if (timelineRangeOverlaps(defaultLaneEffects, start, end, "")) {
      notify({ type: "warning", title: "该位置已有特效", message: "同一条特效轨中的素材不能重叠，请拖到空白位置" });
      return false;
    }
    const historySnapshot = captureEditorSnapshot();
    const effect: EditorEffect = normalizeEditorEffect({
      id: createEditorId("effect"),
      laneId: effectLaneId,
      kind,
      name: definition.name,
      start,
      end,
      enabled: true,
      intensity: kind === "mosaic" ? 0.65 : 0.5,
      opacity: effectIsLocal({ kind }) ? 1 : 0.78,
      speed: 1,
      density: 55,
      seed: Math.max(1, Math.floor(Date.now() % 2147483647)),
      mask: effectIsLocal({ kind }) ? { x: 50, y: 50, width: 35, height: 35 } : undefined
    }, projectVideoDuration);
    const nextEffects = [...effectsRef.current, effect];
    effectsRef.current = nextEffects;
    setEffects(nextEffects);
    if (!timelineLaneOrderRef.current.includes(effectLaneId)) {
      const nextLaneOrder = [effectLaneId, ...timelineLaneOrderRef.current];
      timelineLaneOrderRef.current = nextLaneOrder;
      setTimelineLaneOrder(nextLaneOrder);
    }
    setSelectedResourceId("");
    setSelectedVideoClipId("");
    setSelectedTrackId("");
    setSelectedEffectId(effect.id);
    setSelectedLaneId(effectLaneId);
    setSelectedKeyframeId("");
    setInspectorTab("effects");
    seekPreview(effect.start, false);
    pushEditorHistory(historySnapshot);
    return true;
  };

  const removeVideoEffect = (effectId: string) => {
    const effect = effectsRef.current.find((item) => item.id === effectId);
    if (!effect) return;
    const historySnapshot = captureEditorSnapshot();
    const nextEffects = effectsRef.current.filter((item) => item.id !== effectId);
    effectsRef.current = nextEffects;
    setEffects(nextEffects);
    const nextLaneOrder = mergeTimelineLaneOrder(timelineLaneOrderRef.current, videoClipsRef.current, tracksRef.current, nextEffects, subtitleTracksRef.current);
    timelineLaneOrderRef.current = nextLaneOrder;
    setTimelineLaneOrder(nextLaneOrder);
    if (!nextEffects.some((item) => (item.laneId || effectLaneId) === (effect.laneId || effectLaneId))) setSelectedLaneId("");
    if (selectedEffectId === effectId) setSelectedEffectId("");
    pushEditorHistory(historySnapshot);
  };

  const startEffectTimelineDrag = (
    event: ReactPointerEvent<HTMLElement>,
    effect: EditorEffect,
    action: "move" | "trim-start" | "trim-end"
  ) => {
    if (event.button !== 0 || taskRunning) return;
    event.preventDefault();
    event.stopPropagation();
    const content = event.currentTarget.closest(".lossless-timeline-content") as HTMLElement | null;
    if (!content) return;
    const contentRect = content.getBoundingClientRect();
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const historySnapshot = captureEditorSnapshot();
    const pointerOwner = event.currentTarget;
    const clipElement = event.currentTarget.closest(".lossless-media-track-clip") as HTMLElement | null;
    try {
      pointerOwner.setPointerCapture(event.pointerId);
    } catch {
      // Window 级监听仍可完成拖动。
    }
    const originalLaneId = effect.laneId || effectLaneId;
    const effectDuration = effect.end - effect.start;
    const baseEffects = effectsRef.current;
    const laneBounds = getTimelineRangeBounds(
      baseEffects.filter((item) => (item.laneId || effectLaneId) === originalLaneId),
      effect,
      projectVideoDuration
    );
    const generatedLaneId = createEditorId("effect-lane");
    let changed = false;
    trackDragMovedRef.current = false;
    setSelectedResourceId("");
    setSelectedVideoClipId("");
    setSelectedTrackId("");
    setSelectedEffectId(effect.id);
    setSelectedLaneId(originalLaneId);
    setSelectedKeyframeId("");
    setInspectorTab("effects");
    markTimelineLaneDropTarget();
    clipElement?.classList.add("is-dragging", action === "move" ? "is-moving" : "is-trimming");
    const move = (moveEvent: PointerEvent) => {
      if (Math.abs(moveEvent.clientX - startClientX) > 2 || Math.abs(moveEvent.clientY - startClientY) > 2) {
        trackDragMovedRef.current = true;
      }
      const deltaTime = (moveEvent.clientX - startClientX) / Math.max(1, contentRect.width) * timelineDisplayDuration;
      let targetLaneId = originalLaneId;
      let laneDrop: TimelineLaneDrop = {
        laneId: originalLaneId,
        insertionIndex: Math.max(0, timelineLanes.findIndex((lane) => lane.id === originalLaneId)),
        kind: "source"
      };
      if (action === "move") {
        laneDrop = resolveTimelineLaneDrop(
          moveEvent.clientY,
          "effect",
          originalLaneId,
          generatedLaneId,
          moveEvent.clientY - startClientY
        );
        targetLaneId = laneDrop.laneId;
      }
      changed = updateEffect(effect.id, (current) => {
        if (action === "move") {
          let start = roundTimelineFrame(clampValue(effect.start + deltaTime, 0, Math.max(0, projectVideoDuration - effectDuration)));
          let end = start + effectDuration;
          const overlapsTargetLane = () => baseEffects.some((item) => item.id !== effect.id
            && (item.laneId || effectLaneId) === targetLaneId
            && start < item.end - 0.001
            && end > item.start + 0.001);
          if (targetLaneId !== originalLaneId && overlapsTargetLane()) {
            laneDrop = { laneId: generatedLaneId, insertionIndex: laneDrop.insertionIndex, kind: "create" };
            targetLaneId = generatedLaneId;
          }
          if (targetLaneId === originalLaneId) {
            const maximumStart = Math.max(laneBounds.minimumStart, laneBounds.maximumEnd - effectDuration);
            start = roundTimelineFrame(clampValue(start, laneBounds.minimumStart, maximumStart));
            end = start + effectDuration;
          } else if (overlapsTargetLane()) {
            return current;
          }
          if (laneDrop.kind === "create") positionTimelineLane(targetLaneId, laneDrop.insertionIndex);
          markTimelineLaneDropTarget(
            laneDrop.kind === "existing" ? targetLaneId : "",
            laneDrop.kind === "create" ? laneDrop.insertionIndex : undefined
          );
          return { ...current, laneId: targetLaneId, start, end };
        }
        if (action === "trim-start") {
          return {
            ...current,
            start: roundTimelineFrame(clampValue(effect.start + deltaTime, laneBounds.minimumStart, effect.end - minimumTimelineClipDuration))
          };
        }
        return {
          ...current,
          end: roundTimelineFrame(clampValue(effect.end + deltaTime, effect.start + minimumTimelineClipDuration, laneBounds.maximumEnd))
        };
      }) || changed;
      const currentEffect = effectsRef.current.find((item) => item.id === effect.id);
      if (currentEffect) setSelectedLaneId(currentEffect.laneId || effectLaneId);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
      markTimelineLaneDropTarget();
      clipElement?.classList.remove("is-dragging", "is-moving", "is-trimming");
      try {
        if (pointerOwner.hasPointerCapture(event.pointerId)) pointerOwner.releasePointerCapture(event.pointerId);
      } catch {
        // 元素结束拖动时可能已经释放捕获。
      }
      setTimelineLaneOrder((current) => {
        const next = mergeTimelineLaneOrder(current, videoClipsRef.current, tracksRef.current, effectsRef.current, subtitleTracksRef.current);
        timelineLaneOrderRef.current = next;
        return next;
      });
      if (changed) pushEditorHistory(historySnapshot);
      window.setTimeout(() => {
        trackDragMovedRef.current = false;
      }, 120);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    window.addEventListener("blur", finish, { once: true });
  };

  const startEffectMaskTransform = (
    event: ReactPointerEvent<HTMLElement>,
    effect: EditorEffect,
    action: "move" | "resize"
  ) => {
    if (!effect.mask || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const stage = event.currentTarget.closest(".lossless-media-overlay") as HTMLElement | null;
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const initialMask = { ...effect.mask };
    const historySnapshot = captureEditorSnapshot();
    let changed = false;
    const move = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) / Math.max(1, stageRect.width) * 100;
      const dy = (moveEvent.clientY - startY) / Math.max(1, stageRect.height) * 100;
      changed = updateEffect(effect.id, (current) => {
        if (!current.mask) return current;
        let mask: VideoEffectMask;
        if (action === "move") {
          const snapped = snapCanvasPosition(
            initialMask.x + dx,
            initialMask.y + dy,
            initialMask.width,
            initialMask.height,
            stageRect.width,
            stageRect.height
          );
          paintCanvasSnapGuides(snapped.verticalGuide, snapped.horizontalGuide);
          mask = normalizeEffectMask({ ...initialMask, x: snapped.x, y: snapped.y });
        } else {
          clearCanvasSnapGuides();
          mask = normalizeEffectMask({
              ...initialMask,
              width: Math.max(2, initialMask.width + dx * 2),
              height: Math.max(2, initialMask.height + dy * 2)
            });
        }
        return { ...current, mask };
      }) || changed;
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      clearCanvasSnapGuides();
      if (changed) pushEditorHistory(historySnapshot);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };

  const removeTrack = (trackId: string) => {
    const track = tracksRef.current.find((item) => item.id === trackId);
    if (!track) return;
    const historySnapshot = captureEditorSnapshot();
    audioPreviewRefs.current.get(trackId)?.pause();
    audioPreviewRefs.current.delete(trackId);
    imageOverlayRefs.current.delete(trackId);
    const nextTracks = tracksRef.current.filter((item) => item.id !== trackId);
    tracksRef.current = nextTracks;
    setTracks(nextTracks);
    commitSubtitleTracks(subtitleTracksRef.current.filter((subtitleTrack) => subtitleTrack.linkedAudioTrackId !== trackId));
    const nextLaneOrder = mergeTimelineLaneOrder(timelineLaneOrderRef.current, videoClipsRef.current, nextTracks, effectsRef.current, subtitleTracksRef.current);
    timelineLaneOrderRef.current = nextLaneOrder;
    setTimelineLaneOrder(nextLaneOrder);
    if (selectedTrackId === trackId) {
      setSelectedTrackId("");
      setSelectedKeyframeId("");
    }
    if (track && !nextTracks.some((item) => getTrackLaneId(item) === getTrackLaneId(track))) {
      setSelectedLaneId("");
    }
    pushEditorHistory(historySnapshot);
  };

  const updateTrackBoundary = (trackId: string, boundary: "start" | "end", value: number) => {
    const historySnapshot = captureEditorSnapshot();
    const nextTracks = tracksRef.current.map((track) => {
      if (track.id !== trackId) return track;
      const timelineEnd = projectVideoDuration > 0 ? projectVideoDuration : Math.max(track.end, value);
      const laneBounds = getLaneClipBounds(tracksRef.current, track, timelineEnd);
      if (boundary === "start") {
        const start = clampValue(value, laneBounds.minimumStart, Math.max(laneBounds.minimumStart, track.end - 0.05));
        if (track.type === "audio") {
          const nextSourceStart = clampValue(
            track.sourceStart + (start - track.start),
            0,
            Math.max(0, track.sourceEnd - 0.05)
          );
          return { ...track, start: track.start + (nextSourceStart - track.sourceStart), sourceStart: nextSourceStart };
        }
        return {
          ...track,
          start,
          staticTransform: { ...track.staticTransform, time: start },
          keyframes: clampImageKeyframesToRange(track, start, track.end)
        };
      }
      const end = clampValue(value, track.start + 0.05, Math.max(track.start + 0.05, laneBounds.maximumEnd));
      if (track.type === "audio") {
        if (track.loop) return { ...track, end };
        const nextSourceEnd = clampValue(
          track.sourceEnd + (end - track.end),
          track.sourceStart + 0.05,
          track.sourceDuration
        );
        return { ...track, end: track.end + (nextSourceEnd - track.sourceEnd), sourceEnd: nextSourceEnd };
      }
      return {
        ...track,
        end,
        staticTransform: { ...track.staticTransform, time: track.start },
        keyframes: clampImageKeyframesToRange(track, track.start, end)
      };
    });
    tracksRef.current = nextTracks;
    setTracks(nextTracks);
    pushEditorHistory(historySnapshot);
  };

  const timelineTimeAtPointer = (target: HTMLElement, clientX: number) => {
    const content = target.closest(".lossless-timeline-content") as HTMLElement | null;
    if (!content) return currentTime;
    const rect = content.getBoundingClientRect();
    return clampValue(((clientX - rect.left) / Math.max(1, rect.width)) * timelineDisplayDuration, 0, timelineDisplayDuration);
  };

  const resolveBladeTime = (target: HTMLElement, clientX: number) =>
    snapTimelinePlayheadTime(timelineTimeAtPointer(target, clientX));

  const hideTimelineBladeGuide = () => {
    timelineBladeGuideRef.current?.classList.remove("is-visible");
  };

  const updateTimelineBladeGuide = (target: HTMLElement, clientX: number) => {
    const guide = timelineBladeGuideRef.current;
    if (!guide) return;
    const splitTime = resolveBladeTime(target, clientX);
    guide.style.left = `${(splitTime / Math.max(0.001, timelineDisplayDuration)) * 100}%`;
    guide.classList.add("is-visible");
  };

  const cutSelectedTimelineMaterialWithBlade = (event: ReactPointerEvent<HTMLElement>) => {
    if (timelineTool !== "blade" || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    trackDragMovedRef.current = false;
    const splitTime = resolveBladeTime(event.currentTarget, event.clientX);
    const audioTrack = tracksRef.current.find((item): item is AudioEditorTrack => item.id === selectedTrackId && item.type === "audio");
    if (audioTrack) {
      splitAudioTrackAtTime(audioTrack, splitTime, { selectRight: false });
      return;
    }
    const clip = videoClipsRef.current.find((item) => item.id === selectedVideoClipId);
    if (clip) splitVideoClipAtTime(clip, splitTime, { selectRight: false });
  };

  const setTimelinePlayheadDuringEdit = (requestedTime: number, maximumTime: number) => {
    const nextTime = clampValue(roundTimelineFrame(requestedTime), 0, Math.max(0, maximumTime));
    if (Math.abs(nextTime - currentTimeRef.current) < 0.0001) return;
    currentTimeRef.current = nextTime;
    playbackAnchorRef.current = { time: nextTime, startedAt: performance.now() };
    setCurrentTime(nextTime);
  };

  const lockTimelinePlayheadForMaterialDrag = () => {
    const lock = {
      id: timelineMaterialDragSequenceRef.current + 1,
      time: currentTimeRef.current
    };
    timelineMaterialDragSequenceRef.current = lock.id;
    timelineMaterialDragLockRef.current = lock;
    currentTimeRef.current = lock.time;
    videoRef.current?.pause();
    audioPreviewRefs.current.forEach((audio) => audio.pause());
    if (isPlayingRef.current) {
      isPlayingRef.current = false;
      setIsPlaying(false);
    }
    setCurrentTime(lock.time);
    return lock;
  };

  const releaseTimelinePlayheadAfterMaterialDrag = (lock: { id: number; time: number } | null) => {
    if (!lock || timelineMaterialDragLockRef.current?.id !== lock.id) return;
    const projectDuration = getTimelineProjectDuration(videoClipsRef.current, tracksRef.current, subtitleTracksRef.current);
    const nextTime = clampValue(lock.time, 0, projectDuration);
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
    seekPreview(nextTime, false, false);
    timelineMaterialDragLockRef.current = null;
  };

  const selectVideoClipAtPointer = (event: ReactMouseEvent<HTMLElement>, clip: VideoEditorClip) => {
    setSelectedResourceId("");
    setSelectedVideoClipId(clip.id);
    setSelectedTrackId("");
    setSelectedEffectId("");
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
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const row = event.currentTarget.closest(".lossless-media-track-row") as HTMLElement | null;
    if (!row) return;
    const historySnapshot = captureEditorSnapshot();
    const playheadLock = action === "move" ? lockTimelinePlayheadForMaterialDrag() : null;
    const pointerOwner = event.currentTarget;
    const clipElement = event.currentTarget.closest(".lossless-media-track-clip") as HTMLElement | null;
    try {
      pointerOwner.setPointerCapture(event.pointerId);
    } catch {
      // Window 级监听仍可完成拖动。
    }
    const rowRect = row.getBoundingClientRect();
    const pointerStart = event.clientX;
    const pointerStartY = event.clientY;
    const originalStart = clip.start;
    const originalEnd = clip.end;
    const originalSourceStart = clip.sourceStart;
    const originalSourceEnd = clip.sourceEnd;
    const sourceMin = clip.sourceMin ?? clip.sourceStart;
    const sourceMax = clip.sourceMax ?? clip.sourceEnd;
    const playheadAtDragStart = currentTimeRef.current;
    const trimBoundaryTolerance = 2 / timelineFps;
    const followTrimStart = action === "trim-start" && Math.abs(playheadAtDragStart - originalStart) <= trimBoundaryTolerance;
    const followTrimEnd = action === "trim-end" && Math.abs(playheadAtDragStart - originalEnd) <= trimBoundaryTolerance;
    const clipDuration = originalEnd - originalStart;
    const baseClips = videoClipsRef.current;
    const generatedLaneId = createEditorId("video-lane");
    let pendingMove: PointerEvent | null = null;
    let animationFrame = 0;
    trackDragMovedRef.current = false;
    setSelectedResourceId("");
    setSelectedVideoClipId(clip.id);
    setSelectedTrackId("");
    setSelectedEffectId("");
    setSelectedLaneId(clip.laneId);
    setSelectedKeyframeId("");
    setInspectorTab("tracks");
    if (action !== "move") {
      videoRef.current?.pause();
      audioPreviewRefs.current.forEach((audio) => audio.pause());
      isPlayingRef.current = false;
      setIsPlaying(false);
    }
    markTimelineLaneDropTarget();
    clipElement?.classList.add("is-dragging", action === "move" ? "is-moving" : "is-trimming");

    const applyMove = (moveEvent: PointerEvent) => {
      const pixelDelta = moveEvent.clientX - pointerStart;
      if (Math.abs(pixelDelta) > 2 || Math.abs(moveEvent.clientY - pointerStartY) > 2) trackDragMovedRef.current = true;
      const timeDelta = (pixelDelta / Math.max(1, rowRect.width)) * timelineDisplayDuration;
      const snapThreshold = (timelineSnapDistancePx / Math.max(1, rowRect.width)) * timelineDisplayDuration;
      let nextLaneId = clip.laneId;
      let laneDrop: TimelineLaneDrop = {
        laneId: clip.laneId,
        insertionIndex: Math.max(0, timelineLanes.findIndex((lane) => lane.id === clip.laneId)),
        kind: "source"
      };
      if (action === "move") {
        laneDrop = resolveTimelineLaneDrop(
          moveEvent.clientY,
          "video",
          clip.laneId,
          generatedLaneId,
          moveEvent.clientY - pointerStartY
        );
        nextLaneId = laneDrop.laneId;
      }
      const laneClips = (laneId: string) => baseClips.filter((item) => item.id !== clip.id && item.laneId === laneId);
      const snapTargets = (laneId: string) => [
        0,
        currentTime,
        ...laneClips(laneId).flatMap((item) => [item.start, item.end])
      ];
      let updatedClip = clip;

      if (action === "move") {
        let start = snapTimelineClipStart(Math.max(0, originalStart + timeDelta), clipDuration, snapTargets(nextLaneId), snapThreshold);
        let end = start + clipDuration;
        const overlapsTargetLane = () => laneClips(nextLaneId).some((item) => start < item.end - 0.001 && end > item.start + 0.001);
        if (nextLaneId !== clip.laneId && overlapsTargetLane()) {
          laneDrop = { laneId: generatedLaneId, insertionIndex: laneDrop.insertionIndex, kind: "create" };
          nextLaneId = laneDrop.laneId;
          start = snapTimelineClipStart(Math.max(0, originalStart + timeDelta), clipDuration, snapTargets(nextLaneId), snapThreshold);
          end = start + clipDuration;
        }
        if (nextLaneId === clip.laneId) {
          const bounds = getVideoClipLaneBounds(baseClips, clip);
          const maximumStart = Number.isFinite(bounds.maximumEnd)
            ? Math.max(bounds.minimumStart, bounds.maximumEnd - clipDuration)
            : Number.POSITIVE_INFINITY;
          start = clampValue(start, bounds.minimumStart, maximumStart);
          end = start + clipDuration;
        } else if (overlapsTargetLane()) {
          return;
        }
        if (laneDrop.kind === "create") {
          positionTimelineLane(nextLaneId, laneDrop.insertionIndex);
        }
        markTimelineLaneDropTarget(
          laneDrop.kind === "existing" ? nextLaneId : "",
          laneDrop.kind === "create" ? laneDrop.insertionIndex : undefined
        );
        updatedClip = { ...clip, laneId: nextLaneId, start, end };
      } else if (action === "trim-start") {
        const bounds = getVideoClipLaneBounds(baseClips, clip);
        const earliestTimelineStart = originalStart - Math.max(0, originalSourceStart - sourceMin);
        const minimumStart = Math.max(bounds.minimumStart, earliestTimelineStart);
        const maximumStart = originalEnd - minimumTimelineClipDuration;
        const start = clampValue(
          snapTimelineValue(originalStart + timeDelta, snapTargets(clip.laneId), snapThreshold),
          minimumStart,
          maximumStart
        );
        updatedClip = {
          ...clip,
          start,
          sourceStart: originalSourceStart + start - originalStart
        };
      } else {
        const bounds = getVideoClipLaneBounds(baseClips, clip);
        const latestTimelineEnd = originalEnd + Math.max(0, sourceMax - originalSourceEnd);
        const maximumEnd = Math.min(bounds.maximumEnd, latestTimelineEnd);
        const end = clampValue(
          snapTimelineValue(originalEnd + timeDelta, snapTargets(clip.laneId), snapThreshold),
          originalStart + minimumTimelineClipDuration,
          Math.max(originalStart + minimumTimelineClipDuration, maximumEnd)
        );
        updatedClip = {
          ...clip,
          end,
          sourceEnd: originalSourceEnd + end - originalEnd
        };
      }

      if (
        updatedClip.laneId === clip.laneId
        && Math.abs(updatedClip.start - clip.start) < 0.0001
        && Math.abs(updatedClip.end - clip.end) < 0.0001
        && Math.abs(updatedClip.sourceStart - clip.sourceStart) < 0.0001
        && Math.abs(updatedClip.sourceEnd - clip.sourceEnd) < 0.0001
      ) return;
      const next = baseClips
        .map((item) => item.id === clip.id ? updatedClip : item)
        .sort((left, right) => left.start - right.start);
      videoClipsRef.current = next;
      setVideoClips(next);
      const linkedSubtitleTracks = historySnapshot.subtitleTracks.map((subtitleTrack) => {
        if (subtitleTrack.linkedVideoClipId !== clip.id) return subtitleTrack;
        if (action === "move") {
          const delta = updatedClip.start - originalStart;
          return {
            ...subtitleTrack,
            cues: subtitleTrack.cues.map((cue) => ({
              ...cue,
              start: cue.start + delta,
              end: cue.end + delta,
              words: cue.words?.map((word) => ({ ...word, start: word.start + delta, end: word.end + delta }))
            }))
          };
        }
        return {
          ...subtitleTrack,
          cues: subtitleTrack.cues
            .filter((cue) => cue.end > updatedClip.start + 0.001 && cue.start < updatedClip.end - 0.001)
            .map((cue) => ({
              ...cue,
              start: Math.max(cue.start, updatedClip.start),
              end: Math.min(cue.end, updatedClip.end),
              words: cue.words?.filter((word) => word.end > updatedClip.start && word.start < updatedClip.end)
            }))
        };
      });
      commitSubtitleTracks(linkedSubtitleTracks);
      setSelectedLaneId(updatedClip.laneId);
      const nextProjectDuration = getTimelineProjectDuration(next, tracksRef.current, subtitleTracksRef.current);
      let nextPlayhead = Math.min(currentTimeRef.current, nextProjectDuration);
      if (action === "trim-start") {
        const playheadWasTrimmed = playheadAtDragStart >= originalStart - trimBoundaryTolerance
          && playheadAtDragStart < updatedClip.start;
        if (followTrimStart || playheadWasTrimmed) nextPlayhead = updatedClip.start;
      } else if (action === "trim-end") {
        const playheadWasTrimmed = playheadAtDragStart > updatedClip.end
          && playheadAtDragStart <= originalEnd + trimBoundaryTolerance;
        if (followTrimEnd || playheadWasTrimmed) nextPlayhead = updatedClip.end;
      }
      setTimelinePlayheadDuringEdit(nextPlayhead, nextProjectDuration);
    };

    const flushPendingMove = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      if (!pendingMove) return;
      const moveEvent = pendingMove;
      pendingMove = null;
      applyMove(moveEvent);
    };
    const handleMove = (moveEvent: PointerEvent) => {
      pendingMove = moveEvent;
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        if (!pendingMove) return;
        const nextMove = pendingMove;
        pendingMove = null;
        applyMove(nextMove);
      });
    };
    const finishDrag = (endEvent?: PointerEvent) => {
      if (endEvent) pendingMove = endEvent;
      flushPendingMove();
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
      window.removeEventListener("blur", handleBlur);
      markTimelineLaneDropTarget();
      clipElement?.classList.remove("is-dragging", "is-moving", "is-trimming");
      try {
        if (pointerOwner.hasPointerCapture(event.pointerId)) pointerOwner.releasePointerCapture(event.pointerId);
      } catch {
        // 元素结束拖动时可能已经释放捕获。
      }
      setTimelineLaneOrder((current) => {
        const next = mergeTimelineLaneOrder(current, videoClipsRef.current, tracksRef.current, effectsRef.current, subtitleTracksRef.current);
        timelineLaneOrderRef.current = next;
        return next;
      });
      releaseTimelinePlayheadAfterMaterialDrag(playheadLock);
      if (trackDragMovedRef.current) {
        pushEditorHistory(historySnapshot);
        resetResult();
        if (action !== "move") seekPreview(currentTimeRef.current, false, false);
      }
      window.setTimeout(() => {
        trackDragMovedRef.current = false;
      }, 120);
    };
    const handleUp = (upEvent: PointerEvent) => finishDrag(upEvent);
    const handleCancel = () => finishDrag();
    const handleBlur = () => finishDrag();
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleCancel, { once: true });
    window.addEventListener("blur", handleBlur, { once: true });
  };

  const selectTrackAtPointer = (event: ReactMouseEvent<HTMLElement>, track: EditorTrack) => {
    setSelectedResourceId("");
    setSelectedVideoClipId("");
    setSelectedTrackId(track.id);
    setSelectedEffectId("");
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
    setSelectedResourceId("");
    setSelectedVideoClipId("");
    setSelectedTrackId(track.id);
    setSelectedEffectId("");
    setSelectedLaneId(getTrackLaneId(track));
    setInspectorTab("tracks");
    addImageKeyframe(track, time);
    seekPreview(time, false);
  };

  const startTrackTimelineDrag = (event: ReactPointerEvent<HTMLElement>, track: EditorTrack, action: "move" | "trim-start" | "trim-end") => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const row = event.currentTarget.closest(".lossless-media-track-row") as HTMLElement | null;
    if (!row) return;
    const historySnapshot = captureEditorSnapshot();
    const playheadLock = action === "move" ? lockTimelinePlayheadForMaterialDrag() : null;
    const pointerOwner = event.currentTarget;
    const clipElement = event.currentTarget.closest(".lossless-media-track-clip") as HTMLElement | null;
    try {
      pointerOwner.setPointerCapture(event.pointerId);
    } catch {
      // Window 级监听仍可完成拖动。
    }
    const rowRect = row.getBoundingClientRect();
    const pointerStart = event.clientX;
    const pointerStartY = event.clientY;
    const originalStart = track.start;
    const originalEnd = track.end;
    const playheadAtDragStart = currentTimeRef.current;
    const trimBoundaryTolerance = 2 / timelineFps;
    const followTrimStart = action === "trim-start" && Math.abs(playheadAtDragStart - originalStart) <= trimBoundaryTolerance;
    const followTrimEnd = action === "trim-end" && Math.abs(playheadAtDragStart - originalEnd) <= trimBoundaryTolerance;
    const originalLaneId = getTrackLaneId(track);
    const trackDuration = originalEnd - originalStart;
    const maxDuration = timelineDisplayDuration;
    const baseTracks = tracksRef.current;
    const laneBounds = getLaneClipBounds(baseTracks, track, maxDuration);
    const generatedLaneId = createEditorId(`${track.type}-lane`);
    let pendingMove: PointerEvent | null = null;
    let animationFrame = 0;
    trackDragMovedRef.current = false;
    setSelectedResourceId("");
    setSelectedVideoClipId("");
    setSelectedTrackId(track.id);
    setSelectedEffectId("");
    setSelectedLaneId(getTrackLaneId(track));
    setSelectedKeyframeId(track.type === "image" && track.animated ? track.keyframes[0]?.id || "" : "");
    setInspectorTab("tracks");
    if (action !== "move") {
      videoRef.current?.pause();
      audioPreviewRefs.current.forEach((audio) => audio.pause());
      isPlayingRef.current = false;
      setIsPlaying(false);
    }
    markTimelineLaneDropTarget();
    clipElement?.classList.add("is-dragging", action === "move" ? "is-moving" : "is-trimming");

    const applyMove = (moveEvent: PointerEvent) => {
      const pixelDelta = moveEvent.clientX - pointerStart;
      if (Math.abs(pixelDelta) > 2 || Math.abs(moveEvent.clientY - pointerStartY) > 2) trackDragMovedRef.current = true;
      const timeDelta = (pixelDelta / Math.max(1, rowRect.width)) * timelineDisplayDuration;
      let targetLaneId = originalLaneId;
      let laneDrop: TimelineLaneDrop = {
        laneId: originalLaneId,
        insertionIndex: Math.max(0, timelineLanes.findIndex((lane) => lane.id === originalLaneId)),
        kind: "source"
      };
      let proposedStart = originalStart;
      let proposedEnd = originalEnd;
      if (action === "move") {
        laneDrop = resolveTimelineLaneDrop(
          moveEvent.clientY,
          track.type,
          originalLaneId,
          generatedLaneId,
          moveEvent.clientY - pointerStartY
        );
        targetLaneId = laneDrop.laneId;
        proposedStart = clampValue(originalStart + timeDelta, 0, Math.max(0, maxDuration - trackDuration));
        proposedEnd = proposedStart + trackDuration;
        const overlapsTargetLane = baseTracks.some((item) => item.id !== track.id
          && getTrackLaneId(item) === targetLaneId
          && proposedStart < item.end - 0.001
          && proposedEnd > item.start + 0.001);
        if (targetLaneId !== originalLaneId && overlapsTargetLane) {
          laneDrop = { laneId: generatedLaneId, insertionIndex: laneDrop.insertionIndex, kind: "create" };
          targetLaneId = laneDrop.laneId;
        }
        if (laneDrop.kind === "create") {
          positionTimelineLane(targetLaneId, laneDrop.insertionIndex);
        }
        markTimelineLaneDropTarget(
          laneDrop.kind === "existing" ? targetLaneId : "",
          laneDrop.kind === "create" ? laneDrop.insertionIndex : undefined
        );
      }

      let updatedTrack: EditorTrack = track;
      if (action === "move") {
        if (targetLaneId === originalLaneId) {
          const delta = clampValue(
            timeDelta,
            laneBounds.minimumStart - originalStart,
            Math.max(laneBounds.minimumStart - originalStart, laneBounds.maximumEnd - originalEnd)
          );
          proposedStart = originalStart + delta;
          proposedEnd = originalEnd + delta;
        }
        const delta = proposedStart - originalStart;
        updatedTrack = track.type === "image"
          ? {
              ...track,
              laneId: targetLaneId,
              start: proposedStart,
              end: proposedEnd,
              staticTransform: { ...track.staticTransform, time: proposedStart },
              keyframes: track.keyframes.map((keyframe) => ({ ...keyframe, time: keyframe.time + delta }))
            }
          : { ...track, laneId: targetLaneId, start: proposedStart, end: proposedEnd };
      } else if (action === "trim-start") {
        const minimumStart = track.type === "audio" && !track.loop
          ? Math.max(laneBounds.minimumStart, originalStart - track.sourceStart)
          : laneBounds.minimumStart;
        const start = clampValue(originalStart + timeDelta, minimumStart, originalEnd - 0.05);
        updatedTrack = track.type === "audio"
          ? {
              ...track,
              start,
              sourceStart: clampValue(track.sourceStart + (start - originalStart), 0, track.sourceEnd - 0.05)
            }
          : {
              ...track,
              start,
              staticTransform: { ...track.staticTransform, time: start },
              keyframes: clampImageKeyframesToRange(track, start, originalEnd)
            };
      } else {
        const maximumEnd = track.type === "audio" && !track.loop
          ? Math.min(laneBounds.maximumEnd, originalEnd + (track.sourceDuration - track.sourceEnd))
          : laneBounds.maximumEnd;
        const end = clampValue(originalEnd + timeDelta, originalStart + 0.05, maximumEnd);
        updatedTrack = track.type === "audio"
          ? {
              ...track,
              end,
              sourceEnd: track.loop
                ? track.sourceEnd
                : clampValue(track.sourceEnd + (end - originalEnd), track.sourceStart + 0.05, track.sourceDuration)
            }
          : {
              ...track,
              end,
              staticTransform: { ...track.staticTransform, time: originalStart },
              keyframes: clampImageKeyframesToRange(track, originalStart, end)
            };
      }

      const next = baseTracks.map((item) => item.id === track.id ? updatedTrack : item);
      tracksRef.current = next;
      setTracks(next);
      if (track.type === "audio") {
        const linkedSubtitleTracks = historySnapshot.subtitleTracks.map((subtitleTrack) => {
          if (subtitleTrack.linkedAudioTrackId !== track.id) return subtitleTrack;
          if (action === "move") {
            const delta = updatedTrack.start - originalStart;
            return {
              ...subtitleTrack,
              cues: subtitleTrack.cues.map((cue) => ({
                ...cue,
                start: cue.start + delta,
                end: cue.end + delta,
                words: cue.words?.map((word) => ({ ...word, start: word.start + delta, end: word.end + delta }))
              }))
            };
          }
          return {
            ...subtitleTrack,
            cues: subtitleTrack.cues
              .filter((cue) => cue.end > updatedTrack.start + 0.001 && cue.start < updatedTrack.end - 0.001)
              .map((cue) => ({
                ...cue,
                start: Math.max(cue.start, updatedTrack.start),
                end: Math.min(cue.end, updatedTrack.end),
                words: cue.words?.filter((word) => word.end > updatedTrack.start && word.start < updatedTrack.end)
              }))
          };
        });
        commitSubtitleTracks(linkedSubtitleTracks);
      }
      setSelectedLaneId(getTrackLaneId(updatedTrack));
      const nextProjectDuration = getTimelineProjectDuration(videoClipsRef.current, next, subtitleTracksRef.current);
      let nextPlayhead = Math.min(currentTimeRef.current, nextProjectDuration);
      if (action === "trim-start") {
        const playheadWasTrimmed = playheadAtDragStart >= originalStart - trimBoundaryTolerance
          && playheadAtDragStart < updatedTrack.start;
        if (followTrimStart || playheadWasTrimmed) nextPlayhead = updatedTrack.start;
      } else if (action === "trim-end") {
        const playheadWasTrimmed = playheadAtDragStart > updatedTrack.end
          && playheadAtDragStart <= originalEnd + trimBoundaryTolerance;
        if (followTrimEnd || playheadWasTrimmed) nextPlayhead = updatedTrack.end;
      }
      setTimelinePlayheadDuringEdit(nextPlayhead, nextProjectDuration);
    };

    const flushPendingMove = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      if (!pendingMove) return;
      const moveEvent = pendingMove;
      pendingMove = null;
      applyMove(moveEvent);
    };
    const handleMove = (moveEvent: PointerEvent) => {
      pendingMove = moveEvent;
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        if (!pendingMove) return;
        const nextMove = pendingMove;
        pendingMove = null;
        applyMove(nextMove);
      });
    };
    const finishDrag = (endEvent?: PointerEvent) => {
      if (endEvent) pendingMove = endEvent;
      flushPendingMove();
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
      window.removeEventListener("blur", handleBlur);
      markTimelineLaneDropTarget();
      clipElement?.classList.remove("is-dragging", "is-moving", "is-trimming");
      try {
        if (pointerOwner.hasPointerCapture(event.pointerId)) pointerOwner.releasePointerCapture(event.pointerId);
      } catch {
        // 元素结束拖动时可能已经释放捕获。
      }
      setTimelineLaneOrder((current) => {
        const next = mergeTimelineLaneOrder(current, videoClipsRef.current, tracksRef.current, effectsRef.current, subtitleTracksRef.current);
        timelineLaneOrderRef.current = next;
        return next;
      });
      releaseTimelinePlayheadAfterMaterialDrag(playheadLock);
      if (trackDragMovedRef.current) {
        pushEditorHistory(historySnapshot);
        if (action !== "move") seekPreview(currentTimeRef.current, false, false);
      }
      window.setTimeout(() => {
        trackDragMovedRef.current = false;
      }, 120);
    };
    const handleUp = (upEvent: PointerEvent) => finishDrag(upEvent);
    const handleCancel = () => finishDrag();
    const handleBlur = () => finishDrag();
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleCancel, { once: true });
    window.addEventListener("blur", handleBlur, { once: true });
  };

  const upsertImageKeyframe = (track: ImageEditorTrack, time = currentTime, patch: Partial<MediaKeyframe> = {}, recordHistory = true) => {
    const historySnapshot = recordHistory ? captureEditorSnapshot() : undefined;
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
    if (historySnapshot) pushEditorHistory(historySnapshot);
    return nearby?.id || keyframeId;
  };

  const addImageKeyframe = (track: ImageEditorTrack, time = currentTime) => upsertImageKeyframe(track, time);

  const updateImageAtPlayhead = (track: ImageEditorTrack, patch: Partial<MediaKeyframe>, recordHistory = true) => {
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
      }, recordHistory);
      setSelectedKeyframeId("");
      return;
    }
    upsertImageKeyframe(track, videoRef.current?.currentTime ?? currentTime, patch, recordHistory);
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
    }, true);
    setSelectedKeyframeId(animated ? track.keyframes[0]?.id || "" : "");
  };

  const updateImageKeyframe = (trackId: string, keyframeId: string, patch: Partial<MediaKeyframe>, recordHistory = false) => {
    updateTrack(
      trackId,
      (track) => track.type === "image"
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
        : track,
      recordHistory
    );
  };

  const startKeyframeTimelineDrag = (event: ReactPointerEvent<HTMLButtonElement>, track: ImageEditorTrack, keyframe: MediaKeyframe) => {
    event.preventDefault();
    event.stopPropagation();
    const row = event.currentTarget.closest(".lossless-media-track-row") as HTMLElement | null;
    if (!row) return;
    const historySnapshot = captureEditorSnapshot();
    const rowRect = row.getBoundingClientRect();
    const pointerStart = event.clientX;
    trackDragMovedRef.current = false;
    setSelectedResourceId("");
    setSelectedVideoClipId("");
    setSelectedTrackId(track.id);
    setSelectedEffectId("");
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
      if (trackDragMovedRef.current) pushEditorHistory(historySnapshot);
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
    updateTrack(track.id, (current) => (current.type === "image" ? { ...current, keyframes: remaining } : current), true);
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

  const startVideoTransform = (
    event: ReactPointerEvent<HTMLElement>,
    clip: VideoEditorClip,
    source: VideoEditorSource,
    action: VideoTransformAction
  ) => {
    if (!projectCanvasChanged || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const layer = videoTransformOverlayRef.current?.parentElement
      || previewRef.current?.querySelector<HTMLElement>(".lossless-video-stage");
    if (!layer) return;

    const historySnapshot = captureEditorSnapshot();
    const video = videoRef.current;
    video?.pause();
    audioPreviewRefs.current.forEach((audio) => audio.pause());
    isPlayingRef.current = false;
    setIsPlaying(false);
    setSelectedResourceId("");
    setSelectedVideoClipId(clip.id);
    setSelectedTrackId("");
    setSelectedEffectId("");
    setSelectedKeyframeId("");
    setSelectedLaneId(clip.laneId);
    setInspectorTab("tracks");

    const rect = layer.getBoundingClientRect();
    const sourceSize = { width: source.width, height: source.height };
    const snapshot = resolveVideoTransform(clip, sourceSize, videoSize);
    const snapshotHeight = videoTransformHeightPercent(snapshot, sourceSize, videoSize);
    const pointerStartX = event.clientX;
    const pointerStartY = event.clientY;
    const centerX = rect.left + snapshot.x / 100 * rect.width;
    const centerY = rect.top + snapshot.y / 100 * rect.height;
    const grabOffsetX = pointerStartX - centerX;
    const grabOffsetY = pointerStartY - centerY;
    const widthPixels = snapshot.width / 100 * rect.width;
    const heightPixels = snapshotHeight / 100 * rect.height;
    let animationFrame = 0;
    let moved = false;
    let latestTransform = snapshot;
    let latestPointer = { x: pointerStartX, y: pointerStartY };
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = action === "move"
      ? "grabbing"
      : action.endsWith("nw") || action.endsWith("se") ? "nwse-resize" : "nesw-resize";

    const paint = (nextTransform: VideoTransform) => {
      if (videoRef.current) paintVideoTransform(videoRef.current, nextTransform, sourceSize, videoSize);
      const overlay = videoTransformOverlayRef.current;
      if (overlay?.dataset.clipId === clip.id) paintVideoTransform(overlay, nextTransform, sourceSize, videoSize);
    };

    const updatePosition = (clientX: number, clientY: number) => {
      if (Math.hypot(clientX - pointerStartX, clientY - pointerStartY) < 2) return;
      let nextTransform: VideoTransform;
      if (action === "move") {
        const snapped = snapCanvasPosition(
          (clientX - grabOffsetX - rect.left) / Math.max(1, rect.width) * 100,
          (clientY - grabOffsetY - rect.top) / Math.max(1, rect.height) * 100,
          snapshot.width,
          snapshotHeight,
          rect.width,
          rect.height
        );
        paintCanvasSnapGuides(snapped.verticalGuide, snapped.horizontalGuide);
        nextTransform = normalizeVideoTransform({
          ...snapshot,
          x: snapped.x,
          y: snapped.y,
          customized: true
        });
      } else {
        clearCanvasSnapGuides();
        const handle = action.slice("resize-".length) as VideoResizeHandle;
        const horizontalDirection = handle.includes("e") ? 1 : -1;
        const verticalDirection = handle.includes("s") ? 1 : -1;
        const anchorX = centerX - horizontalDirection * widthPixels / 2;
        const anchorY = centerY - verticalDirection * heightPixels / 2;
        const initialVectorX = pointerStartX - anchorX;
        const initialVectorY = pointerStartY - anchorY;
        const pointerVectorX = clientX - anchorX;
        const pointerVectorY = clientY - anchorY;
        const vectorLengthSquared = Math.max(1, initialVectorX * initialVectorX + initialVectorY * initialVectorY);
        const requestedScale = (pointerVectorX * initialVectorX + pointerVectorY * initialVectorY) / vectorLengthSquared;
        const nextWidth = clampValue(snapshot.width * requestedScale, 2, 400);
        const scale = nextWidth / Math.max(0.001, snapshot.width);
        const nextCenterX = anchorX + horizontalDirection * widthPixels * scale / 2;
        const nextCenterY = anchorY + verticalDirection * heightPixels * scale / 2;
        nextTransform = normalizeVideoTransform({
          x: (nextCenterX - rect.left) / Math.max(1, rect.width) * 100,
          y: (nextCenterY - rect.top) / Math.max(1, rect.height) * 100,
          width: nextWidth,
          customized: true
        });
      }
      moved = true;
      latestTransform = nextTransform;
      paint(nextTransform);
    };

    const handleMove = (moveEvent: PointerEvent) => {
      latestPointer = { x: moveEvent.clientX, y: moveEvent.clientY };
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        updatePosition(latestPointer.x, latestPointer.y);
      });
    };
    const handleUp = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        updatePosition(latestPointer.x, latestPointer.y);
      }
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      clearCanvasSnapGuides();
      if (!moved) return;
      const nextClips = videoClipsRef.current.map((item) => item.id === clip.id
        ? { ...item, transform: { ...latestTransform, customized: true } }
        : item);
      videoClipsRef.current = nextClips;
      setVideoClips(nextClips);
      pushEditorHistory(historySnapshot);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleUp, { once: true });
  };

  const resetVideoTransform = (
    event: ReactMouseEvent<HTMLElement>,
    clip: VideoEditorClip,
    source: VideoEditorSource
  ) => {
    if (!projectCanvasChanged) return;
    event.preventDefault();
    event.stopPropagation();
    const historySnapshot = captureEditorSnapshot();
    const sourceSize = { width: source.width, height: source.height };
    const nextTransform = createDefaultVideoTransform(sourceSize, videoSize);
    const nextClips = videoClipsRef.current.map((item) => item.id === clip.id
      ? { ...item, transform: nextTransform }
      : item);
    videoClipsRef.current = nextClips;
    setVideoClips(nextClips);
    if (videoRef.current) paintVideoTransform(videoRef.current, nextTransform, sourceSize, videoSize);
    if (videoTransformOverlayRef.current) {
      paintVideoTransform(videoTransformOverlayRef.current, nextTransform, sourceSize, videoSize);
    }
    pushEditorHistory(historySnapshot);
  };

  const startImageTransform = (event: ReactPointerEvent<HTMLElement>, track: ImageEditorTrack, action: ImageTransformAction) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedResourceId("");
    setSelectedVideoClipId("");
    setSelectedTrackId(track.id);
    setSelectedEffectId("");
    setSelectedLaneId(getTrackLaneId(track));
    setInspectorTab("tracks");
    const overlay = event.currentTarget.closest(".lossless-image-overlay") as HTMLElement | null;
    const layer = overlay?.parentElement;
    if (!layer || !overlay) return;
    const historySnapshot = captureEditorSnapshot();
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
        clearCanvasSnapGuides();
        let angleDelta = ((Math.atan2(clientY - centerY, clientX - centerX) - startAngle) * 180) / Math.PI;
        if (angleDelta > 180) angleDelta -= 360;
        if (angleDelta < -180) angleDelta += 360;
        patch = { rotation: clampValue(snapshot.rotation + angleDelta, -720, 720) };
      } else if (action === "move") {
        const snapped = snapCanvasPosition(
          ((clientX - grabOffsetX - rect.left) / Math.max(1, rect.width)) * 100,
          ((clientY - grabOffsetY - rect.top) / Math.max(1, rect.height)) * 100,
          snapshot.width,
          snapshotHeight,
          rect.width,
          rect.height
        );
        paintCanvasSnapGuides(snapped.verticalGuide, snapped.horizontalGuide);
        patch = {
          x: clampValue(snapped.x, -100, 200),
          y: clampValue(snapped.y, -100, 200)
        };
      } else {
        clearCanvasSnapGuides();
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
      clearCanvasSnapGuides();
      if (moved) {
        updateImageAtPlayhead(track, latestPatch, false);
        pushEditorHistory(historySnapshot);
      }
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
    const historySnapshot = captureEditorSnapshot();
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
    setSelectedResourceId("");
    setSelectedVideoClipId("");
    setSelectedTrackId(track.id);
    setSelectedEffectId("");
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
      if (moved) {
        updateImageKeyframe(track.id, keyframe.id, latestPosition);
        pushEditorHistory(historySnapshot);
      }
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleUp, { once: true });
  };

  const runDetect = async () => {
    if (!videoInput) return;
    reusableSourceTaskIdRef.current = undefined;
    setStatus("detecting");
    setError("");
    setProgress({ percent: 1, label: "上传视频", detail: "正在把视频交给本地处理器" });
    const nextTaskId = createVideoTaskId();
    setTaskId(nextTaskId);
    abortRef.current = new AbortController();
    const taskWatcher = watchVideoTask(nextTaskId, (info) => {
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
    });
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
        }
      );
      applyPrimaryAudioPeaks(response.audioPeaks);
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
      editUndoRef.current = editUndoRef.current.filter((entry) => entry.kind === "editor");
      editRedoRef.current = editRedoRef.current.filter((entry) => entry.kind === "editor");
      setHistoryVersion((value) => value + 1);
      const completedTaskId = response.taskId || nextTaskId;
      setTaskId(completedTaskId);
      reusableSourceTaskIdRef.current = completedTaskId;
      if (response.duration) setDuration(response.duration);
      setSegmentFilter(nextRepeats > 0 ? "repeat" : nextTransitions > 0 ? "transition" : "settings");
      setStatus("detected");
      setProgress({
        percent: 100,
        label: "检测完成",
        detail: response.message || (nextSegments.length ? `发现 ${nextRepeats} 段重复，${nextTransitions} 段上滑转场` : "没有发现满足阈值的重复或上滑转场")
      });
    } catch (err) {
      reusableSourceTaskIdRef.current = undefined;
      const message = err instanceof Error ? err.message : "检测失败";
      setStatus(abortRef.current?.signal.aborted ? "cancelled" : "error");
      setError(message);
      setProgress({ percent: 0, label: "检测未完成", detail: message });
      notify({ type: "error", title: "检测失败", message });
    } finally {
      taskWatcher.close();
      abortRef.current = null;
    }
  };

  const runExport = async () => {
    if (projectVideoDuration <= 0 || (!videoClips.length && !enabledTracks.length)) return;
    setStatus("exporting");
    setError("");
    setProgress({ percent: 15, label: "导出中", detail: automaticExportMode === "keyframe-copy" ? "画面无需重编码，正在准备原码流输出" : "正在准备最高质量精确输出" });
    if (enabledTracks.length || enabledEffects.length || hasVideoEdits || hasVideoColorAdjustments) {
      setProgress({ percent: 15, label: "导出中", detail: `正在准备 ${videoClips.length + enabledTracks.length + enabledEffects.length} 个时间轴项目` });
    }
    abortRef.current = new AbortController();
    let taskWatcher: ReturnType<typeof watchVideoTask> | undefined;
    try {
      const reusableSourceTaskId = taskId && reusableSourceTaskIdRef.current === taskId ? taskId : undefined;
      const exportTaskId = reusableSourceTaskId || createVideoTaskId();
      if (taskId !== exportTaskId) setTaskId(exportTaskId);
      const primarySourceFile = videoSources.find((source) => source.primary)?.file || videoFile || undefined;
      taskWatcher = watchVideoTask(exportTaskId, (info) => {
        if (info.status === "exporting" || info.status === "done" || info.status === "failed" || info.status === "cancelled") {
          setProgress({
            percent: clampPercent(info.progress),
            label: info.stage || "导出中",
            detail: info.message || "正在生成 MP4"
          });
        }
      });
      const hasProjectEdits = Boolean(
        enabledTracks.length
        || enabledEffects.length
        || hasVideoEdits
        || hasVideoColorAdjustments
        || hasVideoAudioAdjustments
        || projectCanvasChanged
        || enabledSubtitleTracks.length
      );
      const outputSuffix = hasProjectEdits ? "_edited.mp4" : "_clean.mp4";
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
              sourceStart: track.sourceStart,
              sourceEnd: track.sourceEnd,
              sourceVideoId: track.sourceVideoSourceId,
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
              sourceWidth: track.sourceWidth,
              sourceHeight: track.sourceHeight,
              keyframes: track.animated
                ? track.keyframes
                : [{ ...track.staticTransform, time: track.start, easing: "linear" }]
            }
      );
      const exportVideoClips: ExportVideoClip[] | undefined = videoClips.length
        ? videoClips.map((clip) => {
            const source = videoSources.find((item) => item.id === clip.sourceId);
            const transform = projectCanvasChanged && source
              ? resolveVideoTransform(clip, { width: source.width, height: source.height }, videoSize)
              : undefined;
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
              primary: Boolean(source?.primary),
              volume: readVideoClipVolume(clip),
              transform: transform
                ? { x: transform.x, y: transform.y, width: transform.width }
                : undefined,
              color: clip.color && !videoColorIsDefault(readVideoColor(clip))
                ? cloneVideoColor(clip.color)
                : undefined
            };
          })
        : undefined;
      const subtitleBackgroundEffects: ExportVideoEffect[] = enabledSubtitleTracks.flatMap((track, trackIndex) => {
        const style = readSubtitleStyle(track.style);
        if (style.backgroundBlur <= 0) return [];
        return track.cues.map((cue, cueIndex) => ({
          id: `subtitle-background-${track.id}-${cue.id}`,
          purpose: "subtitle-background" as const,
          kind: "blur",
          start: cue.start,
          end: cue.end,
          enabled: true,
          intensity: clampValue((style.backgroundBlur - 1) / 22, 0, 1),
          opacity: 1,
          speed: 1,
          density: 0,
          seed: trackIndex * 10000 + cueIndex + 1,
          mask: {
            x: style.x,
            y: style.position,
            width: style.width,
            height: subtitleBackgroundHeightPercent(cue.text, style, videoSize.width, videoSize.height)
          }
        }));
      });
      const exportEffects = [
        ...enabledEffects
          .sort((left, right) => laneLayer(right.laneId || effectLaneId) - laneLayer(left.laneId || effectLaneId))
          .map(({ laneId: _laneId, name: _name, ...effect }) => ({
            ...effect,
            mask: effect.mask ? { ...effect.mask } : undefined
          })),
        ...subtitleBackgroundEffects
      ];
      const exportSubtitleTracks: ExportSubtitleTrack[] = enabledSubtitleTracks.map((track) => {
        const style = readSubtitleStyle(track.style);
        return {
          id: track.id,
          laneId: track.laneId,
          layer: laneLayer(track.laneId),
          name: track.name,
          language: track.language,
          enabled: track.enabled,
          style,
          cues: track.cues.map((cue) => ({
            ...cue,
            text: layoutSubtitleForCanvas(cue.text, style, videoSize.width),
            words: cue.words?.map((word) => ({ ...word }))
          }))
        };
      });
      const response = await exportCleanVideo(
        {
          taskId: exportTaskId,
          input: videoInput || { name: "timeline.mp4" },
          projectDuration: projectVideoDuration,
          canvasWidth: Math.max(2, Math.round(videoSize.width)),
          canvasHeight: Math.max(2, Math.round(videoSize.height)),
          forceCanvas: projectCanvasChanged || hasVideoColorAdjustments || exportEffects.length > 0,
          sourceVideoUnchanged: videoClips.length === 1
            && !hasVideoEdits
            && !hasExternalVideoSources
            && !needsVideoComposition,
          // The timeline stays frame-accurate at 60 fps; zero tells the backend
          // to preserve the source frame rate instead of duplicating frames.
          frameRate: 0,
          // Detection results are proposals. Only edits already applied to the timeline are exported.
          segments: [],
          tracks: exportTracks,
          videoClips: exportVideoClips,
          effects: exportEffects,
          subtitleTracks: exportSubtitleTracks,
          subtitleMode: automaticSubtitleMode,
          mode: automaticExportMode,
          outputName
        },
        abortRef.current.signal,
        enabledTracks
          .filter((track) => track.type !== "audio"
            || !track.sourceVideoSourceId
            || !usedVideoSourceIds.has(track.sourceVideoSourceId))
          .map((track) => ({ trackId: track.id, file: track.file })),
        videoClips.length
          ? videoSources
              .filter((source) => !source.primary && usedVideoSourceIds.has(source.id))
              .map((source) => ({ sourceId: source.id, file: source.file }))
          : [],
        reusableSourceTaskId ? undefined : primarySourceFile,
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
      reusableSourceTaskIdRef.current = undefined;
      downloadVideoOutput(response.taskId || exportTaskId, outputName);
      setStatus("done");
      setProgress({ percent: 100, label: "导出完成", detail: `${response.message || "已输出 MP4"}，文件已开始保存：${outputName}` });
    } catch (err) {
      reusableSourceTaskIdRef.current = undefined;
      const message = err instanceof Error ? err.message : "导出失败";
      setStatus(abortRef.current?.signal.aborted ? "cancelled" : "error");
      setError(message);
      setProgress({ percent: 0, label: "导出未完成", detail: message });
      notify({ type: "error", title: "导出失败", message });
    } finally {
      taskWatcher?.close();
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
    pushHistoryEntry({ kind: "selection", values: currentValues });
    setSegments((current) => current.map((segment, index) => ({ ...segment, deleteSecond: nextValues[index] ?? segment.deleteSecond })));
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

  const applyDetectedSegmentsToTimeline = () => {
    if (taskRunning || !videoClipsRef.current.length) return;
    const timelineEnd = getTimelineProjectDuration(videoClipsRef.current, tracksRef.current, subtitleTracksRef.current);
    const ranges = mergeTimelineRemovalRanges(
      segments
        .filter((segment) => segment.deleteSecond)
        .map((segment) => ({
          start: roundTimelineFrame(segment.deleteStart ?? segment.secondStart),
          end: roundTimelineFrame(segment.deleteEnd ?? segment.secondEnd)
        })),
      timelineEnd
    );
    if (!ranges.length) return;

    const historySnapshot = captureEditorSnapshot();
    videoRef.current?.pause();
    audioPreviewRefs.current.forEach((audio) => audio.pause());
    isPlayingRef.current = false;
    setIsPlaying(false);

    const nextVideoClips = videoClipsRef.current.flatMap((clip) => {
      const pieces = timelineRangePieces(clip.start, clip.end, ranges);
      return pieces.map((piece, index) => {
        const sourceStart = clip.sourceStart + piece.start - clip.start;
        const sourceEnd = clip.sourceStart + piece.end - clip.start;
        return {
          ...cloneVideoEditorClip(clip),
          id: index === 0 ? clip.id : createEditorId("video-clip"),
          start: roundTimelineFrame(timelineTimeAfterRemovals(piece.start, ranges)),
          end: roundTimelineFrame(timelineTimeAfterRemovals(piece.end, ranges)),
          sourceStart,
          sourceEnd,
          sourceMin: piece.start > clip.start + 0.001 ? sourceStart : clip.sourceMin,
          sourceMax: piece.end < clip.end - 0.001 ? sourceEnd : clip.sourceMax
        };
      });
    }).sort((left, right) => left.start - right.start || left.end - right.end);

    const nextTracks = tracksRef.current.flatMap((track): EditorTrack[] => {
      const pieces = timelineRangePieces(track.start, track.end, ranges);
      if (!pieces.length) return [];
      if (track.type === "audio" && !track.loop) {
        return pieces.map((piece, index) => {
          const sourceStart = clampValue(track.sourceStart + piece.start - track.start, track.sourceStart, track.sourceEnd);
          const sourceEnd = clampValue(track.sourceStart + piece.end - track.start, sourceStart, track.sourceEnd);
          return {
            ...track,
            id: index === 0 ? track.id : createEditorId("audio"),
            start: roundTimelineFrame(timelineTimeAfterRemovals(piece.start, ranges)),
            end: roundTimelineFrame(timelineTimeAfterRemovals(piece.end, ranges)),
            sourceStart,
            sourceEnd,
            fadeIn: piece.start <= track.start + 0.001 ? track.fadeIn : 0,
            fadeOut: piece.end >= track.end - 0.001 ? track.fadeOut : 0,
            detachedFromVideoClipId: undefined
          };
        });
      }
      const start = roundTimelineFrame(timelineTimeAfterRemovals(pieces[0].start, ranges));
      const end = roundTimelineFrame(timelineTimeAfterRemovals(pieces[pieces.length - 1].end, ranges));
      if (track.type === "audio") return [{ ...track, start, end, detachedFromVideoClipId: undefined }];
      const shiftedKeyframes = track.keyframes
        .filter((keyframe) => !ranges.some((range) => keyframe.time >= range.start - 0.001 && keyframe.time < range.end - 0.001))
        .map((keyframe) => ({ ...keyframe, time: roundTimelineFrame(timelineTimeAfterRemovals(keyframe.time, ranges)) }));
      const shiftedTrack: ImageEditorTrack = {
        ...track,
        start,
        end,
        staticTransform: { ...track.staticTransform, time: start },
        keyframes: shiftedKeyframes
      };
      return [{ ...shiftedTrack, keyframes: clampImageKeyframesToRange(shiftedTrack, start, end) }];
    });

    const nextEffects = effectsRef.current.flatMap((effect): EditorEffect[] => {
      const pieces = timelineRangePieces(effect.start, effect.end, ranges);
      if (!pieces.length) return [];
      return [{
        ...cloneEditorEffect(effect),
        start: roundTimelineFrame(timelineTimeAfterRemovals(pieces[0].start, ranges)),
        end: roundTimelineFrame(timelineTimeAfterRemovals(pieces[pieces.length - 1].end, ranges))
      }];
    });

    const nextSubtitleTracks = subtitleTracksRef.current.map((track) => ({
      ...track,
      linkedVideoClipId: undefined,
      linkedAudioTrackId: undefined,
      cues: track.cues.flatMap((cue): SubtitleCue[] => {
        const pieces = timelineRangePieces(cue.start, cue.end, ranges);
        if (!pieces.length) return [];
        const words = cue.words?.flatMap((word) => {
          const wordPieces = timelineRangePieces(word.start, word.end, ranges);
          if (!wordPieces.length) return [];
          return [{
            ...word,
            start: roundTimelineFrame(timelineTimeAfterRemovals(wordPieces[0].start, ranges)),
            end: roundTimelineFrame(timelineTimeAfterRemovals(wordPieces[wordPieces.length - 1].end, ranges))
          }];
        });
        return [{
          ...cue,
          start: roundTimelineFrame(timelineTimeAfterRemovals(pieces[0].start, ranges)),
          end: roundTimelineFrame(timelineTimeAfterRemovals(pieces[pieces.length - 1].end, ranges)),
          words: words?.length ? words : undefined
        }];
      })
    })).filter((track) => track.cues.length > 0);

    videoClipsRef.current = nextVideoClips;
    tracksRef.current = nextTracks;
    effectsRef.current = nextEffects;
    setVideoClips(nextVideoClips);
    setTracks(nextTracks);
    setEffects(nextEffects);
    commitSubtitleTracks(nextSubtitleTracks);
    const nextLaneOrder = mergeTimelineLaneOrder(
      timelineLaneOrderRef.current,
      nextVideoClips,
      nextTracks,
      nextEffects,
      subtitleTracksRef.current
    );
    timelineLaneOrderRef.current = nextLaneOrder;
    setTimelineLaneOrder(nextLaneOrder);
    setSelectedVideoClipId("");
    setSelectedTrackId("");
    setSelectedEffectId("");
    setSelectedSubtitleTrackId("");
    setSelectedSubtitleCueId("");
    setSelectedLaneId("");
    setSelectedKeyframeId("");

    const nextDuration = getTimelineProjectDuration(nextVideoClips, nextTracks, subtitleTracksRef.current);
    const nextTime = clampValue(timelineTimeAfterRemovals(currentTimeRef.current, ranges), 0, nextDuration);
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
    pushEditorHistory(historySnapshot);
    resetResult();
    setProgress({
      percent: 100,
      label: "已应用到时间轴",
      detail: `删除 ${ranges.length} 个区间，时间轴缩短 ${formatCompactDuration(ranges.reduce((sum, range) => sum + range.end - range.start, 0))}`
    });
    setStatus("done");
    window.requestAnimationFrame(() => seekPreview(nextTime, false, false));
  };

  const syncAudioPreviews = (time: number, shouldPlay: boolean) => {
    tracks.forEach((track) => {
      if (track.type !== "audio") return;
      const audio = audioPreviewRefs.current.get(track.id);
      if (!audio) return;
      const localTime = time - track.start;
      const active = track.enabled && time >= track.start && time < track.end;
      const sourceRangeDuration = Math.max(0, track.sourceEnd - track.sourceStart);
      const playable = active && (track.loop || sourceRangeDuration <= 0 || localTime < sourceRangeDuration);
      if (!playable) {
        audio.pause();
        return;
      }
      const sourceTime = track.sourceStart + (
        track.loop && sourceRangeDuration > 0 ? localTime % sourceRangeDuration : Math.max(0, localTime)
      );
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

  const seekVideoPreviewFrame = (video: HTMLVideoElement, clip: VideoEditorClip, timelineTime: number) => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    const sourceTime = resolveVideoPreviewSourceTime(clip, timelineTime, video.duration);
    if (Math.abs(video.currentTime - sourceTime) <= 0.0001) return;
    video.currentTime = sourceTime;
  };

  const applyPendingVideoSeek = (video: HTMLVideoElement) => {
    const pending = pendingVideoSeekRef.current;
    const clip = videoClipsRef.current.find((item) => item.id === activeVideoClipIdRef.current);
    if (!pending || !clip) return;
    seekVideoPreviewFrame(video, clip, pending.time);
    video.playbackRate = playbackRate;
    applyVideoPreviewGain(video, clip);
    pendingVideoSeekRef.current = null;
    syncAudioPreviews(pending.time, pending.shouldPlay);
    if (pending.shouldPlay) void video.play().catch(() => undefined);
  };

  const seekPreview = (seconds: number, shouldPlay = true, preservePlayback = true) => {
    const clips = videoClipsRef.current;
    const projectDuration = getTimelineProjectDuration(clips, tracksRef.current, subtitleTracksRef.current);
    const nextTime = clampValue(seconds, 0, Math.max(0, projectDuration));
    const clip = findVideoClipAtTime(clips, nextTime, timelineLaneOrderRef.current);
    const video = videoRef.current;
    const continuePlayback = shouldPlay || (preservePlayback && isPlayingRef.current);
    playbackAnchorRef.current = { time: nextTime, startedAt: performance.now() };
    pendingVideoSeekRef.current = { time: nextTime, shouldPlay: continuePlayback };
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
    syncAudioPreviews(nextTime, continuePlayback);
    if (continuePlayback !== isPlayingRef.current) {
      isPlayingRef.current = continuePlayback;
      setIsPlaying(continuePlayback);
    }
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

  useEffect(() => {
    if (currentTimeRef.current <= projectVideoDuration + 0.0001) return;
    const nextTime = clampValue(roundTimelineFrame(projectVideoDuration), 0, projectVideoDuration);
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
    const frameId = window.requestAnimationFrame(() => seekPreview(nextTime, false, false));
    return () => window.cancelAnimationFrame(frameId);
  }, [projectVideoDuration]);

  const togglePlayback = () => {
    const projectDuration = getTimelineProjectDuration(videoClipsRef.current, tracksRef.current, subtitleTracksRef.current);
    if (projectDuration <= 0.001) return;
    if (isPlaying) {
      videoRef.current?.pause();
      isPlayingRef.current = false;
      setIsPlaying(false);
      syncAudioPreviews(currentTime, false);
      return;
    }
    const graph = ensureVideoAudioGraph();
    const activeClip = videoClipsRef.current.find((clip) => clip.id === activeVideoClipIdRef.current);
    if (graph && activeClip) applyVideoPreviewGain(graph.element, activeClip);
    seekPreview(currentTime >= projectDuration - 0.001 ? 0 : currentTime, true);
  };

  const changeTimelineZoom = (exponent: number) => {
    const nextZoom = 2 ** clampValue(exponent, timelineMinZoomExponent, timelineMaxZoomExponent);
    const viewport = timelineScrollRef.current;
    if (!viewport || !timelineDuration) {
      setTimelineZoom(nextZoom);
      return;
    }
    const playheadPosition = timelineEdgeSpacePx + currentTime * timelineGeometry.pixelsPerSecond;
    const playheadViewportX = playheadPosition - viewport.scrollLeft;
    const playheadIsVisible = playheadViewportX >= 0 && playheadViewportX <= viewport.clientWidth;
    const anchorViewportX = playheadIsVisible ? playheadViewportX : viewport.clientWidth / 2;
    const anchorTime = playheadIsVisible
      ? currentTime
      : clampValue(
          (viewport.scrollLeft + anchorViewportX - timelineEdgeSpacePx) / Math.max(0.000001, timelineGeometry.pixelsPerSecond),
          0,
          timelineDisplayDuration
        );
    const nextGeometry = calculateTimelineGeometry(viewport.clientWidth, timelineBaseDuration, timelineDuration, nextZoom);
    setTimelineZoom(nextZoom);
    window.requestAnimationFrame(() => {
      const nextScrollLeft = clampValue(
        timelineEdgeSpacePx + anchorTime * nextGeometry.pixelsPerSecond - anchorViewportX,
        0,
        Math.max(0, nextGeometry.canvasWidth - viewport.clientWidth)
      );
      viewport.scrollLeft = nextScrollLeft;
      setTimelineViewport({ width: viewport.clientWidth, scrollLeft: nextScrollLeft });
    });
  };

  const snapTimelinePlayheadTime = (time: number, requestedStep = timelineScale.minorStep) => {
    const step = Math.max(1 / timelineFps, requestedStep);
    const snapped = roundTimelineFrame(Math.round(Math.max(0, time) / step) * step);
    return clampValue(snapped, 0, Math.max(0, projectVideoDuration));
  };

  const startTimelineScrub = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const ruler = event.currentTarget.matches(".lossless-timeline-ruler")
      ? event.currentTarget
      : event.currentTarget.closest(".lossless-timeline-content")?.querySelector<HTMLElement>(".lossless-timeline-ruler");
    if (!ruler) return;
    let lastSnappedTime = Number.NaN;
    const seekAtPointer = (clientX: number) => {
      const rect = ruler.getBoundingClientRect();
      const rawTime = clampValue(((clientX - rect.left) / Math.max(1, rect.width)) * timelineDisplayDuration, 0, timelineDisplayDuration);
      const time = snapTimelinePlayheadTime(rawTime);
      if (Math.abs(time - lastSnappedTime) < 0.5 / timelineFps) return;
      lastSnappedTime = time;
      seekPreview(time, false);
    };
    seekAtPointer(event.clientX);
    const handleMove = (moveEvent: PointerEvent) => seekAtPointer(moveEvent.clientX);
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      window.removeEventListener("blur", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleUp, { once: true });
    window.addEventListener("blur", handleUp, { once: true });
  };

  const handleTimelineRulerKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const jumpStep = event.shiftKey ? timelineScale.majorStep : timelineScale.minorStep;
    const target = event.key === "ArrowLeft"
      ? (Math.ceil(currentTime / jumpStep - 0.000001) - 1) * jumpStep
      : event.key === "ArrowRight"
        ? (Math.floor(currentTime / jumpStep + 0.000001) + 1) * jumpStep
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? projectVideoDuration
            : undefined;
    if (target === undefined) return;
    event.preventDefault();
    seekPreview(event.key === "End" ? projectVideoDuration : snapTimelinePlayheadTime(target, jumpStep), false);
  };

  const stepFrame = (direction: -1 | 1) => {
    videoRef.current?.pause();
    isPlayingRef.current = false;
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
    const video = videoRef.current;
    const clip = videoClipsRef.current.find((item) => item.id === activeVideoClipIdRef.current);
    if (video && clip) {
      const graph = ensureVideoAudioGraph();
      applyVideoPreviewGain(graph?.element || video, clip, nextMuted);
    } else if (video) {
      video.muted = nextMuted;
    }
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
      height: video.videoHeight || source.height || 9,
      hasAudio: inspectVideoHasAudio(video) ?? source.hasAudio
    };
    const nextSources = videoSourcesRef.current.map((item) => item.id === source.id ? { ...item, ...metadata } : item);
    videoSourcesRef.current = nextSources;
    setVideoSources(nextSources);
    video.playbackRate = playbackRate;
    if (currentClip) applyVideoPreviewGain(video, currentClip);
    else {
      video.volume = 1;
      video.muted = isMuted;
    }

    if (source.primary) {
      setDuration(metadata.duration);
    }
    window.requestAnimationFrame(() => applyPendingVideoSeek(video));
  };

  const handlePreviewLoadedData = (video: HTMLVideoElement) => {
    const clip = videoClipsRef.current.find((item) => item.id === activeVideoClipIdRef.current);
    if (clip) {
      applyVideoPreviewGain(video, clip);
      seekVideoPreviewFrame(video, clip, currentTimeRef.current);
    }
  };

  useEffect(() => {
    if (!isPlaying) return;
    playbackAnchorRef.current = { time: currentTime, startedAt: performance.now() };
    let frameId = 0;
    const tick = (now: number) => {
      if (!isPlayingRef.current || timelineMaterialDragLockRef.current) return;
      const projectDuration = getTimelineProjectDuration(videoClipsRef.current, tracksRef.current, subtitleTracksRef.current);
      const anchor = playbackAnchorRef.current;
      const nextTime = anchor.time + (now - anchor.startedAt) / 1000 * playbackRate;
      if (nextTime >= projectDuration - 0.0005) {
        currentTimeRef.current = projectDuration;
        setCurrentTime(projectDuration);
        isPlayingRef.current = false;
        setIsPlaying(false);
        videoRef.current?.pause();
        syncAudioPreviews(projectDuration, false);
        return;
      }
      currentTimeRef.current = nextTime;
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
    const sourceTime = resolveVideoPreviewSourceTime(clip, currentTime, video.duration);
    const atClipBoundary = currentTime <= clip.start + 0.0005 || currentTime >= clip.end - 0.0005;
    if (Math.abs(video.currentTime - sourceTime) > (atClipBoundary ? 0.0001 : 0.18)) {
      seekVideoPreviewFrame(video, clip, currentTime);
    }
    video.playbackRate = playbackRate;
    applyVideoPreviewGain(video, clip);
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
      const isEditingText = Boolean(target?.closest("input, select, textarea, [contenteditable='true']"));
      const commandKey = event.metaKey || event.ctrlKey;
      const undoShortcut = commandKey && event.key.toLowerCase() === "z" && !event.shiftKey;
      const redoShortcut = commandKey && (
        (event.key.toLowerCase() === "z" && event.shiftKey)
        || (!event.metaKey && event.key.toLowerCase() === "y")
      );
      if (!isEditingText && (undoShortcut || redoShortcut)) {
        event.preventDefault();
        if (redoShortcut) redoEdit();
        else undoEdit();
        return;
      }
      if (!isEditingText && commandKey && event.key.toLowerCase() === "a" && selectedSubtitleTrackId) {
        event.preventDefault();
        selectAllSubtitleCues(selectedSubtitleTrackId);
        return;
      }
      if (isEditingText || target?.closest("button")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        splitSelectedTimelineMaterial();
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setTimelineTool("blade");
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && (event.key.toLowerCase() === "a" || event.key === "Escape")) {
        event.preventDefault();
        setTimelineTool("select");
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        if (selectedSubtitleTrackId && selectedSubtitleCueId) {
          event.preventDefault();
          if (selectedSubtitleCueId === allSubtitleCuesSelectionId) removeSubtitleTrack(selectedSubtitleTrackId);
          else removeSubtitleCue(selectedSubtitleTrackId, selectedSubtitleCueId);
        } else if (selectedEffectId) {
          event.preventDefault();
          removeVideoEffect(selectedEffectId);
        } else if (selectedVideoClipId) {
          event.preventDefault();
          removeVideoClip(selectedVideoClipId);
        } else if (selectedTrackId) {
          event.preventDefault();
          removeTrack(selectedTrackId);
        } else if (selectedResourceId) {
          const resource = importedResources.find((item) => item.id === selectedResourceId);
          if (resource) {
            event.preventDefault();
            removeImportedResource(resource);
          }
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

  const statusIcon = status === "detecting" || status === "transcribing" || status === "separating" || status === "exporting" ? <Loader2 className="spin" size={18} /> : status === "done" || status === "detected" ? <CheckCircle2 size={18} /> : status === "error" ? <XCircle size={18} /> : <ShieldCheck size={18} />;
  const contextMenuTarget = mediaContextMenu?.target;
  const contextMenuResource = contextMenuTarget?.kind === "resource"
    ? importedResources.find((resource) => resource.id === contextMenuTarget.resourceId)
    : undefined;
  const contextMenuVideoClip = contextMenuTarget?.kind === "video-clip"
    ? videoClips.find((clip) => clip.id === contextMenuTarget.clipId)
    : undefined;
  const contextMenuVideoSource = contextMenuVideoClip
    ? videoSources.find((source) => source.id === contextMenuVideoClip.sourceId)
    : undefined;
  const contextMenuAudioSeparated = Boolean(contextMenuVideoClip?.audioDetached);
  const contextMenuTrack = contextMenuTarget?.kind === "track"
    ? tracks.find((track) => track.id === contextMenuTarget.trackId)
    : undefined;
  const contextMenuSubtitleTrack = contextMenuTarget?.kind === "subtitle-cue"
    ? subtitleTracks.find((track) => track.id === contextMenuTarget.trackId)
    : undefined;
  const contextMenuSubtitleCue = contextMenuTarget?.kind === "subtitle-cue"
    ? contextMenuSubtitleTrack?.cues.find((cue) => cue.id === contextMenuTarget.cueId)
    : undefined;
  const contextMenuSubtitleTime = contextMenuTarget?.kind === "subtitle-cue" && contextMenuSubtitleCue
    ? roundTimelineFrame(clampValue(contextMenuTarget.time, contextMenuSubtitleCue.start, contextMenuSubtitleCue.end))
    : 0;
  const canContextMenuSplitSubtitle = Boolean(
    contextMenuSubtitleCue
    && contextMenuSubtitleTime > contextMenuSubtitleCue.start + minimumTimelineClipDuration
    && contextMenuSubtitleTime < contextMenuSubtitleCue.end - minimumTimelineClipDuration
  );
  const contextMenuSplitTime = contextMenuTarget?.kind === "video-clip" && contextMenuVideoClip
    ? roundTimelineFrame(clampValue(contextMenuTarget.time, contextMenuVideoClip.start, contextMenuVideoClip.end))
    : 0;
  const canContextMenuSplit = Boolean(
    contextMenuVideoClip
    && contextMenuSplitTime > contextMenuVideoClip.start + minimumTimelineClipDuration
    && contextMenuSplitTime < contextMenuVideoClip.end - minimumTimelineClipDuration
  );
  const contextMenuTrackSplitTime = contextMenuTarget?.kind === "track" && contextMenuTrack?.type === "audio"
    ? roundTimelineFrame(clampValue(contextMenuTarget.time, contextMenuTrack.start, contextMenuTrack.end))
    : 0;
  const canContextMenuSplitAudio = Boolean(
    contextMenuTrack?.type === "audio"
    && contextMenuTrackSplitTime > contextMenuTrack.start + minimumTimelineClipDuration
    && contextMenuTrackSplitTime < contextMenuTrack.end - minimumTimelineClipDuration
  );
  const contextMenuResourceUsageCount = contextMenuResource
    ? videoClips.filter((clip) => clip.sourceId === contextMenuResource.id).length
      + tracks.filter((track) => track.sourceId === contextMenuResource.id).length
    : 0;
  const contextMenuResourceDeleteTitle = contextMenuResourceUsageCount
    ? `删除资源并同步删除时间轴中的 ${contextMenuResourceUsageCount} 个素材`
    : "删除资源";

  return (
    <section className="workspace module-workspace lossless-video-page">
      <section className="data-panel data-panel-full data-panel-compact lossless-video-panel">
        <header className="table-toolbar lossless-video-toolbar">
          <div className="lossless-toolbar-group">
            <button className="lossless-icon-button" type="button" title="撤销（⌘Z / Ctrl+Z）" aria-label="撤销" onClick={undoEdit} disabled={!canUndoEdit || taskRunning}>
              <Undo2 size={16} />
            </button>
            <button className="lossless-icon-button" type="button" title="重做（⌘⇧Z / Ctrl+Y）" aria-label="重做" onClick={redoEdit} disabled={!canRedoEdit || taskRunning}>
              <Redo2 size={16} />
            </button>
            <button className="lossless-icon-button" type="button" title="全选待删除片段" aria-label="全选待删除片段" onClick={() => setAllSegments(true)} disabled={!segments.length}>
              <ListChecks size={16} />
            </button>
            <button className="lossless-icon-button" type="button" title="重置检测结果" aria-label="重置检测结果" onClick={resetResult} disabled={taskRunning}>
              <RotateCcw size={16} />
            </button>
            <button className="lossless-icon-button text-danger" type="button" title="取消当前任务" aria-label="取消当前任务" onClick={cancelTask} disabled={!taskRunning}>
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
            <button className={inspectorTab === "subtitles" ? "is-active" : ""} type="button" role="tab" aria-selected={inspectorTab === "subtitles"} onClick={() => setInspectorTab("subtitles")}>
              <Captions size={16} />
              字幕
            </button>
            <button className={inspectorTab === "effects" ? "is-active" : ""} type="button" role="tab" aria-selected={inspectorTab === "effects"} onClick={() => setInspectorTab("effects")}>
              <Sparkles size={16} />
              特效
            </button>
            <button className={inspectorTab === "export" ? "is-active" : ""} type="button" role="tab" aria-selected={inspectorTab === "export"} onClick={() => setInspectorTab("export")}>
              <Download size={16} />
              导出
            </button>
            <button
              className={inspectorTab === "settings" ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={inspectorTab === "settings"}
              onClick={() => {
                setInspectorTab("settings");
                if (!audioSeparationStatus && !audioSeparationStatusLoading) void checkAudioSeparationStatus();
                if (!subtitleEngineStatus && !subtitleEngineStatusLoading) void checkSubtitleEngineStatus();
              }}
            >
              <Settings2 size={16} />
              设置
            </button>
          </nav>
          <div className="lossless-file-chip" title={importedResources.map((resource) => resource.name).join("\n")}>
            <FileVideo size={16} />
            <strong>{importedResources.length ? `${importedResources.length} 个已导入资源` : "未导入资源"}</strong>
            {videoClips.length + tracks.length + effects.length + subtitleTracks.length > 0 ? <span>{videoClips.length + tracks.length + effects.length + subtitleTracks.length} 个时间轴素材</span> : null}
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
        <input
          ref={subtitleInputRef}
          className="lossless-file-input"
          type="file"
          accept=".srt,.vtt,.ass,.ssa,text/vtt,application/x-subrip"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importSubtitleFile(file);
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
                      <svg className="lossless-video-filter-defs" aria-hidden="true">
                        <defs>
                          <filter id="lossless-active-video-grade" colorInterpolationFilters="sRGB">
                            <feComponentTransfer>
                              <feFuncR type="table" tableValues={activeVideoColorTables[0]} />
                              <feFuncG type="table" tableValues={activeVideoColorTables[1]} />
                              <feFuncB type="table" tableValues={activeVideoColorTables[2]} />
                            </feComponentTransfer>
                            <feColorMatrix type="saturate" values={String(activeVideoColor.saturation)} />
                          </filter>
                        </defs>
                      </svg>
                      <div
                        className="lossless-video-stage"
                        style={{
                          left: previewVideoRect.left,
                          top: previewVideoRect.top,
                          width: previewVideoRect.width,
                          height: previewVideoRect.height
                        }}
                      >
                        {activeVideoSource && activeVideoClip && activeVideoTransform ? (
                          <video
                            ref={videoRef}
                            src={activeVideoSource.previewUrl}
                            preload="auto"
                            playsInline
                            draggable={false}
                            style={{
                              left: `${activeVideoTransform.x}%`,
                              top: `${activeVideoTransform.y}%`,
                              width: `${activeVideoTransform.width}%`,
                              height: `${activeVideoTransformHeight}%`,
                              transform: "translate3d(-50%, -50%, 0)",
                              filter: videoColorIsDefault(activeVideoColor) ? undefined : "url(#lossless-active-video-grade)"
                            }}
                            onPointerDown={(event) => {
                              if (projectCanvasChanged) startVideoTransform(event, activeVideoClip, activeVideoSource, "move");
                            }}
                            onDoubleClick={(event) => resetVideoTransform(event, activeVideoClip, activeVideoSource)}
                            onClick={projectCanvasChanged ? undefined : togglePlayback}
                            onLoadedMetadata={(event) => handlePreviewLoadedMetadata(event.currentTarget)}
                            onLoadedData={(event) => handlePreviewLoadedData(event.currentTarget)}
                          />
                        ) : (
                          <div className="lossless-preview-canvas" onClick={togglePlayback} />
                        )}
                      </div>
                      <div
                        className="lossless-media-overlay"
                        style={{
                          left: previewVideoRect.left,
                          top: previewVideoRect.top,
                          width: previewVideoRect.width,
                          height: previewVideoRect.height
                        }}
                      >
                        <div ref={canvasVerticalGuideRef} className="lossless-canvas-snap-guide is-vertical" aria-hidden="true" />
                        <div ref={canvasHorizontalGuideRef} className="lossless-canvas-snap-guide is-horizontal" aria-hidden="true" />
                        {activeVideoTransformSelected && activeVideoClip && activeVideoSource && activeVideoTransform ? (
                          <div
                            ref={videoTransformOverlayRef}
                            className="lossless-video-transform-overlay"
                            data-clip-id={activeVideoClip.id}
                            role="group"
                            aria-label={`调整视频 ${activeVideoClip.name}`}
                            title="拖动画面；拖动四角等比例缩放；双击恢复适配"
                            style={{
                              left: `${activeVideoTransform.x}%`,
                              top: `${activeVideoTransform.y}%`,
                              width: `${activeVideoTransform.width}%`,
                              height: `${activeVideoTransformHeight}%`,
                              transform: "translate3d(-50%, -50%, 0)",
                              zIndex: Math.max(1, timelineLanes.length - activeVideoLayer)
                            }}
                            onPointerDown={(event) => startVideoTransform(event, activeVideoClip, activeVideoSource, "move")}
                            onDoubleClick={(event) => resetVideoTransform(event, activeVideoClip, activeVideoSource)}
                          >
                            {videoResizeHandles.map((handle) => (
                              <button
                                className={`lossless-video-transform-handle is-${handle}`}
                                type="button"
                                key={handle}
                                title="等比例缩放视频"
                                aria-label={`从 ${handle} 角等比例缩放视频`}
                                onPointerDown={(event) => startVideoTransform(event, activeVideoClip, activeVideoSource, `resize-${handle}`)}
                              />
                            ))}
                          </div>
                        ) : null}
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
                                setSelectedResourceId("");
                                setSelectedVideoClipId("");
                                setSelectedTrackId(track.id);
                                setSelectedEffectId("");
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
                                  updateImageKeyframe(selectedImageTrack.id, keyframe.id, position, true);
                                }}
                              >
                                <Diamond size={13} fill={selectedKeyframeId === keyframe.id ? "currentColor" : "var(--card-bg)"} />
                              </button>
                            ))
                          : null}
                        {activeEffects.map((effect) => effectIsLocal(effect) && effect.mask ? (
                          <div
                            className={`lossless-local-effect-preview is-${effect.kind} ${selectedEffectId === effect.id ? "is-selected" : ""}`}
                            key={`${effect.id}-preview`}
                            role="button"
                            tabIndex={0}
                            aria-label={`调整${effect.name}区域`}
                            title="拖动调整区域，拖动右下角调整大小"
                            style={{
                              left: `${effect.mask.x}%`,
                              top: `${effect.mask.y}%`,
                              width: `${effect.mask.width}%`,
                              height: `${effect.mask.height}%`,
                              opacity: effect.opacity,
                              backdropFilter: effect.kind === "blur" ? `blur(${1 + effect.intensity * 18}px)` : `blur(${0.5 + effect.intensity * 2}px) contrast(${1 + effect.intensity * 0.35})`
                            }}
                            onPointerDown={(event) => {
                              setSelectedResourceId("");
                              setSelectedVideoClipId("");
                              setSelectedTrackId("");
                              setSelectedEffectId(effect.id);
                              setSelectedLaneId(effect.laneId || effectLaneId);
                              setSelectedKeyframeId("");
                              setInspectorTab("effects");
                              startEffectMaskTransform(event, effect, "move");
                            }}
                          >
                            {selectedEffectId === effect.id ? (
                              <button
                                className="lossless-local-effect-resize"
                                type="button"
                                title="调整特效区域大小"
                                aria-label="调整特效区域大小"
                                onPointerDown={(event) => startEffectMaskTransform(event, effect, "resize")}
                              />
                            ) : null}
                          </div>
                        ) : (
                          <GlobalEffectPreview key={`${effect.id}-preview`} effect={effect} time={currentTime} />
                        ))}
                        {activeSubtitle && activeSubtitleStyle ? (
                          <div
                            className={`lossless-subtitle-preview ${selectedSubtitleTrackId === activeSubtitle.track.id && (selectedSubtitleCueId === activeSubtitle.cue.id || selectedSubtitleCueId === allSubtitleCuesSelectionId) ? "is-selected" : ""}`}
                            role="button"
                            tabIndex={0}
                            title="拖动字幕；拖动四角缩放"
                            aria-label={`字幕：${activeSubtitle.cue.text}`}
                            onPointerDown={(event) => startSubtitleCanvasTransform(event, activeSubtitle.track, activeSubtitle.cue, "move")}
                            onClick={(event) => {
                              event.stopPropagation();
                              selectSubtitleCue(activeSubtitle.track.id, activeSubtitle.cue.id, false);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") return;
                              event.preventDefault();
                              selectSubtitleCue(activeSubtitle.track.id, activeSubtitle.cue.id, false);
                            }}
                            style={{
                              left: `${activeSubtitleStyle.x}%`,
                              top: `${activeSubtitleStyle.position}%`,
                              width: `${activeSubtitleStyle.width}%`,
                              transform: "translate3d(-50%, -50%, 0)",
                              color: activeSubtitleStyle.color,
                              fontFamily: activeSubtitleStyle.fontFamily,
                              fontSize: `${Math.max(10, activeSubtitleStyle.fontSize / Math.max(1, videoSize.height) * previewVideoRect.height)}px`,
                              fontWeight: activeSubtitleStyle.fontFamily === "LXGW WenKai TC"
                                ? activeSubtitleStyle.bold ? 400 : 300
                                : activeSubtitleStyle.bold ? 700 : 400,
                              fontStyle: activeSubtitleStyle.italic ? "italic" : "normal",
                              textDecoration: activeSubtitleStyle.underline ? "underline" : "none",
                              textAlign: activeSubtitleStyle.alignment,
                              WebkitTextFillColor: activeSubtitleStyle.color,
                              WebkitTextStroke: `${Math.max(0, activeSubtitleStyle.outlineWidth / Math.max(1, videoSize.height) * previewVideoRect.height)}px ${activeSubtitleStyle.outlineColor}`,
                              paintOrder: "stroke fill",
                              background: hexColorWithAlpha(activeSubtitleStyle.backgroundColor, activeSubtitleStyle.backgroundAlpha),
                              backdropFilter: activeSubtitleStyle.backgroundBlur > 0
                                ? `blur(${activeSubtitleStyle.backgroundBlur / Math.max(1, videoSize.height) * previewVideoRect.height}px)`
                                : "none",
                              WebkitBackdropFilter: activeSubtitleStyle.backgroundBlur > 0
                                ? `blur(${activeSubtitleStyle.backgroundBlur / Math.max(1, videoSize.height) * previewVideoRect.height}px)`
                                : "none"
                            }}
                          >
                            {layoutSubtitleForCanvas(activeSubtitle.cue.text, activeSubtitleStyle, videoSize.width)}
                            {selectedSubtitleTrackId === activeSubtitle.track.id && (selectedSubtitleCueId === activeSubtitle.cue.id || selectedSubtitleCueId === allSubtitleCuesSelectionId) ? subtitleResizeHandles.map((handle) => (
                              <button
                                className={`lossless-subtitle-transform-handle is-${handle}`}
                                type="button"
                                key={handle}
                                title="缩放字幕"
                                aria-label={`从 ${handle} 角缩放字幕`}
                                onPointerDown={(event) => startSubtitleCanvasTransform(event, activeSubtitle.track, activeSubtitle.cue, `resize-${handle}`)}
                              />
                            )) : null}
                          </div>
                        ) : null}
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
                    <button
                      className={timelineTool === "select" ? "is-active" : ""}
                      type="button"
                      title="选择工具 (A)"
                      aria-label="选择工具"
                      aria-pressed={timelineTool === "select"}
                      onClick={() => {
                        hideTimelineBladeGuide();
                        setTimelineTool("select");
                      }}
                    >
                      <MousePointer2 size={15} />
                    </button>
                    <button
                      className={timelineTool === "blade" ? "is-active" : ""}
                      type="button"
                      title="刀片工具 (B)，在时间轴切割当前选中的视频或音频素材"
                      aria-label="刀片工具"
                      aria-pressed={timelineTool === "blade"}
                      onClick={() => setTimelineTool((current) => {
                        if (current === "blade") hideTimelineBladeGuide();
                        return current === "blade" ? "select" : "blade";
                      })}
                      disabled={!videoClips.length && !tracks.some((track) => track.type === "audio")}
                    >
                      <Scissors size={15} />
                    </button>
                    <button type="button" title="删除选中视频片段" aria-label="删除视频片段" onClick={() => selectedVideoClip && removeVideoClip(selectedVideoClip.id)} disabled={!selectedVideoClip}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="lossless-timeline-transport" aria-label="预览控制">
                    <span className="lossless-timecode" title={`${formatSeconds(currentTime)} / ${projectVideoDuration ? formatSeconds(projectVideoDuration) : "--:--"}`}>
                      {formatTimelineTimecode(safeCurrentTime, timelineFps)} / {projectVideoDuration ? formatTimelineTimecode(projectVideoDuration, timelineFps) : "--:--:--:--"}
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
                    <div
                      className="lossless-project-aspect-control"
                      title={`作品画布 ${Math.round(videoSize.width)} × ${Math.round(videoSize.height)}`}
                    >
                      <Ratio size={15} />
                      <AppSelect
                        className="lossless-transport-select lossless-project-aspect-select"
                        value={projectAspectPreset}
                        options={projectAspectOptions}
                        menuClassName="lossless-transport-menu lossless-project-aspect-menu"
                        matchTriggerWidth
                        maxMenuHeight={350}
                        onChange={changeProjectAspect}
                        ariaLabel="作品尺寸比例"
                        disabled={projectVideoDuration <= 0}
                      />
                    </div>
                    <label className="lossless-timeline-zoom-control">
                      <ZoomIn size={15} />
                      <EditorRange
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
                  <div
                    className="lossless-timeline-canvas"
                    style={{
                      width: `${timelineGeometry.canvasWidth}px`,
                      minHeight: `${timelineCanvasBaseHeightPx + timelineLanes.length * timelineLanePitchPx}px`
                    }}
                  >
                    <div
                      className={`lossless-timeline-content ${timelineDropActive ? "is-resource-dragging" : ""} ${effectDropPreview ? `is-effect-dragging ${effectDropPreview.valid ? "is-valid-effect-drop" : "is-invalid-effect-drop"}` : ""} ${timelineTool === "blade" ? "is-blade-tool" : ""}`}
                      onPointerMove={(event) => {
                        if (timelineTool === "blade") updateTimelineBladeGuide(event.currentTarget, event.clientX);
                      }}
                      onPointerLeave={() => {
                        if (timelineTool === "blade") hideTimelineBladeGuide();
                      }}
                      onPointerDownCapture={cutSelectedTimelineMaterialWithBlade}
                      onDragEnter={(event) => {
                        const dragTypes = Array.from(event.dataTransfer.types);
                        if (!dragTypes.includes(resourceDragMime) && !dragTypes.includes(effectDragMime)) return;
                        event.preventDefault();
                        event.stopPropagation();
                        setTimelineDropActive(dragTypes.includes(resourceDragMime));
                      }}
                      onDragOver={(event) => {
                        const dragTypes = Array.from(event.dataTransfer.types);
                        if (dragTypes.includes(effectDragMime)) {
                          const kind = draggedEffectKindRef.current || event.dataTransfer.getData(effectDragMime);
                          if (!isVideoEffectKind(kind)) return;
                          event.preventDefault();
                          event.stopPropagation();
                          setTimelineDropActive(false);
                          const preview = updateEffectDropPreview(event.currentTarget, event.clientX, kind);
                          event.dataTransfer.dropEffect = preview.valid ? "copy" : "none";
                          window.requestAnimationFrame(() => markTimelineLaneDropTarget(effectLaneId));
                          return;
                        }
                        if (!dragTypes.includes(resourceDragMime)) return;
                        event.preventDefault();
                        event.stopPropagation();
                        event.dataTransfer.dropEffect = "copy";
                        setTimelineDropActive(true);
                        setEffectDropPreview(null);
                        const resource = importedResources.find((item) => item.id === selectedResourceId);
                        if (resource) {
                          const laneDrop = resolveTimelineLanePlacement(event.clientY, resource.type, "resource-drop-preview");
                          markTimelineLaneDropTarget(
                            laneDrop.kind === "existing" ? laneDrop.laneId : "",
                            laneDrop.kind === "create" ? laneDrop.insertionIndex : undefined
                          );
                        }
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          setTimelineDropActive(false);
                          setEffectDropPreview(null);
                          markTimelineLaneDropTarget();
                        }
                      }}
                      onDrop={handleTimelineDrop}
                    >
                      <div
                        className="lossless-timeline-ruler"
                        title="点击或拖动定位播放头"
                        role="slider"
                        tabIndex={projectVideoDuration > 0 ? 0 : -1}
                        aria-label="播放进度"
                        aria-valuemin={0}
                        aria-valuemax={projectVideoDuration}
                        aria-valuenow={safeCurrentTime}
                        aria-valuetext={formatTimelineTimecode(safeCurrentTime, timelineFps)}
                        onPointerDown={startTimelineScrub}
                        onKeyDown={handleTimelineRulerKeyDown}
                      >
                        <i
                          className="lossless-timeline-ruler-progress"
                          style={{ width: `${(safeCurrentTime / timelineDisplayDuration) * 100}%` }}
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
                      <div ref={timelineLaneDropIndicatorRef} className="lossless-lane-drop-indicator" aria-hidden="true" />
                      <div ref={timelineBladeGuideRef} className="lossless-blade-guide" aria-hidden="true" />
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
                          className={`lossless-media-track-row is-${lane.type} ${selectedLaneId === lane.id && (lane.type === "effect" ? !selectedEffectId : lane.type === "video" ? !selectedVideoClipId : lane.type === "subtitle" ? !selectedSubtitleCueId : !selectedTrackId) ? "is-selected" : ""}`}
                          key={`${lane.id}-timeline`}
                          style={{ top: `${timelineLaneTopPx + laneIndex * timelineLanePitchPx}px` }}
                          data-lane-id={lane.id}
                          data-lane-type={lane.type}
                          aria-label={`${lane.type === "effect" ? "特效" : lane.type === "video" ? "视频" : lane.type === "audio" ? "音频" : lane.type === "subtitle" ? "字幕" : "图片"}轨道，${lane.type === "effect" ? lane.effects.length : lane.type === "video" ? lane.videoClips.length : lane.type === "subtitle" ? lane.subtitleCues.length : lane.clips.length} 个素材`}
                          onPointerDown={(event) => {
                            setSelectedLaneId(lane.id);
                            if (event.target === event.currentTarget) {
                              setSelectedVideoClipId("");
                              setSelectedTrackId("");
                              setSelectedEffectId("");
                              setSelectedSubtitleTrackId(lane.type === "subtitle" ? lane.subtitleTrack?.id || "" : "");
                              setSelectedSubtitleCueId(lane.type === "subtitle" && lane.subtitleCues.length ? allSubtitleCuesSelectionId : "");
                              setSelectedKeyframeId("");
                              setInspectorTab(lane.type === "effect" ? "effects" : lane.type === "subtitle" ? "subtitles" : "tracks");
                            }
                          }}
                        >
                        {lane.type === "effect" ? (
                          <>
                          {lane.effects.map((effect) => (
                          <button
                            className={`lossless-media-track-clip is-effect-clip is-${effect.kind} ${selectedEffectId === effect.id ? "is-selected" : ""} ${effect.enabled ? "" : "is-disabled"}`}
                            type="button"
                            key={`${effect.id}-timeline`}
                            aria-pressed={selectedEffectId === effect.id}
                            style={{
                              left: `${(effect.start / timelineDisplayDuration) * 100}%`,
                              width: `${Math.max(((effect.end - effect.start) / timelineDisplayDuration) * 100, 0.35)}%`
                            }}
                            title={`${effect.name} · 拖动调整时间，拖动两端调整范围`}
                            onPointerDown={(event) => startEffectTimelineDrag(event, effect, "move")}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (trackDragMovedRef.current) {
                                trackDragMovedRef.current = false;
                                return;
                              }
                              setSelectedResourceId("");
                              setSelectedVideoClipId("");
                              setSelectedTrackId("");
                              setSelectedEffectId(effect.id);
                              setSelectedLaneId(effect.laneId || effectLaneId);
                              setSelectedKeyframeId("");
                              setInspectorTab("effects");
                              seekPreview(clampValue(timelineTimeAtPointer(event.currentTarget, event.clientX), effect.start, effect.end), false);
                            }}
                          >
                            <i
                              className="lossless-media-track-handle is-start"
                              title="调整特效开始时间"
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                startEffectTimelineDrag(event, effect, "trim-start");
                              }}
                            />
                            {effect.kind === "snow" ? <Snowflake size={13} /> : <Sparkles size={13} />}
                            <span>{effect.name}</span>
                            <small className="lossless-media-track-duration">{formatCompactDuration(effect.end - effect.start)}</small>
                            <i
                              className="lossless-media-track-handle is-end"
                              title="调整特效结束时间"
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                startEffectTimelineDrag(event, effect, "trim-end");
                              }}
                            />
                          </button>
                          ))}
                          {effectDropPreview && lane.id === effectLaneId ? (
                            <div
                              className={`lossless-effect-drop-preview ${effectDropPreview.valid ? "is-valid" : "is-invalid"}`}
                              style={{
                                left: `${(effectDropPreview.start / timelineDisplayDuration) * 100}%`,
                                width: `${Math.max(((effectDropPreview.end - effectDropPreview.start) / timelineDisplayDuration) * 100, 0.35)}%`
                              }}
                              aria-hidden="true"
                            >
                              {effectDropPreview.kind === "snow" ? <Snowflake size={13} /> : <Sparkles size={13} />}
                              <span>{videoEffectDefinitions.find((definition) => definition.kind === effectDropPreview.kind)?.name}</span>
                              <small>{effectDropPreview.valid ? formatCompactDuration(effectDropPreview.end - effectDropPreview.start) : "不可放置"}</small>
                            </div>
                          ) : null}
                          </>
                        ) : lane.type === "subtitle" && lane.subtitleTrack ? lane.subtitleCues.map((cue) => {
                          const subtitleTrack = lane.subtitleTrack!;
                          const confidence = cue.confidence === undefined ? undefined : Math.round(cue.confidence * 100);
                          return (
                            <button
                              className={`lossless-media-track-clip is-subtitle-clip ${selectedSubtitleTrackId === subtitleTrack.id && (selectedSubtitleCueId === cue.id || selectedSubtitleCueId === allSubtitleCuesSelectionId) ? "is-selected" : ""} ${subtitleTrack.enabled ? "" : "is-disabled"} ${confidence !== undefined && confidence < 75 ? "is-low-confidence" : ""}`}
                              type="button"
                              key={`${cue.id}-timeline`}
                              aria-pressed={selectedSubtitleTrackId === subtitleTrack.id && (selectedSubtitleCueId === cue.id || selectedSubtitleCueId === allSubtitleCuesSelectionId)}
                              style={{
                                left: `${(cue.start / timelineDisplayDuration) * 100}%`,
                                width: `${Math.max(((cue.end - cue.start) / timelineDisplayDuration) * 100, 0.0001)}%`
                              }}
                              title={`${cue.text} · ${formatSeconds(cue.start)} - ${formatSeconds(cue.end)}`}
                              onPointerDown={(event) => startSubtitleCueTimelineDrag(event, subtitleTrack, cue, "move")}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (trackDragMovedRef.current) {
                                  trackDragMovedRef.current = false;
                                  return;
                                }
                                selectSubtitleCue(subtitleTrack.id, cue.id);
                              }}
                              onContextMenu={(event) => {
                                selectSubtitleCue(subtitleTrack.id, cue.id, false);
                                showMediaContextMenu(event, {
                                  kind: "subtitle-cue",
                                  trackId: subtitleTrack.id,
                                  cueId: cue.id,
                                  time: snapTimelinePlayheadTime(timelineTimeAtPointer(event.currentTarget, event.clientX))
                                });
                              }}
                            >
                              <i
                                className="lossless-media-track-handle is-start"
                                title="调整字幕开始时间"
                                onPointerDown={(event) => {
                                  event.stopPropagation();
                                  startSubtitleCueTimelineDrag(event, subtitleTrack, cue, "trim-start");
                                }}
                              />
                              <Type className="lossless-subtitle-clip-glyph" size={24} strokeWidth={1.5} />
                              <span className="lossless-subtitle-clip-label">{cue.text}</span>
                              {confidence !== undefined ? <small className="lossless-subtitle-confidence">{confidence}%</small> : null}
                              <i
                                className="lossless-media-track-handle is-end"
                                title="调整字幕结束时间"
                                onPointerDown={(event) => {
                                  event.stopPropagation();
                                  startSubtitleCueTimelineDrag(event, subtitleTrack, cue, "trim-end");
                                }}
                              />
                            </button>
                          );
                        }) : lane.type === "video" ? lane.videoClips.map((clip) => {
                          const source = videoSources.find((item) => item.id === clip.sourceId);
                          const clipVolume = readVideoClipVolume(clip);
                          const clipAudioPeaks = source ? audioPeaksForVideoClip(source, clip) : [];
                          const hasAttachedAudio = Boolean(source?.hasAudio && !clip.audioDetached);
                          return (
                          <button
                            className={`lossless-media-track-clip is-video-clip ${hasAttachedAudio ? "has-embedded-audio" : ""} ${selectedVideoClipId === clip.id ? "is-selected" : ""}`}
                            type="button"
                            key={`${clip.id}-timeline`}
                            aria-pressed={selectedVideoClipId === clip.id}
                            style={{
                              left: `${(clip.start / timelineDisplayDuration) * 100}%`,
                              width: `${Math.max(((clip.end - clip.start) / timelineDisplayDuration) * 100, 0.35)}%`
                            }}
                            title={timelineTool === "blade" ? `${clip.name} · 刀片切割当前选中的素材` : `${clip.name} · 拖动调整轨道和位置，右键操作`}
                            onPointerDown={(event) => {
                              if (event.button !== 0) return;
                              if (timelineTool === "blade") return;
                              startVideoClipTimelineDrag(event, clip, "move");
                            }}
                            onClick={(event) => {
                              if (timelineTool === "blade") {
                                event.preventDefault();
                                event.stopPropagation();
                                return;
                              }
                              selectVideoClipAtPointer(event, clip);
                            }}
                            onContextMenu={(event) => {
                              hideTimelineBladeGuide();
                              setSelectedResourceId("");
                              setSelectedVideoClipId(clip.id);
                              setSelectedTrackId("");
                              setSelectedEffectId("");
                              setSelectedLaneId(clip.laneId);
                              setSelectedKeyframeId("");
                              showMediaContextMenu(event, {
                                kind: "video-clip",
                                clipId: clip.id,
                                time: snapTimelinePlayheadTime(timelineTimeAtPointer(event.currentTarget, event.clientX))
                              });
                            }}
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
                            <small className="lossless-media-track-duration">{formatCompactDuration(clip.end - clip.start)}</small>
                            {hasAttachedAudio ? (
                              <span
                                className="lossless-video-audio-strip"
                                title={`视频原声 ${formatVideoGainDb(clipVolume)}，上下拖动调整`}
                                onPointerDown={(event) => startVideoClipVolumeDrag(event, clip)}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                              >
                                <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
                                  <line className="lossless-video-waveform-center" x1="0" y1="12" x2="100" y2="12" />
                                  <path className="lossless-video-waveform-area" d={buildAudioPresencePath(clipAudioPeaks)} />
                                  <path className="lossless-video-waveform-line" d={buildAudioWaveformLine(clipAudioPeaks, -1)} />
                                  <path className="lossless-video-waveform-line" d={buildAudioWaveformLine(clipAudioPeaks, 1)} />
                                </svg>
                                <i className="lossless-video-volume-line" style={{ top: `${videoGainLinePosition(clipVolume)}%` }} />
                              </span>
                            ) : null}
                            <i
                              className="lossless-media-track-handle is-end"
                              title="调整出点"
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                startVideoClipTimelineDrag(event, clip, "trim-end");
                              }}
                            />
                          </button>
                          );
                        }) : lane.clips.map((track) => {
                          const trackAudioPeaks = track.type === "audio"
                            ? audioPeaksForSourceRange(track.audioPeaks, track.sourceDuration, track.sourceStart, track.sourceEnd)
                            : [];
                          return (
                          <Fragment key={`${track.id}-timeline`}>
                            <button
                              className={`lossless-media-track-clip ${selectedTrackId === track.id ? "is-selected" : ""} ${track.enabled ? "" : "is-disabled"}`}
                              type="button"
                              aria-pressed={selectedTrackId === track.id}
                              style={{
                                left: `${(track.start / timelineDisplayDuration) * 100}%`,
                                width: `${Math.max(((track.end - track.start) / timelineDisplayDuration) * 100, 0.35)}%`
                              }}
                              title={timelineTool === "blade" && track.type === "audio"
                                ? `${track.name} · 刀片切割当前选中的音频素材`
                                : `${track.name} · 拖动主体调整轨道和位置，右键操作${track.type === "image" && track.animated ? "，双击添加关键帧" : ""}`}
                              onPointerDown={(event) => {
                                if (event.button !== 0 || timelineTool === "blade") return;
                                startTrackTimelineDrag(event, track, "move");
                              }}
                              onClick={(event) => {
                                if (timelineTool === "blade") {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  return;
                                }
                                selectTrackAtPointer(event, track);
                              }}
                              onDoubleClick={(event) => addTrackKeyframeAtPointer(event, track)}
                              onContextMenu={(event) => {
                                setSelectedResourceId("");
                                setSelectedVideoClipId("");
                                setSelectedTrackId(track.id);
                                setSelectedEffectId("");
                                setSelectedLaneId(getTrackLaneId(track));
                                setSelectedKeyframeId(track.type === "image" && track.animated ? track.keyframes[0]?.id || "" : "");
                                showMediaContextMenu(event, {
                                  kind: "track",
                                  trackId: track.id,
                                  time: snapTimelinePlayheadTime(timelineTimeAtPointer(event.currentTarget, event.clientX))
                                });
                              }}
                            >
                              <i
                                className="lossless-media-track-handle is-start"
                                title="调整开始时间"
                                onPointerDown={(event) => {
                                  event.stopPropagation();
                                  startTrackTimelineDrag(event, track, "trim-start");
                                }}
                              />
                              {track.type === "audio" && trackAudioPeaks.length ? (
                                <span className="lossless-audio-track-waveform" aria-hidden="true">
                                  <svg viewBox="0 0 100 24" preserveAspectRatio="none">
                                    <line className="lossless-video-waveform-center" x1="0" y1="12" x2="100" y2="12" />
                                    <path className="lossless-video-waveform-area" d={buildAudioPresencePath(trackAudioPeaks)} />
                                    <path className="lossless-video-waveform-line" d={buildAudioWaveformLine(trackAudioPeaks, -1)} />
                                    <path className="lossless-video-waveform-line" d={buildAudioWaveformLine(trackAudioPeaks, 1)} />
                                  </svg>
                                </span>
                              ) : null}
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
                                      setSelectedResourceId("");
                                      setSelectedVideoClipId("");
                                      setSelectedTrackId(track.id);
                                      setSelectedEffectId("");
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
                          );
                        })}
                        </div>
                      ))}
                      <i
                        ref={timelinePlayheadRef}
                        className="lossless-playhead"
                        title="拖动播放指针，自动吸附到刻度"
                        role="slider"
                        tabIndex={projectVideoDuration > 0 ? 0 : -1}
                        aria-label="拖动播放指针"
                        aria-valuemin={0}
                        aria-valuemax={projectVideoDuration}
                        aria-valuenow={safeCurrentTime}
                        aria-valuetext={formatTimelineTimecode(safeCurrentTime, timelineFps)}
                        style={{ left: `${(safeCurrentTime / timelineDisplayDuration) * 100}%` }}
                        onPointerDown={startTimelineScrub}
                        onKeyDown={handleTimelineRulerKeyDown}
                      />
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
                        <dl><dt>作品比例</dt><dd>{formatProjectAspect(videoSize)}</dd></dl>
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
                  <button
                    className="primary-button lossless-inspector-action lossless-apply-detections-action"
                    type="button"
                    title="将勾选的检测片段波纹删除并应用到时间轴"
                    onClick={applyDetectedSegmentsToTimeline}
                    disabled={taskRunning || !videoClips.length || !removableSegments.length}
                  >
                    <Scissors size={17} />
                    删除检测片段
                  </button>
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
                        <button type="button" onClick={pickResourceFiles} disabled={taskRunning}>
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
                                draggable={!taskRunning}
                                tabIndex={0}
                                title={`${resource.name} · 拖到时间轴，双击添加，右键操作`}
                                onClick={() => selectImportedResource(resource.id)}
                                onContextMenu={(event) => {
                                  selectImportedResource(resource.id);
                                  showMediaContextMenu(event, { kind: "resource", resourceId: resource.id });
                                }}
                                onDoubleClick={() => {
                                  addImportedResourceToTimeline(resource.id);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter") return;
                                  event.preventDefault();
                                  addImportedResourceToTimeline(resource.id);
                                }}
                                onDragStart={(event) => {
                                  selectImportedResource(resource.id);
                                  event.dataTransfer.effectAllowed = "copy";
                                  event.dataTransfer.setData(resourceDragMime, resource.id);
                                  event.dataTransfer.setData("text/plain", resource.id);
                                }}
                                onDragEnd={() => {
                                  setTimelineDropActive(false);
                                  markTimelineLaneDropTarget();
                                }}
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

                  {selectedVideoClip && selectedVideoSource?.hasAudio ? (
                    <section className="lossless-inspector-section lossless-video-audio-inspector">
                      <div className="lossless-section-title-row">
                        <h3>视频声音</h3>
                        <span>{selectedVideoClip.name}</span>
                      </div>
                      <label className="lossless-slider-field lossless-db-slider-field">
                        <span>音量</span>
                        <EditorRange
                          min={videoGainMinDb}
                          max={videoGainMaxDb}
                          step={0.1}
                          value={Number(videoGainToDb(readVideoClipVolume(selectedVideoClip)).toFixed(1))}
                          aria-label="视频原声音量"
                          onPointerDown={beginVideoVolumeEdit}
                          onPointerUp={finishVideoVolumeEdit}
                          onPointerCancel={finishVideoVolumeEdit}
                          onKeyDown={beginVideoVolumeEdit}
                          onKeyUp={finishVideoVolumeEdit}
                          onBlur={finishVideoVolumeEdit}
                          onChange={(event) => updateVideoClipVolume(selectedVideoClip.id, videoDbToGain(Number(event.target.value)))}
                        />
                        <span className="lossless-db-value">
                          <input
                            type="number"
                            min={videoGainMinDb}
                            max={videoGainMaxDb}
                            step={0.1}
                            value={Number(videoGainToDb(readVideoClipVolume(selectedVideoClip)).toFixed(1))}
                            aria-label="视频原声音量分贝"
                            onPointerDown={beginVideoVolumeEdit}
                            onPointerUp={finishVideoVolumeEdit}
                            onPointerCancel={finishVideoVolumeEdit}
                            onKeyDown={beginVideoVolumeEdit}
                            onKeyUp={finishVideoVolumeEdit}
                            onBlur={finishVideoVolumeEdit}
                            onChange={(event) => updateVideoClipVolume(selectedVideoClip.id, videoDbToGain(Number(event.target.value)))}
                          />
                          <em>dB</em>
                        </span>
                      </label>
                    </section>
                  ) : null}

                  {selectedVideoClip ? (
                    <section className="lossless-inspector-section lossless-video-color-inspector">
                      <div className="lossless-section-title-row">
                        <h3><Palette size={15} />视频调色</h3>
                        <button
                          className="lossless-icon-button"
                          type="button"
                          title="重置当前片段调色"
                          aria-label="重置当前片段调色"
                          disabled={videoColorIsDefault(selectedVideoColor)}
                          onClick={() => resetVideoClipColor(selectedVideoClip.id)}
                        >
                          <RotateCcw size={14} />
                        </button>
                      </div>
                      <div className="lossless-color-wheel-grid">
                        {([
                          ["lift", "暗部"],
                          ["gamma", "中间调"],
                          ["gain", "亮部"],
                          ["offset", "整体"]
                        ] as const).map(([key, label]) => (
                          <ColorWheelControl
                            key={key}
                            label={label}
                            value={selectedVideoColor[key]}
                            onEditStart={beginVideoColorEdit}
                            onEditEnd={finishVideoColorEdit}
                            onChange={(wheel) => updateVideoClipColor(selectedVideoClip.id, (color) => ({ ...color, [key]: normalizeColorWheel(wheel) }))}
                          />
                        ))}
                      </div>
                      <label className="lossless-slider-field lossless-color-saturation">
                        <span>饱和度</span>
                        <EditorRange
                          min={0}
                          max={2}
                          step={0.01}
                          value={selectedVideoColor.saturation}
                          onFocus={beginVideoColorEdit}
                          onBlur={finishVideoColorEdit}
                          onPointerDown={beginVideoColorEdit}
                          onPointerUp={finishVideoColorEdit}
                          onPointerCancel={finishVideoColorEdit}
                          onChange={(event) => updateVideoClipColor(selectedVideoClip.id, (color) => ({ ...color, saturation: Number(event.target.value) }))}
                        />
                        <em>{Math.round(selectedVideoColor.saturation * 100)}%</em>
                      </label>
                    </section>
                  ) : null}

                  {selectedTrack ? (
                    <>
                      <section className="lossless-inspector-section">
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
                              <EditorRange min={0} max={2} step={0.01} value={selectedTrack.volume} onChange={(event) => updateTrack(selectedTrack.id, (track) => track.type === "audio" ? { ...track, volume: Number(event.target.value) } : track, true)} />
                              <em>{Math.round(selectedTrack.volume * 100)}%</em>
                            </label>
                            <label className="lossless-inspector-field">
                              <span>淡入</span>
                              <span><input type="number" min={0} max={selectedTrack.end - selectedTrack.start} step={0.1} value={selectedTrack.fadeIn} onChange={(event) => updateTrack(selectedTrack.id, (track) => track.type === "audio" ? { ...track, fadeIn: Math.max(0, Number(event.target.value || 0)) } : track, true)} /><em>秒</em></span>
                            </label>
                            <label className="lossless-inspector-field">
                              <span>淡出</span>
                              <span><input type="number" min={0} max={selectedTrack.end - selectedTrack.start} step={0.1} value={selectedTrack.fadeOut} onChange={(event) => updateTrack(selectedTrack.id, (track) => track.type === "audio" ? { ...track, fadeOut: Math.max(0, Number(event.target.value || 0)) } : track, true)} /><em>秒</em></span>
                            </label>
                            <div className="lossless-switch-row">
                              <span>循环播放</span>
                              <AppSwitch checked={selectedTrack.loop} onChange={(checked) => updateTrack(selectedTrack.id, (track) => track.type === "audio" ? { ...track, loop: checked } : track, true)} ariaLabel="循环播放" />
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
                              <small>{formatTimelineTimecode(safeCurrentTime, timelineFps)}</small>
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
                              <EditorRange min={0} max={1} step={0.01} value={currentImageTransform.opacity ?? selectedImageTrack.opacity} onChange={(event) => updateImageAtPlayhead(selectedImageTrack, { opacity: Number(event.target.value) })} />
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
                  ) : null}
                </div>
              ) : inspectorTab === "subtitles" ? (
                <div className="lossless-inspector-content lossless-subtitle-inspector">
                  <section className="lossless-inspector-section lossless-subtitle-source-section">
                    <div className="lossless-section-title-row">
                      <h3>字幕素材</h3>
                      <span>{subtitleTracks.reduce((count, track) => count + track.cues.length, 0)} 条</span>
                    </div>
                    <div className="lossless-subtitle-toolbar">
                      <button type="button" onClick={() => subtitleInputRef.current?.click()} disabled={taskRunning}>
                        <FolderOpen size={14} />
                        导入字幕
                      </button>
                      <button type="button" onClick={addManualSubtitleCue} disabled={taskRunning}>
                        <Plus size={14} />
                        新建字幕
                      </button>
                      <button type="button" disabled={!enabledSubtitleTracks.length} onClick={() => downloadSubtitleText("subtitles.srt", serializeSubtitleSRT(subtitleTracks))}>导出 SRT</button>
                      <button type="button" disabled={!enabledSubtitleTracks.length} onClick={() => downloadSubtitleText("subtitles.ass", serializeSubtitleASS(subtitleTracks, videoSize.width, videoSize.height))}>导出 ASS</button>
                      {selectedSubtitleTrack ? <button className="text-danger" type="button" onClick={() => removeSubtitleTrack(selectedSubtitleTrack.id)}>删除轨道</button> : null}
                    </div>
                  </section>

                  {selectedSubtitleTrack && selectedSubtitleCue ? (
                    <section className="lossless-inspector-section lossless-subtitle-editor">
                      <div className="lossless-section-title-row">
                        <h3>字幕内容</h3>
                        <button className="lossless-icon-button text-danger" type="button" title="删除当前字幕" aria-label="删除当前字幕" onClick={() => removeSubtitleCue(selectedSubtitleTrack.id, selectedSubtitleCue.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <textarea
                        rows={3}
                        value={selectedSubtitleCue.text}
                        onFocus={beginSubtitlePropertyEdit}
                        onBlur={finishSubtitlePropertyEdit}
                        onChange={(event) => updateSubtitleCue(selectedSubtitleTrack.id, selectedSubtitleCue.id, (cue) => ({ ...cue, text: event.target.value, words: undefined }))}
                      />
                      <div className="lossless-subtitle-time-fields">
                        <label>
                          <span>开始</span>
                          <input type="number" min={0} step={1 / timelineFps} value={Number(selectedSubtitleCue.start.toFixed(3))} onFocus={beginSubtitlePropertyEdit} onBlur={finishSubtitlePropertyEdit} onChange={(event) => updateSubtitleCue(selectedSubtitleTrack.id, selectedSubtitleCue.id, (cue) => ({ ...cue, start: Number(event.target.value) }))} />
                        </label>
                        <label>
                          <span>结束</span>
                          <input type="number" min={0} step={1 / timelineFps} value={Number(selectedSubtitleCue.end.toFixed(3))} onFocus={beginSubtitlePropertyEdit} onBlur={finishSubtitlePropertyEdit} onChange={(event) => updateSubtitleCue(selectedSubtitleTrack.id, selectedSubtitleCue.id, (cue) => ({ ...cue, end: Number(event.target.value) }))} />
                        </label>
                      </div>
                    </section>
                  ) : null}

                  <section className="lossless-inspector-section lossless-subtitle-style-section">
                    <div className="lossless-section-title-row">
                      <h3>字幕样式</h3>
                      {selectedSubtitleTrack ? (
                        <button
                          type="button"
                          className={selectedSubtitleCueId === allSubtitleCuesSelectionId ? "is-active" : ""}
                          title="选择同一轨道的全部字幕并统一调整"
                          onClick={() => selectAllSubtitleCues(selectedSubtitleTrack.id)}
                        >
                          <ListChecks size={14} />
                          {selectedSubtitleCueId === allSubtitleCuesSelectionId ? `已选 ${selectedSubtitleTrack.cues.length} 条` : "全选本轨"}
                        </button>
                      ) : null}
                    </div>
                    <div className="lossless-subtitle-property-list">
                      <div className="lossless-subtitle-property-row">
                        <span>字体</span>
                        <AppSelect
                          value={editableSubtitleStyle.fontFamily}
                          options={subtitleFontOptions.some((option) => option.value === editableSubtitleStyle.fontFamily)
                            ? subtitleFontOptions
                            : [{ label: editableSubtitleStyle.fontFamily, value: editableSubtitleStyle.fontFamily }, ...subtitleFontOptions]}
                          className="lossless-editor-select"
                          menuClassName="lossless-editor-select-menu"
                          matchTriggerWidth
                          ariaLabel="字幕字体"
                          onChange={(fontFamily) => updateSelectedSubtitleStyle({ fontFamily }, true)}
                        />
                      </div>
                      <div className="lossless-subtitle-property-row is-slider">
                        <span>字号</span>
                        <EditorRange min={12} max={160} step={1} value={editableSubtitleStyle.fontSize} onPointerDown={beginSubtitlePropertyEdit} onPointerUp={finishSubtitlePropertyEdit} onPointerCancel={finishSubtitlePropertyEdit} onChange={(event) => updateSelectedSubtitleStyle({ fontSize: Number(event.target.value) })} />
                        <input type="number" min={12} max={160} step={1} value={Math.round(editableSubtitleStyle.fontSize)} onFocus={beginSubtitlePropertyEdit} onBlur={finishSubtitlePropertyEdit} onChange={(event) => updateSelectedSubtitleStyle({ fontSize: Number(event.target.value) })} />
                      </div>
                      <div className="lossless-subtitle-property-row">
                        <span>样式</span>
                        <div className="lossless-subtitle-style-buttons">
                          <button className={editableSubtitleStyle.bold ? "is-active" : ""} type="button" title="粗体" aria-label="字幕粗体" aria-pressed={editableSubtitleStyle.bold} onClick={() => updateSelectedSubtitleStyle({ bold: !editableSubtitleStyle.bold }, true)}>B</button>
                          <button className={editableSubtitleStyle.underline ? "is-active" : ""} type="button" title="下划线" aria-label="字幕下划线" aria-pressed={editableSubtitleStyle.underline} onClick={() => updateSelectedSubtitleStyle({ underline: !editableSubtitleStyle.underline }, true)}>U</button>
                          <button className={editableSubtitleStyle.italic ? "is-active" : ""} type="button" title="斜体" aria-label="字幕斜体" aria-pressed={editableSubtitleStyle.italic} onClick={() => updateSelectedSubtitleStyle({ italic: !editableSubtitleStyle.italic }, true)}>I</button>
                        </div>
                      </div>
                      <div className="lossless-subtitle-property-row">
                        <span>颜色</span>
                        <label className="lossless-subtitle-color-control">
                          <input type="color" value={editableSubtitleStyle.color} onFocus={beginSubtitlePropertyEdit} onBlur={finishSubtitlePropertyEdit} onChange={(event) => updateSelectedSubtitleStyle({ color: event.target.value })} />
                          <code>{editableSubtitleStyle.color.toUpperCase()}</code>
                        </label>
                      </div>
                      <div className="lossless-subtitle-property-row is-slider">
                        <span>宽度</span>
                        <EditorRange min={5} max={100} step={1} value={editableSubtitleStyle.width} onPointerDown={beginSubtitlePropertyEdit} onPointerUp={finishSubtitlePropertyEdit} onPointerCancel={finishSubtitlePropertyEdit} onChange={(event) => updateSelectedSubtitleStyle({ width: Number(event.target.value) })} />
                        <input type="number" min={5} max={100} step={1} value={Math.round(editableSubtitleStyle.width)} onFocus={beginSubtitlePropertyEdit} onBlur={finishSubtitlePropertyEdit} onChange={(event) => updateSelectedSubtitleStyle({ width: Number(event.target.value) })} />
                      </div>
                    </div>
                    <div className="lossless-subtitle-property-list is-secondary">
                      <div className="lossless-subtitle-property-row">
                        <span>描边颜色</span>
                        <label className="lossless-subtitle-color-control">
                          <input type="color" value={editableSubtitleStyle.outlineColor} onFocus={beginSubtitlePropertyEdit} onBlur={finishSubtitlePropertyEdit} onChange={(event) => updateSelectedSubtitleStyle({ outlineColor: event.target.value })} />
                          <code>{editableSubtitleStyle.outlineColor.toUpperCase()}</code>
                        </label>
                      </div>
                      <div className="lossless-subtitle-property-row is-slider">
                        <span>描边宽度</span>
                        <EditorRange min={0} max={10} step={0.5} value={editableSubtitleStyle.outlineWidth} onPointerDown={beginSubtitlePropertyEdit} onPointerUp={finishSubtitlePropertyEdit} onPointerCancel={finishSubtitlePropertyEdit} onChange={(event) => updateSelectedSubtitleStyle({ outlineWidth: Number(event.target.value) })} />
                        <input type="number" min={0} max={10} step={0.5} value={editableSubtitleStyle.outlineWidth} onFocus={beginSubtitlePropertyEdit} onBlur={finishSubtitlePropertyEdit} onChange={(event) => updateSelectedSubtitleStyle({ outlineWidth: Number(event.target.value) })} />
                      </div>
                      <div className="lossless-subtitle-property-row">
                        <span>背景颜色</span>
                        <label className="lossless-subtitle-color-control">
                          <input type="color" value={editableSubtitleStyle.backgroundColor} onFocus={beginSubtitlePropertyEdit} onBlur={finishSubtitlePropertyEdit} onChange={(event) => updateSelectedSubtitleStyle({ backgroundColor: event.target.value })} />
                          <code>{editableSubtitleStyle.backgroundColor.toUpperCase()}</code>
                        </label>
                      </div>
                      <div className="lossless-subtitle-property-row is-slider">
                        <span>背景透明度</span>
                        <EditorRange min={0} max={1} step={0.01} value={editableSubtitleStyle.backgroundAlpha} onPointerDown={beginSubtitlePropertyEdit} onPointerUp={finishSubtitlePropertyEdit} onPointerCancel={finishSubtitlePropertyEdit} onChange={(event) => updateSelectedSubtitleStyle({ backgroundAlpha: Number(event.target.value) })} />
                        <input type="number" min={0} max={100} step={1} value={Math.round(editableSubtitleStyle.backgroundAlpha * 100)} onFocus={beginSubtitlePropertyEdit} onBlur={finishSubtitlePropertyEdit} onChange={(event) => updateSelectedSubtitleStyle({ backgroundAlpha: Number(event.target.value) / 100 })} />
                      </div>
                      <div className="lossless-subtitle-property-row is-slider">
                        <span>背景模糊</span>
                        <EditorRange min={0} max={23} step={1} value={editableSubtitleStyle.backgroundBlur} onPointerDown={beginSubtitlePropertyEdit} onPointerUp={finishSubtitlePropertyEdit} onPointerCancel={finishSubtitlePropertyEdit} onChange={(event) => updateSelectedSubtitleStyle({ backgroundBlur: Number(event.target.value) })} />
                        <input type="number" min={0} max={23} step={1} value={Math.round(editableSubtitleStyle.backgroundBlur)} onFocus={beginSubtitlePropertyEdit} onBlur={finishSubtitlePropertyEdit} onChange={(event) => updateSelectedSubtitleStyle({ backgroundBlur: Number(event.target.value) })} />
                      </div>
                      <div className="lossless-subtitle-property-row is-slider">
                        <span>水平位置</span>
                        <EditorRange min={0} max={100} step={0.1} value={editableSubtitleStyle.x} onPointerDown={beginSubtitlePropertyEdit} onPointerUp={finishSubtitlePropertyEdit} onPointerCancel={finishSubtitlePropertyEdit} onChange={(event) => updateSelectedSubtitleStyle({ x: Number(event.target.value) })} />
                        <input type="number" min={0} max={100} step={0.1} value={Number(editableSubtitleStyle.x.toFixed(1))} onFocus={beginSubtitlePropertyEdit} onBlur={finishSubtitlePropertyEdit} onChange={(event) => updateSelectedSubtitleStyle({ x: Number(event.target.value) })} />
                      </div>
                      <div className="lossless-subtitle-property-row is-slider">
                        <span>垂直位置</span>
                        <EditorRange min={0} max={100} step={0.1} value={editableSubtitleStyle.position} onPointerDown={beginSubtitlePropertyEdit} onPointerUp={finishSubtitlePropertyEdit} onPointerCancel={finishSubtitlePropertyEdit} onChange={(event) => updateSelectedSubtitleStyle({ position: Number(event.target.value) })} />
                        <input type="number" min={0} max={100} step={0.1} value={Number(editableSubtitleStyle.position.toFixed(1))} onFocus={beginSubtitlePropertyEdit} onBlur={finishSubtitlePropertyEdit} onChange={(event) => updateSelectedSubtitleStyle({ position: Number(event.target.value) })} />
                      </div>
                    </div>
                  </section>

                </div>
              ) : inspectorTab === "effects" ? (
                <div className="lossless-inspector-content lossless-effects-inspector">
                  <section className="lossless-inspector-section">
                    <div className="lossless-section-title-row">
                      <h3>基础特效</h3>
                      <span>{effects.length}</span>
                    </div>
                    <div className="lossless-effect-library">
                      {videoEffectDefinitions.map((definition) => (
                        <button
                          type="button"
                          key={definition.kind}
                          title={`拖到时间轴添加${definition.name}`}
                          aria-label={`拖到时间轴添加${definition.name}`}
                          disabled={projectVideoDuration <= 0 || status === "exporting"}
                          draggable={projectVideoDuration > 0 && status !== "exporting"}
                          onDragStart={(event) => {
                            draggedEffectKindRef.current = definition.kind;
                            event.dataTransfer.effectAllowed = "copy";
                            event.dataTransfer.setData(effectDragMime, definition.kind);
                            event.dataTransfer.setData("text/plain", definition.name);
                          }}
                          onDragEnd={() => {
                            setTimelineDropActive(false);
                            clearEffectDrag();
                          }}
                        >
                          <span className={`is-${definition.kind}`}>
                            {definition.kind === "snow" ? <Snowflake size={18} /> : <Sparkles size={18} />}
                          </span>
                          <strong>{definition.name}</strong>
                          <small>{definition.scope === "global" ? "全局" : "局部"}</small>
                        </button>
                      ))}
                    </div>
                  </section>

                  {effects.length ? (
                    <section className="lossless-inspector-section">
                      <div className="lossless-section-title-row">
                        <h3>时间轴特效</h3>
                        <span>{enabledEffects.length} 个启用</span>
                      </div>
                      <div className="lossless-effect-list">
                        {effects.map((effect) => (
                          <button
                            className={selectedEffectId === effect.id ? "is-selected" : ""}
                            type="button"
                            key={`${effect.id}-inspector`}
                            onClick={() => {
                              setSelectedResourceId("");
                              setSelectedVideoClipId("");
                              setSelectedTrackId("");
                              setSelectedEffectId(effect.id);
                              setSelectedLaneId(effect.laneId || effectLaneId);
                              setSelectedKeyframeId("");
                              seekPreview(effect.start, false);
                            }}
                          >
                            {effect.kind === "snow" ? <Snowflake size={14} /> : <Sparkles size={14} />}
                            <span><strong>{effect.name}</strong><small>{formatSeconds(effect.start)} - {formatSeconds(effect.end)}</small></span>
                            <em>{effect.enabled ? "开" : "关"}</em>
                          </button>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {selectedEffect ? (
                    <section className="lossless-inspector-section lossless-effect-properties">
                      <div className="lossless-section-title-row">
                        <h3>{selectedEffect.name}</h3>
                        <button className="lossless-icon-button text-danger" type="button" title="删除特效" aria-label="删除特效" onClick={() => removeVideoEffect(selectedEffect.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="lossless-switch-row">
                        <span>启用</span>
                        <AppSwitch checked={selectedEffect.enabled} onChange={(enabled) => updateEffect(selectedEffect.id, (effect) => ({ ...effect, enabled }), true)} ariaLabel="启用特效" />
                      </div>
                      <div className="lossless-effect-time-fields">
                        <label>
                          <span>开始</span>
                          <span><input type="number" min={selectedEffectLaneBounds?.minimumStart ?? 0} max={selectedEffect.end - minimumTimelineClipDuration} step={1 / timelineFps} value={Number(selectedEffect.start.toFixed(3))} onFocus={beginEffectPropertyEdit} onBlur={finishEffectPropertyEdit} onChange={(event) => updateEffect(selectedEffect.id, (effect) => ({ ...effect, start: Number(event.target.value) }))} /><em>s</em></span>
                        </label>
                        <label>
                          <span>结束</span>
                          <span><input type="number" min={selectedEffect.start + minimumTimelineClipDuration} max={selectedEffectLaneBounds?.maximumEnd ?? projectVideoDuration} step={1 / timelineFps} value={Number(selectedEffect.end.toFixed(3))} onFocus={beginEffectPropertyEdit} onBlur={finishEffectPropertyEdit} onChange={(event) => updateEffect(selectedEffect.id, (effect) => ({ ...effect, end: Number(event.target.value) }))} /><em>s</em></span>
                        </label>
                      </div>
                      <label className="lossless-slider-field">
                        <span>强度</span>
                        <EditorRange min={0} max={1} step={0.01} value={selectedEffect.intensity} onFocus={beginEffectPropertyEdit} onBlur={finishEffectPropertyEdit} onPointerDown={beginEffectPropertyEdit} onPointerUp={finishEffectPropertyEdit} onPointerCancel={finishEffectPropertyEdit} onChange={(event) => updateEffect(selectedEffect.id, (effect) => ({ ...effect, intensity: Number(event.target.value) }))} />
                        <em>{Math.round(selectedEffect.intensity * 100)}%</em>
                      </label>
                      <label className="lossless-slider-field">
                        <span>透明度</span>
                        <EditorRange min={0} max={1} step={0.01} value={selectedEffect.opacity} onFocus={beginEffectPropertyEdit} onBlur={finishEffectPropertyEdit} onPointerDown={beginEffectPropertyEdit} onPointerUp={finishEffectPropertyEdit} onPointerCancel={finishEffectPropertyEdit} onChange={(event) => updateEffect(selectedEffect.id, (effect) => ({ ...effect, opacity: Number(event.target.value) }))} />
                        <em>{Math.round(selectedEffect.opacity * 100)}%</em>
                      </label>
                      {effectIsLocal(selectedEffect) && selectedEffect.mask ? (
                        <div className="lossless-effect-mask-fields">
                          <strong>区域</strong>
                          {(["x", "y", "width", "height"] as const).map((key) => (
                            <label key={key}>
                              <span>{key === "x" ? "X" : key === "y" ? "Y" : key === "width" ? "宽" : "高"}</span>
                              <input
                                type="number"
                                min={key === "width" || key === "height" ? 2 : 0}
                                max={100}
                                step={0.1}
                                value={Number(selectedEffect.mask![key].toFixed(1))}
                                onFocus={beginEffectPropertyEdit}
                                onBlur={finishEffectPropertyEdit}
                                onChange={(event) => updateEffect(selectedEffect.id, (effect) => ({
                                  ...effect,
                                  mask: normalizeEffectMask({ ...(effect.mask || selectedEffect.mask!), [key]: Number(event.target.value) })
                                }))}
                              />
                            </label>
                          ))}
                        </div>
                      ) : (
                        <>
                          <label className="lossless-slider-field">
                            <span>速度</span>
                            <EditorRange min={0.1} max={4} step={0.05} value={selectedEffect.speed} onFocus={beginEffectPropertyEdit} onBlur={finishEffectPropertyEdit} onPointerDown={beginEffectPropertyEdit} onPointerUp={finishEffectPropertyEdit} onPointerCancel={finishEffectPropertyEdit} onChange={(event) => updateEffect(selectedEffect.id, (effect) => ({ ...effect, speed: Number(event.target.value) }))} />
                            <em>{selectedEffect.speed.toFixed(1)}×</em>
                          </label>
                          <label className="lossless-slider-field">
                            <span>密度</span>
                            <EditorRange min={0} max={100} step={1} value={selectedEffect.density} onFocus={beginEffectPropertyEdit} onBlur={finishEffectPropertyEdit} onPointerDown={beginEffectPropertyEdit} onPointerUp={finishEffectPropertyEdit} onPointerCancel={finishEffectPropertyEdit} onChange={(event) => updateEffect(selectedEffect.id, (effect) => ({ ...effect, density: Number(event.target.value) }))} />
                            <em>{Math.round(selectedEffect.density)}%</em>
                          </label>
                        </>
                      )}
                    </section>
                  ) : null}
                </div>
              ) : inspectorTab === "export" ? (
                <div className="lossless-inspector-content lossless-export-inspector">
                  <button className="primary-button lossless-inspector-action" type="button" onClick={runExport} disabled={!canExport}>
                    {status === "exporting" ? <Loader2 className="spin" size={17} /> : <Download size={17} />}
                    {status === "exporting" ? "导出中" : "导出 MP4"}
                  </button>
                  <div className="lossless-export-body">
                    <section className="lossless-inspector-section">
                      <h3>自动输出</h3>
                      <div className={`lossless-export-boundary ${!videoOutputReencoded ? "is-lossless" : "is-reencode"}`}>
                        {!videoOutputReencoded ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
                        <span>
                          {enabledSubtitleTracks.length
                            ? `将 ${enabledSubtitleTracks.reduce((count, track) => count + track.cues.length, 0)} 条字幕烧录到画面，视频轨需要高质量重编码。`
                            : projectCanvasChanged
                            ? `作品比例已设为 ${formatProjectAspect(videoSize)}，需要按 ${Math.round(videoSize.width)} × ${Math.round(videoSize.height)} 项目画布高质量重编码。`
                            : enabledEffects.length
                            ? `${enabledEffects.length} 个时间轴特效需要逐帧合成，视频轨将使用硬件优先的高质量重编码。`
                            : hasVideoColorAdjustments
                            ? "视频片段已应用调色，画面将使用硬件优先的高质量重编码；原始素材不会被修改。"
                            : hasImageTracks
                            ? "图片素材需要写入画面，视频轨将高质量重编码；音频轨会一并混合。"
                            : needsVideoComposition
                              ? "多视频轨或时间轴空档会按项目画布合成，并使用硬件加速高质量编码。"
                            : hasExternalVideoSources
                              ? "多个视频来源会统一到项目画布并使用硬件加速高质量编码，避免不同编码参数直接拼接造成损坏。"
                            : videoClips.length === 0
                              ? "当前没有视频素材，将生成项目画布并混合时间轴声音后高质量编码。"
                            : enabledTracks.length && automaticExportMode === "keyframe-copy"
                              ? "仅合成声音轨时，视频画面保持流拷贝，音频会重新混合编码。"
                            : automaticExportMode === "keyframe-copy"
                              ? "画面保持原码流输出，不进行重复编码。"
                              : "按精确时间使用最高质量参数重编码输出。"}
                        </span>
                      </div>
                    </section>

                    <section className="lossless-inspector-section lossless-inspector-summary">
                      <h3>输出检查</h3>
                      <dl><dt>输出时长</dt><dd>{projectVideoDuration ? formatSeconds(projectVideoDuration) : "--:--"}</dd></dl>
                      <dl><dt>作品比例</dt><dd>{formatProjectAspect(videoSize)}</dd></dl>
                      <dl><dt>画面尺寸</dt><dd>{`${Math.round(videoSize.width)} × ${Math.round(videoSize.height)}`}</dd></dl>
                      <dl><dt>导入资源</dt><dd>{videoClips.length + enabledTracks.length}</dd></dl>
                      <dl><dt>片段调色</dt><dd>{hasVideoColorAdjustments ? "已启用" : "未启用"}</dd></dl>
                      <dl><dt>视频特效</dt><dd>{enabledEffects.length}</dd></dl>
                      <dl><dt>字幕</dt><dd>{enabledSubtitleTracks.length ? `${enabledSubtitleTracks.reduce((count, track) => count + track.cues.length, 0)} 条 · 自动烧录` : "无"}</dd></dl>
                      <dl><dt>封装格式</dt><dd>MP4</dd></dl>
                    </section>
                  </div>
                </div>
              ) : (
                <div className="lossless-inspector-content">
                  <section className="lossless-inspector-section lossless-subtitle-source-section">
                    <div className="lossless-section-title-row">
                      <h3>字幕识别</h3>
                      <span>{subtitleTracks.reduce((count, track) => count + track.cues.length, 0)} 条</span>
                    </div>
                    <div className="lossless-subtitle-language-row">
                      <label>
                        <span>语言</span>
                        <AppSelect
                          value={subtitlePreferences.language}
                          options={subtitleLanguageOptions}
                          className="lossless-editor-select"
                          menuClassName="lossless-editor-select-menu"
                          matchTriggerWidth
                          disabled={taskRunning}
                          ariaLabel="字幕识别语言"
                          onChange={(language) => setSubtitlePreferences((current) => ({ ...current, language }))}
                        />
                      </label>
                    </div>
                    <div className={`lossless-audio-engine-status ${subtitleEngineStatusLoading ? "is-loading" : subtitleEngineStatus?.available ? "is-ready" : "is-unavailable"}`}>
                      {subtitleEngineStatusLoading
                        ? <Loader2 className="spin" size={16} />
                        : subtitleEngineStatus?.available
                          ? <CheckCircle2 size={16} />
                          : <Captions size={16} />}
                      <span>
                        <strong>{subtitleEngineStatusLoading ? "检查字幕引擎" : subtitleEngineStatus?.available ? subtitleEngineStatus.device || "本地字幕引擎" : subtitleEngineStatus ? "引擎不可用" : "本地字幕识别"}</strong>
                        <small>{subtitleEngineStatus?.message || "首次识别时检查引擎并加载所选模型"}</small>
                      </span>
                      <button className="lossless-icon-button" type="button" title="重新检查字幕引擎" aria-label="重新检查字幕引擎" disabled={subtitleEngineStatusLoading || taskRunning} onClick={() => void checkSubtitleEngineStatus()}>
                        <RotateCw size={14} />
                      </button>
                    </div>
                  </section>
                  <section className="lossless-inspector-section">
                    <h3>素材去 BGM</h3>
                    <div className="lossless-audio-separation-controls">
                      <div className="lossless-audio-option-row">
                        <span>保留内容</span>
                        <AppSelect
                          value={audioSeparation.mode}
                          options={audioSeparationModeOptions}
                          menuClassName="lossless-audio-select-menu"
                          matchTriggerWidth
                          disabled={taskRunning}
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
                          disabled={taskRunning}
                          ariaLabel="人声分离处理质量"
                          onChange={(quality) => {
                            setAudioSeparationStatus(null);
                            setAudioSeparation((current) => ({ ...current, quality }));
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
                            disabled={taskRunning}
                            ariaLabel="演唱过滤强度"
                            onChange={(dialogueStrength) => setAudioSeparation((current) => ({ ...current, dialogueStrength }))}
                          />
                        </div>
                      ) : (
                        <label className="lossless-audio-option-row is-range">
                          <span>背景保留</span>
                          <EditorRange
                            min={0}
                            max={1}
                            step={0.05}
                            value={audioSeparation.backgroundVolume}
                            disabled={taskRunning}
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
                          disabled={audioSeparationStatusLoading || taskRunning}
                          onClick={() => void checkAudioSeparationStatus()}
                        >
                          <RotateCw size={14} />
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </aside>
          </div>
        </div>
        {mediaContextMenu && (contextMenuResource || contextMenuVideoClip || contextMenuTrack || contextMenuSubtitleCue) ? (
          <div
            className="lossless-media-context-menu"
            role="menu"
            aria-label="素材操作"
            style={{ left: mediaContextMenu.x, top: mediaContextMenu.y }}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            {contextMenuResource ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  title="添加到当前播放头"
                  aria-label="添加到当前播放头"
                  disabled={taskRunning}
                  onClick={() => {
                    setMediaContextMenu(null);
                    addImportedResourceToTimeline(contextMenuResource.id);
                  }}
                >
                  <Plus size={14} />
                  <span>添加</span>
                </button>
                <i aria-hidden="true" />
                <button
                  className="is-danger"
                  type="button"
                  role="menuitem"
                  title={contextMenuResourceDeleteTitle}
                  aria-label={contextMenuResourceDeleteTitle}
                  disabled={taskRunning}
                  onClick={() => {
                    setMediaContextMenu(null);
                    removeImportedResource(contextMenuResource);
                  }}
                >
                  <Trash2 size={14} />
                  <span>删除</span>
                </button>
              </>
            ) : contextMenuVideoClip ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  title="在右键位置切割"
                  aria-label="在右键位置切割"
                  disabled={!canContextMenuSplit}
                  onClick={() => {
                    setMediaContextMenu(null);
                    splitVideoClipAtTime(contextMenuVideoClip, contextMenuSplitTime);
                  }}
                >
                  <Scissors size={14} />
                  <span>切割</span>
                </button>
                {contextMenuVideoSource?.hasAudio ? (
                  <button
                    type="button"
                    role="menuitem"
                    title={contextMenuAudioSeparated ? "该视频素材的声音已经分离" : "将视频声音分离为独立音频素材"}
                    aria-label={contextMenuAudioSeparated ? "声音已分离" : "分离音频"}
                    disabled={contextMenuAudioSeparated || taskRunning}
                    onClick={() => {
                      setMediaContextMenu(null);
                      separateVideoClipAudio(contextMenuVideoClip.id);
                    }}
                  >
                    <AudioLines size={14} />
                    <span>{contextMenuAudioSeparated ? "声音已分离" : "分离音频"}</span>
                  </button>
                ) : null}
                {contextMenuVideoSource?.hasAudio ? (
                  <button
                    type="button"
                    role="menuitem"
                    title={contextMenuAudioSeparated ? "请对已分离的音频素材执行去除 BGM" : "按声音设置处理此视频片段并生成可编辑音轨"}
                    aria-label="去除 BGM"
                    disabled={contextMenuAudioSeparated || taskRunning}
                    onClick={() => {
                      setMediaContextMenu(null);
                      void removeBgmFromTimelineMaterial({ kind: "video", id: contextMenuVideoClip.id });
                    }}
                  >
                    <Music2 size={14} />
                    <span>去除 BGM</span>
                  </button>
                ) : null}
                {contextMenuVideoSource?.hasAudio ? (
                  <button
                    type="button"
                    role="menuitem"
                    title="识别此视频素材中的语音并生成字幕"
                    aria-label="识别字幕"
                    disabled={taskRunning}
                    onClick={() => {
                      const sourceId = `video:${contextMenuVideoClip.id}`;
                      setMediaContextMenu(null);
                      setInspectorTab("subtitles");
                      void runSubtitleTranscription(sourceId);
                    }}
                  >
                    <Captions size={14} />
                    <span>识别字幕</span>
                  </button>
                ) : null}
                <i aria-hidden="true" />
                <button
                  className="is-danger"
                  type="button"
                  role="menuitem"
                  title="删除视频素材"
                  aria-label="删除视频素材"
                  onClick={() => {
                    setMediaContextMenu(null);
                    removeVideoClip(contextMenuVideoClip.id);
                  }}
                >
                  <Trash2 size={14} />
                  <span>删除</span>
                </button>
              </>
            ) : contextMenuSubtitleTrack && contextMenuSubtitleCue ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  title="在右键位置切分字幕"
                  aria-label="切分字幕"
                  disabled={!canContextMenuSplitSubtitle}
                  onClick={() => {
                    setMediaContextMenu(null);
                    splitSubtitleCueAtTime(contextMenuSubtitleTrack.id, contextMenuSubtitleCue.id, contextMenuSubtitleTime);
                  }}
                >
                  <Scissors size={14} />
                  <span>切分</span>
                </button>
                <i aria-hidden="true" />
                <button
                  className="is-danger"
                  type="button"
                  role="menuitem"
                  title="删除字幕"
                  aria-label="删除字幕"
                  onClick={() => {
                    setMediaContextMenu(null);
                    removeSubtitleCue(contextMenuSubtitleTrack.id, contextMenuSubtitleCue.id);
                  }}
                >
                  <Trash2 size={14} />
                  <span>删除</span>
                </button>
              </>
            ) : contextMenuTrack ? (
              <>
                {contextMenuTrack.type === "audio" ? (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      title="在右键位置切割音频"
                      aria-label="切割音频"
                      disabled={!canContextMenuSplitAudio}
                      onClick={() => {
                        setMediaContextMenu(null);
                        splitAudioTrackAtTime(contextMenuTrack, contextMenuTrackSplitTime);
                      }}
                    >
                      <Scissors size={14} />
                      <span>切割</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      title="按声音设置处理此音频素材并原位替换"
                      aria-label="去除 BGM"
                      disabled={taskRunning}
                      onClick={() => {
                        setMediaContextMenu(null);
                        void removeBgmFromTimelineMaterial({ kind: "audio", id: contextMenuTrack.id });
                      }}
                    >
                      <Music2 size={14} />
                      <span>去除 BGM</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      title="识别此音轨中的语音并生成字幕"
                      aria-label="识别字幕"
                      disabled={taskRunning}
                      onClick={() => {
                        const sourceId = `audio:${contextMenuTrack.id}`;
                        setMediaContextMenu(null);
                        setInspectorTab("subtitles");
                        void runSubtitleTranscription(sourceId);
                      }}
                    >
                      <Captions size={14} />
                      <span>识别字幕</span>
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  title={contextMenuTrack.enabled ? "停用时间轴素材" : "启用时间轴素材"}
                  aria-label={contextMenuTrack.enabled ? "停用时间轴素材" : "启用时间轴素材"}
                  onClick={() => {
                    setMediaContextMenu(null);
                    updateTrack(contextMenuTrack.id, (track) => ({ ...track, enabled: !track.enabled }), true);
                  }}
                >
                  <Eye size={14} />
                  <span>{contextMenuTrack.enabled ? "停用" : "启用"}</span>
                </button>
                <i aria-hidden="true" />
                <button
                  className="is-danger"
                  type="button"
                  role="menuitem"
                  title="删除时间轴素材"
                  aria-label="删除时间轴素材"
                  onClick={() => {
                    setMediaContextMenu(null);
                    removeTrack(contextMenuTrack.id);
                  }}
                >
                  <Trash2 size={14} />
                  <span>删除</span>
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}
