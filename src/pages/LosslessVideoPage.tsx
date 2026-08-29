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
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
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

type TimelineLane = {
  id: string;
  type: EditorTrack["type"];
  clips: EditorTrack[];
};

type PendingEditorMedia =
  | { type: "audio"; file: File; previewUrl: string; sourceDuration: number }
  | { type: "image"; file: File; previewUrl: string; sourceWidth: number; sourceHeight: number };

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
const timelineMaxFrameWidthPx = 48;
const timelineMaxCanvasWidthPx = 16_000_000;
const timelineAbsoluteMaxZoom = 16_384;
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

function formatFileSize(size?: number) {
  if (!size) return "-";
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pickTimelineMajorFrameCount(targetFrames: number) {
  const safeTarget = Math.max(5, Number.isFinite(targetFrames) ? targetFrames : 5);
  const magnitude = 10 ** Math.floor(Math.log10(safeTarget));
  const normalized = safeTarget / magnitude;
  const coefficient = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 3 ? 3 : normalized <= 5 ? 5 : 10;
  return Math.max(5, coefficient * magnitude);
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

function findAvailableClipStart(clips: EditorTrack[], preferredStart: number, clipDuration: number, timelineEnd: number) {
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoPickerCooldownUntilRef = useRef(0);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const timelinePlayheadRef = useRef<HTMLElement | null>(null);
  const audioPreviewRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const imageOverlayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const imageMotionPathRef = useRef<SVGPolylineElement | null>(null);
  const tracksRef = useRef<EditorTrack[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const selectionUndoRef = useRef<boolean[][]>([]);
  const selectionRedoRef = useRef<boolean[][]>([]);
  const trackDragMovedRef = useRef(false);
  const audioSeparationStatusRequestRef = useRef(0);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoInput, setVideoInput] = useState<VideoInput | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [videoSize, setVideoSize] = useState<PreviewSize>({ width: 16, height: 9 });
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
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("detect");
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
  const [dragging, setDragging] = useState(false);
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

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      abortRef.current?.abort();
    };
  }, [previewUrl]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    return () => {
      tracksRef.current.forEach((track) => URL.revokeObjectURL(track.previewUrl));
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
    tracks.forEach((track) => {
      const laneId = track.laneId || track.id;
      const lane = lanes.get(laneId);
      if (lane) lane.clips.push(track);
      else lanes.set(laneId, { id: laneId, type: track.type, clips: [track] });
    });
    return Array.from(lanes.values()).map((lane) => ({
      ...lane,
      clips: [...lane.clips].sort((left, right) => left.start - right.start)
    }));
  }, [tracks]);
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
        duration,
        ...segments.map((segment) => Math.max(segment.deleteEnd ?? segment.secondEnd, segment.secondEnd, segment.firstEnd)),
        ...tracks.map((track) => track.end),
        10
      ),
    [duration, segments, tracks]
  );
  const selectedTrackLaneBounds = useMemo(
    () => selectedTrack ? getLaneClipBounds(tracks, selectedTrack, duration || timelineDuration) : undefined,
    [duration, selectedTrack, timelineDuration, tracks]
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
    const canvasWidth = Math.max(1, viewportWidth * timelineZoom - timelineEdgeSpacePx * 2);
    const pixelsPerSecond = canvasWidth / Math.max(0.001, timelineDuration);
    const frameStep = 1 / timelineFps;
    const pixelsPerFrame = pixelsPerSecond / timelineFps;
    const majorFrameCount = pickTimelineMajorFrameCount(96 / Math.max(0.000001, pixelsPerFrame));
    const subdivisionCount = majorFrameCount === 5 ? 5 : 10;
    const minorFrameCount = Math.max(1, majorFrameCount / subdivisionCount);
    const minorStep = minorFrameCount / timelineFps;
    const buffer = viewportWidth * 0.5;
    const visibleStart = clampValue(((timelineViewport.scrollLeft - timelineEdgeSpacePx - buffer) / canvasWidth) * timelineDuration, 0, timelineDuration);
    const visibleEnd = clampValue(((timelineViewport.scrollLeft + viewportWidth - timelineEdgeSpacePx + buffer) / canvasWidth) * timelineDuration, 0, timelineDuration);
    const firstIndex = Math.max(0, Math.floor(visibleStart / minorStep));
    const lastIndex = Math.max(firstIndex, Math.ceil(visibleEnd / minorStep));
    const ticks: TimelineTick[] = [];
    const renderedLastIndex = Math.min(lastIndex, firstIndex + 2400);
    for (let index = firstIndex; index <= renderedLastIndex; index += 1) {
      const frame = index * minorFrameCount;
      const frameWithinMajor = frame % majorFrameCount;
      const time = Math.min(timelineDuration, frame / timelineFps);
      const kind = frameWithinMajor === 0
        ? "major"
        : subdivisionCount === 10 && frameWithinMajor === majorFrameCount / 2
          ? "medium"
          : minorFrameCount === 1
            ? "frame"
            : "minor";
      ticks.push({ index, kind, time, percent: (time / timelineDuration) * 100 });
    }
    return { ticks, frameStep };
  }, [timelineDuration, timelineFps, timelineViewport, timelineZoom]);
  const timelineTicks = timelineScale.ticks;

  useEffect(() => {
    setTimelineZoom((current) => Math.min(current, timelineMaxZoom));
  }, [timelineMaxZoom]);

  const canRunTask = Boolean(videoInput) && status !== "detecting" && status !== "exporting";
  const videoOutputReencoded = hasImageTracks
    || mode === "precise-reencode"
    || (mode === "hybrid" && keyframeWarnings > 0);
  const canUseAudioSeparation = !audioSeparation.enabled
    || (!audioSeparationStatusLoading && audioSeparationStatus?.available === true);
  const canExport = Boolean(videoFile)
    && status !== "detecting"
    && status !== "exporting"
    && canUseAudioSeparation
    && (removableSegments.length > 0 || enabledTracks.length > 0 || audioSeparation.enabled);
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
      tracksRef.current.forEach((track) => {
        if (track.type !== "image") return;
        const element = imageOverlayRefs.current.get(track.id);
        if (!element) return;
        const active = track.enabled && mediaTime >= track.start && mediaTime <= track.end;
        const visibility = active ? "visible" : "hidden";
        const pointerEvents = active ? "auto" : "none";
        if (element.style.visibility !== visibility) element.style.visibility = visibility;
        if (element.style.pointerEvents !== pointerEvents) element.style.pointerEvents = pointerEvents;
        if (active) paintImageTransform(element, interpolateImageKeyframe(track, mediaTime), track);
      });

      const playhead = timelinePlayheadRef.current;
      if (playhead) {
        const playheadPercent = Math.min(mediaTime, timelineDuration) / Math.max(0.001, timelineDuration) * 100;
        const left = `${playheadPercent.toFixed(5)}%`;
        if (playhead.style.left !== left) playhead.style.left = left;
      }

      if (now - lastReactUpdate >= 100) {
        lastReactUpdate = now;
        setCurrentTime((previous) => Math.abs(previous - mediaTime) > 0.001 ? mediaTime : previous);
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
  }, [previewUrl, timelineDuration]);

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

  const acceptFile = (file: File) => {
    if (status === "detecting" || status === "exporting") return;
    if (!isVideoFile(file)) {
      notify({ type: "warning", title: "请选择视频文件", message: file.name });
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    tracks.forEach((track) => URL.revokeObjectURL(track.previewUrl));
    audioPreviewRefs.current.forEach((audio) => audio.pause());
    audioPreviewRefs.current.clear();
    setTracks([]);
    setSelectedTrackId("");
    setSelectedLaneId("");
    setSelectedKeyframeId("");
    setVideoFile(file);
    setVideoInput(createInputFromFile(file));
    setPreviewUrl(URL.createObjectURL(file));
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setTimelineZoom(1);
    resetResult();
  };

  const pickVideo = () => {
    const input = fileInputRef.current;
    const now = performance.now();
    if (!input || now < videoPickerCooldownUntilRef.current) return;
    videoPickerCooldownUntilRef.current = now + 1000;
    input.click();
  };

  const pickAudioTrack = () => audioInputRef.current?.click();

  const pickImageTrack = () => imageInputRef.current?.click();

  const appendMediaClips = (media: PendingEditorMedia[]) => {
    if (!media.length) return;
    const type = media[0].type;
    const insertionStart = clampValue(currentTime, 0, Math.max(0, duration - 0.05));
    const timelineEnd = duration > 0.05 ? duration : Number.POSITIVE_INFINITY;
    const nextTracks = [...tracksRef.current];
    const selectedClip = nextTracks.find((track) => track.id === selectedTrackId);
    const selectedLaneType = nextTracks.find((track) => getTrackLaneId(track) === selectedLaneId)?.type;
    const firstCompatibleClip = nextTracks.find((track) => track.type === type);
    let preferredLaneId =
      selectedLaneId && selectedLaneType === type
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
      const videoAspectRatio = videoSize.width > 0 && videoSize.height > 0 ? videoSize.width / videoSize.height : 16 / 9;
      const defaultImageWidth = 18;
      const defaultImageHeight = item.type === "image"
        ? calculateImageHeightPercent(defaultImageWidth, item.sourceWidth, item.sourceHeight, videoAspectRatio)
        : 18;
      const defaultImageTransform: MediaKeyframe = {
        id: createEditorId("static-transform"),
        time: start,
        x: 85,
        y: 15,
        width: defaultImageWidth,
        height: defaultImageHeight,
        rotation: 0,
        opacity: 0.85,
        easing: "linear"
      };
      const track: EditorTrack = item.type === "audio"
        ? {
            id: clipId,
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
            laneId,
            type: "image",
            name: item.file.name,
            file: item.file,
            previewUrl: item.previewUrl,
            start,
            end,
            enabled: true,
            animated: false,
            opacity: 0.85,
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
    if (lastAdded) {
      setSelectedTrackId(lastAdded.id);
      setSelectedLaneId(getTrackLaneId(lastAdded));
      setSelectedKeyframeId(lastAdded.type === "image" && lastAdded.animated ? lastAdded.keyframes[0]?.id || "" : "");
    }
    setInspectorTab("tracks");
  };

  const acceptAudioTracks = async (files: File[]) => {
    const validFiles = files.filter(isAudioFile);
    if (!validFiles.length) {
      notify({ type: "warning", title: "请选择音频文件" });
      return;
    }
    const media = await Promise.all(
      validFiles.map(async (file): Promise<PendingEditorMedia> => {
        const previewUrl = URL.createObjectURL(file);
        return { type: "audio", file, previewUrl, sourceDuration: await readAudioDuration(previewUrl) };
      })
    );
    appendMediaClips(media);
  };

  const acceptImageTracks = async (files: File[]) => {
    const validFiles = files.filter(isImageFile);
    if (!validFiles.length) {
      notify({ type: "warning", title: "请选择标签图片" });
      return;
    }
    const media = await Promise.all(
      validFiles.map(async (file): Promise<PendingEditorMedia> => {
        const previewUrl = URL.createObjectURL(file);
        const size = await readImageSize(previewUrl);
        return { type: "image", file, previewUrl, sourceWidth: size.width, sourceHeight: size.height };
      })
    );
    appendMediaClips(media);
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
      const timelineEnd = duration > 0 ? duration : Math.max(track.end, value);
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
    return clampValue(((clientX - rect.left) / Math.max(1, rect.width)) * timelineDuration, 0, duration || timelineDuration);
  };

  const selectTrackAtPointer = (event: ReactMouseEvent<HTMLElement>, track: EditorTrack) => {
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
    const originalStart = track.start;
    const originalEnd = track.end;
    const maxDuration = duration || timelineDuration;
    const laneBounds = getLaneClipBounds(tracksRef.current, track, maxDuration);
    trackDragMovedRef.current = false;
    setSelectedTrackId(track.id);
    setSelectedLaneId(getTrackLaneId(track));
    setSelectedKeyframeId(track.type === "image" && track.animated ? track.keyframes[0]?.id || "" : "");
    setInspectorTab("tracks");

    const handleMove = (moveEvent: PointerEvent) => {
      const pixelDelta = moveEvent.clientX - pointerStart;
      if (Math.abs(pixelDelta) > 2) trackDragMovedRef.current = true;
      const timeDelta = (pixelDelta / Math.max(1, rowRect.width)) * timelineDuration;
      setTracks((current) =>
        current.map((item) => {
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
        })
      );
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
      const time = clampValue(keyframe.time + (pixelDelta / Math.max(1, rowRect.width)) * timelineDuration, track.start, track.end);
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
      const nextSegments = response.segments.map(normalizeSegment);
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
    if (!videoInput) return;
    if (!removableSegments.length && !enabledTracks.length && !audioSeparation.enabled) {
      notify({ type: "warning", title: "没有需要导出的编辑内容" });
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
    if (enabledTracks.length) {
      setProgress({ percent: 15, label: "导出中", detail: `正在上传并准备合成 ${enabledTracks.length} 个时间轴素材` });
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
          ? enabledTracks.length ? "_edited_dialogue.mp4" : "_dialogue.mp4"
          : enabledTracks.length ? "_edited_voice.mp4" : "_voice.mp4"
        : enabledTracks.length ? "_edited.mp4" : "_clean.mp4";
      const outputName = videoInput.name.replace(/\.[^.]+$/, outputSuffix);
      const exportTracks: ExportMediaTrack[] = enabledTracks.map((track) =>
        track.type === "audio"
          ? {
              id: track.id,
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
      const response = await exportCleanVideo(
        {
          taskId: exportTaskId,
          input: videoInput,
          segments,
          tracks: exportTracks,
          mode,
          outputName,
          audioSeparation
        },
        abortRef.current.signal,
        enabledTracks.map((track) => ({ trackId: track.id, file: track.file })),
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

  const seekPreview = (seconds: number, shouldPlay = true) => {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = Math.min(Math.max(0, seconds), Number.isFinite(video.duration) ? video.duration : seconds);
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
    syncAudioPreviews(nextTime, shouldPlay || !video.paused);
    if (shouldPlay) void video.play();
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  const changeTimelineZoom = (exponent: number) => {
    const nextZoom = 2 ** clampValue(exponent, 0, timelineMaxZoomExponent);
    const viewport = timelineScrollRef.current;
    if (!viewport || !timelineDuration) {
      setTimelineZoom(nextZoom);
      return;
    }
    const oldCanvasWidth = Math.max(viewport.clientWidth, viewport.scrollWidth);
    const oldContentWidth = Math.max(1, oldCanvasWidth - timelineEdgeSpacePx * 2);
    const playheadPosition = timelineEdgeSpacePx + (currentTime / timelineDuration) * oldContentWidth;
    const playheadViewportX = playheadPosition - viewport.scrollLeft;
    const playheadIsVisible = playheadViewportX >= 0 && playheadViewportX <= viewport.clientWidth;
    const anchorViewportX = playheadIsVisible ? playheadViewportX : viewport.clientWidth / 2;
    const anchorRatio = playheadIsVisible
      ? currentTime / timelineDuration
      : clampValue((viewport.scrollLeft + anchorViewportX - timelineEdgeSpacePx) / oldContentWidth, 0, 1);
    setTimelineZoom(nextZoom);
    window.requestAnimationFrame(() => {
      const newCanvasWidth = Math.max(viewport.clientWidth, viewport.scrollWidth);
      const newContentWidth = Math.max(1, newCanvasWidth - timelineEdgeSpacePx * 2);
      const nextScrollLeft = clampValue(
        timelineEdgeSpacePx + anchorRatio * newContentWidth - anchorViewportX,
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
      const time = clampValue(((clientX - rect.left) / Math.max(1, rect.width)) * timelineDuration, 0, timelineDuration);
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
            ? timelineDuration
            : undefined;
    if (target === undefined) return;
    event.preventDefault();
    seekPreview(target, false);
  };

  const stepFrame = (direction: -1 | 1) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    seekPreview(video.currentTime + direction / timelineFps, false);
  };

  const seekCandidate = (direction: -1 | 1) => {
    if (!segments.length) return;
    const points = segments
      .map((segment) => segment.deleteStart ?? segment.secondStart)
      .sort((left, right) => left - right);
    const activeTime = videoRef.current?.currentTime ?? currentTime;
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
            <button className="primary-button" type="button" onClick={pickVideo} disabled={status === "detecting" || status === "exporting"}>
              <FolderOpen size={16} />
              打开视频
            </button>
            <span className="lossless-toolbar-separator" />
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
            <button className={inspectorTab === "detect" ? "is-active" : ""} type="button" role="tab" aria-selected={inspectorTab === "detect"} onClick={() => setInspectorTab("detect")}>
              <Target size={16} />
              检测
            </button>
            <button className={inspectorTab === "tracks" ? "is-active" : ""} type="button" role="tab" aria-selected={inspectorTab === "tracks"} onClick={() => setInspectorTab("tracks")}>
              <Layers3 size={16} />
              时间轴
            </button>
            <button className={inspectorTab === "export" ? "is-active" : ""} type="button" role="tab" aria-selected={inspectorTab === "export"} onClick={() => setInspectorTab("export")}>
              <Download size={16} />
              导出
            </button>
          </nav>
          <div className="lossless-file-chip" title={videoInput?.name}>
            <FileVideo size={16} />
            <strong>{videoInput?.name || "未打开视频"}</strong>
            {videoInput ? <span>{formatFileSize(videoInput.size)}</span> : null}
          </div>
        </header>

        <input
          ref={fileInputRef}
          className="lossless-file-input"
          type="file"
          accept="video/*,.mp4,.mov,.m4v,.mkv,.webm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) acceptFile(file);
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={audioInputRef}
          className="lossless-file-input"
          type="file"
          multiple
          accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus"
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            if (files.length) void acceptAudioTracks(files);
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={imageInputRef}
          className="lossless-file-input"
          type="file"
          multiple
          accept="image/*,.png,.jpg,.jpeg,.webp,.bmp"
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            if (files.length) acceptImageTracks(files);
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
              <section
                className={`lossless-viewer ${dragging ? "is-dragging" : ""}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const files = Array.from(event.dataTransfer.files);
                  const video = files.find(isVideoFile);
                  const images = files.filter(isImageFile);
                  const audios = files.filter(isAudioFile);
                  if (video) acceptFile(video);
                  else if (videoInput && (images.length || audios.length)) {
                    if (images.length) acceptImageTracks(images);
                    if (audios.length) void acceptAudioTracks(audios);
                  }
                  else notify({ type: "warning", title: videoInput ? "请拖入声音或图片素材" : "请先拖入视频" });
                }}
              >
                <div className="lossless-viewer-titlebar">
                  <span>视频</span>
                  <span>{duration ? formatSeconds(duration) : "--:--"}</span>
                </div>
                <div className="lossless-preview" ref={previewRef}>
                  {previewUrl ? (
                    <>
                      <video
                        ref={videoRef}
                        src={previewUrl}
                        playsInline
                        muted={isMuted}
                        onClick={togglePlayback}
                        onLoadedMetadata={(event) => {
                          setDuration(event.currentTarget.duration);
                          setVideoSize({ width: event.currentTarget.videoWidth || 16, height: event.currentTarget.videoHeight || 9 });
                          event.currentTarget.playbackRate = playbackRate;
                        }}
                        onTimeUpdate={(event) => {
                          const time = event.currentTarget.currentTime;
                          setCurrentTime(time);
                          syncAudioPreviews(time, !event.currentTarget.paused);
                        }}
                        onSeeked={(event) => {
                          const time = event.currentTarget.currentTime;
                          setCurrentTime(time);
                          syncAudioPreviews(time, !event.currentTarget.paused);
                        }}
                        onPlay={(event) => {
                          setIsPlaying(true);
                          syncAudioPreviews(event.currentTarget.currentTime, true);
                        }}
                        onPause={(event) => {
                          setIsPlaying(false);
                          syncAudioPreviews(event.currentTarget.currentTime, false);
                        }}
                        onEnded={(event) => {
                          setIsPlaying(false);
                          syncAudioPreviews(event.currentTarget.currentTime, false);
                        }}
                      />
                      <div
                        className="lossless-media-overlay"
                        style={{
                          left: previewVideoRect.left,
                          top: previewVideoRect.top,
                          width: previewVideoRect.width,
                          height: previewVideoRect.height
                        }}
                      >
                        {selectedImageTrack && selectedImageMotionPoints && currentTime >= selectedImageTrack.start && currentTime <= selectedImageTrack.end ? (
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
                          const isActive = track.enabled && currentTime >= track.start && currentTime <= track.end;
                          return (
                            <div
                              className={`lossless-image-overlay ${isSelected ? "is-selected" : ""}`}
                              key={track.id}
                              ref={(element) => {
                                if (element) {
                                  imageOverlayRefs.current.set(track.id, element);
                                  paintImageTransform(element, interpolateImageKeyframe(track, videoRef.current?.currentTime ?? currentTime), track);
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
                                pointerEvents: isActive ? "auto" : "none"
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
                    <button className="lossless-drop" type="button" onClick={pickVideo}>
                      <FileVideo size={34} />
                      <strong>拖入视频或点击打开</strong>
                      <span>MP4 · MOV · MKV · WebM</span>
                    </button>
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
                    <button type="button" title="向选中音频轨添加素材" aria-label="添加音频素材" onClick={pickAudioTrack} disabled={!videoInput}>
                      <Music2 size={15} />
                    </button>
                    <button type="button" title="向选中图片轨添加素材" aria-label="添加图片素材" onClick={pickImageTrack} disabled={!videoInput}>
                      <Sticker size={15} />
                    </button>
                    <span>{tracks.length ? `${tracks.length} 个素材 · ${timelineLanes.length} 条轨道` : "V1"}</span>
                  </div>
                  <div className="lossless-timeline-transport" aria-label="预览控制">
                    <span className="lossless-timecode" title={`${formatSeconds(currentTime)} / ${duration ? formatSeconds(duration) : "--:--"}`}>
                      {formatTimelineTimecode(currentTime, timelineFps)} / {duration ? formatTimelineTimecode(duration, timelineFps) : "--:--:--:--"}
                    </span>
                    <div className="lossless-transport-buttons">
                      <button type="button" title="上一个候选片段" aria-label="上一个候选片段" onClick={() => seekCandidate(-1)} disabled={!previewUrl || !segments.length}>
                        <SkipBack size={15} />
                      </button>
                      <button type="button" title="上一帧" aria-label="上一帧" onClick={() => stepFrame(-1)} disabled={!previewUrl}>
                        <ChevronLeft size={15} />
                      </button>
                      <button className="lossless-play-button" type="button" title={isPlaying ? "暂停" : "播放"} aria-label={isPlaying ? "暂停" : "播放"} onClick={togglePlayback} disabled={!previewUrl}>
                        {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                      </button>
                      <button type="button" title="下一帧" aria-label="下一帧" onClick={() => stepFrame(1)} disabled={!previewUrl}>
                        <ChevronRight size={15} />
                      </button>
                      <button type="button" title="下一个候选片段" aria-label="下一个候选片段" onClick={() => seekCandidate(1)} disabled={!previewUrl || !segments.length}>
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
                      disabled={!previewUrl}
                    />
                    <button className="lossless-timeline-mute" type="button" title={isMuted ? "打开声音" : "静音"} aria-label={isMuted ? "打开声音" : "静音"} onClick={toggleMute} disabled={!previewUrl}>
                      {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                    </button>
                  </div>
                  <div className="lossless-timeline-toolbar-end">
                    <label className="lossless-timeline-zoom-control">
                      <ZoomIn size={15} />
                      <input
                        type="range"
                        min={0}
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
                  <div className="lossless-timeline-canvas" style={{ width: `${timelineZoom * 100}%`, minHeight: `${108 + timelineLanes.length * 34}px` }}>
                    <div className="lossless-timeline-content">
                      <div
                        className="lossless-timeline-ruler"
                        title="点击或拖动定位播放头"
                        role="slider"
                        tabIndex={previewUrl ? 0 : -1}
                        aria-label="播放进度"
                        aria-valuemin={0}
                        aria-valuemax={timelineDuration}
                        aria-valuenow={Math.min(currentTime, timelineDuration)}
                        aria-valuetext={formatTimelineTimecode(currentTime, timelineFps)}
                        onPointerDown={startTimelineScrub}
                        onKeyDown={handleTimelineRulerKeyDown}
                      >
                        <i
                          className="lossless-timeline-ruler-progress"
                          style={{ width: `${(Math.min(currentTime, timelineDuration) / timelineDuration) * 100}%` }}
                        />
                        {timelineTicks.map((tick) => (
                          <span className={`is-${tick.kind}`} key={`${tick.kind}-${tick.index}`} style={{ left: `${tick.percent}%` }}>
                            {tick.kind === "major" ? <time>{formatTimelineTimecode(tick.time, timelineFps)}</time> : null}
                          </span>
                        ))}
                      </div>
                      <div className="lossless-timeline-grid-lines" aria-hidden="true">
                        {timelineTicks.map((tick) => (
                          <i className={`is-${tick.kind}`} key={`grid-${tick.kind}-${tick.index}`} style={{ left: `${tick.percent}%` }} />
                        ))}
                      </div>
                      <div className="lossless-source-track">
                        <span>{videoInput?.name || "V1"}</span>
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
                              style={{ left: `${(start / timelineDuration) * 100}%`, width: `${Math.max(((end - start) / timelineDuration) * 100, 0.08)}%` }}
                              title={`${segment.kind === "slide-transition" ? "上滑转场" : "重复片段"} ${formatSeconds(start)} - ${formatSeconds(end)}`}
                              aria-label={`定位到 ${formatSeconds(start)}`}
                              onClick={() => seekPreview(start, false)}
                              disabled={!previewUrl}
                            />
                          );
                        })}
                      </div>
                      {timelineLanes.map((lane, laneIndex) => (
                        <div
                          className={`lossless-media-track-row is-${lane.type} ${selectedLaneId === lane.id && !selectedTrackId ? "is-selected" : ""}`}
                          key={`${lane.id}-timeline`}
                          style={{ top: `${102 + laneIndex * 34}px` }}
                          aria-label={`${lane.type === "audio" ? "音频" : "图片"}轨道，${lane.clips.length} 个素材`}
                          onPointerDown={(event) => {
                            setSelectedLaneId(lane.id);
                            if (event.target === event.currentTarget) {
                              setSelectedTrackId("");
                              setSelectedKeyframeId("");
                              setInspectorTab("tracks");
                            }
                          }}
                        >
                        {lane.clips.map((track) => (
                          <Fragment key={`${track.id}-timeline`}>
                            <button
                              className={`lossless-media-track-clip ${selectedTrackId === track.id ? "is-selected" : ""} ${track.enabled ? "" : "is-disabled"}`}
                              type="button"
                              aria-pressed={selectedTrackId === track.id}
                              style={{
                                left: `${(track.start / timelineDuration) * 100}%`,
                                width: `${Math.max(((track.end - track.start) / timelineDuration) * 100, 0.35)}%`
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
                                    style={{ left: `${(keyframe.time / timelineDuration) * 100}%` }}
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
                      <i ref={timelinePlayheadRef} className="lossless-playhead" style={{ left: `${(Math.min(currentTime, timelineDuration) / timelineDuration) * 100}%` }} />
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
                                  <button type="button" title="播放处理范围" aria-label={`从 ${formatSeconds(start)} 开始播放`} disabled={!previewUrl} onClick={() => seekPreview(start, true)}>
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
                      <h3>时间轴素材</h3>
                      <span>{tracks.length}</span>
                    </div>
                    <div className="lossless-track-add-actions">
                      <button type="button" onClick={pickAudioTrack} disabled={!videoInput}>
                        <Music2 size={15} />
                        添加声音
                      </button>
                      <button type="button" onClick={pickImageTrack} disabled={!videoInput}>
                        <Sticker size={15} />
                        添加图片
                      </button>
                    </div>
                  </section>

                  {selectedTrack ? (
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
                          <span><input type="number" min={selectedTrack.start + 0.05} max={selectedTrackLaneBounds?.maximumEnd ?? (duration || undefined)} step={0.01} value={Number(selectedTrack.end.toFixed(2))} onChange={(event) => updateTrackBoundary(selectedTrack.id, "end", Number(event.target.value || selectedTrack.end))} /><em>秒</em></span>
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
                  ) : (
                    <section className="lossless-inspector-section">
                      <div className="lossless-track-empty">
                        <Layers3 size={21} />
                        <span>{tracks.length ? "未选择时间轴素材" : "时间轴暂无素材"}</span>
                      </div>
                    </section>
                  )}
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
                            <small>{audioSeparationStatus?.message || "正在读取运行环境与模型状态"}</small>
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
                    <dl><dt>输出时长</dt><dd>{duration ? formatSeconds(Math.max(0, duration - removeDuration)) : "--:--"}</dd></dl>
                    <dl><dt>画面尺寸</dt><dd>保持原画</dd></dl>
                    <dl><dt>时间轴素材</dt><dd>{enabledTracks.length}</dd></dl>
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
