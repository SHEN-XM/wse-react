import {
  AlertTriangle,
  CheckCircle2,
  CircleStop,
  Download,
  FileVideo,
  FolderOpen,
  Loader2,
  Play,
  RotateCcw,
  Scissors,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  cancelVideoTask,
  detectDuplicateSegments,
  downloadVideoOutput,
  exportCleanVideo,
  getProcessorHint,
  hasVideoProcessor,
  type CropRect,
  type DetectParams,
  type DuplicateSegment,
  type LosslessCutMode,
  type VideoInput
} from "../api/losslessVideo";
import SegmentedControl from "../components/SegmentedControl";
import { notify } from "../utils/notify";

type TaskStatus = "idle" | "detecting" | "detected" | "exporting" | "done" | "error" | "cancelled";

type ProgressState = {
  percent: number;
  label: string;
  detail: string;
};

const defaultParams: DetectParams = {
  maxSearchWindowSec: 30,
  minRepeatSec: 2,
  audioSimilarity: 95,
  videoSimilarity: 97,
  frameSampleFps: 2,
  confirmPaddingMs: 300,
  preferAudioFirst: true,
  autoCropBlackBars: true,
  autoDetectSlideTransitions: true
};

const settingsStorageKey = "wse.losslessVideo.settings.v1";

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

function loadStoredSettings() {
  if (typeof window === "undefined") {
    return { params: defaultParams, mode: "keyframe-copy" as LosslessCutMode };
  }
  try {
    const rawValue = window.localStorage.getItem(settingsStorageKey);
    if (!rawValue) {
      return { params: defaultParams, mode: "keyframe-copy" as LosslessCutMode };
    }
    const stored = JSON.parse(rawValue) as { params?: Partial<DetectParams>; mode?: unknown };
    const storedParams = stored.params || {};
    return {
      params: {
        maxSearchWindowSec: readNumberSetting(storedParams.maxSearchWindowSec, defaultParams.maxSearchWindowSec),
        minRepeatSec: readNumberSetting(storedParams.minRepeatSec, defaultParams.minRepeatSec),
        audioSimilarity: readNumberSetting(storedParams.audioSimilarity, defaultParams.audioSimilarity),
        videoSimilarity: readNumberSetting(storedParams.videoSimilarity, defaultParams.videoSimilarity),
        frameSampleFps: readNumberSetting(storedParams.frameSampleFps, defaultParams.frameSampleFps),
        confirmPaddingMs: readNumberSetting(storedParams.confirmPaddingMs, defaultParams.confirmPaddingMs),
        preferAudioFirst: readBooleanSetting(storedParams.preferAudioFirst, defaultParams.preferAudioFirst),
        autoCropBlackBars: readBooleanSetting(storedParams.autoCropBlackBars, defaultParams.autoCropBlackBars),
        autoDetectSlideTransitions: readBooleanSetting(storedParams.autoDetectSlideTransitions, defaultParams.autoDetectSlideTransitions)
      },
      mode: isCutMode(stored.mode) ? stored.mode : "keyframe-copy"
    };
  } catch {
    return { params: defaultParams, mode: "keyframe-copy" as LosslessCutMode };
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoInput, setVideoInput] = useState<VideoInput | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [params, setParams] = useState<DetectParams>(storedSettingsRef.current.params);
  const [mode, setMode] = useState<LosslessCutMode>(storedSettingsRef.current.mode);
  const [status, setStatus] = useState<TaskStatus>("idle");
  const [progress, setProgress] = useState<ProgressState>({ percent: 0, label: "等待视频", detail: "选择合成长视频后开始检测" });
  const [segments, setSegments] = useState<DuplicateSegment[]>([]);
  const [cropRect, setCropRect] = useState<CropRect | undefined>();
  const [taskId, setTaskId] = useState<string>();
  const [error, setError] = useState("");
  const [outputPath, setOutputPath] = useState("");
  const [dragging, setDragging] = useState(false);
  const [stepStartedAt, setStepStartedAt] = useState(0);
  const [stepFinishedAt, setStepFinishedAt] = useState(0);
  const [clockNow, setClockNow] = useState(Date.now());

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      abortRef.current?.abort();
    };
  }, [previewUrl]);

  useEffect(() => {
    try {
      window.localStorage.setItem(settingsStorageKey, JSON.stringify({ params, mode }));
    } catch {
      // 浏览器禁用本地存储时不影响视频处理。
    }
  }, [params, mode]);

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
  }, [progress.detail, progress.label, status]);

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
  const repeatCount = useMemo(
    () => segments.filter((segment) => segment.kind !== "slide-transition").length,
    [segments]
  );
  const transitionCount = useMemo(
    () => segments.filter((segment) => segment.kind === "slide-transition").length,
    [segments]
  );
  const canRunTask = Boolean(videoInput) && status !== "detecting" && status !== "exporting";
  const canExport = Boolean(taskId) && status !== "detecting" && status !== "exporting" && (segments.length > 0 || params.autoCropBlackBars);
  const stepElapsed = stepStartedAt ? formatElapsed((stepFinishedAt || clockNow) - stepStartedAt) : "";
  const showStepElapsed = Boolean(stepElapsed) && status !== "idle";

  const setNumberParam = (key: keyof DetectParams, value: number) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const resetResult = () => {
    setSegments([]);
    setCropRect(undefined);
    setTaskId(undefined);
    setError("");
    setOutputPath("");
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
    setVideoFile(file);
    setVideoInput(createInputFromFile(file));
    setPreviewUrl(URL.createObjectURL(file));
    setDuration(0);
    resetResult();
  };

  const pickVideo = async () => {
    fileInputRef.current?.click();
  };

  const runDetect = async () => {
    if (!videoInput) {
      notify({ type: "warning", title: "请先选择视频" });
      return;
    }
    setStatus("detecting");
    setError("");
    setOutputPath("");
    setProgress({ percent: 8, label: "检测中", detail: "连接本地处理器，准备音频指纹初筛" });
    abortRef.current = new AbortController();
    try {
      const response = await detectDuplicateSegments({ file: videoFile ?? undefined, input: videoInput, params }, abortRef.current.signal);
      const nextSegments = response.segments.map(normalizeSegment);
      const nextRepeats = nextSegments.filter((segment) => segment.kind !== "slide-transition").length;
      const nextTransitions = nextSegments.filter((segment) => segment.kind === "slide-transition").length;
      setSegments(nextSegments);
      setCropRect(response.cropRect);
      setTaskId(response.taskId);
      if (response.duration) setDuration(response.duration);
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
      abortRef.current = null;
    }
  };

  const runExport = async () => {
    if (!videoInput) return;
    if (!removableSegments.length && !params.autoCropBlackBars) {
      notify({ type: "warning", title: "没有勾选删除片段" });
      return;
    }
    setStatus("exporting");
    setError("");
    setProgress({ percent: 15, label: "导出中", detail: mode === "keyframe-copy" ? "按关键帧边界生成流拷贝切割方案" : "准备精确裁剪方案" });
    if (params.autoCropBlackBars) {
      setProgress({ percent: 15, label: "导出中", detail: "裁黑边会改变画面尺寸，正在准备重编码导出" });
    }
    abortRef.current = new AbortController();
    try {
      const response = await exportCleanVideo(
        {
          taskId,
          input: videoInput,
          segments,
          mode,
          outputName: videoInput.name.replace(/\.[^.]+$/, "_clean.mp4"),
          autoCropBlackBars: params.autoCropBlackBars,
          cropRect
        },
        abortRef.current.signal
      );
      const path = response.outputPath || response.downloadUrl || "";
      setOutputPath(path);
      setStatus("done");
      setProgress({ percent: 100, label: "导出完成", detail: response.message || path || "已输出无重复 MP4" });
      notify({ type: "success", title: "导出完成", message: path || response.message });
    } catch (err) {
      const message = err instanceof Error ? err.message : "导出失败";
      setStatus(abortRef.current?.signal.aborted ? "cancelled" : "error");
      setError(message);
      setProgress({ percent: 0, label: "导出未完成", detail: message });
      notify({ type: "error", title: "导出失败", message });
    } finally {
      abortRef.current = null;
    }
  };

  const cancelTask = async () => {
    abortRef.current?.abort();
    await cancelVideoTask(taskId);
    setStatus("cancelled");
    setProgress({ percent: 0, label: "已取消", detail: "当前任务已停止" });
  };

  const toggleSegment = (index: number) => {
    setSegments((prev) => prev.map((segment, segmentIndex) => (segmentIndex === index ? { ...segment, deleteSecond: !segment.deleteSecond } : segment)));
  };

  const seekPreview = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, seconds);
    void videoRef.current.play();
  };

  const statusIcon = status === "detecting" || status === "exporting" ? <Loader2 className="spin" size={18} /> : status === "done" || status === "detected" ? <CheckCircle2 size={18} /> : status === "error" ? <XCircle size={18} /> : <ShieldCheck size={18} />;

  return (
    <section className="workspace module-workspace lossless-video-page">
      <section className="data-panel data-panel-full data-panel-compact lossless-video-panel">
        <div className="table-toolbar lossless-video-toolbar">
          <button className="primary-button" type="button" onClick={pickVideo} disabled={status === "detecting" || status === "exporting"}>
            <FolderOpen size={16} />
            选择视频
          </button>
          <button type="button" onClick={runDetect} disabled={!canRunTask}>
            {status === "detecting" ? <Loader2 className="spin" size={16} /> : <Target size={16} />}
            开始检测
          </button>
          <button type="button" onClick={runExport} disabled={!canExport}>
            {status === "exporting" ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
            导出 MP4
          </button>
          <button className="text-danger" type="button" onClick={cancelTask} disabled={status !== "detecting" && status !== "exporting"}>
            <CircleStop size={16} />
            取消
          </button>
          <button type="button" onClick={resetResult} disabled={status === "detecting" || status === "exporting"}>
            <RotateCcw size={16} />
            重置结果
          </button>
          <span className={`processor-chip ${hasVideoProcessor() ? "ready" : "missing"}`}>{getProcessorHint()}</span>
        </div>

        <div className="lossless-video-body">
          <aside className="lossless-video-left">
            <section
              className={`lossless-drop ${dragging ? "is-dragging" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = Array.from(event.dataTransfer.files).find(isVideoFile);
                if (file) acceptFile(file);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,.mp4,.mov,.m4v,.mkv,.webm"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) acceptFile(file);
                  event.currentTarget.value = "";
                }}
              />
              <FileVideo size={26} />
              <strong>{videoInput?.name || "拖入已经合成好的长视频"}</strong>
              <small>{videoInput ? `${formatFileSize(videoInput.size)} · ${duration ? formatSeconds(duration) : "等待读取时长"}` : "支持 MP4 / MOV / MKV；真实处理交给本地 FFmpeg 服务"}</small>
            </section>

            <section className="lossless-preview">
              {previewUrl ? (
                <video ref={videoRef} controls src={previewUrl} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} />
              ) : (
                <div className="lossless-preview-empty">
                  <Play size={22} />
                  <span>浏览器预览等待本地文件</span>
                </div>
              )}
            </section>

            <section className="lossless-boundary">
              <div>
                <ShieldCheck size={18} />
                <strong>关键帧无损裁剪</strong>
                <span>使用 FFmpeg 流拷贝，不重编码；裁剪点会贴近关键帧，可能多留或少切少量画面。</span>
              </div>
              <div>
                <AlertTriangle size={18} />
                <strong>精确裁剪</strong>
                <span>可以按毫秒切准非关键帧位置，但需要局部或整体重编码；不是严格无损。</span>
              </div>
              <div>
                <AlertTriangle size={18} />
                <strong>裁掉黑边</strong>
                <span>裁黑边会改变画面像素和尺寸，导出时必须重编码。</span>
              </div>
            </section>
          </aside>

          <main className="lossless-video-main">
            <section className="lossless-settings">
              <header className="panel-title">
                <div>
                  <strong>检测参数</strong>
                  <span>音频指纹初筛，再用视频抽帧 / pHash 二次确认</span>
                </div>
                <SlidersHorizontal size={18} />
              </header>
              <div className="lossless-settings-grid">
                <label>
                  <span>最大相邻搜索窗口</span>
                  <input type="number" min={5} max={300} value={params.maxSearchWindowSec} onChange={(event) => setNumberParam("maxSearchWindowSec", Number(event.target.value || 30))} />
                  <em>秒</em>
                </label>
                <label>
                  <span>最短重复时长</span>
                  <input type="number" min={0.5} step={0.5} max={30} value={params.minRepeatSec} onChange={(event) => setNumberParam("minRepeatSec", Number(event.target.value || 2))} />
                  <em>秒</em>
                </label>
                <label>
                  <span>音频相似度</span>
                  <input type="number" min={80} max={100} value={params.audioSimilarity} onChange={(event) => setNumberParam("audioSimilarity", Number(event.target.value || 95))} />
                  <em>%</em>
                </label>
                <label>
                  <span>画面相似度</span>
                  <input type="number" min={80} max={100} value={params.videoSimilarity} onChange={(event) => setNumberParam("videoSimilarity", Number(event.target.value || 97))} />
                  <em>%</em>
                </label>
                <label>
                  <span>抽帧频率</span>
                  <input type="number" min={1} max={8} value={params.frameSampleFps} onChange={(event) => setNumberParam("frameSampleFps", Number(event.target.value || 2))} />
                  <em>fps</em>
                </label>
                <label>
                  <span>确认前后缓冲</span>
                  <input type="number" min={0} max={2000} step={100} value={params.confirmPaddingMs} onChange={(event) => setNumberParam("confirmPaddingMs", Number(event.target.value || 300))} />
                  <em>ms</em>
                </label>
              </div>
              <label className="lossless-check">
                <input type="checkbox" checked={params.preferAudioFirst} onChange={(event) => setParams((prev) => ({ ...prev, preferAudioFirst: event.target.checked }))} />
                <span>音频优先初筛，画面二次确认</span>
              </label>
              <label className="lossless-check">
                <input type="checkbox" checked={params.autoCropBlackBars} onChange={(event) => setParams((prev) => ({ ...prev, autoCropBlackBars: event.target.checked }))} />
                <span>检测并裁掉画面黑边</span>
              </label>
              <label className="lossless-check">
                <input type="checkbox" checked={params.autoDetectSlideTransitions} onChange={(event) => setParams((prev) => ({ ...prev, autoDetectSlideTransitions: event.target.checked }))} />
                <span>检测并删除上滑转场</span>
              </label>
              <div className="lossless-mode">
                <span>导出策略</span>
                <SegmentedControl value={mode} options={cutModeOptions} onChange={setMode} />
              </div>
              {params.autoCropBlackBars ? (
                <div className="lossless-crop-hint">
                  {cropRect ? `已检测到裁剪框：${cropRect.w}x${cropRect.h}+${cropRect.x}+${cropRect.y}` : "检测时会分析黑边；启用后导出将重编码。"}
                </div>
              ) : null}
            </section>

            <section className="lossless-progress">
              <div className={`lossless-status status-${status}`}>
                {statusIcon}
                <strong>{progress.label}</strong>
                <span>{progress.detail}</span>
                {showStepElapsed ? <em>本步用时 {stepElapsed}</em> : null}
              </div>
              <div className="lossless-progress-bar">
                <i style={{ width: `${clampPercent(progress.percent)}%` }} />
              </div>
              <div className="lossless-summary">
                <span>重复段：{repeatCount}</span>
                <span>上滑转场：{transitionCount}</span>
                <span>默认删除：{removableSegments.length}</span>
                <span>预计缩短：{formatSeconds(removeDuration)}</span>
                <span>非关键帧：{keyframeWarnings}</span>
                <span>黑边：{cropRect ? `${cropRect.w}x${cropRect.h}` : params.autoCropBlackBars ? "待检测" : "关闭"}</span>
              </div>
              {error ? <div className="lossless-error">{error}</div> : null}
              {outputPath ? (
                <button type="button" className="lossless-output" onClick={() => void downloadVideoOutput(taskId, videoInput?.name.replace(/\.[^.]+$/, "_clean.mp4"))}>
                  <Download size={16} />
                  {outputPath}
                </button>
              ) : null}
            </section>

            <section className="lossless-segments">
              <div className="lossless-segment-row lossless-segment-head">
                <span>处理</span>
                <span>第一次出现</span>
                <span>第二次出现</span>
                <span>删除范围</span>
                <span>时长</span>
                <span>相似度</span>
                <span>方式</span>
                <span>定位</span>
              </div>
              {segments.length ? (
                segments.map((segment, index) => (
                  <div className="lossless-segment-row" key={`${segment.id}-${index}`}>
                    <label className="lossless-row-check">
                      <input type="checkbox" checked={segment.deleteSecond} onChange={() => toggleSegment(index)} />
                      <span>{segment.deleteSecond ? (segment.kind === "slide-transition" ? "删转场" : "删第二遍") : "保留"}</span>
                    </label>
                    <span>{segment.kind === "slide-transition" ? "-" : `${formatSeconds(segment.firstStart)} - ${formatSeconds(segment.firstEnd)}`}</span>
                    <span>{segment.kind === "slide-transition" ? "上滑转场" : `${formatSeconds(segment.secondStart)} - ${formatSeconds(segment.secondEnd)}`}</span>
                    <span>
                      {formatSeconds(segment.deleteStart ?? segment.secondStart)} - {formatSeconds(segment.deleteEnd ?? segment.secondEnd)}
                      {(segment.deleteStart ?? segment.secondStart) < segment.secondStart ? <small className="lossless-transition-note">含转场 {formatSeconds(segment.secondStart - (segment.deleteStart ?? segment.secondStart))}</small> : null}
                    </span>
                    <span>{formatSeconds(segment.deleteDuration ?? segment.duration)}</span>
                    <span>{segment.kind === "slide-transition" ? `转场 · ${Math.round(segment.confidence)}%` : `${Math.round(segment.confidence)}% · A${Math.round(segment.audioSimilarity)} / V${Math.round(segment.videoSimilarity)}`}</span>
                    <span className={segment.keyframeAligned ? "lossless-tag safe" : "lossless-tag warn"}>
                      {segment.kind === "slide-transition" ? "转场片段" : segment.keyframeAligned ? "可流拷贝" : "非关键帧"}
                    </span>
                    <span className="lossless-locate">
                      <button type="button" disabled={!previewUrl || segment.kind === "slide-transition"} onClick={() => seekPreview(segment.firstStart)}>
                        首段
                      </button>
                      <button type="button" disabled={!previewUrl} onClick={() => seekPreview(segment.deleteStart ?? segment.secondStart)}>
                        {segment.kind === "slide-transition" ? "转场" : "重复段"}
                      </button>
                    </span>
                  </div>
                ))
              ) : (
                <div className="table-empty lossless-empty">
                  <Scissors size={22} />
                  还没有重复片段。开始检测后会在这里列出第二次出现的重复段。
                </div>
              )}
            </section>
          </main>
        </div>
      </section>
    </section>
  );
}
