import { getToken } from "../utils/authState";
import { postReq, type ApiResponse } from "../utils/request";

export type LosslessCutMode = "keyframe-copy" | "precise-reencode" | "hybrid";

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

export type DetectRequest = {
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
  mode: LosslessCutMode;
  outputName?: string;
  autoCropBlackBars?: boolean;
  cropRect?: CropRect;
};

export type ExportResponse = {
  taskId?: string;
  outputPath?: string;
  downloadUrl?: string;
  message?: string;
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

export function getProcessorHint() {
  return "后端：wse-check /check/video";
}

export async function detectDuplicateSegments(request: DetectRequest, signal?: AbortSignal) {
  if (!request.file) {
    throw new Error("请重新选择视频文件后再检测");
  }
  const formData = new FormData();
  formData.append("file", request.file);
  formData.append("input", JSON.stringify(request.input));
  formData.append("params", JSON.stringify(request.params));
  const resp = await postReq<DetectResponse>("/check/video/detect", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    signal,
    timeout: 0
  });
  return unwrap(resp);
}

export async function exportCleanVideo(request: ExportRequest, signal?: AbortSignal) {
  const resp = await postReq<ExportResponse>("/check/video/export", request, {
    signal,
    timeout: 0
  });
  return unwrap(resp);
}

export async function cancelVideoTask(taskId?: string) {
  if (!taskId) return;
  await postReq("/check/video/task/cancel", { taskId }).catch(() => undefined);
}

export async function downloadVideoOutput(taskId?: string, filename = "video_clean.mp4") {
  if (!taskId) return;
  const baseURL = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
  const response = await fetch(`${baseURL}/check/video/download`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      authorization: getToken(),
      Authorization: getToken()
    },
    body: JSON.stringify({ taskId })
  });
  if (!response.ok) {
    throw new Error(`下载失败：${response.status}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
