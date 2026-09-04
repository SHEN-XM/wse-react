import { getReq, postBlobReq, postReq, type ApiResponse } from "../utils/request";

export type LosslessCutMode = "keyframe-copy" | "precise-reencode" | "hybrid";
export type AudioSeparationQuality = "fast" | "standard" | "high";
export type AudioSeparationMode = "vocals" | "dialogue";
export type DialogueStrength = "conservative" | "standard" | "strong";

export type AudioSeparationOptions = {
  enabled: boolean;
  mode: AudioSeparationMode;
  quality: AudioSeparationQuality;
  dialogueStrength: DialogueStrength;
  backgroundVolume: number;
};

export type AudioSeparationStatus = {
  available: boolean;
  engine?: string;
  version?: string;
  device?: string;
  platform?: string;
  videoEncoder?: string;
  videoHardware?: boolean;
  modelReady: boolean;
  dialogueReady?: boolean;
  message?: string;
};

export type AudioSeparationApplyOptions = AudioSeparationOptions & {
  sourceStart: number;
  sourceEnd: number;
  outputName?: string;
};

export type AudioSeparationApplyResponse = {
  taskId: string;
  duration: number;
  engine?: string;
  device?: string;
  message?: string;
};

export type WatermarkRemovalStatus = {
  available: boolean;
  engine?: string;
  version?: string;
  device?: string;
  platform?: string;
  modelReady: boolean;
  message?: string;
};

export type WatermarkRemovalOptions = {
  sourceStart: number;
  sourceEnd: number;
  outputName?: string;
  quality: "high";
  mask: VideoEffectMask;
  maskKeyframes?: VideoEffectMaskKeyframe[];
};

export type WatermarkRemovalResponse = {
  taskId: string;
  duration: number;
  engine?: string;
  device?: string;
  message?: string;
};

export type DetectParams = {
  maxSearchWindowSec: number;
  minRepeatSec: number;
  audioSimilarity: number;
  videoSimilarity: number;
  frameSampleFps: number;
  confirmPaddingMs: number;
  preferAudioFirst: boolean;
  autoDetectSlideTransitions: boolean;
};

export type CropRect = {
  w: number;
  h: number;
  x: number;
  y: number;
};

export type VideoInput = {
  name: string;
  size?: number;
};

export type DuplicateSegment = {
  id: string;
  kind?: "repeat" | "slide-transition" | string;
  firstStart: number;
  firstEnd: number;
  secondStart: number;
  secondEnd: number;
  deleteStart?: number;
  deleteEnd?: number;
  deleteDuration?: number;
  duration: number;
  audioSimilarity: number;
  videoSimilarity: number;
  confidence: number;
  keyframeAligned: boolean;
  deleteSecond: boolean;
  note?: string;
};

export type MediaKeyframe = {
  id: string;
  time: number;
  x: number;
  y: number;
  width: number;
  height?: number;
  rotation: number;
  opacity?: number;
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
};

export type ColorWheelValue = {
  x: number;
  y: number;
  master: number;
};

export type VideoColorAdjustments = {
  lift: ColorWheelValue;
  gamma: ColorWheelValue;
  gain: ColorWheelValue;
  offset: ColorWheelValue;
  saturation: number;
};

export type VideoEffectKind = "particles" | "snow" | "blur" | "mosaic" | "watermark" | "ai-watermark";

export type VideoEffectMask = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VideoEffectMaskKeyframe = VideoEffectMask & {
  id: string;
  time: number;
};

export type ExportVideoEffect = {
  id: string;
  purpose?: "subtitle-background";
  kind: VideoEffectKind;
  start: number;
  end: number;
  enabled: boolean;
  intensity: number;
  opacity: number;
  speed: number;
  density: number;
  seed: number;
  mask?: VideoEffectMask;
  removalMode?: "repair";
  maskKeyframes?: VideoEffectMaskKeyframe[];
};

export type SubtitleWord = {
  text: string;
  start: number;
  end: number;
  confidence?: number;
};

export type SubtitleCue = {
  id: string;
  start: number;
  end: number;
  sourceStart?: number;
  sourceEnd?: number;
  text: string;
  confidence?: number;
  speaker?: string;
  words?: SubtitleWord[];
};

export type SubtitleStyle = {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  backgroundColor: string;
  backgroundAlpha: number;
  backgroundBlur: number;
  x: number;
  position: number;
  width: number;
  alignment: "left" | "center" | "right";
};

export type ExportSubtitleTrack = {
  id: string;
  laneId: string;
  layer: number;
  name: string;
  language: string;
  enabled: boolean;
  style: SubtitleStyle;
  cues: SubtitleCue[];
};

export type SubtitleQuality = "fast" | "standard" | "high";
export type SubtitleExportMode = "none" | "soft" | "burn";

export type SubtitleTranscribeOptions = {
  language: string;
  quality: SubtitleQuality;
  sourceStart: number;
  sourceEnd: number;
  maxCharsPerLine: number;
  maxLines: number;
  hotwords: string[];
};

export type SubtitleTranscribeResponse = {
  taskId: string;
  language: string;
  duration: number;
  engine: string;
  model: string;
  device: string;
  cues: SubtitleCue[];
  message?: string;
};

export type SubtitleEngineStatus = {
  available: boolean;
  engine?: string;
  version?: string;
  device?: string;
  platform?: string;
  model?: string;
  modelReady: boolean;
  message?: string;
};

export type ExportMediaTrack = {
  id: string;
  laneId: string;
  layer: number;
  type: "audio" | "image";
  name: string;
  start: number;
  end: number;
  sourceStart?: number;
  sourceEnd?: number;
  sourceVideoId?: string;
  enabled: boolean;
  volume?: number;
  opacity?: number;
  fadeIn?: number;
  fadeOut?: number;
  loop?: boolean;
  sourceWidth?: number;
  sourceHeight?: number;
  keyframes?: MediaKeyframe[];
};

export type ExportVideoClip = {
  id: string;
  sourceId: string;
  laneId: string;
  layer: number;
  name: string;
  start: number;
  end: number;
  sourceStart: number;
  sourceEnd: number;
  primary: boolean;
  volume?: number;
  transform?: {
    x: number;
    y: number;
    width: number;
  };
  color?: VideoColorAdjustments;
};

export type ExportTrackAsset = {
  trackId: string;
  file: File;
};

export type ExportVideoAsset = {
  sourceId: string;
  file: File;
};

export type ExportVideoCover = {
  mode: "frame" | "upload";
  time?: number;
};

export type DetectRequest = {
  taskId?: string;
  file?: File;
  input: VideoInput;
  params: DetectParams;
};

export type DetectResponse = {
  taskId?: string;
  segments: DuplicateSegment[];
  cropRect?: CropRect;
  duration?: number;
  audioPeaks?: number[];
  processedFrames?: number;
  message?: string;
};

export type ExportRequest = {
  taskId?: string;
  input: VideoInput;
  projectDuration: number;
  canvasWidth: number;
  canvasHeight: number;
  forceCanvas?: boolean;
  sourceVideoUnchanged?: boolean;
  frameRate: number;
  segments: DuplicateSegment[];
  tracks?: ExportMediaTrack[];
  videoClips?: ExportVideoClip[];
  effects?: ExportVideoEffect[];
  subtitleTracks?: ExportSubtitleTrack[];
  subtitleMode?: SubtitleExportMode;
  cover?: ExportVideoCover;
  mode: LosslessCutMode;
  outputName?: string;
};

export type ExportResponse = {
  taskId?: string;
  outputPath?: string;
  downloadUrl?: string;
  message?: string;
};

export type VideoTaskInfo = {
  taskId: string;
  status: string;
  progress: number;
  stage?: string;
  message?: string;
  duration?: number;
  audioPeaks?: number[];
  segments?: DuplicateSegment[];
  cropRect?: CropRect;
  outputPath?: string;
  subtitleCues?: SubtitleCue[];
  subtitleLanguage?: string;
  subtitleEngine?: string;
  subtitleModel?: string;
  subtitleDevice?: string;
};

function unwrap<T>(resp: ApiResponse<T>) {
  if (typeof resp.code === "number" && resp.code !== 0) {
    throw new Error(resp.msg || "视频处理接口返回失败");
  }
  return resp.data as T;
}

export function hasVideoProcessor() {
  return true;
}

export function createVideoTaskId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `video-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function detectDuplicateSegments(request: DetectRequest, signal?: AbortSignal, onUploadProgress?: (fraction: number) => void) {
  if (!request.file) {
    throw new Error("请重新选择视频文件后再检测");
  }
  const formData = new FormData();
  formData.append("file", request.file);
  formData.append("input", JSON.stringify(request.input));
  formData.append("params", JSON.stringify(request.params));
  const taskQuery = request.taskId ? `?taskId=${encodeURIComponent(request.taskId)}` : "";
  const resp = await postReq<DetectResponse>(`/check/video/detect${taskQuery}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    signal,
    timeout: 0,
    onUploadProgress: (event) => {
      const total = Number(event.total || 0);
      if (total > 0) {
        onUploadProgress?.(Math.min(1, Math.max(0, event.loaded / total)));
      }
    }
  });
  return unwrap(resp);
}

export async function getVideoTaskInfo(taskId: string) {
  const resp = await postReq<VideoTaskInfo>("/check/video/task/info", { taskId }, { timeout: 0 });
  return unwrap(resp);
}

export type VideoTaskWatcher = {
  close: () => void;
};

export function watchVideoTask(
  taskId: string,
  onTask: (info: VideoTaskInfo) => void,
  onConnectionChange?: (connected: boolean) => void
): VideoTaskWatcher {
  let closed = false;
  let source: EventSource | undefined;
  let fallbackDelay: number | undefined;
  let fallbackTimer: number | undefined;
  let fallbackBusy = false;

  const stopFallback = () => {
    if (fallbackDelay !== undefined) window.clearTimeout(fallbackDelay);
    if (fallbackTimer !== undefined) window.clearInterval(fallbackTimer);
    fallbackDelay = undefined;
    fallbackTimer = undefined;
  };
  const close = () => {
    if (closed) return;
    closed = true;
    stopFallback();
    source?.close();
    source = undefined;
  };
  const acceptTask = (info: VideoTaskInfo) => {
    if (closed) return;
    onTask(info);
  };
  const pollFallback = async () => {
    if (closed || fallbackBusy) return;
    fallbackBusy = true;
    try {
      acceptTask(await getVideoTaskInfo(taskId));
    } catch {
      // SSE 会继续自动重连，轮询只负责断线期间的低频兜底。
    } finally {
      fallbackBusy = false;
    }
  };
  const startFallback = () => {
    if (closed || fallbackTimer !== undefined) return;
    void pollFallback();
    fallbackTimer = window.setInterval(() => void pollFallback(), 5000);
  };

  if (typeof EventSource === "undefined") {
    startFallback();
  } else {
    const baseURL = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
    source = new EventSource(`${baseURL}/check/video/task/events?taskId=${encodeURIComponent(taskId)}`, {
      withCredentials: true
    });
    source.addEventListener("open", () => {
      if (closed) return;
      stopFallback();
      onConnectionChange?.(true);
    });
    source.addEventListener("task", (event) => {
      if (closed) return;
      try {
        const info = JSON.parse((event as MessageEvent<string>).data) as VideoTaskInfo;
        stopFallback();
        onConnectionChange?.(true);
        acceptTask(info);
      } catch {
        startFallback();
      }
    });
    source.addEventListener("error", () => {
      if (closed) return;
      onConnectionChange?.(false);
      startFallback();
    });
    fallbackDelay = window.setTimeout(startFallback, 6000);
  }

  return { close };
}

export async function getAudioSeparationStatus(
  quality: AudioSeparationQuality = "standard",
  mode: AudioSeparationMode = "vocals"
) {
  const resp = await getReq<AudioSeparationStatus>("/check/video/audio-separation/status", { quality, mode }, { timeout: 60_000 });
  return unwrap(resp);
}

export async function applyAudioSeparationToAsset(
  taskId: string,
  file: File,
  options: AudioSeparationApplyOptions,
  signal?: AbortSignal,
  onUploadProgress?: (fraction: number) => void
) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("options", JSON.stringify({ ...options, enabled: true }));
  const query = taskId ? `?taskId=${encodeURIComponent(taskId)}` : "";
  const resp = await postReq<AudioSeparationApplyResponse>(`/check/video/audio-separation/apply${query}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    signal,
    timeout: 0,
    onUploadProgress: (event) => {
      const total = Number(event.total || 0);
      if (total > 0) onUploadProgress?.(Math.min(1, Math.max(0, event.loaded / total)));
    }
  });
  return unwrap(resp);
}

export async function getWatermarkRemovalStatus() {
  const resp = await getReq<WatermarkRemovalStatus>("/check/video/watermark-removal/status", undefined, { timeout: 60_000 });
  return unwrap(resp);
}

export async function applyWatermarkRemovalToAsset(
  taskId: string,
  file: File,
  options: WatermarkRemovalOptions,
  signal?: AbortSignal,
  onUploadProgress?: (fraction: number) => void
) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("options", JSON.stringify(options));
  const query = taskId ? `?taskId=${encodeURIComponent(taskId)}` : "";
  const resp = await postReq<WatermarkRemovalResponse>(`/check/video/watermark-removal/apply${query}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    signal,
    timeout: 0,
    onUploadProgress: (event) => {
      const total = Number(event.total || 0);
      if (total > 0) onUploadProgress?.(Math.min(1, Math.max(0, event.loaded / total)));
    }
  });
  return unwrap(resp);
}

export function downloadVideoOutputBlob(taskId: string, signal?: AbortSignal) {
  if (!taskId) throw new Error("处理任务不存在，请重新处理");
  return postBlobReq("/check/video/download", { taskId }, { signal, timeout: 0 });
}

export async function getSubtitleEngineStatus(quality: SubtitleQuality = "standard") {
  const resp = await getReq<SubtitleEngineStatus>("/check/video/subtitle/status", { quality }, { timeout: 60_000 });
  return unwrap(resp);
}

export async function transcribeSubtitles(
  taskId: string,
  file: File,
  options: SubtitleTranscribeOptions,
  signal?: AbortSignal,
  onUploadProgress?: (fraction: number) => void
) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("options", JSON.stringify(options));
  const query = taskId ? `?taskId=${encodeURIComponent(taskId)}` : "";
  const resp = await postReq<SubtitleTranscribeResponse>(`/check/video/subtitle/transcribe${query}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    signal,
    timeout: 0,
    onUploadProgress: (event) => {
      const total = Number(event.total || 0);
      if (total > 0) onUploadProgress?.(Math.min(1, Math.max(0, event.loaded / total)));
    }
  });
  return unwrap(resp);
}

export async function exportCleanVideo(
  request: ExportRequest,
  signal?: AbortSignal,
  assets: ExportTrackAsset[] = [],
  videoAssets: ExportVideoAsset[] = [],
  sourceFile?: File,
  onUploadProgress?: (fraction: number) => void,
  coverFile?: File
) {
  const payload: ExportRequest | FormData = assets.length || videoAssets.length || sourceFile || coverFile
    ? (() => {
        const formData = new FormData();
        formData.append("request", JSON.stringify(request));
        if (sourceFile) formData.append("source", sourceFile, sourceFile.name);
        assets.forEach((asset) => formData.append(`asset_${asset.trackId}`, asset.file, asset.file.name));
        videoAssets.forEach((asset) => formData.append(`video_asset_${asset.sourceId}`, asset.file, asset.file.name));
        if (coverFile) formData.append("cover", coverFile, coverFile.name);
        return formData;
      })()
    : request;
  const resp = await postReq<ExportResponse>("/check/video/export", payload, {
    headers: payload instanceof FormData ? { "Content-Type": "multipart/form-data" } : undefined,
    signal,
    timeout: 0,
    onUploadProgress: (event) => {
      const total = Number(event.total || 0);
      if (total > 0) onUploadProgress?.(Math.min(1, Math.max(0, event.loaded / total)));
    }
  });
  return unwrap(resp);
}

export async function cancelVideoTask(taskId?: string) {
  if (!taskId) return;
  await postReq("/check/video/task/cancel", { taskId }).catch(() => undefined);
}

export function downloadVideoOutput(taskId?: string, filename = "video_clean.mp4") {
  if (!taskId) {
    throw new Error("导出任务不存在，请重新导出");
  }
  const baseURL = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
  const link = document.createElement("a");
  link.href = `${baseURL}/check/video/download?taskId=${encodeURIComponent(taskId)}`;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
