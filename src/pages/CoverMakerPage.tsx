import {
  ArrowLeftRight,
  Crop,
  Download,
  FileImage,
  FolderOpen,
  Grid3X3,
  Loader2,
  Minus,
  Move,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  Trash2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, WheelEvent } from "react";
import AppSelect from "../components/AppSelect";
import SegmentedControl from "../components/SegmentedControl";
import { notify } from "../utils/notify";

const settingsStorageKey = "wse.coverMaker.settings.v2";
const legacySettingsStorageKeys = ["wse.coverMaker.settings.v1", "wse.youtubeThumbnail.settings.v1"];
const maxPreviewEdge = 1280;
const maxSharpTagEdge = 4096;
const maxExportDimension = 16384;
const maxExportPixels = 80_000_000;
const minRatioPart = 1;
const maxRatioPart = 100;

type ExportFormat = "jpeg" | "png";
type ExportScale = 1 | 2 | 3;

type CoverRatioPreset = {
  id: string;
  label: string;
  ratioWidth: number;
  ratioHeight: number;
};

type SourceImage = {
  file: File;
  url: string;
  width: number;
  height: number;
};

type Point = {
  x: number;
  y: number;
};

type Size = {
  width: number;
  height: number;
};

type StoredSettings = {
  presetId: string;
  customRatioWidth: number;
  customRatioHeight: number;
  format: ExportFormat;
  quality: number;
  showGrid: boolean;
  showSafeArea: boolean;
  exportScale: ExportScale;
  tags: CoverTag[];
};

type CoverTag = {
  id: string;
  text: string;
  color: string;
  bold: boolean;
  rotation: number;
  fontSize: number;
  widthScale: number;
  heightScale: number;
  x: number;
  y: number;
};

type DragStateBase = {
  pointerId: number;
  startX: number;
  startY: number;
};

type ImageDragState = DragStateBase & {
  kind: "image";
  offsetX: number;
  offsetY: number;
  unitsPerPixelX: number;
  unitsPerPixelY: number;
};

type TagDragState = DragStateBase & {
  kind: "tag";
  tagId: string;
  tagX: number;
  tagY: number;
  normalizedPerPixelX: number;
  normalizedPerPixelY: number;
};

type TagResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type TagResizeDragState = DragStateBase & {
  kind: "tag-resize";
  tagId: string;
  tagFontSize: number;
  tagWidthScale: number;
  tagHeightScale: number;
  tagWidth: number;
  tagHeight: number;
  anchorX: number;
  anchorY: number;
  directionX: -1 | 0 | 1;
  directionY: -1 | 0 | 1;
  initialVectorX: number;
  initialVectorY: number;
  rotation: number;
  unitsPerPixelX: number;
  unitsPerPixelY: number;
};

type DragState = ImageDragState | TagDragState | TagResizeDragState;

type TagMetrics = {
  width: number;
  height: number;
  baseWidth: number;
  baseHeight: number;
  fontSize: number;
};

const tagResizeHandles: TagResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const minTagAxisScale = 0.25;
const maxTagAxisScale = 4;

const coverRatioPresets: CoverRatioPreset[] = [
  { id: "landscape-16-9", label: "YouTube / 西瓜视频 · 16:9", ratioWidth: 16, ratioHeight: 9 },
  { id: "bilibili-16-10", label: "哔哩哔哩 · 16:10", ratioWidth: 16, ratioHeight: 10 },
  { id: "vertical-9-16", label: "Shorts / 抖音 / 快手 · 9:16", ratioWidth: 9, ratioHeight: 16 },
  { id: "xiaohongshu-3-4", label: "小红书 · 3:4", ratioWidth: 3, ratioHeight: 4 },
  { id: "wechat-channels-6-7", label: "视频号 · 6:7", ratioWidth: 6, ratioHeight: 7 },
  { id: "landscape-4-3", label: "通用横版 · 4:3", ratioWidth: 4, ratioHeight: 3 },
  { id: "landscape-3-2", label: "通用横版 · 3:2", ratioWidth: 3, ratioHeight: 2 },
  { id: "square-1-1", label: "通用方形 · 1:1", ratioWidth: 1, ratioHeight: 1 },
  { id: "custom", label: "自定义比例", ratioWidth: 16, ratioHeight: 9 }
];

const presetOptions = coverRatioPresets.map((preset) => ({ value: preset.id, label: preset.label }));

const formatOptions: { label: string; value: ExportFormat }[] = [
  { label: "JPG", value: "jpeg" },
  { label: "PNG", value: "png" }
];

const exportScaleOptions: { label: string; value: ExportScale }[] = [
  { label: "当前", value: 1 },
  { label: "2×", value: 2 },
  { label: "3×", value: 3 }
];

const defaultTagColor = "#12b981";
const tagColorOptions = [
  { value: defaultTagColor, label: "绿色" },
  { value: "#2563eb", label: "蓝色" },
  { value: "#f4c542", label: "黄色" },
  { value: "#ef4444", label: "红色" },
  { value: "#111827", label: "黑色" },
  { value: "#f7f7f7", label: "白色" }
];

const defaultSettings: StoredSettings = {
  presetId: "landscape-16-9",
  customRatioWidth: 16,
  customRatioHeight: 9,
  format: "jpeg",
  quality: 92,
  showGrid: true,
  showSafeArea: false,
  exportScale: 2,
  tags: []
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTagAxisScale(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, minTagAxisScale, maxTagAxisScale) : 1;
}

function normalizeRatioPart(value: unknown, fallback: number) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? clamp(parsed, minRatioPart, maxRatioPart) : fallback;
}

function normalizeTagColor(value: unknown) {
  if (typeof value !== "string") return defaultTagColor;
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized.slice(1).split("").map((part) => part + part).join("")}`;
  }
  return defaultTagColor;
}

function normalizeStoredTags(value: unknown): CoverTag[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((entry, index) => {
    const tag = entry && typeof entry === "object" ? entry as Partial<CoverTag> : {};
    const fontSize = Number(tag.fontSize);
    const widthScale = Number(tag.widthScale);
    const heightScale = Number(tag.heightScale);
    const rotation = Number(tag.rotation);
    const x = Number(tag.x);
    const y = Number(tag.y);
    return {
      id: typeof tag.id === "string" && tag.id ? tag.id : `stored-tag-${index}-${Date.now()}`,
      text: typeof tag.text === "string" ? tag.text.slice(0, 40) : "新标签",
      color: normalizeTagColor(tag.color),
      bold: typeof tag.bold === "boolean" ? tag.bold : true,
      fontSize: Number.isFinite(fontSize) ? clamp(fontSize, 4, 20) : 8,
      widthScale: normalizeTagAxisScale(widthScale),
      heightScale: normalizeTagAxisScale(heightScale),
      rotation: Number.isFinite(rotation) ? clamp(rotation, -180, 180) : 0,
      x: Number.isFinite(x) ? clamp(x, 0, 1) : 0.5,
      y: Number.isFinite(y) ? clamp(y, 0, 1) : clamp(0.16 + index * 0.1, 0.12, 0.82)
    };
  });
}

function loadStoredSettings(): StoredSettings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const rawValue = window.localStorage.getItem(settingsStorageKey)
      || legacySettingsStorageKeys.map((key) => window.localStorage.getItem(key)).find(Boolean);
    if (!rawValue) return defaultSettings;
    const stored = JSON.parse(rawValue) as Partial<StoredSettings>;
    const storedExportScale = Number(stored.exportScale);
    return {
      presetId: coverRatioPresets.some((preset) => preset.id === stored.presetId)
        ? String(stored.presetId)
        : defaultSettings.presetId,
      customRatioWidth: normalizeRatioPart(stored.customRatioWidth, defaultSettings.customRatioWidth),
      customRatioHeight: normalizeRatioPart(stored.customRatioHeight, defaultSettings.customRatioHeight),
      format: stored.format === "png" ? "png" : "jpeg",
      quality: clamp(Number(stored.quality) || defaultSettings.quality, 40, 100),
      showGrid: typeof stored.showGrid === "boolean" ? stored.showGrid : defaultSettings.showGrid,
      showSafeArea: typeof stored.showSafeArea === "boolean" ? stored.showSafeArea : defaultSettings.showSafeArea,
      exportScale: storedExportScale === 1 || storedExportScale === 2 || storedExportScale === 3
        ? storedExportScale
        : defaultSettings.exportScale,
      tags: normalizeStoredTags(stored.tags)
    };
  } catch {
    return defaultSettings;
  }
}

function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name);
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function greatestCommonDivisor(left: number, right: number): number {
  return right === 0 ? left : greatestCommonDivisor(right, left % right);
}

function formatRatio(ratioWidth: number, ratioHeight: number) {
  const divisor = greatestCommonDivisor(Math.round(ratioWidth), Math.round(ratioHeight)) || 1;
  return `${Math.round(ratioWidth / divisor)}:${Math.round(ratioHeight / divisor)}`;
}

function calculateReferenceSize(ratioWidth: number, ratioHeight: number): Size {
  const ratio = ratioWidth / ratioHeight;
  if (ratio >= 1) return { width: maxPreviewEdge, height: Math.max(1, Math.round(maxPreviewEdge / ratio)) };
  return { width: Math.max(1, Math.round(maxPreviewEdge * ratio)), height: maxPreviewEdge };
}

function calculateExportSize(source: SourceImage, ratioWidth: number, ratioHeight: number): Size {
  const targetRatio = ratioWidth / ratioHeight;
  const sourceRatio = source.width / source.height;
  let cropWidth = source.width;
  let cropHeight = source.height;

  if (sourceRatio > targetRatio) {
    cropWidth = source.height * targetRatio;
  } else {
    cropHeight = source.width / targetRatio;
  }

  if (targetRatio >= 1) {
    const width = Math.max(1, Math.round(cropWidth));
    return { width, height: Math.max(1, Math.round(width / targetRatio)) };
  }
  const height = Math.max(1, Math.round(cropHeight));
  return { width: Math.max(1, Math.round(height * targetRatio)), height };
}

function exportFileName(
  fileName: string,
  presetId: string,
  ratioWidth: number,
  ratioHeight: number,
  outputSize: Size,
  format: ExportFormat
) {
  const baseName = fileName.replace(/\.[^.]+$/, "") || "video-cover";
  const presetName = presetId === "custom" ? "custom" : presetId;
  const ratioName = formatRatio(ratioWidth, ratioHeight).replace(":", "x");
  return `${baseName}_${presetName}_${ratioName}_${outputSize.width}x${outputSize.height}.${format === "png" ? "png" : "jpg"}`;
}

function clampOffset(source: SourceImage, zoom: number, point: Point, outputSize: Size): Point {
  const coverScale = Math.max(outputSize.width / source.width, outputSize.height / source.height);
  const drawWidth = source.width * coverScale * zoom;
  const drawHeight = source.height * coverScale * zoom;
  const maxX = Math.max(0, (drawWidth - outputSize.width) / 2);
  const maxY = Math.max(0, (drawHeight - outputSize.height) / 2);
  return {
    x: clamp(point.x, -maxX, maxX),
    y: clamp(point.y, -maxY, maxY)
  };
}

function createTag(index: number): CoverTag {
  return {
    id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: "新标签",
    color: defaultTagColor,
    bold: true,
    rotation: 0,
    fontSize: 8,
    widthScale: 1,
    heightScale: 1,
    x: 0.5,
    y: clamp(0.16 + index * 0.1, 0.12, 0.82)
  };
}

function tagDisplayText(tag: CoverTag) {
  return tag.text.trim() || "标签";
}

function getTagMetrics(context: CanvasRenderingContext2D, tag: CoverTag, outputSize: Size): TagMetrics {
  const fontSize = Math.max(12, Math.round(Math.min(outputSize.width, outputSize.height) * tag.fontSize / 100));
  context.font = `${tag.bold ? 700 : 400} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  context.textRendering = "optimizeLegibility";
  const textWidth = context.measureText(tagDisplayText(tag)).width;
  const baseWidth = Math.ceil(Math.max(fontSize * 1.7, textWidth + fontSize * 0.86));
  const baseHeight = Math.ceil(fontSize * 1.52);
  return {
    width: Math.ceil(baseWidth * normalizeTagAxisScale(tag.widthScale)),
    height: Math.ceil(baseHeight * normalizeTagAxisScale(tag.heightScale)),
    baseWidth,
    baseHeight,
    fontSize
  };
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function tagTextColor(color: string) {
  const hex = color.replace("#", "");
  const normalized = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
  const red = Number.parseInt(normalized.slice(0, 2), 16) || 0;
  const green = Number.parseInt(normalized.slice(2, 4), 16) || 0;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) || 0;
  return (red * 299 + green * 587 + blue * 114) / 1000 > 158 ? "#101010" : "#ffffff";
}

function paintTags(
  context: CanvasRenderingContext2D,
  tags: CoverTag[],
  outputSize: Size
) {
  tags.forEach((tag) => {
    context.save();
    const metrics = getTagMetrics(context, tag, outputSize);
    context.translate(Math.round(tag.x * outputSize.width), Math.round(tag.y * outputSize.height));
    context.rotate(tag.rotation * Math.PI / 180);
    context.scale(
      normalizeTagAxisScale(tag.widthScale),
      normalizeTagAxisScale(tag.heightScale)
    );

    const left = -metrics.baseWidth / 2;
    const top = -metrics.baseHeight / 2;
    roundedRectPath(context, left, top, metrics.baseWidth, metrics.baseHeight, 2);
    context.fillStyle = tag.color;
    context.fill();

    context.fillStyle = tagTextColor(tag.color);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(tagDisplayText(tag), 0, metrics.fontSize * 0.02);

    context.restore();
  });
}

function paintExportTags(context: CanvasRenderingContext2D, tags: CoverTag[], outputSize: Size) {
  if (!tags.length) return;
  const renderScale = clamp(maxSharpTagEdge / Math.max(outputSize.width, outputSize.height), 1, 2);
  if (renderScale <= 1) {
    paintTags(context, tags, outputSize);
    return;
  }

  const layer = document.createElement("canvas");
  layer.width = Math.max(1, Math.round(outputSize.width * renderScale));
  layer.height = Math.max(1, Math.round(outputSize.height * renderScale));
  const layerContext = layer.getContext("2d");
  if (!layerContext) {
    paintTags(context, tags, outputSize);
    return;
  }

  layerContext.scale(layer.width / outputSize.width, layer.height / outputSize.height);
  paintTags(layerContext, tags, outputSize);
  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(layer, 0, 0, outputSize.width, outputSize.height);
  context.restore();
}

function findTagAtPoint(
  context: CanvasRenderingContext2D,
  tags: CoverTag[],
  point: Point,
  outputSize: Size
) {
  for (let index = tags.length - 1; index >= 0; index -= 1) {
    const tag = tags[index];
    const metrics = getTagMetrics(context, tag, outputSize);
    const deltaX = point.x - Math.round(tag.x * outputSize.width);
    const deltaY = point.y - Math.round(tag.y * outputSize.height);
    const radians = tag.rotation * Math.PI / 180;
    const localX = deltaX * Math.cos(radians) + deltaY * Math.sin(radians);
    const localY = -deltaX * Math.sin(radians) + deltaY * Math.cos(radians);
    if (Math.abs(localX) <= metrics.width / 2 && Math.abs(localY) <= metrics.height / 2) return tag;
  }
  return null;
}

function paintCover(
  context: CanvasRenderingContext2D,
  source: SourceImage,
  image: HTMLImageElement,
  zoom: number,
  offset: Point,
  outputSize: Size
) {
  const coverScale = Math.max(outputSize.width / source.width, outputSize.height / source.height);
  const drawScale = coverScale * zoom;
  context.save();
  context.fillStyle = "#101010";
  context.fillRect(0, 0, outputSize.width, outputSize.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.translate(outputSize.width / 2 + offset.x, outputSize.height / 2 + offset.y);
  context.scale(drawScale, drawScale);
  context.drawImage(image, -source.width / 2, -source.height / 2, source.width, source.height);
  context.restore();
}

export default function CoverMakerPage() {
  const storedSettingsRef = useRef(loadStoredSettings());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const loadVersionRef = useRef(0);

  const [source, setSource] = useState<SourceImage | null>(null);
  const [presetId, setPresetId] = useState(storedSettingsRef.current.presetId);
  const [customRatioWidth, setCustomRatioWidth] = useState(storedSettingsRef.current.customRatioWidth);
  const [customRatioHeight, setCustomRatioHeight] = useState(storedSettingsRef.current.customRatioHeight);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [tags, setTags] = useState<CoverTag[]>(() => storedSettingsRef.current.tags);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(() => {
    const storedTags = storedSettingsRef.current.tags;
    return storedTags.length ? storedTags[storedTags.length - 1].id : null;
  });
  const [format, setFormat] = useState<ExportFormat>(storedSettingsRef.current.format);
  const [exportScale, setExportScale] = useState<ExportScale>(storedSettingsRef.current.exportScale);
  const [quality, setQuality] = useState(storedSettingsRef.current.quality);
  const [showGrid, setShowGrid] = useState(storedSettingsRef.current.showGrid);
  const [showSafeArea, setShowSafeArea] = useState(storedSettingsRef.current.showSafeArea);
  const [dropActive, setDropActive] = useState(false);
  const [panning, setPanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const activePreset = useMemo(
    () => coverRatioPresets.find((preset) => preset.id === presetId) || coverRatioPresets[0],
    [presetId]
  );
  const ratioWidth = presetId === "custom" ? customRatioWidth : activePreset.ratioWidth;
  const ratioHeight = presetId === "custom" ? customRatioHeight : activePreset.ratioHeight;
  const ratioLabel = formatRatio(ratioWidth, ratioHeight);
  const outputRatio = ratioWidth / ratioHeight;
  const orientation = outputRatio > 1.05 ? "landscape" : outputRatio < 0.95 ? "portrait" : "square";
  const orientationLabel = orientation === "landscape" ? "横版" : orientation === "portrait" ? "竖版" : "方形";
  const cropSize = useMemo(
    () => source ? calculateExportSize(source, ratioWidth, ratioHeight) : calculateReferenceSize(ratioWidth, ratioHeight),
    [ratioHeight, ratioWidth, source]
  );
  const finalOutputSize = useMemo(() => ({
    width: cropSize.width * exportScale,
    height: cropSize.height * exportScale
  }), [cropSize, exportScale]);
  const previewScale = maxPreviewEdge / Math.max(cropSize.width, cropSize.height);
  const previewWidth = Math.max(1, Math.round(cropSize.width * previewScale));
  const previewHeight = Math.max(1, Math.round(cropSize.height * previewScale));
  const selectedTag = useMemo(
    () => tags.find((tag) => tag.id === selectedTagId) || null,
    [selectedTagId, tags]
  );
  const selectedTagMetrics = useMemo(() => {
    if (!source || !selectedTag) return null;
    const context = canvasRef.current?.getContext("2d");
    return context ? getTagMetrics(context, selectedTag, cropSize) : null;
  }, [cropSize, selectedTag, source]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        settingsStorageKey,
        JSON.stringify({ presetId, customRatioWidth, customRatioHeight, format, quality, showGrid, showSafeArea, exportScale, tags })
      );
    } catch {
      // 本地存储不可用时仍可正常制作和导出。
    }
  }, [customRatioHeight, customRatioWidth, exportScale, format, presetId, quality, showGrid, showSafeArea, tags]);

  useEffect(() => {
    return () => {
      if (source?.url) URL.revokeObjectURL(source.url);
    };
  }, [source?.url]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = "#101010";
    context.fillRect(0, 0, previewWidth, previewHeight);
    if (!source || !image) return;

    context.save();
    context.scale(previewWidth / cropSize.width, previewHeight / cropSize.height);
    paintCover(context, source, image, zoom, offset, cropSize);
    paintTags(context, tags, cropSize);
    context.restore();
  }, [cropSize, offset, previewHeight, previewWidth, source, tags, zoom]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const outputName = useMemo(
    () => source
      ? exportFileName(source.file.name, presetId, ratioWidth, ratioHeight, finalOutputSize, format)
      : `video-cover_${ratioLabel.replace(":", "x")}_${exportScale}x.${format === "png" ? "png" : "jpg"}`,
    [exportScale, finalOutputSize, format, presetId, ratioHeight, ratioLabel, ratioWidth, source]
  );

  const resetCrop = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const addTag = () => {
    const nextTag = createTag(tags.length);
    setTags((current) => [...current, nextTag]);
    setSelectedTagId(nextTag.id);
  };

  const updateSelectedTag = (changes: Partial<CoverTag>) => {
    if (!selectedTagId) return;
    setTags((current) => current.map((tag) => tag.id === selectedTagId ? { ...tag, ...changes } : tag));
  };

  const deleteSelectedTag = () => {
    if (!selectedTagId) return;
    setTags((current) => current.filter((tag) => tag.id !== selectedTagId));
    setSelectedTagId(null);
  };

  const selectPreset = (nextPresetId: string) => {
    setPresetId(nextPresetId);
    resetCrop();
  };

  const setCustomRatio = (axis: "width" | "height", rawValue: string) => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const nextValue = normalizeRatioPart(parsed, axis === "width" ? ratioWidth : ratioHeight);
    setCustomRatioWidth(axis === "width" ? nextValue : ratioWidth);
    setCustomRatioHeight(axis === "height" ? nextValue : ratioHeight);
    setPresetId("custom");
    resetCrop();
  };

  const swapRatio = () => {
    setCustomRatioWidth(ratioHeight);
    setCustomRatioHeight(ratioWidth);
    setPresetId("custom");
    resetCrop();
  };

  const updateZoom = (value: number) => {
    const nextZoom = clamp(value, 1, 5);
    setZoom(nextZoom);
    if (source) {
      setOffset((current) => clampOffset(source, nextZoom, current, cropSize));
    }
  };

  const acceptFile = (file: File) => {
    if (!isImageFile(file)) {
      notify({ type: "error", title: "无法读取图片", message: "请选择 JPG、PNG、WebP 或 AVIF 图片。" });
      return;
    }

    const loadVersion = ++loadVersionRef.current;
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    setLoading(true);

    image.onload = () => {
      if (loadVersion !== loadVersionRef.current) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      imageRef.current = image;
      setSource({ file, url: objectUrl, width: image.naturalWidth, height: image.naturalHeight });
      resetCrop();
      setLoading(false);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      if (loadVersion !== loadVersionRef.current) return;
      setLoading(false);
      notify({ type: "error", title: "图片读取失败", message: "文件可能已损坏，或浏览器不支持该图片格式。" });
    };

    image.src = objectUrl;
  };

  const moveBy = (deltaX: number, deltaY: number) => {
    if (!source) return;
    if (selectedTagId) {
      setTags((current) => current.map((tag) => tag.id === selectedTagId ? {
        ...tag,
        x: clamp(tag.x + deltaX / cropSize.width, 0, 1),
        y: clamp(tag.y + deltaY / cropSize.height, 0, 1)
      } : tag));
      return;
    }
    setOffset((current) => clampOffset(
      source,
      zoom,
      { x: current.x + deltaX, y: current.y + deltaY },
      cropSize
    ));
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!source || event.button !== 0) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = {
      x: (event.clientX - bounds.left) * cropSize.width / Math.max(1, bounds.width),
      y: (event.clientY - bounds.top) * cropSize.height / Math.max(1, bounds.height)
    };
    const context = event.currentTarget.getContext("2d");
    const hitTag = context ? findTagAtPoint(context, tags, point, cropSize) : null;
    if (hitTag) {
      setSelectedTagId(hitTag.id);
      dragRef.current = {
        kind: "tag",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        tagId: hitTag.id,
        tagX: hitTag.x,
        tagY: hitTag.y,
        normalizedPerPixelX: 1 / Math.max(1, bounds.width),
        normalizedPerPixelY: 1 / Math.max(1, bounds.height)
      };
    } else {
      setSelectedTagId(null);
      dragRef.current = {
        kind: "image",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: offset.x,
        offsetY: offset.y,
        unitsPerPixelX: cropSize.width / Math.max(1, bounds.width),
        unitsPerPixelY: cropSize.height / Math.max(1, bounds.height)
      };
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 窗口级拖拽监听仍可继续处理不支持指针捕获的浏览器。
    }
    setPanning(true);
  };

  const startTagResize = (event: PointerEvent<HTMLButtonElement>, handle: TagResizeHandle) => {
    if (!source || !selectedTag || !selectedTagMetrics || event.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    event.stopPropagation();

    const bounds = canvas.getBoundingClientRect();
    const unitsPerPixelX = cropSize.width / Math.max(1, bounds.width);
    const unitsPerPixelY = cropSize.height / Math.max(1, bounds.height);
    const directionX: -1 | 0 | 1 = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
    const directionY: -1 | 0 | 1 = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
    const radians = selectedTag.rotation * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const centerX = selectedTag.x * cropSize.width;
    const centerY = selectedTag.y * cropSize.height;
    const oppositeX = -directionX * selectedTagMetrics.width / 2;
    const oppositeY = -directionY * selectedTagMetrics.height / 2;
    const anchorX = centerX + oppositeX * cosine - oppositeY * sine;
    const anchorY = centerY + oppositeX * sine + oppositeY * cosine;
    const pointerX = (event.clientX - bounds.left) * unitsPerPixelX;
    const pointerY = (event.clientY - bounds.top) * unitsPerPixelY;
    const pointerDeltaX = pointerX - anchorX;
    const pointerDeltaY = pointerY - anchorY;

    dragRef.current = {
      kind: "tag-resize",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      tagId: selectedTag.id,
      tagFontSize: selectedTag.fontSize,
      tagWidthScale: normalizeTagAxisScale(selectedTag.widthScale),
      tagHeightScale: normalizeTagAxisScale(selectedTag.heightScale),
      tagWidth: selectedTagMetrics.width,
      tagHeight: selectedTagMetrics.height,
      anchorX,
      anchorY,
      directionX,
      directionY,
      initialVectorX: pointerDeltaX * cosine + pointerDeltaY * sine,
      initialVectorY: -pointerDeltaX * sine + pointerDeltaY * cosine,
      rotation: radians,
      unitsPerPixelX,
      unitsPerPixelY
    };
    setPanning(true);
  };

  const movePointerDrag = useCallback((pointerId: number, clientX: number, clientY: number) => {
    const drag = dragRef.current;
    if (!source || !drag || drag.pointerId !== pointerId) return;
    if (drag.kind === "tag") {
      const nextX = clamp(drag.tagX + (clientX - drag.startX) * drag.normalizedPerPixelX, 0, 1);
      const nextY = clamp(drag.tagY + (clientY - drag.startY) * drag.normalizedPerPixelY, 0, 1);
      setTags((current) => current.map((tag) => tag.id === drag.tagId ? { ...tag, x: nextX, y: nextY } : tag));
      return;
    }
    if (drag.kind === "tag-resize") {
      const cosine = Math.cos(drag.rotation);
      const sine = Math.sin(drag.rotation);
      const pointerX = (clientX - drag.startX) * drag.unitsPerPixelX
        + drag.anchorX + drag.initialVectorX * cosine - drag.initialVectorY * sine;
      const pointerY = (clientY - drag.startY) * drag.unitsPerPixelY
        + drag.anchorY + drag.initialVectorX * sine + drag.initialVectorY * cosine;
      const pointerDeltaX = pointerX - drag.anchorX;
      const pointerDeltaY = pointerY - drag.anchorY;
      const localX = pointerDeltaX * cosine + pointerDeltaY * sine;
      const localY = -pointerDeltaX * sine + pointerDeltaY * cosine;
      let nextSize: Partial<CoverTag>;
      let centerLocalX = 0;
      let centerLocalY = 0;
      if (drag.directionX !== 0 && drag.directionY !== 0) {
        const vectorLengthSquared = Math.max(
          1,
          drag.initialVectorX * drag.initialVectorX + drag.initialVectorY * drag.initialVectorY
        );
        const requestedScale = (
          localX * drag.initialVectorX + localY * drag.initialVectorY
        ) / vectorLengthSquared;
        const nextFontSize = clamp(drag.tagFontSize * requestedScale, 4, 20);
        const scale = nextFontSize / Math.max(0.001, drag.tagFontSize);
        centerLocalX = drag.directionX * drag.tagWidth * scale / 2;
        centerLocalY = drag.directionY * drag.tagHeight * scale / 2;
        nextSize = { fontSize: nextFontSize };
      } else if (drag.directionX !== 0) {
        const requestedScale = localX / (Math.abs(drag.initialVectorX) < 0.001 ? drag.directionX : drag.initialVectorX);
        const nextWidthScale = clamp(
          drag.tagWidthScale * requestedScale,
          minTagAxisScale,
          maxTagAxisScale
        );
        const scale = nextWidthScale / Math.max(0.001, drag.tagWidthScale);
        centerLocalX = drag.directionX * drag.tagWidth * scale / 2;
        nextSize = { widthScale: nextWidthScale };
      } else {
        const requestedScale = localY / (Math.abs(drag.initialVectorY) < 0.001 ? drag.directionY : drag.initialVectorY);
        const nextHeightScale = clamp(
          drag.tagHeightScale * requestedScale,
          minTagAxisScale,
          maxTagAxisScale
        );
        const scale = nextHeightScale / Math.max(0.001, drag.tagHeightScale);
        centerLocalY = drag.directionY * drag.tagHeight * scale / 2;
        nextSize = { heightScale: nextHeightScale };
      }
      const centerX = drag.anchorX + centerLocalX * cosine - centerLocalY * sine;
      const centerY = drag.anchorY + centerLocalX * sine + centerLocalY * cosine;
      setTags((current) => current.map((tag) => tag.id === drag.tagId ? {
        ...tag,
        ...nextSize,
        x: clamp(centerX / Math.max(1, cropSize.width), 0, 1),
        y: clamp(centerY / Math.max(1, cropSize.height), 0, 1)
      } : tag));
      return;
    }
    const nextPoint = {
      x: drag.offsetX + (clientX - drag.startX) * drag.unitsPerPixelX,
      y: drag.offsetY + (clientY - drag.startY) * drag.unitsPerPixelY
    };
    setOffset(clampOffset(source, zoom, nextPoint, cropSize));
  }, [cropSize, source, zoom]);

  const endPointerDrag = useCallback((pointerId: number) => {
    if (dragRef.current?.pointerId !== pointerId) return;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(pointerId)) {
      try {
        canvas.releasePointerCapture(pointerId);
      } catch {
        // 指针可能已经由浏览器自动释放。
      }
    }
    dragRef.current = null;
    setPanning(false);
  }, []);

  useEffect(() => {
    const handleWindowPointerMove = (event: globalThis.PointerEvent) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      event.preventDefault();
      movePointerDrag(event.pointerId, event.clientX, event.clientY);
    };
    const handleWindowPointerEnd = (event: globalThis.PointerEvent) => endPointerDrag(event.pointerId);

    window.addEventListener("pointermove", handleWindowPointerMove, { capture: true, passive: false });
    window.addEventListener("pointerup", handleWindowPointerEnd, true);
    window.addEventListener("pointercancel", handleWindowPointerEnd, true);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove, true);
      window.removeEventListener("pointerup", handleWindowPointerEnd, true);
      window.removeEventListener("pointercancel", handleWindowPointerEnd, true);
    };
  }, [endPointerDrag, movePointerDrag]);

  const handleWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    if (!source) return;
    event.preventDefault();
    updateZoom(zoom + (event.deltaY < 0 ? 0.05 : -0.05));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!source) return;
    const step = event.shiftKey ? 12 : 3;
    if (event.key === "ArrowLeft") moveBy(-step, 0);
    else if (event.key === "ArrowRight") moveBy(step, 0);
    else if (event.key === "ArrowUp") moveBy(0, -step);
    else if (event.key === "ArrowDown") moveBy(0, step);
    else return;
    event.preventDefault();
  };

  const downloadCover = async () => {
    const image = imageRef.current;
    if (!source || !image) return;
    if (
      Math.max(finalOutputSize.width, finalOutputSize.height) > maxExportDimension
      || finalOutputSize.width * finalOutputSize.height > maxExportPixels
    ) {
      notify({
        type: "error",
        title: "导出尺寸过大",
        message: `${finalOutputSize.width} × ${finalOutputSize.height} 超出浏览器安全处理范围，请降低导出倍率。`
      });
      return;
    }
    setExporting(true);

    try {
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = finalOutputSize.width;
      exportCanvas.height = finalOutputSize.height;
      const context = exportCanvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("浏览器无法创建导出画布");
      paintCover(
        context,
        source,
        image,
        zoom,
        { x: offset.x * exportScale, y: offset.y * exportScale },
        finalOutputSize
      );
      paintExportTags(context, tags, finalOutputSize);

      const mimeType = format === "png" ? "image/png" : "image/jpeg";
      const blob = await new Promise<Blob>((resolve, reject) => {
        exportCanvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error("浏览器未能生成封面文件"))),
          mimeType,
          format === "jpeg" ? quality / 100 : undefined
        );
      });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = outputName;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      notify({ type: "error", title: "导出失败", message: error instanceof Error ? error.message : "请稍后重试。" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="workspace module-workspace cover-maker-page">
      <section className="data-panel data-panel-full data-panel-compact cover-maker-panel">
        <div className="table-toolbar cover-maker-toolbar">
          <button className="primary-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={loading}>
            {loading ? <Loader2 className="spin" size={16} /> : <FolderOpen size={16} />}
            {source ? "更换图片" : "选择图片"}
          </button>
          <button type="button" onClick={downloadCover} disabled={!source || exporting}>
            {exporting ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
            下载封面
          </button>
          <button type="button" onClick={resetCrop} disabled={!source}>
            <RotateCcw size={16} />
            重置裁剪
          </button>
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept="image/*,.avif,.heic,.heif,.jpg,.jpeg,.png,.webp"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) acceptFile(file);
              event.currentTarget.value = "";
            }}
          />
          <span className="cover-maker-local-status">
            <ShieldCheck size={15} />
            本地处理 · {ratioLabel}
          </span>
        </div>

        <div className="cover-maker-body">
          <main className="cover-maker-workbench">
            <header className="cover-maker-stage-bar">
              <div>
                <Crop size={17} />
                <strong>封面裁剪</strong>
              </div>
              {source ? (
                <span>{source.file.name} · {source.width} × {source.height} · {formatFileSize(source.file.size)}</span>
              ) : (
                <span>等待图片</span>
              )}
            </header>

            <section
              className={`cover-maker-stage ${dropActive ? "is-drop-active" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDropActive(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDropActive(false);
                const file = Array.from(event.dataTransfer.files).find(isImageFile);
                if (file) acceptFile(file);
                else notify({ type: "error", title: "未找到图片", message: "请拖入一个可读取的图片文件。" });
              }}
            >
              <div
                className={`cover-maker-canvas-frame is-${orientation} ${panning ? "is-panning" : ""}`}
                style={{ aspectRatio: `${ratioWidth} / ${ratioHeight}` }}
              >
                <canvas
                  ref={canvasRef}
                  width={previewWidth}
                  height={previewHeight}
                  tabIndex={source ? 0 : -1}
                  aria-label="封面裁剪画布"
                  onDoubleClick={resetCrop}
                  onKeyDown={handleKeyDown}
                  onPointerDown={handlePointerDown}
                  onWheel={handleWheel}
                />
                {source && selectedTag && selectedTagMetrics ? (
                  <div
                    className="cover-maker-tag-selection"
                    style={{
                      left: `${selectedTag.x * 100}%`,
                      top: `${selectedTag.y * 100}%`,
                      width: `${selectedTagMetrics.width / Math.max(1, cropSize.width) * 100}%`,
                      height: `${selectedTagMetrics.height / Math.max(1, cropSize.height) * 100}%`,
                      transform: `translate(-50%, -50%) rotate(${selectedTag.rotation}deg)`
                    }}
                  >
                    {tagResizeHandles.map((handle) => (
                      <button
                        key={handle}
                        className={`cover-maker-tag-resize-handle is-${handle}`}
                        type="button"
                        tabIndex={-1}
                        title={handle.length === 1 ? "自由拉伸标签" : "等比例缩放标签"}
                        aria-label={`${handle.length === 1 ? "拉伸" : "缩放"}标签 ${handle}`}
                        style={{ transform: `rotate(${-selectedTag.rotation}deg)` }}
                        onPointerDown={(event) => startTagResize(event, handle)}
                      />
                    ))}
                  </div>
                ) : null}
                {source && showGrid ? (
                  <div className="cover-maker-grid" aria-hidden="true">
                    <i /><i /><i /><i />
                  </div>
                ) : null}
                {source && showSafeArea ? <div className="cover-maker-safe-area" aria-hidden="true" /> : null}
                {!source ? (
                  <button className="cover-maker-empty" type="button" onClick={() => fileInputRef.current?.click()}>
                    {loading ? <Loader2 className="spin" size={34} /> : <FileImage size={34} />}
                    <strong>{loading ? "正在读取图片" : "拖入或选择封面原图"}</strong>
                    <span>JPG / PNG / WebP / AVIF</span>
                  </button>
                ) : null}
              </div>
            </section>

            <footer className="cover-maker-stage-footer">
              {selectedTag ? (
                <span><Tag size={15} /> X {Math.round(selectedTag.x * 100)}% · Y {Math.round(selectedTag.y * 100)}%</span>
              ) : (
                <span><Move size={15} /> X {Math.round(offset.x)} · Y {Math.round(offset.y)}</span>
              )}
              <span>图片 {Math.round(zoom * 100)}%</span>
              <span>{ratioLabel} · {orientationLabel}</span>
              <span>{source ? `导出 ${finalOutputSize.width} × ${finalOutputSize.height}` : `${exportScale}× 分辨率`}</span>
            </footer>
          </main>

          <aside className="cover-maker-controls">
            <section>
              <header className="cover-maker-control-title">
                <div><SlidersHorizontal size={17} /><strong>平台与比例</strong></div>
                <span>{ratioLabel}</span>
              </header>
              <AppSelect
                className="cover-maker-preset-select"
                value={presetId}
                options={presetOptions}
                onChange={selectPreset}
                ariaLabel="平台比例预设"
                maxMenuHeight={380}
              />
              <div className="cover-maker-dimensions cover-maker-ratio-inputs">
                <label>
                  <span>宽</span>
                  <input
                    type="number"
                    min={minRatioPart}
                    max={maxRatioPart}
                    value={ratioWidth}
                    aria-label="比例宽度"
                    onChange={(event) => setCustomRatio("width", event.target.value)}
                  />
                </label>
                <button type="button" title="交换比例" aria-label="交换比例" onClick={swapRatio}>
                  <ArrowLeftRight size={16} />
                </button>
                <label>
                  <span>高</span>
                  <input
                    type="number"
                    min={minRatioPart}
                    max={maxRatioPart}
                    value={ratioHeight}
                    aria-label="比例高度"
                    onChange={(event) => setCustomRatio("height", event.target.value)}
                  />
                </label>
              </div>
            </section>

            <section>
              <header className="cover-maker-control-title">
                <div><Crop size={17} /><strong>图片缩放</strong></div>
                <span>{Math.round(zoom * 100)}%</span>
              </header>
              <div className="cover-maker-zoom-row">
                <button type="button" title="缩小图片" aria-label="缩小图片" onClick={() => updateZoom(zoom - 0.05)} disabled={!source || zoom <= 1}>
                  <Minus size={16} />
                </button>
                <input
                  type="range"
                  min={100}
                  max={500}
                  step={1}
                  value={Math.round(zoom * 100)}
                  disabled={!source}
                  aria-label="图片缩放"
                  onChange={(event) => updateZoom(Number(event.target.value) / 100)}
                />
                <button type="button" title="放大图片" aria-label="放大图片" onClick={() => updateZoom(zoom + 0.05)} disabled={!source || zoom >= 5}>
                  <Plus size={16} />
                </button>
              </div>
              <button className="cover-maker-wide-button" type="button" onClick={resetCrop} disabled={!source}>
                <RotateCcw size={16} />
                适配裁剪框
              </button>
            </section>

            <section className="cover-maker-tag-section">
              <header className="cover-maker-control-title">
                <div><Tag size={17} /><strong>文字标签</strong></div>
                <button
                  className="cover-maker-icon-button"
                  type="button"
                  title="添加标签"
                  aria-label="添加标签"
                  onClick={addTag}
                  disabled={!source}
                >
                  <Plus size={16} />
                </button>
              </header>

              {tags.length ? (
                <div className="cover-maker-tag-list" role="list" aria-label="文字标签列表">
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      className={selectedTagId === tag.id ? "is-selected" : ""}
                      type="button"
                      role="listitem"
                      onClick={() => setSelectedTagId(tag.id)}
                    >
                      <i style={{ backgroundColor: tag.color }} aria-hidden="true" />
                      <span>{tagDisplayText(tag)}</span>
                      <em>{tag.rotation}°</em>
                    </button>
                  ))}
                </div>
              ) : (
                <button className="cover-maker-wide-button" type="button" onClick={addTag} disabled={!source}>
                  <Plus size={16} />
                  添加标签
                </button>
              )}

              {selectedTag ? (
                <div className="cover-maker-tag-editor">
                  <div className="cover-maker-tag-text-row">
                    <input
                      type="text"
                      maxLength={40}
                      value={selectedTag.text}
                      aria-label="标签文字"
                      placeholder="标签文字"
                      onChange={(event) => updateSelectedTag({ text: event.target.value })}
                    />
                    <button type="button" title="删除标签" aria-label="删除标签" onClick={deleteSelectedTag}>
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="cover-maker-tag-colors" role="group" aria-label="标签颜色">
                    {tagColorOptions.map((color) => (
                      <button
                        key={color.value}
                        className={selectedTag.color.toLowerCase() === color.value ? "is-selected" : ""}
                        type="button"
                        title={color.label}
                        aria-label={color.label}
                        aria-pressed={selectedTag.color.toLowerCase() === color.value}
                        style={{ backgroundColor: color.value }}
                        onClick={() => updateSelectedTag({ color: color.value })}
                      />
                    ))}
                    <label className="cover-maker-custom-color" title="自定义颜色">
                      <input
                        type="color"
                        value={selectedTag.color}
                        aria-label="自定义标签颜色"
                        onChange={(event) => updateSelectedTag({ color: event.target.value })}
                      />
                    </label>
                  </div>

                  <label className="cover-maker-check">
                    <input
                      type="checkbox"
                      checked={selectedTag.bold}
                      aria-label="标签粗体"
                      onChange={(event) => updateSelectedTag({ bold: event.target.checked })}
                    />
                    <span>粗体</span>
                  </label>

                  <label className="cover-maker-tag-range">
                    <span>字号</span>
                    <input
                      type="range"
                      min={4}
                      max={20}
                      step={1}
                      value={selectedTag.fontSize}
                      aria-label="标签字号"
                      onChange={(event) => updateSelectedTag({ fontSize: Number(event.target.value) })}
                    />
                    <input
                      className="cover-maker-tag-number"
                      type="number"
                      min={4}
                      max={20}
                      value={selectedTag.fontSize}
                      aria-label="标签字号数值"
                      onChange={(event) => updateSelectedTag({ fontSize: clamp(Number(event.target.value) || 4, 4, 20) })}
                    />
                  </label>

                  <label className="cover-maker-tag-range">
                    <span>旋转</span>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={selectedTag.rotation}
                      aria-label="标签旋转角度"
                      onChange={(event) => updateSelectedTag({ rotation: Number(event.target.value) })}
                    />
                    <input
                      className="cover-maker-tag-number"
                      type="number"
                      min={-180}
                      max={180}
                      value={selectedTag.rotation}
                      aria-label="标签旋转角度数值"
                      onChange={(event) => updateSelectedTag({ rotation: clamp(Number(event.target.value) || 0, -180, 180) })}
                    />
                  </label>
                </div>
              ) : null}
            </section>

            <section>
              <header className="cover-maker-control-title">
                <div><Grid3X3 size={17} /><strong>辅助线</strong></div>
              </header>
              <label className="cover-maker-check">
                <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
                <span>三分线</span>
              </label>
              <label className="cover-maker-check">
                <input type="checkbox" checked={showSafeArea} onChange={(event) => setShowSafeArea(event.target.checked)} />
                <span>标题安全区</span>
              </label>
            </section>

            <section>
              <header className="cover-maker-control-title">
                <div><Download size={17} /><strong>导出</strong></div>
                <span>{source ? `${finalOutputSize.width} × ${finalOutputSize.height}` : `${exportScale}×`}</span>
              </header>
              <div className="cover-maker-export-scale">
                <span>分辨率</span>
                <SegmentedControl value={exportScale} options={exportScaleOptions} onChange={setExportScale} />
              </div>
              <SegmentedControl className="cover-maker-format" value={format} options={formatOptions} onChange={setFormat} />
              <label className={`cover-maker-quality ${format === "png" ? "is-disabled" : ""}`}>
                <span>画质</span>
                <input
                  type="range"
                  min={40}
                  max={100}
                  step={1}
                  value={quality}
                  disabled={format === "png"}
                  onChange={(event) => setQuality(Number(event.target.value))}
                />
                <em>{format === "png" ? "无损" : `${quality}%`}</em>
              </label>
              <div className="cover-maker-output-name" title={outputName}>{outputName}</div>
              <button className="primary-button cover-maker-download" type="button" onClick={downloadCover} disabled={!source || exporting}>
                {exporting ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
                下载封面
              </button>
            </section>
          </aside>
        </div>
      </section>
    </section>
  );
}
