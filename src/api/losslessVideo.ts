import { getReq, postReq, type ApiResponse } from "../utils/request";

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
  modelReady: boolean;
  dialogueReady?: boolean;
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
  autoCropBlackBars: boolean;
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

export type ExportMediaTrack = {
  id: string;
  type: "audio" | "image";
  name: string;
  start: number;
  end: number;
  enabled: boolean;
  volume?: number;
  opacity?: number;
  fadeIn?: number;
  fadeOut?: number;
  loop?: boolean;
  keyframes?: MediaKeyframe[];
};

export type ExportTrackAsset = {
  trackId: string;
  file: File;
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
  processedFrames?: number;
  message?: string;
};

export type ExportRequest = {
  taskId?: string;
  input: VideoInput;
  segments: DuplicateSegment[];
  tracks?: ExportMediaTrack[];
  mode: LosslessCutMode;
  outputName?: string;
  autoCropBlackBars?: boolean;
  cropRect?: CropRect;
  audioSeparation?: AudioSeparationOptions;
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
  segments?: DuplicateSegment[];
  cropRect?: CropRect;
  outputPath?: string;
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

export async function getAudioSeparationStatus(
  quality: AudioSeparationQuality = "standard",
  mode: AudioSeparationMode = "vocals"
) {
  const resp = await getReq<AudioSeparationStatus>("/check/video/audio-separation/status", { quality, mode }, { timeout: 60_000 });
  return unwrap(resp);
}

export async function exportCleanVideo(
  request: ExportRequest,
  signal?: AbortSignal,
  assets: ExportTrackAsset[] = [],
  sourceFile?: File,
  onUploadProgress?: (fraction: number) => void
) {
  const payload: ExportRequest | FormData = assets.length || sourceFile
    ? (() => {
        const formData = new FormData();
        formData.append("request", JSON.stringify(request));
        if (sourceFile) formData.append("source", sourceFile, sourceFile.name);
        assets.forEach((asset) => formData.append(`asset_${asset.trackId}`, asset.file, asset.file.name));
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
    throw new Error("导出任务不存在，请重新检测");
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
