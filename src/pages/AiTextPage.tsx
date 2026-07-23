import * as d3 from "d3";
import { Bot, Loader2, Maximize2, Minimize2, Plus, RefreshCw, Search, Upload, WandSparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeRows, uploadRecord } from "../api/admin";
import AppSelect, { type SelectOption } from "../components/AppSelect";
import FileUploadField from "../components/FileUploadField";
import JsonViewer from "../components/JsonViewer";
import LoadingState from "../components/LoadingState";
import { postReq } from "../utils/request";
import { notify } from "../utils/notify";
import { buildTableLayout } from "../utils/tableLayout";
import { formatAppDateTime } from "../utils/dateFormat";
import { confirmAction } from "../utils/confirm";

type Row = Record<string, unknown>;
type ModelOption = SelectOption<string>;

type Column = {
  key: string;
  title: string;
  header?: React.ReactNode;
  width?: number;
  render?: (row: Row) => React.ReactNode;
};

type DatasetKey =
  | "word"
  | "detectionWord"
  | "sensitiveWord"
  | "pattern"
  | "feature"
  | "baseline"
  | "corpus"
  | "paragraph"
  | "runs"
  | "sentences"
  | "observations"
  | "lexicons";

type MainTab = "tasks" | DatasetKey | "dashboard" | "visualization";

type DatasetConfig = {
  key: DatasetKey;
  label: string;
  endpoint?: string;
  columns: Column[];
  search: Array<{ key: string; label: string; placeholder?: string; type?: "input" | "select"; options?: Array<{ label: string; value: string | number }> }>;
  split?: Array<{ key: string; title: string; endpoint: string; columns: Column[]; search?: DatasetConfig["search"] }>;
  toolbarExtra?: React.ReactNode;
};

type PageState = {
  pageNum: number;
  pageSize: number;
  total: number;
  size: number;
};

type DataState = {
  rows: Row[];
  page: PageState;
  loading: boolean;
  filters: Record<string, string | number>;
};

const tabs: Array<{ key: MainTab; label: string }> = [
  { key: "tasks", label: "任务" },
  { key: "word", label: "词汇" },
  { key: "detectionWord", label: "检测词汇" },
  { key: "sensitiveWord", label: "违规词" },
  { key: "pattern", label: "句式" },
  { key: "feature", label: "特征" },
  { key: "corpus", label: "语料" },
  { key: "paragraph", label: "段落" },
  { key: "runs", label: "分析运行" },
  { key: "sentences", label: "句子" },
  { key: "observations", label: "特征观察" },
  { key: "lexicons", label: "研究词库" },
  { key: "baseline", label: "检测基准" },
  { key: "dashboard", label: "全局" },
  { key: "visualization", label: "可视化" }
];

const pageDefaults: PageState = { pageNum: 1, pageSize: 20, total: 0, size: 0 };

const sourceOptions = [
  { label: "全部类型", value: "all" },
  { label: "AI文", value: "ai" },
  { label: "人工文", value: "human" }
];

const taskStatusOptions = [
  { label: "全部状态", value: "all" },
  { label: "待执行", value: "pending" },
  { label: "排队中", value: "queued" },
  { label: "执行中", value: "processing" },
  { label: "停止中", value: "stopping" },
  { label: "已完成", value: "completed" },
  { label: "失败", value: "failed" },
  { label: "已撤回", value: "rolled_back" },
  { label: "等待撤回", value: "rollback_pending" },
  { label: "撤回中", value: "rolling_back" },
  { label: "停止撤回中", value: "rollback_stopping" },
  { label: "撤回失败", value: "rollback_failed" },
  { label: "等待删除", value: "delete_pending" },
  { label: "删除中", value: "deleting" },
  { label: "删除失败", value: "delete_failed" }
];

const featureTypeOptions = [
  { label: "全部特征", value: "all" },
  { label: "词汇偏向", value: "word" },
  { label: "模板句式", value: "pattern" },
  { label: "模板化表达", value: "template" },
  { label: "句形结构", value: "sentence_shape" },
  { label: "词性结构", value: "pos_pattern" },
  { label: "依存结构", value: "dependency_pattern" },
  { label: "语义依存", value: "semantic_dependency" },
  { label: "依存关系", value: "dependency_relation" },
  { label: "语义角色", value: "semantic_role" },
  { label: "实体类型", value: "entity_type" },
  { label: "篇章标记", value: "discourse_marker" },
  { label: "抽象词", value: "abstract_word" },
  { label: "情绪词", value: "emotion_word" },
  { label: "感官词", value: "sensory_word" }
];

const metricNameMap: Record<string, string> = {
  char_count: "字符数",
  raw_char_count: "原始字符数",
  cjk_char_count: "汉字数",
  token_count: "词数",
  unique_token_count: "不同词数",
  hapax_count: "单现词数",
  hapax_ratio: "单现词比例",
  lexical_mattr_50: "字词多样性",
  lexical_ttr: "词汇TTR",
  lexical_root_ttr: "词汇Root TTR",
  lexical_diversity: "词汇多样性",
  word_entropy: "词汇熵",
  yules_k: "Yule K",
  char_bigram_entropy: "二字组合熵",
  char_trigram_entropy: "三字组合熵",
  avg_paragraph_chars: "平均段落字数",
  std_paragraph_chars: "段落长度标准差",
  paragraph_length_entropy: "段落长度熵",
  high_risk_paragraph_ratio: "高风险段落占比",
  high_risk_block_ratio: "高风险块占比",
  max_contiguous_ai_span: "连续AI风险块",
  style_change_point_count: "风格突变点数",
  style_change_score: "风格突变分",
  avg_sentence_chars: "平均句子字数",
  std_sentence_chars: "句子长度标准差",
  sentence_length_cv: "句长变异系数",
  sentence_burstiness: "句长爆发度",
  sentence_length_burstiness: "句长爆发度",
  sentence_length_gini: "句长基尼系数",
  sentence_opening_entropy: "句首变化熵",
  punctuation_count: "标点数",
  punctuation_variety: "标点种类数",
  punctuation_density: "标点密度",
  punctuation_count_density: "标点数量密度",
  comma_count: "逗号数",
  comma_density: "逗号密度",
  period_count: "句号数",
  period_density: "句号密度",
  quote_count: "引号数",
  quote_density: "引号密度",
  question_count: "问号数",
  question_density: "问号密度",
  exclamation_count: "省略号数",
  exclamation_density: "感叹号密度",
  ellipsis_count: "省略号数",
  ellipsis_density: "省略号密度",
  dialogue_char_count: "对白字符数",
  surface_pattern_count: "表层模板句式数",
  surface_pattern_density: "句式密度",
  discourse_marker_count: "篇章标记数",
  discourse_marker_density: "篇章标记密度",
  action_word_count: "动作词数",
  action_word_density: "动作词密度",
  dependency_max_depth: "依存最大深度",
  semantic_frame_count: "语义框架数",
  semantic_frame_density: "语义框架密度",
  named_entity_count: "命名实体数",
  named_entity_density: "实体密度",
  noun_ratio: "名词占比",
  verb_ratio: "动词占比",
  adjective_ratio: "形容词占比",
  adverb_ratio: "副词占比",
  pronoun_ratio: "代词占比",
  conjunction_ratio: "连词占比",
  particle_ratio: "助词占比",
  adjacent_sentence_similarity: "相邻句相似度",
  abstract_density: "抽象表达密度",
  abstract_word_density: "抽象词密度",
  smoothness_score: "平滑度分",
  connector_count: "连接词数",
  connector_density: "连接词密度",
  paragraph_length_cv: "段长变异系数",
  ai_signal_score: "AI迹象分",
  modifier_density: "修饰语密度",
  information_density: "信息密度",
  repeated_ngram_ratio: "重复片段比例",
  specific_marker_count: "具体标记数",
  specific_marker_density: "具体标记密度",
  sentence_length_entropy: "句子长度熵",
  punctuation_entropy: "标点熵",
  dialogue_ratio: "对白占比",
  abstract_word_count: "抽象词数",
  emotion_word_count: "情绪词数",
  emotion_word_density: "情绪词密度",
  sensory_word_count: "感官词数",
  sensory_word_density: "感官词密度",
  template_pattern_count: "模板句式数",
  action_verb_count: "动作词数",
  dependency_average_distance: "依存距离",
  compression_ratio: "压缩复杂度"
};

const metricTokenNameMap: Record<string, string> = {
  ai: "AI",
  avg: "平均",
  average: "平均",
  std: "标准差",
  raw: "原始",
  cjk: "汉字",
  char: "字符",
  chars: "字符",
  character: "字符",
  count: "数",
  ratio: "占比",
  density: "密度",
  entropy: "熵",
  paragraph: "段落",
  paragraphs: "段落",
  sentence: "句子",
  sentences: "句子",
  length: "长度",
  lexical: "词汇",
  token: "词",
  unique: "不同",
  word: "词",
  words: "词",
  abstract: "抽象",
  action: "动作",
  verb: "动词",
  emotion: "情绪",
  sensory: "感官",
  punctuation: "标点",
  connector: "连接词",
  modifier: "修饰语",
  information: "信息",
  compression: "压缩",
  complexity: "复杂度",
  similarity: "相似度",
  adjacent: "相邻",
  repeated: "重复",
  ngram: "片段",
  high: "高",
  risk: "风险",
  block: "块",
  gini: "基尼",
  cv: "变异系数",
  burstiness: "爆发度",
  smoothness: "平滑度",
  score: "分",
  signal: "迹象",
  style: "风格",
  change: "变化",
  point: "点",
  points: "点",
  max: "最大",
  min: "最小",
  depth: "深度",
  dependency: "依存",
  distance: "距离",
  dialogue: "对白",
  quote: "引号",
  question: "问号",
  exclamation: "感叹号",
  ellipsis: "省略号",
  comma: "逗号",
  period: "句号",
  template: "模板",
  pattern: "句式",
  surface: "表层",
  marker: "标记",
  specific: "具体",
  variety: "种类",
  opening: "开头",
  bigram: "二字组合",
  trigram: "三字组合",
  mattr: "MATTR",
  ttr: "TTR",
  yules: "Yule",
  k: "K"
};

const assetNameMap: Record<string, string> = {
  tasks: "采集任务",
  analysisRuns: "分析运行",
  corpora: "语料块",
  paragraphs: "段落",
  sentences: "句子",
  metrics: "指标事实",
  featureDefinitions: "特征项",
  featureObservations: "特征命中",
  lexicons: "研究词库",
  lexiconEntries: "词库条目"
};

const featureTypeMap: Record<string, string> = {
  word: "词汇偏向",
  pattern: "模板句式",
  template: "模板化表达",
  sentence_shape: "句形结构",
  pos_pattern: "词性结构",
  dependency_pattern: "依存结构",
  semantic_dependency: "语义依存",
  dependency_relation: "依存关系",
  semantic_role: "语义角色",
  entity_type: "实体类型",
  discourse_marker: "篇章标记",
  abstract_word: "抽象词",
  emotion_word: "情绪词",
  sensory_word: "感官词"
};

const taskStatusMap: Record<string, string> = {
  pending: "待执行",
  queued: "排队中",
  processing: "执行中",
  stopping: "停止中",
  completed: "已完成",
  failed: "失败",
  skipped: "已跳过",
  rolled_back: "已撤回",
  rollback_pending: "等待撤回",
  rolling_back: "撤回中",
  rollback_stopping: "停止撤回中",
  rollback_failed: "撤回失败",
  delete_pending: "等待删除",
  deleting: "删除中",
  delete_failed: "删除失败"
};

const busyStatuses = new Set(["queued", "processing", "stopping", "rollback_pending", "rolling_back", "rollback_stopping", "delete_pending", "deleting"]);
const activeStatuses = new Set([...busyStatuses]);

function buildPageState(): DataState {
  return { rows: [], page: { ...pageDefaults }, loading: false, filters: {} };
}

function formatText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "-";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  if (/^\d{13}$/.test(text)) return formatAppDateTime(Number(text));
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return formatAppDateTime(text);
  return text;
}

function formatNumber(value: unknown, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  if (Math.abs(num) >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: digits });
  return num.toFixed(digits).replace(/\.00$/, "");
}

function formatPercent(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0%";
  return `${(Math.abs(num) <= 1 ? num * 100 : num).toFixed(1).replace(/\.0$/, "")}%`;
}

function formatSignedPercent(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0%";
  const normalized = Math.abs(num) <= 1 ? num * 100 : num;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${normalized.toFixed(1).replace(/\.0$/, "")}%`;
}

function clampNumber(value: number, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function countNovelPlatformChars(text: string) {
  return Array.from(text.replace(/\s/g, "")).length;
}

function countSentences(text: string) {
  return text.split(/[。！？!?]/).filter((item) => item.trim()).length;
}

function formatTime(value: unknown) {
  return formatAppDateTime(value);
}

function normalizeScore(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.abs(num) <= 1 ? num * 100 : num));
}

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function normalizedBarWidth(value: unknown, max: number) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || max <= 0) return 0;
  return Math.min(100, Math.max(3, (num / max) * 100));
}

function safeRatio(part: unknown, total: unknown) {
  const numerator = Number(part || 0);
  const denominator = Number(total || 0);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
}

function relativeMetricGap(row: Row) {
  const ai = Number(row.aiAverage ?? row.aiMean ?? 0);
  const human = Number(row.humanAverage ?? row.humanMean ?? 0);
  const denominator = Math.abs(ai) + Math.abs(human);
  return denominator > 0 ? (2 * Number(row.difference ?? ai - human)) / denominator : 0;
}

function metricNormalizedValue(row: Row, source: "ai" | "human") {
  const ai = Number(row.aiAverage ?? row.aiMean ?? 0);
  const human = Number(row.humanAverage ?? row.humanMean ?? 0);
  const max = Math.max(Math.abs(ai), Math.abs(human), Number.EPSILON);
  return Math.min(100, (Math.abs(source === "ai" ? ai : human) / max) * 100);
}

function metricGapToneClass(ai: number, human: number) {
  const gap = Math.abs(ai - human);
  if (gap < 0.15) return "low";
  if (gap < 0.35) return "medium";
  if (gap < 0.6) return "high";
  return "critical";
}

function truncateLabel(value: unknown, max = 10) {
  const text = formatText(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function defaultFilters(fields: DatasetConfig["search"]) {
  return fields.reduce<Record<string, string | number>>((acc, field) => {
    acc[field.key] = field.type === "select" ? field.options?.[0]?.value ?? "all" : "";
    return acc;
  }, {});
}

function hasActiveFilters(values: Record<string, string | number>) {
  return Object.values(values).some((value) => value !== "" && value !== "all" && value !== -1 && value !== undefined && value !== null);
}

function sourceTypeName(value: unknown) {
  return String(value) === "human" ? "人工文" : "AI文";
}

function scopeTypeName(value: unknown) {
  const key = String(value || "");
  if (key === "corpus") return "语料块";
  if (key === "paragraph") return "段落";
  if (key === "sentence") return "句子";
  if (key === "document") return "文档";
  return key || "-";
}

function taskStatusName(value: unknown) {
  const key = String(value || "");
  return taskStatusMap[key] || key || "-";
}

function statusClass(value: unknown) {
  const key = String(value || "");
  if (["completed"].includes(key)) return "success";
  if (["queued"].includes(key)) return "warning";
  if (["processing", "stopping", "rolling_back", "rollback_stopping", "deleting"].includes(key)) return "running";
  if (["failed", "rollback_failed", "delete_failed"].includes(key)) return "danger";
  return "muted";
}

function chunkTypeName(value: unknown) {
  if (String(value) === "chapter") return "章节";
  if (String(value) === "chars") return "字数";
  return "-";
}

function metricName(value: unknown) {
  const key = String(value || "").trim();
  if (!key) return "-";
  if (metricNameMap[key]) return metricNameMap[key];
  const snakeKey = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s.]+/g, "_")
    .toLowerCase();
  if (metricNameMap[snakeKey]) return metricNameMap[snakeKey];
  const tokens = snakeKey.split("_").filter(Boolean);
  const translated = tokens.map((token) => metricTokenNameMap[token] || token);
  return translated.join("");
}

function metricDisplayName(row: Row) {
  const displayName = String(row.displayName || row.metricName || "").trim();
  if (displayName) return displayName;
  return metricName(row.metricKey);
}

function metricKeyWithoutScope(value: unknown) {
  const key = String(value || "").trim();
  const dotIndex = key.indexOf(".");
  return dotIndex >= 0 ? key.slice(dotIndex + 1) : key;
}

function metricScopeFromRow(row: Row) {
  const scope = String(row.scopeType || "").trim();
  if (scope) return scope;
  const key = String(row.metricKey || "").trim();
  const dotIndex = key.indexOf(".");
  return dotIndex > 0 ? key.slice(0, dotIndex) : "";
}

function scoringMetricDisplayName(row: Row) {
  const scope = metricScopeFromRow(row);
  const name = metricName(metricKeyWithoutScope(row.metricKey ?? row.metricName));
  return scope ? `${scopeTypeName(scope)}·${name}` : name;
}

function metricDisplayDedupeKey(row: Row, hideScopePrefix = false) {
  const name = metricDisplayName(row);
  return hideScopePrefix ? stripMetricScopePrefix(name) : name;
}

function metricDisplayRowRank(row: Row) {
  const scoreWeight = Number(row.scoreWeight ?? 0);
  const contribution = Number(row.contribution ?? row.weight ?? 0);
  const relativeGap = Math.abs(Number(row.relativeGap ?? 0));
  return Math.max(scoreWeight, contribution, relativeGap, 0);
}

function dedupeMetricRowsByDisplayName(rows: Row[], hideScopePrefix = false) {
  const index = new Map<string, number>();
  const result: Row[] = [];
  rows.forEach((row) => {
    const key = metricDisplayDedupeKey(row, hideScopePrefix);
    if (!key || key === "-") {
      result.push(row);
      return;
    }
    const existingIndex = index.get(key);
    if (existingIndex !== undefined) {
      if (metricDisplayRowRank(row) > metricDisplayRowRank(result[existingIndex])) {
        result[existingIndex] = row;
      }
      return;
    }
    index.set(key, result.length);
    result.push(row);
  });
  return result;
}

function assetName(value: unknown) {
  const key = String(value || "");
  return assetNameMap[key] || key || "-";
}

function featureTypeName(value: unknown) {
  const key = String(value || "");
  return featureTypeMap[key] || key || "-";
}

function cleanPayload(filters: Record<string, unknown>, page: PageState) {
  const payload: Record<string, unknown> = { pageNum: page.pageNum, pageSize: page.pageSize };
  Object.entries(filters).forEach(([key, value]) => {
    if (value === "" || value === undefined || value === null || value === "all" || value === -1) return;
    payload[key] = value;
  });
  return payload;
}

function isEnabledFlag(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function sortDetectionWordRows(rows: Row[]) {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const blackCompare = Number(isEnabledFlag(left.row.isBlacklist)) - Number(isEnabledFlag(right.row.isBlacklist));
      return blackCompare || left.index - right.index;
    })
    .map((item) => item.row);
}

function getMetricValue(row: Row, key: string) {
  const direct = row[key];
  if (direct !== undefined) return direct;
  const json = row.metricsJson;
  if (json && typeof json === "string") {
    try {
      const parsed = JSON.parse(json);
      return parsed?.[key];
    } catch {
      return undefined;
    }
  }
  if (json && typeof json === "object") return (json as Row)[key];
  return undefined;
}

function taskProgress(record: Row) {
  const direct = Number(record.progress);
  if (Number.isFinite(direct) && direct > 0) return Math.round(Math.max(0, Math.min(100, direct <= 1 ? direct * 100 : direct)));
  const total = Number(record.pageCount || 0);
  if (total <= 0) return 0;
  return Math.min(100, Math.round((Number(record.nextPageIndex || 0) * 100) / total));
}

function executionPoint(record: Row) {
  const total = Number(record.pageCount || 0);
  if (total <= 0) return "-";
  const next = Math.min(Number(record.nextPageIndex || 0) + 1, total);
  const start = Number(record.currentPageStart || 0);
  const end = Number(record.currentPageEnd || 0);
  const range = start > 0 ? (end > start ? `${start}-${end}` : `${start}`) : `${next}`;
  const status = String(record.status || "");
  let tone = "pending";
  let label = "待执行";
  let detail = `第 ${next} 块开始`;

  if (status === "processing") {
    tone = "running";
    label = "执行中";
    detail = `第 ${range} / ${total} 块`;
  } else if (status === "stopping") {
    tone = "running";
    label = "停止中";
    detail = `第 ${range} / ${total} 块`;
  } else if (status === "rollback_pending") {
    tone = "queued";
    label = "待撤回";
    detail = "等待撤回作业";
  } else if (status === "rolling_back") {
    tone = "running";
    label = "撤回中";
    detail = "清理任务数据";
  } else if (status === "rollback_stopping") {
    tone = "running";
    label = "停止撤回";
    detail = "等待安全停止";
  } else if (status === "queued") {
    tone = "queued";
    label = "排队";
    detail = `从第 ${next} 块继续`;
  } else if (status === "failed" && Number(record.nextPageIndex || 0) < total) {
    tone = "danger";
    label = "断点";
    detail = `第 ${next} 块，可继续`;
  } else if (status === "completed") {
    tone = "success";
    label = "完成";
    detail = `${total} 块`;
  } else if (status === "rolled_back") {
    tone = "muted";
    label = "已撤回";
    detail = "";
  }

  return (
    <div className={`aitext-execution-cell ${tone}`}>
      <span className="aitext-execution-status">{label}</span>
      <span className="aitext-execution-detail">{detail}</span>
    </div>
  );
}

function canExecute(record: Row) {
  const status = String(record.status || "");
  return !busyStatuses.has(status) && ["pending", "failed", "rolled_back"].includes(status);
}

function canStop(record: Row) {
  return ["queued", "processing", "rollback_pending", "rolling_back"].includes(String(record.status || ""));
}

function canRollback(record: Row) {
  const status = String(record.status || "");
  return !busyStatuses.has(status) && status !== "rolled_back";
}

function canDelete(record: Row) {
  return !busyStatuses.has(String(record.status || ""));
}

function SmallBadge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "success" | "warning" | "running" | "danger" | "muted" | "ai" | "human" }) {
  return <span className={`aitext-badge ${tone}`}>{children}</span>;
}

function DataTable({
  columns,
  rows,
  loading,
  page,
  onPage,
  minWidth = 1200
}: {
  columns: Column[];
  rows: Row[];
  loading?: boolean;
  page?: PageState;
  onPage?: (page: PageState) => void;
  minWidth?: number;
}) {
  const layout = useMemo(
    () => buildTableLayout({ columns, rows, minWidth, expandLastFixedColumn: true }),
    [columns, minWidth, rows]
  );
  return (
    <section className="aitext-table-card">
      <div className="aitext-table-scroll">
        <div className="aitext-table" style={{ minWidth: layout.minWidth }}>
          <div className="aitext-tr aitext-th" style={{ gridTemplateColumns: layout.gridTemplateColumns }}>
            {columns.map((column) => (
              <div key={column.key}>{column.header ?? column.title}</div>
            ))}
          </div>
          <div className="aitext-tbody">
            {loading ? (
              <div className="aitext-empty">
                <LoadingState text="正在加载" compact />
              </div>
            ) : rows.length === 0 ? (
              <div className="aitext-empty">暂无数据</div>
            ) : (
              rows.map((row, index) => (
                <div className="aitext-tr" style={{ gridTemplateColumns: layout.gridTemplateColumns }} key={String(row.id ?? row.key ?? index)}>
                  {columns.map((column) => (
                    <div key={column.key}>
                      {column.render ? column.render(row) : formatText(row[column.key])}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      {page && onPage ? (
        <div className="aitext-pagination">
          <span>
            当前 {page.size || rows.length} 条 共 {page.total || rows.length} 条
          </span>
          <button disabled={page.pageNum <= 1} onClick={() => onPage({ ...page, pageNum: page.pageNum - 1 })}>
            上一页
          </button>
          <strong>{page.pageNum}</strong>
          <button disabled={page.total > 0 && page.pageNum * page.pageSize >= page.total} onClick={() => onPage({ ...page, pageNum: page.pageNum + 1 })}>
            下一页
          </button>
          <AppSelect value={page.pageSize} options={[20, 50, 100].map((value) => ({ value, label: `${value} / 页` }))} onChange={(pageSize) => onPage({ ...page, pageNum: 1, pageSize })} />
        </div>
      ) : null}
    </section>
  );
}

function SearchBar({
  fields,
  values,
  onChange,
  onSearch,
  onReset,
  children
}: {
  fields: DatasetConfig["search"];
  values: Record<string, string | number>;
  onChange: (key: string, value: string | number) => void;
  onSearch: () => void;
  onReset?: () => void;
  children?: React.ReactNode;
}) {
  const active = hasActiveFilters(values);
  return (
    <div className="aitext-toolbar">
      {fields.map((field) =>
        field.type === "select" ? (
          <AppSelect
            key={field.key}
            className="aitext-filter-select"
            triggerClassName="aitext-filter-select-trigger"
            menuClassName="aitext-filter-select-menu"
            value={String(values[field.key] ?? "all")}
            options={(field.options || []).map((item) => ({ value: String(item.value), label: item.label }))}
            onChange={(value) => onChange(field.key, value)}
          />
        ) : (
          <label className="aitext-search-input" key={field.key}>
            <Search size={18} />
            {values[field.key] ? (
              <button type="button" className="aitext-field-clear" onClick={() => onChange(field.key, "")} aria-label="清空">
                <X size={14} />
              </button>
            ) : null}
            <input
              value={values[field.key] ?? ""}
              placeholder={field.placeholder || field.label}
              onChange={(event) => onChange(field.key, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSearch();
              }}
            />
          </label>
        )
      )}
      <button onClick={onSearch}>查询</button>
      {onReset && active ? (
        <button className="aitext-reset-button" onClick={onReset}>
          清空
        </button>
      ) : null}
      {children}
    </div>
  );
}

function SwitchCell({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button className={`table-switch ${checked ? "is-on" : ""}`} disabled={disabled} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

function baselineVersionOf(row: Row) {
  return String(row.baselineVersion || "baseline-v2");
}

function baselineRowMatches(left: Row, right: Row) {
  return String(left.scopeType || "") === String(right.scopeType || "")
    && String(left.metricKey || "") === String(right.metricKey || "")
    && baselineVersionOf(left) === baselineVersionOf(right);
}

function sortBaselineRowsByScoreWeight(rows: Row[]) {
  return [...rows].sort((left, right) => {
    const weightDiff = Number(right.scoreWeight || 0) - Number(left.scoreWeight || 0);
    if (Math.abs(weightDiff) > 1e-9) return weightDiff;
    if (Boolean(left.scoreEligible) !== Boolean(right.scoreEligible)) return Boolean(left.scoreEligible) ? -1 : 1;
    const importanceDiff = Number(right.importanceScore || 0) - Number(left.importanceScore || 0);
    if (Math.abs(importanceDiff) > 1e-9) return importanceDiff;
    return String(left.metricKey || "").localeCompare(String(right.metricKey || ""));
  });
}

type RadarPoint = {
  label: string;
  ai: number;
  human: number;
  current?: number;
  aiRaw: number;
  humanRaw: number;
  currentRaw?: number;
  hasCurrent?: boolean;
};

function stripMetricScopePrefix(label: string) {
  return label.replace(/^[^·]+·/, "");
}

function MetricRadarD3({
  rows,
  full = false,
  zoomed = false,
  compact = false,
  showCurrent = false,
  hideScopePrefix = false
}: { rows: Row[]; full?: boolean; zoomed?: boolean; compact?: boolean; showCurrent?: boolean; hideScopePrefix?: boolean }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [hovered, setHovered] = useState<RadarPoint | null>(null);
  const values = useMemo(
    () => rows
      .map((row) => {
        const ai = Number(row.aiAverage ?? row.aiMean ?? 0);
        const human = Number(row.humanAverage ?? row.humanMean ?? 0);
        const currentRawValue = row.currentValue ?? row.current ?? row.value;
        const current = Number(currentRawValue);
        const hasCurrent = showCurrent && currentRawValue !== undefined && currentRawValue !== null && currentRawValue !== "" && Number.isFinite(current);
        const max = Math.max(Math.abs(ai), Math.abs(human), hasCurrent ? Math.abs(current) : 0, Number.EPSILON);
        return {
          label: hideScopePrefix ? stripMetricScopePrefix(metricDisplayName(row)) : metricDisplayName(row),
          ai: Math.min(1, Math.abs(ai) / max),
          human: Math.min(1, Math.abs(human) / max),
          current: hasCurrent ? Math.min(1, Math.abs(current) / max) : undefined,
          aiRaw: ai,
          humanRaw: human,
          currentRaw: hasCurrent ? current : undefined,
          hasCurrent
        };
      })
      .filter((item) => item.label !== "-"),
    [rows, showCurrent, hideScopePrefix]
  );
  const activePoint = hovered || values[0] || null;
  const activeMax = activePoint ? Math.max(Math.abs(activePoint.aiRaw), Math.abs(activePoint.humanRaw), activePoint.hasCurrent ? Math.abs(activePoint.currentRaw || 0) : 0, Number.EPSILON) : 1;
  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    const width = compact ? 680 : full ? 980 : 760;
    const height = compact ? 560 : full ? 800 : 640;
    const cx = width / 2;
    const cy = height / 2;
    const radius = compact ? 180 : full ? 215 : 165;
    if (!values.length) return;
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("preserveAspectRatio", "xMidYMid meet");
    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);
    const levels = [0.25, 0.5, 0.75, 1];
    levels.forEach((level) => {
      const points = values.map((_, index) => {
        const angle = (Math.PI * 2 * index) / values.length - Math.PI / 2;
        return [Math.cos(angle) * radius * level, Math.sin(angle) * radius * level].join(",");
      });
      g.append("polygon").attr("points", points.join(" ")).attr("fill", "none").attr("stroke", "var(--border-color)").attr("stroke-width", 1);
    });
    values.forEach((item, index) => {
      const angle = (Math.PI * 2 * index) / values.length - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      g.append("line").attr("x1", 0).attr("y1", 0).attr("x2", x).attr("y2", y).attr("stroke", "var(--border-color)").attr("stroke-width", 1);
      const labelRadius = radius + (compact ? 34 : full ? 42 : 30);
      const angleDeg = (angle * 180) / Math.PI;
      const flipLabel = angleDeg > 90 && angleDeg < 270;
      const lx = Math.cos(angle) * labelRadius;
      const ly = Math.sin(angle) * labelRadius;
      const anchor = flipLabel ? "end" : "start";
      const rotate = angleDeg + (flipLabel ? 180 : 0);
      const tone = metricGapToneClass(item.ai, item.human);
      const labelGroup = g.append("g").attr("transform", `translate(${lx},${ly}) rotate(${rotate})`);
      labelGroup
        .style("cursor", "default")
        .on("mouseenter", () => setHovered(item))
        .on("focus", () => setHovered(item));
      const labelText = labelGroup
        .append("text")
        .attr("class", "aitext-radar-label-text")
        .attr("x", 0)
        .attr("y", 0)
        .attr("text-anchor", anchor)
        .attr("dominant-baseline", "middle")
        .attr("font-size", compact ? 11 : 17)
        .text(full ? truncateLabel(item.label, 8) : compact ? truncateLabel(item.label, 7) : item.label);
      const box = labelText.node()?.getBBox();
      if (box) {
        labelGroup
          .insert("rect", "text")
          .attr("class", `aitext-radar-label-bg ${tone}`)
          .attr("x", box.x - 5)
          .attr("y", box.y - 3)
          .attr("width", box.width + 10)
          .attr("height", box.height + 6)
          .attr("rx", 2)
          .attr("stroke-width", 1);
      }
    });
    const pointOf = (index: number, value: number) => {
      const angle = (Math.PI * 2 * index) / values.length - Math.PI / 2;
      return {
        x: Math.cos(angle) * value * radius,
        y: Math.sin(angle) * value * radius
      };
    };
    const line = d3
      .line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y)
      .curve(d3.curveLinearClosed);
    const drawArea = (key: "ai" | "human" | "current", color: string, fillOpacity = 0.12) => {
      const data = values.map((item, index) => pointOf(index, Number(item[key] ?? 0)));
      g.append("path")
        .datum(data)
        .attr("d", line)
        .attr("fill", color)
        .attr("fill-opacity", fillOpacity)
        .attr("stroke", color)
        .attr("stroke-width", compact ? 2.5 : 3);
      values.forEach((item, index) => {
        if (key === "current" && !item.hasCurrent) {
          return;
        }
        const point = pointOf(index, Number(item[key] ?? 0));
        g.append("circle")
          .attr("cx", point.x)
          .attr("cy", point.y)
          .attr("r", compact ? 3 : full ? 3 : 4)
          .attr("fill", color)
          .attr("stroke", color)
          .attr("stroke-width", 1)
          .style("cursor", "default")
          .on("mouseenter", () => setHovered(item))
          .on("focus", () => setHovered(item));
        g.append("circle")
          .attr("cx", point.x)
          .attr("cy", point.y)
          .attr("r", compact ? 9 : full ? 9 : 12)
          .attr("fill", "transparent")
          .style("cursor", "default")
          .on("mouseenter", () => setHovered(item))
          .on("focus", () => setHovered(item));
      });
    };
    drawArea("human", "#12b981");
    drawArea("ai", "#ff2f5f");
    if (showCurrent && values.some((item) => item.hasCurrent)) {
      drawArea("current", "#1677ff", 0.08);
    }
  }, [values, full, compact, showCurrent]);
  return (
    <div className={`aitext-radar-wrap ${compact ? "compact" : ""} ${zoomed ? "zoomed" : ""}`} onMouseLeave={() => setHovered(null)}>
      <svg className={`aitext-d3-radar ${compact ? "compact" : ""} ${full ? "full" : ""} ${zoomed ? "zoomed" : ""}`} ref={ref} />
      {activePoint ? (
        <div className={`aitext-radar-hover-card ${hovered ? "visible" : ""}`}>
          <strong>{activePoint.label}</strong>
          <div className="aitext-radar-hover-bars">
            {activePoint.hasCurrent ? (
              <div>
                <span>待测文本</span>
                <i><em className="current" style={{ width: `${Math.max(4, (Math.abs(activePoint.currentRaw || 0) / activeMax) * 100)}%` }} /></i>
                <b>{formatNumber(activePoint.currentRaw)}</b>
              </div>
            ) : null}
            <div>
              <span>人工文</span>
              <i><em className="human" style={{ width: `${Math.max(4, (Math.abs(activePoint.humanRaw) / activeMax) * 100)}%` }} /></i>
              <b>{formatNumber(activePoint.humanRaw)}</b>
            </div>
            <div>
              <span>AI文</span>
              <i><em className="ai" style={{ width: `${Math.max(4, (Math.abs(activePoint.aiRaw) / activeMax) * 100)}%` }} /></i>
              <b>{formatNumber(activePoint.aiRaw)}</b>
            </div>
          </div>
          <p>
            差值 <b className={activePoint.aiRaw >= activePoint.humanRaw ? "text-ai" : "text-human"}>{formatNumber(activePoint.aiRaw - activePoint.humanRaw)}</b>
          </p>
        </div>
      ) : null}
    </div>
  );
}

function RadarTitle({ children, zoomed, onZoom }: { children: React.ReactNode; zoomed: boolean; onZoom: () => void }) {
  return (
    <div className="aitext-chart-title-row">
      <h3>{children}</h3>
      <span className="aitext-chart-legend"><i className="human" />人工文</span>
      <span className="aitext-chart-legend"><i className="ai" />AI文</span>
      <button type="button" className="aitext-chart-zoom-button" onClick={onZoom}>
        {zoomed ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        {zoomed ? "还原" : "全局缩放"}
      </button>
    </div>
  );
}

function SampleDonutD3({ sourceStats }: { sourceStats: Row[] }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const sampleRows = useMemo(() => {
    const hasCharCount = sourceStats.some((item) => item.charCount !== undefined && item.charCount !== null);
    return ["ai", "human"].map((sourceType) => {
      const source = sourceStats.find((item) => String(item.sourceType) === sourceType);
      const value = Number((hasCharCount ? source?.charCount : source?.corpusCount) || source?.charCount || source?.corpusCount || 0);
      return {
        sourceType,
        name: sourceTypeName(sourceType),
        value: Number.isFinite(value) ? value : 0,
        label: hasCharCount ? "字数" : "语料块",
        color: sourceType === "human" ? "#12b981" : "#ff2f5f"
      };
    });
  }, [sourceStats]);
  const total = sampleRows.reduce((sum, item) => sum + item.value, 0);
  const hasData = total > 0;
  const percentText = (value: number) => (total > 0 ? `${((value / total) * 100).toFixed(1).replace(/\.0$/, "")}%` : "0%");
  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    if (!hasData) return;
    const width = 420;
    const height = 300;
    const radius = 105;
    const data = sampleRows.filter((item) => item.value > 0);
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);
    const pie = d3.pie<(typeof data)[number]>().value((d) => d.value).sort(null);
    const arc = d3.arc<d3.PieArcDatum<(typeof data)[number]>>().innerRadius(62).outerRadius(radius);
    const labelArc = d3.arc<d3.PieArcDatum<(typeof data)[number]>>().innerRadius(86).outerRadius(86);
    g.selectAll("path")
      .data(pie(data))
      .join("path")
      .attr("d", arc)
      .attr("fill", (d) => d.data.color)
      .attr("stroke", "var(--card-bg)")
      .attr("stroke-width", 2);
    g.selectAll("text")
      .data(pie(data))
      .join("text")
      .attr("transform", (d) => `translate(${labelArc.centroid(d)})`)
      .attr("text-anchor", "middle")
      .attr("font-size", 15)
      .attr("font-weight", 700)
      .attr("fill", "var(--text-color)")
      .each(function (d) {
        const text = d3.select(this);
        text.append("tspan").attr("x", 0).attr("dy", "-0.2em").text(d.data.name);
        text.append("tspan").attr("x", 0).attr("dy", "1.25em").text(percentText(d.data.value));
      });
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("font-size", 13)
      .attr("fill", "var(--text-color-secend)")
      .attr("dy", "-0.35em")
      .text("总量");
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("font-size", 18)
      .attr("font-weight", 700)
      .attr("fill", "var(--text-color)")
      .attr("dy", "0.95em")
      .text(formatNumber(total, 0));
  }, [sampleRows, hasData, total]);
  return hasData ? (
    <div className="aitext-sample-donut">
      <svg className="aitext-d3-donut" ref={ref} />
      <div className="aitext-sample-detail">
        <strong>样本详情</strong>
        {sampleRows.map((item) => (
          <div key={item.sourceType}>
            <span><i style={{ background: item.color }} />{item.name}</span>
            <b>{percentText(item.value)}</b>
            <em>{item.label}：{formatNumber(item.value, 0)}</em>
          </div>
        ))}
        <p>总量：{formatNumber(total, 0)}</p>
      </div>
    </div>
  ) : <div className="aitext-empty">暂无样本构成数据</div>;
}

function DetectCompositionDonut({ composition, score }: { composition: Row; score: number }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const rows = useMemo(() => {
    const rawRows = [
      { key: "human", name: "人工", value: Number(composition.humanRatio), color: "#12b981" },
      { key: "suspicious", name: "疑似AI", value: Number(composition.suspiciousRatio), color: "#d39c00" },
      { key: "ai", name: "AI", value: Number(composition.aiRatio), color: "#ff2f5f" }
    ];
    const total = rawRows.reduce((sum, item) => sum + (Number.isFinite(item.value) && item.value > 0 ? item.value : 0), 0);
    if (total > 0) {
      return rawRows.map((item) => ({ ...item, value: Math.max(0, item.value) / total }));
    }
    const normalizedScore = clampNumber(score / 100, 0, 1);
    if (normalizedScore >= 0.62) return [{ key: "human", name: "人工", value: 0, color: "#12b981" }, { key: "suspicious", name: "疑似AI", value: 0, color: "#d39c00" }, { key: "ai", name: "AI", value: 1, color: "#ff2f5f" }];
    if (normalizedScore <= 0.38) return [{ key: "human", name: "人工", value: 1, color: "#12b981" }, { key: "suspicious", name: "疑似AI", value: 0, color: "#d39c00" }, { key: "ai", name: "AI", value: 0, color: "#ff2f5f" }];
    return [{ key: "human", name: "人工", value: 0, color: "#12b981" }, { key: "suspicious", name: "疑似AI", value: 1, color: "#d39c00" }, { key: "ai", name: "AI", value: 0, color: "#ff2f5f" }];
  }, [composition.aiRatio, composition.humanRatio, composition.suspiciousRatio, score]);
  const aiRatio = rows.find((item) => item.key === "ai")?.value || 0;
  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    const width = 160;
    const height = 138;
    const radius = 58;
    const data = rows.filter((item) => item.value > 0);
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("preserveAspectRatio", "xMidYMid meet");
    if (!data.length) return;
    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);
    const pie = d3.pie<(typeof data)[number]>().value((d) => d.value).sort(null);
    const arc = d3.arc<d3.PieArcDatum<(typeof data)[number]>>().innerRadius(34).outerRadius(radius);
    g.selectAll("path")
      .data(pie(data))
      .join("path")
      .attr("d", arc)
      .attr("fill", (d) => d.data.color)
      .attr("stroke", "var(--card-bg)")
      .attr("stroke-width", 2);
    g.append("text").attr("text-anchor", "middle").attr("font-size", 12).attr("fill", "var(--text-color-secend)").attr("dy", "-0.35em").text("AI占比");
    g.append("text").attr("text-anchor", "middle").attr("font-size", 19).attr("font-weight", 700).attr("fill", "var(--text-color)").attr("dy", "0.95em").text(formatPercent(aiRatio));
  }, [rows, aiRatio]);
  return (
    <div className="detect-composition-chart">
      <svg className="detect-composition-donut" ref={ref} />
      <div className="detect-composition-list">
        {rows.map((item) => (
          <div
            key={item.key}
            style={{
              "--composition-color": item.color,
              "--composition-percent": `${Math.round(clampNumber(item.value, 0, 1) * 10000) / 100}%`
            } as React.CSSProperties}
          >
            <span><i style={{ background: item.color }} />{item.name}</span>
            <b>{formatPercent(item.value)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricBiasD3({ rows }: { rows: Row[] }) {
  const data = rows
    .map((row) => {
      const diff = Number(row.difference ?? row.meanDiff ?? 0);
      const gap = Number(row.relativeGap ?? 0);
      return {
        label: stripMetricScopePrefix(metricDisplayName(row)),
        value: Number.isFinite(diff) ? diff : 0,
        gap,
        ai: Number(row.aiAverage ?? row.aiMean ?? 0),
        human: Number(row.humanAverage ?? row.humanMean ?? 0)
      };
    })
    .filter((item) => item.label !== "-")
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 14);
  const max = Math.max(...data.map((item) => Math.abs(item.value)), 1);
  if (!data.length) return <div className="aitext-empty">暂无指标偏向数据</div>;
  return (
    <div className="aitext-bias-chart">
      {data.map((item) => {
        const width = Math.max(3, (Math.abs(item.value) / max) * 48);
        const aiHigh = item.value >= 0;
        return (
          <div className="aitext-bias-row" key={item.label}>
            <span>{item.label}</span>
            <div className="aitext-bias-track">
              <i className={aiHigh ? "ai" : "human"} style={aiHigh ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }} />
            </div>
            <strong className={aiHigh ? "text-ai" : "text-human"}>{formatNumber(item.value)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function AssetTreemapD3({ rows }: { rows: Row[] }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const hasData = rows.some((row) => Number(row.count || row.total || 0) > 0);
  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    if (!hasData) return;
    const width = 1100;
    const height = 360;
    const data = rows
      .map((row) => ({ name: assetName(row.assetKey || row.assetName || row.name), raw: row.assetKey || row.assetName || row.name, value: Number(row.count || row.total || 0) }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
    if (!data.length) return;
    type AssetTreeDatum = {
      name: string;
      raw?: unknown;
      value?: number;
      layoutValue?: number;
      children?: AssetTreeDatum[];
    };
    const treeData: AssetTreeDatum = {
      name: "研究数据资产",
      children: data.map((item) => ({ ...item, layoutValue: Math.log10(item.value + 1) }))
    };
    const root = d3
      .hierarchy<AssetTreeDatum>(treeData)
      .sum((item) => item.layoutValue || 0)
      .sort((a, b) => Number(b.data.layoutValue || 0) - Number(a.data.layoutValue || 0));
    const treemapRoot = d3.treemap<AssetTreeDatum>().size([width, height]).paddingInner(8).paddingOuter(2).round(true)(root);
    const colors = ["#12b981", "#58e0ff", "#ffc107", "#ff8bb3", "#8b5cf6", "#22c55e", "#f97316", "#38bdf8"];
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("preserveAspectRatio", "xMidYMid meet");
    const defs = svg.append("defs");
    const nodes = svg
      .selectAll("g")
      .data(treemapRoot.leaves())
      .join("g")
      .attr("transform", (d) => `translate(${d.x0},${d.y0})`);
    nodes.each((_, index, groups) => {
      const id = `asset-clip-${index}`;
      const node = d3.select(groups[index]);
      const leaf = node.datum() as d3.HierarchyRectangularNode<AssetTreeDatum>;
      const w = Math.max(0, leaf.x1 - leaf.x0);
      const h = Math.max(0, leaf.y1 - leaf.y0);
      defs
        .append("clipPath")
        .attr("id", id)
        .append("rect")
        .attr("width", w)
        .attr("height", h)
        .attr("rx", 2);
      node.attr("clip-path", `url(#${id})`);
    });
    nodes
      .append("rect")
      .attr("width", (d) => d.x1 - d.x0)
      .attr("height", (d) => d.y1 - d.y0)
      .attr("rx", 2)
      .attr("fill", (_, index) => colors[index % colors.length])
      .attr("fill-opacity", 0.18)
      .attr("stroke", (_, index) => colors[index % colors.length])
      .attr("stroke-width", 1.2);
    nodes
      .append("text")
      .attr("x", 10)
      .attr("y", 24)
      .attr("font-size", (d) => (d.x1 - d.x0 > 210 && d.y1 - d.y0 > 90 ? 18 : 15))
      .attr("font-weight", 700)
      .attr("fill", "var(--text-color)")
      .text((d) => truncateLabel(d.data.name, d.x1 - d.x0 > 150 ? 12 : 6));
    nodes
      .append("text")
      .attr("x", 10)
      .attr("y", 50)
      .attr("font-size", 15)
      .attr("fill", "var(--text-color-secend)")
      .text((d) => (d.x1 - d.x0 > 80 && d.y1 - d.y0 > 54 ? formatNumber(d.data.value, 0) : ""));
  }, [rows, hasData]);
  return hasData ? <svg className="aitext-treemap" ref={ref} /> : <div className="aitext-empty">暂无资产数据</div>;
}

function ProcessingHealthD3({ rows }: { rows: Array<{ label: string; value: number; detail: string }> }) {
  const ref = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    const width = 760;
    const rowHeight = 38;
    const height = Math.max(190, rows.length * rowHeight + 32);
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    const g = svg.append("g").attr("transform", "translate(16,16)");
    const labelWidth = 150;
    const valueWidth = 178;
    const barWidth = width - labelWidth - valueWidth - 42;
    const row = g.selectAll("g").data(rows).join("g").attr("transform", (_, index) => `translate(0,${index * rowHeight})`);
    row.append("text").attr("x", 0).attr("y", 20).attr("font-size", 15).attr("fill", "var(--text-color)").text((d) => d.label);
    row.append("rect").attr("x", labelWidth).attr("y", 8).attr("width", barWidth).attr("height", 12).attr("fill", "var(--bg-color-light)");
    row.append("rect")
      .attr("x", labelWidth)
      .attr("y", 8)
      .attr("width", (d) => Math.max(3, Math.min(1, Math.max(0, d.value)) * barWidth))
      .attr("height", 12)
      .attr("fill", "#12b981")
      .attr("fill-opacity", 0.82);
    row.append("text")
      .attr("x", width - 36)
      .attr("y", 20)
      .attr("text-anchor", "end")
      .attr("font-size", 14)
      .attr("fill", "var(--text-color-secend)")
      .text((d) => `${formatPercent(d.value)} · ${d.detail}`);
  }, [rows]);
  return rows.length ? <svg className="aitext-d3-health" ref={ref} /> : <div className="aitext-empty">暂无处理健康数据</div>;
}

function MetricHeatmapD3({ rows }: { rows: Row[] }) {
  const columns = ["AI均值", "人工均值", "差异强度", "AI偏向", "人工偏向"];
  const keys: Array<"aiNorm" | "humanNorm" | "diff" | "aiBias" | "humanBias"> = ["aiNorm", "humanNorm", "diff", "aiBias", "humanBias"];
  const data: Array<Row & { label: string; aiNorm: number; humanNorm: number; diff: number; aiBias: number; humanBias: number; gap: number }> = rows
    .filter((row) => Math.abs(Number(row.aiAverage ?? row.aiMean ?? 0)) + Math.abs(Number(row.humanAverage ?? row.humanMean ?? 0)) > 0)
    .map((row) => {
      const gap = relativeMetricGap(row);
      return {
        ...(row as Row),
        label: stripMetricScopePrefix(metricDisplayName(row)),
        aiNorm: metricNormalizedValue(row, "ai"),
        humanNorm: metricNormalizedValue(row, "human"),
        diff: Math.min(100, Math.abs(gap) * 50),
        aiBias: gap > 0 ? Math.min(100, Math.abs(gap) * 50) : 0,
        humanBias: gap < 0 ? Math.min(100, Math.abs(gap) * 50) : 0,
        gap
      };
    });
  const colorFor = (key: string, value: number) => {
    const alpha = 0.08 + Math.min(0.82, value / 120);
    if (key === "aiNorm" || key === "aiBias") return `rgba(254, 44, 85, ${alpha})`;
    if (key === "humanNorm" || key === "humanBias") return `rgba(16, 185, 129, ${alpha})`;
    return `rgba(184, 130, 0, ${alpha})`;
  };
  return data.length ? (
    <div className="aitext-heatmap">
      <div className="aitext-heatmap-head">
        <span>指标</span>
        {columns.map((column) => (
          <span key={column}>{column}</span>
        ))}
      </div>
      <div className="aitext-heatmap-body">
        {data.map((row) => (
          <div className="aitext-heatmap-row" key={String(row.metricKey || row.metricName || row.label)}>
            <span className="aitext-heatmap-label">{row.label}</span>
            {keys.map((key) => (
              <span className="aitext-heatmap-cell" key={key} style={{ background: colorFor(key, Number(row[key] || 0)) }}>
                {formatNumber(row[key], 1)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  ) : <div className="aitext-empty">暂无指标热力数据</div>;
}

function FeatureSignificanceD3({ rows }: { rows: Row[] }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const data = rows.map((row) => ({
    label: featureTypeName(row.featureType),
    count: Number(row.featureCount || row.count || 0),
    significant: Number(row.significantCount || 0),
    effect: Number(row.avgAbsEffect || 0)
  })).filter((row) => row.count > 0 || row.significant > 0 || row.effect > 0);
  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    if (!data.length) return;
    const width = 760;
    const height = 360;
    const margin = { top: 24, right: 26, bottom: 84, left: 52 };
    const x = d3.scaleBand().domain(data.map((d) => d.label)).range([margin.left, width - margin.right]).padding(0.32);
    const y = d3.scaleLinear().domain([0, Math.max(...data.map((d) => Math.max(d.count, d.significant)), 1)]).nice().range([height - margin.bottom, margin.top]);
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).tickSizeOuter(0)).selectAll("text").attr("font-size", 14).attr("transform", "rotate(-24)").attr("text-anchor", "end");
    svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4)).selectAll("text").attr("font-size", 13);
    const band = x.bandwidth();
    svg.selectAll("rect.total").data(data).join("rect").attr("x", (d) => x(d.label) || 0).attr("y", (d) => y(d.count)).attr("width", band / 2 - 2).attr("height", (d) => y(0) - y(d.count)).attr("fill", "#0045cc").attr("fill-opacity", 0.72);
    svg.selectAll("rect.sig").data(data).join("rect").attr("x", (d) => (x(d.label) || 0) + band / 2 + 2).attr("y", (d) => y(d.significant)).attr("width", band / 2 - 2).attr("height", (d) => y(0) - y(d.significant)).attr("fill", "#00a6c8").attr("fill-opacity", 0.72);
  }, [data]);
  return data.length ? <svg className="aitext-d3-feature" ref={ref} /> : <div className="aitext-empty">暂无特征统计</div>;
}

function FeatureBiasD3({ aiRows, humanRows }: { aiRows: Row[]; humanRows: Row[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, Row & { bias: number; sourceType: string }>();
    const candidates: Array<Row & { bias: number; sourceType: string }> = [
      ...aiRows.slice(0, 8).map((row) => ({ ...(row as Row), bias: Math.abs(Number(row.frequencyDiff || row.effectSize || 0)), sourceType: "ai" })),
      ...humanRows.slice(0, 8).map((row) => ({ ...(row as Row), bias: -Math.abs(Number(row.frequencyDiff || row.effectSize || 0)), sourceType: "human" }))
    ];
    candidates
      .forEach((row) => {
        const key = String(row.featureText || row.word || row.pattern || row.name || "");
        if (key && !map.has(key)) map.set(key, row);
      });
    return [...map.values()].sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias)).slice(0, 14);
  }, [aiRows, humanRows]);
  return (
    <div className="aitext-feature-bias">
      {rows.map((row) => {
        const text = formatText(row.featureText || row.word || row.pattern || row.name);
        const ai = row.sourceType === "ai";
        return (
          <div key={text}>
            <span>{truncateLabel(text, 16)}</span>
            <i className={ai ? "ai" : "human"} style={{ width: `${Math.min(100, Math.max(6, Math.abs(row.bias)))}%` }} />
            <strong className={ai ? "text-ai" : "text-human"}>{ai ? "AI偏高" : "人工偏高"}</strong>
          </div>
        );
      })}
      {!rows.length ? <div className="aitext-empty">暂无偏向特征</div> : null}
    </div>
  );
}

function riskLevelFromScore(score: unknown, fallback?: unknown) {
  const text = String(fallback || "").toLowerCase();
  if (text.includes("high") || text.includes("高")) return "high";
  if (text.includes("medium") || text.includes("中")) return "medium";
  if (text.includes("low") || text.includes("低")) return "low";
  const normalized = normalizeScore(score);
  if (normalized >= 72) return "high";
  if (normalized >= 55) return "medium";
  return "low";
}

function riskName(value: unknown) {
  const level = riskLevelFromScore(undefined, value);
  return level === "high" ? "高" : level === "medium" ? "中" : "低";
}

function riskClassName(value: unknown, score?: unknown) {
  return `risk-${riskLevelFromScore(score, value)}`;
}

function normalizeRatioValue(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return number > 1 ? number / 100 : number;
}

function dominantCompositionRiskLevel(composition: Row, fallbackScore?: unknown) {
  const human = normalizeRatioValue(composition.humanRatio);
  const suspicious = normalizeRatioValue(composition.suspiciousRatio);
  const ai = normalizeRatioValue(composition.aiRatio);
  if (human + suspicious + ai <= 0) return riskLevelFromScore(fallbackScore);
  if (ai >= human && ai >= suspicious) return "high";
  if (suspicious >= human) return "medium";
  return "low";
}

function evidenceTypeName(value: unknown) {
  const key = String(value || "");
  const map: Record<string, string> = {
    baseline_metric: "指标偏离",
    learned_word: "AI高频词汇",
    sensitive_word: "违规词汇",
    learned_pattern: "AI偏向句形",
    learned_feature: "AI偏向特征",
    smoothness: "节奏平滑",
    abstractness: "抽象表达",
    low_information: "低信息密度",
    repetition: "重复表达",
    template: "模板化表达",
    style_change: "风格突变",
    sentence_metric: "句子指标",
    structure: "结构启发"
  };
  return map[key] || metricName(key) || "痕迹";
}

function evidenceStrengthName(value: unknown) {
  const key = String(value || "").toLowerCase();
  if (key.includes("strong") || key.includes("强")) return "强痕迹";
  if (key.includes("medium") || key.includes("中")) return "中痕迹";
  if (key.includes("weak") || key.includes("弱")) return "弱痕迹";
  return "痕迹";
}

function evidenceStrengthClass(value: unknown) {
  const key = String(value || "").toLowerCase();
  if (key.includes("strong") || key.includes("强")) return "strong";
  if (key.includes("medium") || key.includes("中")) return "medium";
  return "weak";
}

function evidenceFeatureText(item: Row) {
  const key = String(item.key || item.featureKey || "");
  const parts = key.split(":");
  return formatText(item.featureText || item.pattern || item.word || item.text || (parts.length > 1 ? parts.slice(1).join(":") : key));
}

function evidenceReadableMessage(item: Row) {
  return formatText(item.message || item.description || item.reason || item.explain || item.evidence || evidenceFeatureText(item));
}

function contributionNumber(item: Row) {
  const value = Number(item.share ?? item.contribution ?? item.weight ?? item.score ?? 0);
  return Number.isFinite(value) ? Math.abs(value) : 0;
}

const ignoredSingleMarkers = new Set(["的", "了", "是", "不", "在", "有", "和", "也", "就", "都", "又", "还", "吗", "呢", "啊", "呀", "吧", "着", "过", "把", "被", "对", "中", "上", "下", "里"]);

function evidenceKeyName(value: unknown) {
  return metricName(value || "");
}

function evidenceReplayTitle(item: Row) {
  return formatText(item.metricName || evidenceTypeName(item.type) || evidenceKeyName(item.key));
}

function evidenceDetailMessage(item: Row) {
  const raw = String(item.message || item.description || item.reason || evidenceKeyName(item.key) || "").trim();
  const type = String(item.type || "");
  const dictionary: Array<[RegExp, string]> = [
    [/text rhythm is unusually even/i, "文本节奏过于平滑，句段起伏不足，容易呈现机器生成的均质感。"],
    [/concrete action\/detail density is low/i, "具体动作与细节密度偏低，叙述更偏概括，缺少可验证的场景细节。"],
    [/词汇在样本基准中更偏向AI文/i, "该词汇在 AI 样本中相对人工样本更集中，需要结合上下文确认是否为模板化表达。"]
  ];
  const hit = dictionary.find(([pattern]) => pattern.test(raw));
  if (hit) return hit[1];
  if (type === "baseline_metric") {
    return `${formatText(item.metricName || "该指标")}与人工样本分布存在偏离，当前值为 ${formatNumber(item.value)}，人工分位 P${formatNumber(item.humanPercentile)}，AI 分位 P${formatNumber(item.aiPercentile)}。`;
  }
  if (type === "learned_word") return `命中检测词汇「${evidenceFeatureText(item)}」，该词在当前基准中属于 AI 高频词汇。`;
  if (type === "sensitive_word") return `命中违规词汇「${evidenceFeatureText(item)}」，仅作为平台审核风险提醒，不参与 AI 评分。`;
  if (type === "learned_pattern") return `命中 AI 偏向句形「${evidenceFeatureText(item)}」，需要结合上下文检查句形结构是否异常集中。`;
  if (type === "learned_feature") return `命中 AI 偏向特征「${evidenceFeatureText(item)}」，该特征与当前基准中的 AI 文样本更接近。`;
  return raw || evidenceReadableMessage(item) || `${evidenceTypeName(type)}对本段风险贡献 ${formatPercent(item.weight ?? item.contribution)}。`;
}

function markerCategoryForEvidence(item: Row) {
  const type = String(item.type || "");
  if (type === "learned_word") return "word";
  if (type === "sensitive_word") return "sensitive";
  if (type === "learned_pattern") return "feature";
  if (type === "learned_feature") return "feature";
  if (type === "low_information") return "low_information";
  return "";
}

function isUsefulMarkerText(value: unknown) {
  const text = String(value || "").trim();
  if (!text || text.length > 16 || text.length < 2) return false;
  if (ignoredSingleMarkers.has(text)) return false;
  if (/^[^\u4e00-\u9fa5A-Za-z0-9]+$/.test(text)) return false;
  return !/AI高频|命中|信息密度/.test(text);
}

function inlineMarkerTexts(item: Row) {
  const category = markerCategoryForEvidence(item);
  const feature = evidenceFeatureText(item);
  const base = feature && !/^(abstract_|connector_|repeated_|template_|smoothness|information_density|surface_pattern|paragraph_|sentence_)/.test(feature) ? [feature] : [];
  return category ? base : [];
}

function markerCategoryPriority(category: string) {
  return ({ sensitive: 40, word: 30, feature: 20, low_information: 10 } as Record<string, number>)[category] || 0;
}

function markerStrengthRank(value: unknown) {
  return ({ strong: 3, medium: 2, weak: 1 } as Record<string, number>)[String(value)] || 2;
}

function strongerMarkerStrength(left: string, right: string) {
  return markerStrengthRank(left) >= markerStrengthRank(right) ? left : right;
}

function normalizeReadingText(value: unknown) {
  return String(value ?? "");
}

function collectMarkerSpans(block: Row) {
  const sourceText = String(block.text || "");
  const candidates: Array<{ start: number; end: number; category: string; strength: string; priority: number; text: string }> = [];
  asRows(block.evidence || block.evidences || block.signals).forEach((item) => {
    if (item.direction && item.direction !== "ai" && item.type !== "sensitive_word") return;
    const rawCategory = markerCategoryForEvidence(item);
    if (!rawCategory) return;
    const category = rawCategory;
    const strength = evidenceStrengthClass(item.strength);
    inlineMarkerTexts(item).filter(isUsefulMarkerText).forEach((text) => {
      let start = sourceText.indexOf(text);
      while (start >= 0) {
        candidates.push({ start, end: start + text.length, category, strength, priority: markerCategoryPriority(category), text });
        start = sourceText.indexOf(text, start + text.length);
      }
    });
  });

  const selected: typeof candidates = [];
  candidates
    .sort((a, b) => b.priority - a.priority || b.end - b.start - (a.end - a.start) || a.start - b.start)
    .forEach((item) => {
      if (!selected.some((existing) => item.start < existing.end && existing.start < item.end)) selected.push(item);
    });

  const merged: typeof selected = [];
  selected
    .sort((a, b) => a.start - b.start)
    .forEach((item) => {
      const previous = merged[merged.length - 1];
      const gap = previous ? sourceText.slice(previous.end, item.start) : "";
      const mergedLength = previous ? item.end - previous.start : 0;
      if (previous && previous.category === item.category && gap.length <= 2 && !/[\r\n]/.test(gap) && mergedLength <= 24) {
        previous.end = item.end;
        previous.strength = strongerMarkerStrength(previous.strength, item.strength);
        previous.text = sourceText.slice(previous.start, previous.end);
      } else {
        merged.push({ ...item });
      }
    });

  return { spans: merged.slice(0, 16) };
}

function hasLowInformationEvidence(block: Row) {
  return asRows(block.evidence || block.evidences || block.signals).some((item) => String(item.type || "") === "low_information");
}

function blockHasMarkerCategory(block: Row, category: string) {
  if (category === "low_information") return hasLowInformationEvidence(block);
  return collectMarkerSpans(block).spans.some((item) => item.category === category);
}

function renderAnnotatedText(block: Row) {
  const sourceText = String(block.text || "");
  const { spans } = collectMarkerSpans(block);
  const lowInformation = hasLowInformationEvidence(block);
  let lineStart = 0;
  const lines = sourceText.split("\n");
  return lines.map((line, lineIndex) => {
    const lineEnd = lineStart + line.length;
    const lineSpans = spans.filter((item) => item.start < lineEnd && item.end > lineStart);
    const nodes: React.ReactNode[] = [];
    let cursor = lineStart;
    lineSpans.forEach((item, index) => {
      const start = Math.max(item.start, lineStart);
      const end = Math.min(item.end, lineEnd);
      if (start > cursor) nodes.push(sourceText.slice(cursor, start));
      nodes.push(
        <mark className={`detect-mark ${item.strength} mark-${item.category}`} key={`${lineIndex}-${item.start}-${index}`}>
          {sourceText.slice(start, end)}
        </mark>
      );
      cursor = end;
    });
    if (cursor < lineEnd) nodes.push(sourceText.slice(cursor, lineEnd));
    lineStart = lineEnd + 1;
    return (
      <span className={`detect-text-line${lowInformation ? " line-low-information" : ""}`} key={`${lineIndex}-${line.slice(0, 12)}`}>
        {nodes.length ? nodes : line}
      </span>
    );
  });
}

function DetectReport({ result, detailOpen, onCloseDetail, onClear }: { result: Row; detailOpen: boolean; onCloseDetail: () => void; onClear: () => void }) {
  const [selected, setSelected] = useState(0);
  const [detailTab, setDetailTab] = useState<"metrics" | "evidence" | "features" | "review">("metrics");
  const report = (result.report || result.summary || {}) as Row;
  const summary = (result.summary || {}) as Row;
  const blocks = asRows(result.blocks || result.paragraphs || result.segments).map((row, index) => {
    const blockScore = normalizeScore(row.aiScore ?? row.score ?? row.riskScore ?? 0);
    return {
      ...row,
      index: row.index ?? row.paragraphIndex ?? row.blockIndex ?? index + 1,
      text: normalizeReadingText(row.text ?? row.content ?? row.paragraphText ?? ""),
      displayScore: blockScore,
      riskLevel: riskLevelFromScore(blockScore, row.riskLevel)
    };
  }) as Row[];
  useEffect(() => {
    const topIndex = blocks.reduce((best, item, index) => (normalizeScore(item.displayScore) > normalizeScore(blocks[best]?.displayScore) ? index : best), 0);
    setSelected(topIndex || 0);
    setDetailTab("metrics");
  }, [result]);
  const current = (blocks[selected] || blocks[0] || {}) as Row;
  const isDocumentMode = blocks.length <= 1;
  const currentDisplayScore = normalizeScore(current.displayScore ?? current.aiScore ?? 0);
  const isLowRiskConclusion = currentDisplayScore <= (1 - 0.62) * 100;
  const rawEvidence = asRows(current.evidence || current.evidences || current.signals || result.evidence || result.evidences).map((row, index) => ({
    ...row,
    evidenceKey: `${row.type || "evidence"}-${row.key || row.metricName || index}-${index}`
  })) as Row[];
  const selectedEvidenceRows = isLowRiskConclusion ? [] : rawEvidence.slice(0, 12);
  const metricComparisons = asRows(result.metricComparisons || result.metrics || report.metricComparisons);
  const score = normalizeScore(report.score ?? summary.score ?? result.score ?? current.aiScore ?? 0);
  const reportComposition = ((report.composition || summary.composition || {}) as Row);
  const composition = {
    humanRatio: summary.humanRatio ?? reportComposition.humanRatio,
    suspiciousRatio: summary.suspiciousRatio ?? reportComposition.suspiciousRatio,
    aiRatio: summary.aiRatio ?? reportComposition.aiRatio
  } as Row;
  const documentRiskLevel = dominantCompositionRiskLevel(composition, score);
  const markerLegendItems = [
    { key: "word", label: "AI高频词汇", className: "legend-word" },
    { key: "feature", label: "AI偏向句形/特征", className: "legend-feature" },
    { key: "low_information", label: "低信息句", className: "legend-low-information" },
    { key: "sensitive", label: "违规词汇", className: "legend-sensitive" }
  ].filter((item) => blocks.some((block) => blockHasMarkerCategory(block, item.key)));
  const riskSources = isLowRiskConclusion ? [] : (asRows(report.riskSources).length
    ? asRows(report.riskSources)
    : ["baseline_metric", "learned_word", "learned_pattern", "learned_feature", "structure"].map((type) => {
      const rows = rawEvidence.filter((item) => (type === "structure" ? !["baseline_metric", "learned_word", "learned_pattern", "learned_feature"].includes(String(item.type)) : item.type === type));
      const value = rows.reduce((sum, item) => sum + contributionNumber(item), 0);
      return { key: type, label: evidenceTypeName(type), share: value };
    }).filter((item) => item.share > 0)) as Row[];
  const sourceTotal = Math.max(0.0001, riskSources.reduce((sum, item) => sum + contributionNumber(item), 0));
  const sourceRows = riskSources.map((item) => ({ ...item, share: contributionNumber(item) / sourceTotal })).slice(0, 6) as Row[];
  const featureRows = rawEvidence.filter((item) => ["learned_word", "learned_pattern", "learned_feature"].includes(String(item.type))).slice(0, 12);
  const reviewSteps = asRows(report.reviewSteps).map((item) => formatText(item)).filter(Boolean);
  const baselineReady = result.baselineReady !== false;
  const primaryEvidence = [...selectedEvidenceRows].sort((a, b) => markerStrengthRank(b.strength) + Number(b.weight || 0) - (markerStrengthRank(a.strength) + Number(a.weight || 0)))[0];
  const scoreBreakdownRows = asRows(current.scoreBreakdown);
  const scoreBreakdown = scoreBreakdownRows.length ? scoreBreakdownRows : [
    { key: "baseline", label: "基准主分", value: current.baselineScore ?? current.baselineDeviationScore },
    { key: "feature", label: "AI证据校准", value: 0, delta: 0 },
    { key: "heuristic", label: "结构校准", value: 0, delta: 0 }
  ];
  const displayMetricComparisons = dedupeMetricRowsByDisplayName(metricComparisons.map((row): Row => ({
    ...row,
    metricName: metricName(metricKeyWithoutScope(row.metricKey ?? row.metricName)),
    displayName: scoringMetricDisplayName(row)
  })), true);
  const detectScoringRadarRows = dedupeMetricRowsByDisplayName(metricComparisons
    .filter((row) => {
      const currentValue = Number(row.currentValue ?? row.current ?? row.value);
      const ai = Number(row.aiAverage ?? row.aiMean);
      const human = Number(row.humanAverage ?? row.humanMean);
      const scoreWeight = Number(row.scoreWeight ?? row.contribution ?? 0);
      const isScoreEligible = row.scoreEligible === true || row.scoreEligible === undefined;
      return isScoreEligible && scoreWeight > 0 && Number.isFinite(currentValue) && Number.isFinite(ai) && Number.isFinite(human);
    })
    .sort((a, b) => {
      const weightDiff = Number(b.scoreWeight ?? 0) - Number(a.scoreWeight ?? 0);
      if (weightDiff !== 0) return weightDiff;
      return Number(b.contribution ?? 0) - Number(a.contribution ?? 0);
    })
    .map((row): Row => ({
      ...row,
      metricName: metricName(metricKeyWithoutScope(row.metricKey ?? row.metricName)),
      displayName: scoringMetricDisplayName(row)
    })), true);

  useEffect(() => {
    if (detailTab !== "metrics" || metricComparisons.length) return;
    if (selectedEvidenceRows.length) {
      setDetailTab("evidence");
    } else if (featureRows.length) {
      setDetailTab("features");
    } else if (reviewSteps.length) {
      setDetailTab("review");
    }
  }, [detailTab, metricComparisons.length, selectedEvidenceRows.length, featureRows.length, reviewSteps.length]);

  return (
    <div className="aitext-detect-report-page">
      <div className="aitext-detect-kpis">
        <article className="composition-card">
          <span>文本占比</span>
          <DetectCompositionDonut composition={composition} score={score} />
        </article>
      </div>

      {!baselineReady ? <div className="aitext-detect-warning">{formatText((result.baselineStatus as Row)?.message || "当前 AI/人工评分基准不足，综合分暂以辅助证据估算。")}</div> : null}

      <div className="aitext-detect-main">
        <section className="detect-article-panel">
          <div className="detect-legend-row">
            <span>高频标记：</span>
            {markerLegendItems.length ? markerLegendItems.map((item) => (
              <span className={`legend-pill ${item.className}`} key={item.key}>{item.label}</span>
            )) : <span className="text-muted">暂无</span>}
            <button type="button" className="detect-report-clear-button" onClick={onClear}>清空</button>
          </div>
          <div className={`detect-blocks ${isDocumentMode ? "is-single" : ""}`}>
            {blocks.length ? blocks.map((block, index) => {
              const level = isDocumentMode ? documentRiskLevel : riskLevelFromScore(block.displayScore, block.riskLevel);
              if (isDocumentMode) {
                return (
                  <article key={`${block.index}-${index}`} className={`detect-block risk-${level}`}>
                    <p>{renderAnnotatedText(block)}</p>
                  </article>
                );
              }
              return (
                <button key={`${block.index}-${index}`} className={`detect-block ${selected === index ? "active" : ""} risk-${level}`} type="button" onClick={() => setSelected(index)}>
                  <p>{renderAnnotatedText(block)}</p>
                </button>
              );
            }) : <div className="aitext-empty">暂无正文</div>}
          </div>
        </section>

        <aside className="detect-side-panel" key={`side-${formatText(result.id || result.taskId || "preview")}-${selected}`}>
          {detectScoringRadarRows.length ? (
            <section className="detect-side-section detect-metric-radar-card">
              <header><strong>评分项雷达</strong><span>蓝色为待测文本</span></header>
              <MetricRadarD3 rows={detectScoringRadarRows} compact showCurrent hideScopePrefix />
            </section>
          ) : null}
          <div className={`detect-current-card ${riskClassName(current.riskLevel, current.displayScore)}`}>
            <div>
              <strong>{isDocumentMode ? "整章痕迹链" : `第${formatText(current.index || selected + 1)}块痕迹链`}</strong>
              <span>{isDocumentMode ? "当前检测全文" : "当前选取文本块"}</span>
            </div>
            <b>{riskName(current.riskLevel)}风险</b>
          </div>
          <div className="detect-block-score-line">
            <span>{isDocumentMode ? "整章得分" : "块得分"}</span>
            <b>{formatNumber(current.displayScore, 0)}</b>
            <em>/ 100</em>
          </div>
          <div className="detect-score-breakdown">
            {scoreBreakdown.map((item) => (
              <div key={String(item.key || item.label)}>
                <span>{formatText(item.label)}</span>
                {"delta" in item ? (
                  <strong className={Number(item.delta) > 0 ? "is-positive" : Number(item.delta) < 0 ? "is-negative" : ""}>{formatSignedPercent(item.delta)}</strong>
                ) : (
                  <strong>{formatPercent(item.value ?? 0)}</strong>
                )}
                {item.description ? <em>{formatText(item.description)}</em> : null}
              </div>
            ))}
          </div>
          <section className="detect-side-section">
            <header><strong>风险来源聚合</strong><span>按贡献排序</span></header>
            <div className="detect-risk-bars">
              {sourceRows.map((item, index) => (
                <div key={String(item.key || index)}>
                  <b>{index + 1}</b>
                  <span>{formatText(item.label || evidenceTypeName(item.key || item.type))}</span>
                  <i><em style={{ width: `${Math.min(100, Math.max(6, Number(item.share) * 100))}%` }} /></i>
                  <b>{formatPercent(item.share)}</b>
                </div>
              ))}
              {!sourceRows.length ? <div className="aitext-empty">暂无风险来源</div> : null}
            </div>
          </section>
          <section className="detect-side-section indicator-card">
            <header><strong>指标解释</strong><span>{primaryEvidence ? evidenceStrengthName(primaryEvidence.strength) : "暂无强痕迹"}</span></header>
            {primaryEvidence ? (
              <>
                <h4>{formatText(primaryEvidence.metricName || evidenceTypeName(primaryEvidence.type))}</h4>
                <div className="indicator-stat-grid">
                  <div><span>当前值</span><strong>{formatNumber(primaryEvidence.value)}</strong></div>
                  <div><span>人工分位</span><strong>P{formatNumber(primaryEvidence.humanPercentile)}</strong></div>
                  <div><span>AI分位</span><strong>P{formatNumber(primaryEvidence.aiPercentile)}</strong></div>
                </div>
                <p>{evidenceDetailMessage(primaryEvidence)}</p>
              </>
            ) : (
              <p>当前块没有返回可解释指标，建议结合上下文和人工复核判断。</p>
            )}
          </section>
          <section className="detect-side-section">
            <header><strong>痕迹回放</strong><span>{isDocumentMode ? "针对全文" : "针对当前块"}</span></header>
            <div className="detect-evidence-stack">
              {selectedEvidenceRows.slice(0, 4).map((item, index) => (
                <div className={evidenceStrengthClass(item.strength)} key={String(item.evidenceKey || index)}>
                  <b>{index + 1}</b>
                  <span>
                    <strong>{evidenceReplayTitle(item)}</strong>
                    <em>{evidenceDetailMessage(item)}</em>
                  </span>
                </div>
              ))}
              {!rawEvidence.length ? <div className="aitext-empty">{isDocumentMode ? "暂无全文痕迹" : "暂无当前块痕迹"}</div> : null}
            </div>
          </section>
          <div className="detect-note">
            <strong>检测结果用于定位 AI 痕迹，不作为唯一判定依据</strong>
            <span>请结合人工复核、上下文场景和作者稳定风格综合判断。</span>
          </div>
        </aside>
      </div>

      {detailOpen ? (
        <div className="confirm-mask">
          <section className="crud-modal aitext-detect-modal report-mode detect-detail-modal">
            <header>
              <div className="aitext-detect-title">
                <strong>详细报告</strong>
                <span>指标对照、痕迹明细、高频特征与可信度说明</span>
              </div>
              <button className="icon-button" type="button" onClick={onCloseDetail}>
                <X size={18} />
              </button>
            </header>
            <section className="detect-detail-panel">
              <div className="detect-detail-tabs">
                {[
                  ["metrics", "指标对照"],
                  ["evidence", "痕迹明细"],
                  ["features", "高频特征"],
                  ["review", "可信度说明"]
                ].map(([key, label]) => (
                  <button className={detailTab === key ? "active" : ""} type="button" key={key} onClick={() => setDetailTab(key as typeof detailTab)}>{label}</button>
                ))}
              </div>
              {detailTab === "metrics" ? (
                <DataTable columns={[
                  { key: "metricKey", title: "指标", width: 220, render: (row) => stripMetricScopePrefix(metricDisplayName(row)) },
                  { key: "currentValue", title: "当前值", width: 120, render: (row) => formatNumber(row.currentValue ?? row.value) },
                  { key: "aiAverage", title: "AI均值", width: 120, render: (row) => formatNumber(row.aiAverage ?? row.aiMean) },
                  { key: "humanAverage", title: "人工均值", width: 120, render: (row) => formatNumber(row.humanAverage ?? row.humanMean) },
                  { key: "percentile", title: "分位对照", width: 220, render: (row) => `人工P${formatNumber(row.humanPercentile)} / AIP${formatNumber(row.aiPercentile)}` },
                  { key: "contribution", title: "贡献", width: 100, render: (row) => formatPercent(row.contribution ?? row.weight) },
                  { key: "strength", title: "强度", width: 100, render: (row) => evidenceStrengthName(row.strength) },
                  { key: "explain", title: "解释", width: 360, render: (row) => formatText(row.explain || row.description || row.reason || row.message) }
                ]} rows={displayMetricComparisons} minWidth={1380} />
              ) : detailTab === "evidence" ? (
                <DataTable columns={[
                  { key: "type", title: "痕迹类型", width: 140, render: (row) => evidenceTypeName(row.type) },
                  { key: "message", title: "痕迹内容", width: 800, render: evidenceDetailMessage },
                  { key: "strength", title: "强度", width: 100, render: (row) => evidenceStrengthName(row.strength) },
                  { key: "weight", title: "贡献", width: 100, render: (row) => formatPercent(row.weight ?? row.contribution) },
                  { key: "value", title: "当前值", width: 100, render: (row) => formatNumber(row.value) },
                  { key: "percentile", title: "分位对照", width: 220, render: (row) => `人工P${formatNumber(row.humanPercentile)} / AIP${formatNumber(row.aiPercentile)}` },
                  { key: "key", title: "特征键", width: 240, render: (row) => evidenceFeatureText(row) || evidenceKeyName(row.key) }
                ]} rows={selectedEvidenceRows} minWidth={1160} />
              ) : detailTab === "features" ? (
                <DataTable columns={[
                  { key: "type", title: "类型", width: 140, render: (row) => evidenceTypeName(row.type) },
                  { key: "feature", title: "特征", width: 260, render: evidenceFeatureText },
                  { key: "message", title: "说明", width: 420, render: evidenceDetailMessage },
                  { key: "strength", title: "强度", width: 100, render: (row) => evidenceStrengthName(row.strength) },
                  { key: "weight", title: "贡献", width: 100, render: (row) => formatPercent(row.weight ?? row.contribution) }
                ]} rows={featureRows} minWidth={1020} />
              ) : (
                <div className="detect-review-steps">
                  {(reviewSteps.length ? reviewSteps : ["综合分优先按评分项加权计算。", "词汇、句式、结构启发仅作为解释证据。", "检测结果仅用于定位疑似 AI 痕迹。"]).map((step, index) => (
                    <div key={step}><b>{index + 1}</b><span>{step}</span></div>
                  ))}
                </div>
              )}
            </section>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default function AiTextPage() {
  const [activeTab, setActiveTab] = useState<MainTab>(() => (localStorage.getItem("wse.aitext.activeTab") as MainTab) || "tasks");
  const [taskState, setTaskState] = useState<DataState>(() => ({
    ...buildPageState(),
    filters: { fileName: "", sourceType: "all", status: "all" }
  }));
  const [datasets, setDatasets] = useState<Record<string, DataState>>({});
  const [summary, setSummary] = useState<Row>({});
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [radarZoomed, setRadarZoomed] = useState(false);
  const [baseline, setBaseline] = useState<Row>({});
  const [baselineRows, setBaselineRows] = useState<Row[]>([]);
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [baselineConfirmOpen, setBaselineConfirmOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [batchPages, setBatchPages] = useState(1);
  const [taskConcurrency, setTaskConcurrency] = useState(1);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [taskBusy, setTaskBusy] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadDeduped, setUploadDeduped] = useState(false);
  const [uploadSourceType, setUploadSourceType] = useState("ai");
  const [uploadChars, setUploadChars] = useState(2000);
  const [detectOpen, setDetectOpen] = useState(false);
  const [detectText, setDetectText] = useState("");
  const [detectResult, setDetectResult] = useState<Row | null>(null);
  const [detectLoading, setDetectLoading] = useState(false);
  const [detectDetailOpen, setDetectDetailOpen] = useState(false);
  const [chunkTask, setChunkTask] = useState<Row | null>(null);
  const [chunkState, setChunkState] = useState<DataState>(() => ({ ...buildPageState(), filters: { status: "all" } }));
  const [jobOpen, setJobOpen] = useState(false);
  const [jobState, setJobState] = useState<DataState>(() => ({ ...buildPageState(), filters: { jobType: "all", status: "all", targetId: "" } }));
  const [corpusDetail, setCorpusDetail] = useState<Row | null>(null);
  const [corpusDetailLoading, setCorpusDetailLoading] = useState(false);
  const [taskErrorDetail, setTaskErrorDetail] = useState<Row | null>(null);
  const [sensitiveAddOpen, setSensitiveAddOpen] = useState(false);
  const [sensitiveAddBusy, setSensitiveAddBusy] = useState(false);
  const [sensitiveAddForm, setSensitiveAddForm] = useState({ word: "", replacement: "", remark: "", enabled: 1 });
  const [sensitiveExtractOpen, setSensitiveExtractOpen] = useState(false);
  const [sensitiveExtractBusy, setSensitiveExtractBusy] = useState(false);
  const [sensitiveExtractContent, setSensitiveExtractContent] = useState("");
  const [sensitiveExtractModel, setSensitiveExtractModel] = useState("");
  const [sensitiveExtractModelOptions, setSensitiveExtractModelOptions] = useState<ModelOption[]>([]);
  const [sensitiveExtractModelLoading, setSensitiveExtractModelLoading] = useState(false);
  const [sensitiveExtractCandidates, setSensitiveExtractCandidates] = useState<string[]>([]);
  const [sensitiveExtractResult, setSensitiveExtractResult] = useState<Row | null>(null);
  const detectPlatformChars = useMemo(() => countNovelPlatformChars(detectText), [detectText]);
  const detectSentenceCount = useMemo(() => countSentences(detectText), [detectText]);

  const tableAction = async (endpoint: string, payload: Row, success: string) => {
    const resp = await postReq(endpoint, payload);
    if (resp.code === 0 || resp.code === undefined) {
      notify({ type: "success", title: "操作成功", message: success });
      await loadTasks(true);
    }
  };

  const deleteTask = async (row: Row) => {
    const confirmed = await confirmAction({
      title: "确认删除任务",
      message: "删除任务及其全部研究数据，且不可恢复，确认继续？",
      confirmText: "确认删除",
      tone: "danger"
    });
    if (!confirmed) return;
    await tableAction("/check/aitext/task/delete", { id: row.id }, "任务已加入删除队列");
  };

  const updateTaskSource = async (row: Row, sourceType: string) => {
    const resp = await postReq("/check/aitext/task/source", { id: row.id, sourceType });
    if (resp.code === 0 || resp.code === undefined) {
      notify({ type: "success", title: "类型已更新", message: "任务样本类型已同步" });
      await loadTasks(true);
    }
  };

  const selectedTaskIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
  const selectableTaskIds = useMemo(() => taskState.rows
    .filter((row) => canExecute(row) || canStop(row) || canRollback(row))
    .map((row) => String(row.id || ""))
    .filter(Boolean), [taskState.rows]);
  const selectedTaskRows = useMemo(() => taskState.rows.filter((row) => selectedTaskIdSet.has(String(row.id || ""))), [selectedTaskIdSet, taskState.rows]);
  const executableSelectedRows = useMemo(() => selectedTaskRows.filter(canExecute), [selectedTaskRows]);
  const stoppableSelectedRows = useMemo(() => selectedTaskRows.filter(canStop), [selectedTaskRows]);
  const rollbackableSelectedRows = useMemo(() => selectedTaskRows.filter(canRollback), [selectedTaskRows]);
  const currentPageAllSelected = selectableTaskIds.length > 0 && selectableTaskIds.every((id) => selectedTaskIdSet.has(id));
  const toggleTaskSelected = (id: string, checked: boolean) => {
    setSelectedTaskIds((ids) => {
      if (checked) return ids.includes(id) ? ids : [...ids, id];
      return ids.filter((item) => item !== id);
    });
  };
  const toggleCurrentPageSelected = (checked: boolean) => {
    setSelectedTaskIds((ids) => {
      if (!checked) return ids.filter((id) => !selectableTaskIds.includes(id));
      const next = new Set(ids);
      selectableTaskIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };

  const loadSensitiveExtractModels = async () => {
    setSensitiveExtractModelLoading(true);
    try {
      const [optionResp, modelResp] = await Promise.all([
        postReq<ModelOption[]>("/check/chat/param/option", {}),
        postReq<{ model?: string }>("/check/chat/param/model", {})
      ]);
      const options = Array.isArray(optionResp.data)
        ? optionResp.data
            .map((item) => ({
              value: String(item.value || item.label || ""),
              label: String(item.label || item.value || "")
            }))
            .filter((item) => item.value && item.label)
        : [];
      const defaultModel = String(modelResp.data?.model || "");
      const hasDefault = defaultModel && options.some((item) => item.value === defaultModel);
      const nextOptions = defaultModel && !hasDefault ? [{ value: defaultModel, label: defaultModel }, ...options] : options;
      setSensitiveExtractModelOptions(nextOptions);
      setSensitiveExtractModel((current) => current || defaultModel || nextOptions[0]?.value || "");
      if (!nextOptions.length) {
        notify({ type: "warning", title: "暂无模型", message: "请先在前台模型配置中添加并启用模型。" });
      }
    } finally {
      setSensitiveExtractModelLoading(false);
    }
  };

  const taskColumns: Column[] = [
    {
      key: "selection",
      title: "选择",
      width: 52,
      header: (
        <span className="aitext-select-cell">
          <input
            type="checkbox"
            aria-label="选择当前页任务"
            checked={currentPageAllSelected}
            disabled={!selectableTaskIds.length}
            onChange={(event) => toggleCurrentPageSelected(event.target.checked)}
          />
        </span>
      ),
      render: (row) => {
        const id = String(row.id || "");
        const disabled = !id || !(canExecute(row) || canStop(row) || canRollback(row));
        return (
          <span className="aitext-select-cell">
            <input
              type="checkbox"
              aria-label={`选择任务 ${id}`}
              checked={selectedTaskIdSet.has(id)}
              disabled={disabled}
              onChange={(event) => toggleTaskSelected(id, event.target.checked)}
            />
          </span>
        );
      }
    },
    { key: "id", title: "任务ID", width: 86 },
    { key: "fileName", title: "文件"},
    {
      key: "sourceType",
      title: "类型",
      width: 120,
      render: (row) => {
        const locked = busyStatuses.has(String(row.status || "")) || Number(row.nextPageIndex || 0) > 0;
        return (
          <AppSelect
            className="aitext-inline-select"
            value={String(row.sourceType || "ai")}
            options={[
              { value: "ai", label: "AI文" },
              { value: "human", label: "人工文" }
            ]}
            onChange={(value) => void updateTaskSource(row, value)}
            disabled={locked}
          />
        );
      }
    },
    { key: "status", title: "状态", width: 110, render: (row) => <SmallBadge tone={statusClass(row.status)}>{taskStatusName(row.status)}</SmallBadge> },
    {
      key: "progress",
      title: "进度",
      width: 170,
      render: (row) => (
        <div className="aitext-progress">
          <i style={{ width: `${taskProgress(row)}%` }} />
          <span>{taskProgress(row)}%</span>
        </div>
      )
    },
    { key: "chunkType", title: "分块类型", width: 96, render: (row) => chunkTypeName(row.chunkType) },
    { key: "pageCount", title: "分块", width: 80 },
    { key: "executionPoint", title: "执行位置", width: 230, render: executionPoint },
    { key: "pageTargetChars", title: "兜底字数", width: 100 },
    { key: "charCount", title: "字数", width: 95 },
    { key: "paragraphCount", title: "段落", width: 80 },
    { key: "corpusCount", title: "语料", width: 80 },
    { key: "wordCount", title: "词汇", width: 80 },
    { key: "patternCount", title: "句式", width: 80 },
    { key: "featureCount", title: "特征", width: 80 },
    { key: "createdAt", title: "创建时间", width: 180, render: (row) => formatTime(row.createdAt ?? row.createTime) },
    { key: "updatedAt", title: "更新时间", width: 180, render: (row) => formatTime(row.updatedAt ?? row.updateTime) },
    {
      key: "errorMessage",
      title: "错误",
      width: 120,
      render: (row) => row.errorMessage ? <button onClick={() => setTaskErrorDetail(row)}>查看错误</button> : "-"
    },
    {
      key: "action",
      title: "操作",
      width: 410,
      render: (row) => (
        <div className="aitext-row-actions">
          <button disabled={!canExecute(row) || taskBusy} onClick={() => executeTask(row)}>
            开始执行
          </button>
          <button disabled={!canStop(row) || taskBusy} onClick={() => void stopTasks([String(row.id || "")])}>
            停止
          </button>
          <button onClick={() => openChunkLog(row)}>块日志</button>
          {String(row.status) === "processing" ? <button onClick={() => void tableAction("/check/aitext/task/unlock", { id: row.id }, "任务已解锁")}>解锁</button> : null}
          <button disabled={!canRollback(row)} onClick={() => void tableAction("/check/aitext/task/rollback", { id: row.id }, "任务已加入撤回队列")}>
            撤回
          </button>
          <button className="danger-text" disabled={!canDelete(row)} onClick={() => void deleteTask(row)}>
            删除
          </button>
        </div>
      )
    }
  ];

  const datasetConfigs = useMemo<Record<DatasetKey, DatasetConfig>>(
    () => ({
      word: {
        key: "word",
        label: "词汇",
        endpoint: "/check/aitext/word/page",
        search: [
          { key: "word", label: "词汇", placeholder: "搜索词汇" },
          { key: "isFilter", label: "过滤", type: "select", options: [{ label: "全部", value: -1 }, { label: "保留", value: 0 }, { label: "过滤", value: 1 }] },
          { key: "isBlacklist", label: "拉黑", type: "select", options: [{ label: "全部", value: -1 }, { label: "正常", value: 0 }, { label: "拉黑", value: 1 }] },
          { key: "sourceBias", label: "来源", type: "select", options: [{ label: "全部来源", value: "all" }, { label: "AI偏高", value: "ai" }, { label: "人工偏高", value: "human" }, { label: "均衡", value: "neutral" }] }
        ],
        columns: [
          { key: "word", title: "词汇" },
          { key: "collectCount", title: "总次数"},
          { key: "aiCount", title: "AI次数"},
          { key: "humanCount", title: "人工次数"},
          { key: "aiFrequency", title: "AI频率", render: (row) => formatNumber(row.aiFrequency) },
          { key: "humanFrequency", title: "人工频率", render: (row) => formatNumber(row.humanFrequency) },
          { key: "frequencyDiff", title: "频率差", render: (row) => <span className={Number(row.frequencyDiff) >= 0 ? "text-ai" : "text-human"}>{formatNumber(row.frequencyDiff)}</span> },
          { key: "isFilter", title: "过滤", render: (row) => <SwitchCell checked={row.isFilter === 1} disabled={row.isLock === 1 || row.isBlacklist === 1} onChange={(checked) => updateFilterLike("word", row, "filter", checked)} /> },
          { key: "isLock", title: "锁定", render: (row) => <SwitchCell checked={row.isLock === 1} disabled={row.isBlacklist === 1} onChange={(checked) => updateFilterLike("word", row, "lock", checked)} /> },
          { key: "isBlacklist", title: "拉黑",  render: (row) => <SwitchCell checked={row.isBlacklist === 1} onChange={(checked) => updateFilterLike("word", row, "blacklist", checked)} /> },
          { key: "action", title: "操作", render: (row) => <button className="danger-text" onClick={() => void deleteWordPattern("word", row)}>删除</button> }
        ]
      },
      detectionWord: {
        key: "detectionWord",
        label: "检测词汇",
        endpoint: "/check/aitext/detection/word/page",
        search: [
          { key: "word", label: "词汇", placeholder: "搜索检测词汇" },
          { key: "isFilter", label: "过滤", type: "select", options: [{ label: "全部", value: -1 }, { label: "保留", value: 0 }, { label: "过滤", value: 1 }] },
          { key: "isBlacklist", label: "拉黑", type: "select", options: [{ label: "全部", value: -1 }, { label: "正常", value: 0 }, { label: "拉黑", value: 1 }] },
          { key: "sourceBias", label: "来源", type: "select", options: [{ label: "全部来源", value: "all" }, { label: "AI偏高", value: "ai" }, { label: "人工偏高", value: "human" }, { label: "均衡", value: "neutral" }] }
        ],
        columns: [
          { key: "word", title: "词汇" },
          { key: "score", title: "检测分", width: 100, render: (row) => formatNumber(row.score) },
          { key: "collectCount", title: "总次数", width: 90 },
          { key: "aiCount", title: "AI次数", width: 90 },
          { key: "humanCount", title: "人工次数", width: 100 },
          { key: "aiFrequency", title: "AI频率", width: 100, render: (row) => formatNumber(row.aiFrequency) },
          { key: "humanFrequency", title: "人工频率", width: 110, render: (row) => formatNumber(row.humanFrequency) },
          { key: "frequencyDiff", title: "频率差", width: 100, render: (row) => <span className={Number(row.frequencyDiff) >= 0 ? "text-ai" : "text-human"}>{formatNumber(row.frequencyDiff)}</span> },
          { key: "frequencyRatio", title: "频率比", width: 100, render: (row) => formatNumber(row.frequencyRatio) },
          { key: "confidence", title: "置信度", width: 100, render: (row) => formatPercent(row.confidence) },
          { key: "isFilter", title: "过滤", width: 100, render: (row) => <SwitchCell checked={row.isFilter === 1} disabled={row.isLock === 1 || row.isBlacklist === 1} onChange={(checked) => updateFilterLike("detectionWord", row, "filter", checked)} /> },
          { key: "isLock", title: "锁定", width: 100, render: (row) => <SwitchCell checked={row.isLock === 1} disabled={row.isBlacklist === 1} onChange={(checked) => updateFilterLike("detectionWord", row, "lock", checked)} /> },
          { key: "isBlacklist", title: "拉黑", width: 100, render: (row) => <SwitchCell checked={row.isBlacklist === 1} onChange={(checked) => updateFilterLike("detectionWord", row, "blacklist", checked)} /> },
          { key: "action", title: "操作", width: 90, render: (row) => <button className="danger-text" onClick={() => void deleteWordPattern("detectionWord", row)}>删除</button> }
        ]
      },
      sensitiveWord: {
        key: "sensitiveWord",
        label: "违规词",
        endpoint: "/check/aitext/sensitive/word/page",
        toolbarExtra: (
          <>
            <button onClick={() => {
              setSensitiveAddForm({ word: "", replacement: "", remark: "", enabled: 1 });
              setSensitiveAddOpen(true);
            }}>
              <Plus size={18} /> 新增
            </button>
            <button onClick={() => {
              setSensitiveExtractContent("");
              setSensitiveExtractModel("");
              setSensitiveExtractCandidates([]);
              setSensitiveExtractResult(null);
              setSensitiveExtractOpen(true);
            }}>
              <WandSparkles size={18} /> AI提取
            </button>
          </>
        ),
        search: [
          { key: "word", label: "违规词", placeholder: "搜索违规词" },
          { key: "enabled", label: "启用", type: "select", options: [{ label: "全部", value: -1 }, { label: "启用", value: 1 }, { label: "停用", value: 0 }] }
        ],
        columns: [
          { key: "word", title: "违规词" },
          { key: "replacement", title: "建议替换", width: 180, render: (row) => formatText(row.replacement || "-") },
          { key: "remark", title: "备注", width: 360, render: (row) => formatText(row.remark || "-") },
          { key: "enabled", title: "启用", width: 100, render: (row) => <SwitchCell checked={row.enabled === 1} onChange={(checked) => updateSensitiveWordEnabled(row, checked)} /> },
          { key: "updateTime", title: "更新时间", width: 180, render: (row) => formatTime(row.updateTime) },
          { key: "action", title: "操作", width: 90, render: (row) => <button className="danger-text" onClick={() => void deleteWordPattern("sensitiveWord", row)}>删除</button> }
        ]
      },
      pattern: {
        key: "pattern",
        label: "句式",
        endpoint: "/check/aitext/pattern/page",
        search: [
          { key: "pattern", label: "句式", placeholder: "搜索句式" },
          { key: "isFilter", label: "过滤", type: "select", options: [{ label: "全部", value: -1 }, { label: "保留", value: 0 }, { label: "过滤", value: 1 }] },
          { key: "isBlacklist", label: "拉黑", type: "select", options: [{ label: "全部", value: -1 }, { label: "正常", value: 0 }, { label: "拉黑", value: 1 }] },
          { key: "sourceBias", label: "来源", type: "select", options: [{ label: "全部来源", value: "all" }, { label: "AI偏高", value: "ai" }, { label: "人工偏高", value: "human" }, { label: "均衡", value: "neutral" }] }
        ],
        columns: [
          { key: "pattern", title: "句式"},
          { key: "collectCount", title: "总次数", width: 90 },
          { key: "aiCount", title: "AI次数", width: 90 },
          { key: "humanCount", title: "人工次数", width: 100 },
          { key: "aiFrequency", title: "AI频率", width: 100, render: (row) => formatNumber(row.aiFrequency) },
          { key: "humanFrequency", title: "人工频率", width: 110, render: (row) => formatNumber(row.humanFrequency) },
          { key: "frequencyDiff", title: "频率差", width: 100, render: (row) => <span className={Number(row.frequencyDiff) >= 0 ? "text-ai" : "text-human"}>{formatNumber(row.frequencyDiff)}</span> },
          { key: "isFilter", title: "过滤", width: 100, render: (row) => <SwitchCell checked={row.isFilter === 1} disabled={row.isLock === 1 || row.isBlacklist === 1} onChange={(checked) => updateFilterLike("pattern", row, "filter", checked)} /> },
          { key: "isLock", title: "锁定", width: 100, render: (row) => <SwitchCell checked={row.isLock === 1} disabled={row.isBlacklist === 1} onChange={(checked) => updateFilterLike("pattern", row, "lock", checked)} /> },
          { key: "isBlacklist", title: "拉黑", width: 100, render: (row) => <SwitchCell checked={row.isBlacklist === 1} onChange={(checked) => updateFilterLike("pattern", row, "blacklist", checked)} /> },
          { key: "action", title: "操作", width: 90, render: (row) => <button className="danger-text" onClick={() => void deleteWordPattern("pattern", row)}>删除</button> }
        ]
      },
      feature: dataset("feature", "/check/aitext/novel/feature/page", "特征", [
        { key: "featureText", label: "特征", placeholder: "搜索特征" },
        { key: "featureType", label: "类型", type: "select", options: featureTypeOptions },
        { key: "sourceBias", label: "来源", type: "select", options: [{ label: "全部来源", value: "all" }, { label: "AI偏高", value: "ai" }, { label: "人工偏高", value: "human" }] }
      ], [
        { key: "featureType", title: "类型", render: (row) => featureTypeName(row.featureType) },
        { key: "featureText", title: "特征"},
        { key: "collectCount", title: "总次数", width: 90 },
        { key: "aiCount", title: "AI次数", width: 90 },
        { key: "humanCount", title: "人工次数", width: 100 },
        { key: "aiDocCount", title: "AI文档", width: 90 },
        { key: "humanDocCount", title: "人工文档", width: 100 },
        { key: "aiFrequency", title: "AI频率", width: 100, render: (row) => formatNumber(row.aiFrequency) },
        { key: "humanFrequency", title: "人工频率", width: 110, render: (row) => formatNumber(row.humanFrequency) },
        { key: "frequencyDiff", title: "频率差", width: 100, render: (row) => <span className={Number(row.frequencyDiff) >= 0 ? "text-ai" : "text-human"}>{formatNumber(row.frequencyDiff)}</span> },
        { key: "effectSize", title: "效应量", width: 100, render: (row) => formatNumber(row.effectSize) },
        { key: "adjustedPValue", title: "FDR", width: 90, render: (row) => formatNumber(row.adjustedPValue, 4) }
      ]),
      baseline: dataset("baseline", "/check/aitext/baseline/page", "检测基准", [
        { key: "metricKey", label: "指标", placeholder: "搜索指标" },
        { key: "scopeType", label: "层级", type: "select", options: [{ label: "全部层级", value: "all" }, { label: "语料块", value: "corpus" }, { label: "段落", value: "paragraph" }, { label: "句子", value: "sentence" }] },
        { key: "baselineVersion", label: "版本", placeholder: "默认 baseline-v2" }
      ], [
        { key: "scopeType", title: "层级", width: 90, render: (row) => scopeTypeName(row.scopeType) },
        { key: "metricKey", title: "指标", width: 240, render: (row) => metricName(row.metricKey) },
        { key: "scoreWeight", title: "评分权重", width: 100, render: (row) => formatPercent(row.scoreWeight) },
        {
          key: "direction",
          title: "均值偏向",
          width: 100,
          render: (row) => {
            const ai = Number(row.aiMeanValue || 0);
            const human = Number(row.humanMeanValue || 0);
            if (ai === human) return "-";
            return <SmallBadge tone={ai > human ? "ai" : "human"}>{ai > human ? "AI高" : "人工高"}</SmallBadge>;
          }
        },
        {
          key: "useType",
          title: "用途",
          width: 110,
          render: (row) => <SwitchCell checked={row.scoreEligible === true} onChange={(checked) => updateBaselineScoreEnabled(row, checked)} />
        },
        { key: "scoreReason", title: "原因"},
        { key: "metricCode", title: "指标键", width: 260, render: (row) => formatText(row.metricKey) },
        { key: "aiSampleCount", title: "AI样本", width: 100 },
        { key: "humanSampleCount", title: "人工样本", width: 100 },
        { key: "aiMeanValue", title: "AI均值", width: 100, render: (row) => formatNumber(row.aiMeanValue) },
        { key: "humanMeanValue", title: "人工均值", width: 110, render: (row) => formatNumber(row.humanMeanValue) },
        { key: "aiStdValue", title: "AI标准差", width: 110, render: (row) => formatNumber(row.aiStdValue) },
        { key: "humanStdValue", title: "人工标准差", width: 120, render: (row) => formatNumber(row.humanStdValue) },
        { key: "aiMedianValue", title: "AI中位", width: 100, render: (row) => formatNumber(row.aiMedianValue) },
        { key: "humanMedianValue", title: "人工中位", width: 110, render: (row) => formatNumber(row.humanMedianValue) },
        { key: "aiP05Value", title: "AI P05", width: 100, render: (row) => formatNumber(row.aiP05Value) },
        { key: "aiP95Value", title: "AI P95", width: 100, render: (row) => formatNumber(row.aiP95Value) },
        { key: "humanP05Value", title: "人工 P05", width: 110, render: (row) => formatNumber(row.humanP05Value) },
        { key: "humanP95Value", title: "人工 P95", width: 110, render: (row) => formatNumber(row.humanP95Value) },
        { key: "effectSize", title: "效应量", width: 100, render: (row) => formatNumber(row.effectSize) },
        { key: "overlapScore", title: "重叠度", width: 100, render: (row) => formatPercent(row.overlapScore) },
        { key: "importanceScore", title: "重要性", width: 100, render: (row) => formatPercent(row.importanceScore) },
        { key: "baselineVersion", title: "版本", width: 130 },
        { key: "updateTime", title: "更新时间", width: 180, render: (row) => formatTime(row.updateTime) }
      ]),
      corpus: dataset("corpus", "/check/aitext/novel/corpus/page", "语料", [
        { key: "docName", label: "文档", placeholder: "搜索文档" },
        { key: "sourceType", label: "来源", type: "select", options: sourceOptions },
        { key: "taskId", label: "任务ID", placeholder: "任务ID" }
      ], [
        { key: "taskId", title: "任务ID", width: 90 },
        { key: "sourceType", title: "来源", width: 90, render: (row) => <SmallBadge tone={String(row.sourceType) === "human" ? "human" : "ai"}>{sourceTypeName(row.sourceType)}</SmallBadge> },
        { key: "docName", title: "文档", width: 300 },
        { key: "sourceIndex", title: "分片", width: 80 },
        { key: "pipelineVersion", title: "分析管线", width: 260 },
        { key: "charCount", title: "字数", width: 80 },
        { key: "paragraphCount", title: "段落", width: 80 },
        { key: "sentenceCount", title: "句子", width: 80 },
        { key: "dialogueRatio", title: "对白占比", width: 100, render: (row) => formatPercent(row.dialogueRatio) },
        { key: "avgParagraphChars", title: "均段", width: 80, render: (row) => formatNumber(row.avgParagraphChars) },
        { key: "avgSentenceChars", title: "均句", width: 80, render: (row) => formatNumber(row.avgSentenceChars) },
        { key: "punctuationEntropy", title: "标点熵", width: 90, render: (row) => formatNumber(row.punctuationEntropy) },
        { key: "lexical_mattr_50", title: "MATTR", width: 90, render: (row) => formatNumber(getMetricValue(row, "lexical_mattr_50")) },
        { key: "compression_ratio", title: "压缩比", width: 90, render: (row) => formatNumber(getMetricValue(row, "compression_ratio")) },
        { key: "action", title: "操作", width: 90, render: (row) => <button onClick={() => void openCorpusDetail(row)}>详情</button> }
      ]),
      paragraph: dataset("paragraph", "/check/aitext/novel/paragraph/page", "段落", [
        { key: "corpusId", label: "语料块ID", placeholder: "语料块ID" },
        { key: "sourceType", label: "来源", type: "select", options: sourceOptions },
        { key: "taskId", label: "任务ID", placeholder: "任务ID" }
      ], [
        { key: "taskId", title: "任务ID"},
        { key: "corpusId", title: "语料块ID"},
        { key: "sourceType", title: "来源", render: (row) => sourceTypeName(row.sourceType) },
        { key: "paragraphIndex", title: "段序"},
        { key: "charCount", title: "字数" },
        { key: "sentenceCount", title: "句数"},
        { key: "dialogueRatio", title: "对白占比", render: (row) => formatPercent(row.dialogueRatio) },
        { key: "avgSentenceChars", title: "均句", render: (row) => formatNumber(row.avgSentenceChars) },
        { key: "punctuationEntropy", title: "标点熵", render: (row) => formatNumber(row.punctuationEntropy) },
        { key: "abstractWordCount", title: "抽象"},
        { key: "emotionWordCount", title: "情绪"},
        { key: "sensoryWordCount", title: "感官"},
        { key: "templatePatternCount", title: "模板"}
      ]),
      runs: dataset("runs", "/check/aitext/research/run/page", "分析运行", [
        { key: "taskId", label: "任务ID", placeholder: "任务ID" },
        { key: "status", label: "状态", type: "select", options: [{ label: "全部状态", value: "all" }, { label: "完成", value: "completed" }, { label: "失败", value: "failed" }] }
      ], [
        { key: "id", title: "ID", width: 90 },
        { key: "taskId", title: "任务ID", width: 90 },
        { key: "requestId", title: "请求ID", width: 190 },
        { key: "pipelineVersion", title: "管线版本"},
        { key: "status", title: "状态", width: 100, render: (row) => taskStatusName(row.status) },
        { key: "documentCount", title: "文档数", width: 90 },
        { key: "analyzerVersions", title: "分析器版本"},
        { key: "errorMessage", title: "错误", width: 220 },
        { key: "startedAt", title: "开始时间", width: 180, render: (row) => formatTime(row.startedAt) },
        { key: "completedAt", title: "完成时间", width: 180, render: (row) => formatTime(row.completedAt) }
      ]),
      sentences: dataset("sentences", "/check/aitext/research/sentence/page", "句子", [
        { key: "taskId", label: "任务ID", placeholder: "任务ID" },
        { key: "corpusId", label: "语料ID", placeholder: "语料ID" },
        { key: "name", label: "句子", placeholder: "搜索句子" }
      ], [
        { key: "id", title: "ID", width: 90 },
        { key: "taskId", title: "任务ID", width: 90 },
        { key: "corpusId", title: "语料ID", width: 100 },
        { key: "analysisRunId", title: "运行ID", width: 100 },
        { key: "sentenceIndex", title: "句序", width: 80 },
        { key: "textHash", title: "文本哈希"},
        { key: "metricsJson", title: "完整指标"},
        { key: "createTime", title: "创建时间", width: 180, render: (row) => formatTime(row.createTime) }
      ]),
      observations: dataset("observations", "/check/aitext/research/observation/page", "特征观察", [
        { key: "taskId", label: "任务ID", placeholder: "任务ID" },
        { key: "corpusId", label: "语料ID", placeholder: "语料ID" },
        { key: "featureType", label: "类型", type: "select", options: featureTypeOptions },
        { key: "featureText", label: "内容", placeholder: "特征内容" }
      ], [
        { key: "taskId", title: "任务ID", width: 90 },
        { key: "corpusId", title: "语料ID", width: 100 },
        { key: "sourceType", title: "来源", width: 90, render: (row) => sourceTypeName(row.sourceType) },
        { key: "docName", title: "文档"},
        { key: "featureType", title: "特征类型", width: 130, render: (row) => featureTypeName(row.featureType) },
        { key: "featureText", title: "特征内容"},
        { key: "featureCount", title: "命中次数", width: 100 },
        { key: "scopeType", title: "层级", width: 90 },
        { key: "featureId", title: "特征ID", width: 100 },
        { key: "analysisRunId", title: "运行ID", width: 100 },
        { key: "createTime", title: "创建时间", width: 180, render: (row) => formatTime(row.createTime) }
      ]),
      lexicons: {
        key: "lexicons",
        label: "研究词库",
        search: [],
        columns: [],
        split: [
          { key: "lexicon", title: "词库版本", endpoint: "/check/aitext/research/lexicon/page", columns: [
            { key: "id", title: "ID", width: 90 }, { key: "taskId", title: "任务ID", width: 90 }, { key: "lexiconKey", title: "词库键", width: 180 }, { key: "name", title: "名称", width: 180 }, { key: "version", title: "版本", width: 100 }, { key: "description", title: "说明", width: 360 }, { key: "createTime", title: "创建时间", width: 180, render: (row) => formatTime(row.createTime) }
          ], search: [{ key: "name", label: "词库", placeholder: "词库名称或键" }] },
          { key: "lexiconEntry", title: "词库条目", endpoint: "/check/aitext/research/lexicon/entry/page", columns: [
            { key: "id", title: "ID", width: 90 }, { key: "lexiconId", title: "词库ID", width: 100 }, { key: "lexiconName", title: "词库", width: 180 }, { key: "entryText", title: "条目", width: 260 }, { key: "weight", title: "权重", width: 100, render: (row) => formatNumber(row.weight) }, { key: "metadataJson", title: "元数据", width: 360 }, { key: "taskId", title: "任务ID", width: 90 }
          ], search: [{ key: "lexiconId", label: "词库ID", placeholder: "词库ID" }, { key: "name", label: "条目", placeholder: "搜索条目" }] }
        ]
      }
    }),
    []
  );

  function dataset(key: DatasetKey, endpoint: string, label: string, search: DatasetConfig["search"], columns: Column[]): DatasetConfig {
    return { key, label, endpoint, search, columns };
  }

  const sourceStats = useMemo(() => (Array.isArray(summary.sourceStats) ? (summary.sourceStats as Row[]) : []), [summary]);
  const metricRows = useMemo(() => (Array.isArray(summary.metricComparisons) ? (summary.metricComparisons as Row[]) : []), [summary]);
  const featureRows = useMemo(() => (Array.isArray(summary.featureTypeStats) ? (summary.featureTypeStats as Row[]) : []), [summary]);
  const featureMax = useMemo(() => Math.max(...featureRows.map((row) => Number(row.featureCount || row.count || 0)), 1), [featureRows]);
  const dataAssets = useMemo(() => (Array.isArray(summary.dataAssets) ? (summary.dataAssets as Row[]) : []), [summary]);
  const taskStatusStats = useMemo(() => (Array.isArray(summary.taskStatusStats) ? (summary.taskStatusStats as Row[]) : []), [summary]);
  const runStatusStats = useMemo(() => (Array.isArray(summary.runStatusStats) ? (summary.runStatusStats as Row[]) : []), [summary]);
  const topAiFeatures = useMemo(() => (Array.isArray(summary.topAiFeatures) ? (summary.topAiFeatures as Row[]) : []), [summary]);
  const topHumanFeatures = useMemo(() => (Array.isArray(summary.topHumanFeatures) ? (summary.topHumanFeatures as Row[]) : []), [summary]);
  const maturityRows = useMemo(() => (Array.isArray(summary.maturityRows) ? (summary.maturityRows as Row[]) : []), [summary]);

  const dataAssetMap = useMemo(() => Object.fromEntries(dataAssets.map((item) => [String(item.assetKey), Number(item.count || 0)])), [dataAssets]);
  const taskStatusMapData = useMemo(() => Object.fromEntries(taskStatusStats.map((item) => [String(item.status), Number(item.count || 0)])), [taskStatusStats]);
  const runStatusMapData = useMemo(() => Object.fromEntries(runStatusStats.map((item) => [String(item.status), Number(item.count || 0)])), [runStatusStats]);
  const globalTotals = useMemo(() => sourceStats.reduce<{ corpus: number; chars: number; paragraphs: number; sentences: number }>((total, item) => ({
    corpus: total.corpus + Number(item.corpusCount || 0),
    chars: total.chars + Number(item.charCount || 0),
    paragraphs: total.paragraphs + Number(item.paragraphCount || 0),
    sentences: total.sentences + Number(item.sentenceCount || 0)
  }), { corpus: 0, chars: 0, paragraphs: 0, sentences: 0 }), [sourceStats]);
  const comparableMetricRows = useMemo<Row[]>(() => metricRows
    .filter((item) => Math.abs(Number(item.aiAverage ?? item.aiMean ?? 0)) + Math.abs(Number(item.humanAverage ?? item.humanMean ?? 0)) > 0)
    .map((item): Row => ({ ...item, relativeGap: item.relativeGap ?? relativeMetricGap(item) }))
    .sort((a, b) => Math.abs(Number(b.relativeGap || 0)) - Math.abs(Number(a.relativeGap || 0))), [metricRows]);
  const radarRows = useMemo(() => {
    const preferredKeys = ["lexical_mattr_50", "hapax_ratio", "word_entropy", "sentence_length_burstiness", "punctuation_entropy", "dialogue_ratio", "dependency_average_distance", "compression_ratio"];
    const preferred = preferredKeys.map((key) => comparableMetricRows.find((item) => item.metricKey === key)).filter(Boolean) as Row[];
    const fallback = comparableMetricRows.filter((item) => !preferred.some((row) => row.metricKey === item.metricKey));
    return [...preferred, ...fallback].slice(0, 8);
  }, [comparableMetricRows]);
  const scoringRadarRows = useMemo<Row[]>(() => dedupeMetricRowsByDisplayName(baselineRows
    .filter((item) => item.scoreEligible === true && Number(item.scoreWeight || 0) > 0)
    .sort((a, b) => Number(b.scoreWeight || 0) - Number(a.scoreWeight || 0))
    .map((item): Row => ({
      ...item,
      metricName: metricName(metricKeyWithoutScope(item.metricKey)),
      displayName: scoringMetricDisplayName(item),
      aiAverage: item.aiMeanValue,
      humanAverage: item.humanMeanValue
    })), true), [baselineRows]);
  const coverageRows = useMemo(() => [
    { label: "段落事实覆盖", value: safeRatio(dataAssetMap.paragraphs, globalTotals.paragraphs), detail: `${dataAssetMap.paragraphs || 0} / ${globalTotals.paragraphs}` },
    { label: "句子事实覆盖", value: safeRatio(dataAssetMap.sentences, globalTotals.sentences), detail: `${dataAssetMap.sentences || 0} / ${globalTotals.sentences}` },
    { label: "任务完成率", value: safeRatio(taskStatusMapData.completed, dataAssetMap.tasks), detail: `${taskStatusMapData.completed || 0} / ${dataAssetMap.tasks || 0}` },
    { label: "分析成功率", value: safeRatio(runStatusMapData.completed, dataAssetMap.analysisRuns), detail: `${runStatusMapData.completed || 0} / ${dataAssetMap.analysisRuns || 0}` }
  ], [dataAssetMap, globalTotals, taskStatusMapData, runStatusMapData]);

  const loadTasks = async (silent = false, pageOverride?: PageState, filtersOverride?: Record<string, string | number>) => {
    const page = pageOverride || taskState.page;
    const filters = filtersOverride || taskState.filters;
    setTaskState((state) => ({ ...state, loading: !silent }));
    try {
      const resp = await postReq("/check/aitext/task/page", cleanPayload(filters, page));
      const normalized = normalizeRows(resp as never);
      setTaskState((state) => ({ ...state, rows: normalized.rows, page: { ...page, total: normalized.total, size: normalized.size }, loading: false }));
    } catch {
      setTaskState((state) => ({ ...state, loading: false }));
    }
  };

  const loadSummary = async () => {
    setSummaryLoading(true);
    try {
      const resp = await postReq<Row>("/check/aitext/novel/summary", {});
      if (resp.code === 0 || resp.code === undefined) {
        setSummary((resp.data || {}) as Row);
      }
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadBaseline = async () => {
    const pageSize = 1000;
    const [statusResp, pageResp] = await Promise.all([
      postReq<Row>("/check/aitext/baseline/status", {}),
      postReq("/check/aitext/baseline/page", { pageNum: 1, pageSize })
    ]);
    if (statusResp.code === 0 || statusResp.code === undefined) {
      setBaseline((statusResp.data || {}) as Row);
    }
    const firstPage = normalizeRows(pageResp as never);
    const rows = [...firstPage.rows];
    for (let pageNum = 2; rows.length < firstPage.total; pageNum += 1) {
      const resp = await postReq("/check/aitext/baseline/page", { pageNum, pageSize });
      const normalized = normalizeRows(resp as never);
      if (!normalized.rows.length) break;
      rows.push(...normalized.rows);
    }
    setBaselineRows(rows);
  };

  const rebuildBaseline = async () => {
    setBaselineConfirmOpen(false);
    setBaselineLoading(true);
    try {
      const resp = await postReq<Row>("/check/aitext/baseline/rebuild", {});
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "检测基准已重建", message: `基准 ${formatText((resp.data as Row)?.metricCount)} 项，参与评分 ${formatText((resp.data as Row)?.scoringMetricCount || 0)} 项` });
        await loadBaseline();
      }
    } finally {
      setBaselineLoading(false);
    }
  };

  const loadDataset = async (
    key: string,
    config: { endpoint?: string; search?: DatasetConfig["search"] },
    reset = false,
    pageOverride?: PageState,
    filtersOverride?: Record<string, string | number>
  ) => {
    if (!config.endpoint) return;
    const state = datasets[key] || buildPageState();
    const page = pageOverride || (reset ? { ...state.page, pageNum: 1 } : state.page);
    const filters = filtersOverride || state.filters;
    setDatasets((old) => ({ ...old, [key]: { ...(old[key] || buildPageState()), page, filters, loading: true } }));
    try {
      const resp = await postReq(config.endpoint, cleanPayload(filters, page));
      const normalized = normalizeRows(resp as never);
      setDatasets((old) => ({
        ...old,
        [key]: { ...(old[key] || buildPageState()), rows: normalized.rows, filters, loading: false, page: { ...page, total: normalized.total, size: normalized.size } }
      }));
    } catch {
      setDatasets((old) => ({ ...old, [key]: { ...(old[key] || buildPageState()), loading: false } }));
    }
  };

  const setDatasetFilter = (key: string, field: string, value: string | number) => {
    setDatasets((old) => {
      const state = old[key] || buildPageState();
      return { ...old, [key]: { ...state, page: { ...state.page, pageNum: 1 }, filters: { ...state.filters, [field]: value } } };
    });
  };

  const setTaskFilter = (key: string, value: string | number) => {
    setSelectedTaskIds([]);
    setTaskState((state) => ({ ...state, page: { ...state.page, pageNum: 1 }, filters: { ...state.filters, [key]: value } }));
  };

  const resetTaskFilters = () => {
    const filters = { fileName: "", sourceType: "all", status: "all" };
    const page = { ...taskState.page, pageNum: 1 };
    setSelectedTaskIds([]);
    setTaskState((state) => ({ ...state, page, filters }));
    void loadTasks(false, page, filters);
  };

  const resetDatasetFilters = (key: string, fields: DatasetConfig["search"], config: { endpoint?: string; search?: DatasetConfig["search"] }) => {
    const filters = defaultFilters(fields);
    const current = datasets[key] || buildPageState();
    const page = { ...current.page, pageNum: 1 };
    setDatasets((old) => ({ ...old, [key]: { ...(old[key] || buildPageState()), page, filters } }));
    void loadDataset(key, config, false, page, filters);
  };

  const executeTask = async (row: Row) => {
    setTaskBusy(true);
    try {
      const resp = await postReq<Row>("/check/aitext/task/execute", { id: row.id, batchPages, concurrency: taskConcurrency });
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "任务已提交", message: (resp.data as Row)?.finished ? "处理完成" : "已加入执行队列" });
        await loadTasks(true);
      }
    } catch {
      await loadTasks(true);
    } finally {
      setTaskBusy(false);
    }
  };

  const executeAll = async () => {
    const ids = executableSelectedRows.map((row) => String(row.id || "")).filter(Boolean);
    if (!ids.length) {
      notify({ type: "warning", title: "请选择任务", message: "请勾选可执行的任务" });
      return;
    }
    setTaskBusy(true);
    try {
      const resp = await postReq<Row>("/check/aitext/task/execute/all", { ids, batchPages, concurrency: taskConcurrency });
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "一键执行", message: `已加入执行队列：${formatText((resp.data as Row)?.count || 0)} 个任务` });
        setSelectedTaskIds([]);
        await loadTasks(true);
      }
    } catch {
      await loadTasks(true);
    } finally {
      setTaskBusy(false);
    }
  };

  const stopTasks = async (ids: string[]) => {
    const targetIds = ids.filter(Boolean);
    if (!targetIds.length) {
      notify({ type: "warning", title: "请选择任务", message: "请勾选排队中、执行中、等待撤回或撤回中的任务" });
      return;
    }
    const confirmed = await confirmAction({
      title: "确认停止执行",
      message: `会停止 ${targetIds.length} 个任务。排队任务会回到待执行，执行中任务会在当前批次完成后停在断点；等待撤回会取消，撤回中会尽量在清理前安全停止。`,
      confirmText: "确认停止",
      tone: "danger"
    });
    if (!confirmed) return;
    setTaskBusy(true);
    try {
      const resp = await postReq<Row>("/check/aitext/task/stop/all", { ids: targetIds });
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "停止执行", message: `已处理：${formatText((resp.data as Row)?.count || 0)} 个任务` });
        setSelectedTaskIds((old) => old.filter((id) => !targetIds.includes(id)));
        await loadTasks(true);
      }
    } finally {
      setTaskBusy(false);
    }
  };

  const stopAll = async () => {
    const ids = stoppableSelectedRows.map((row) => String(row.id || "")).filter(Boolean);
    await stopTasks(ids);
  };

  const rollbackAll = async () => {
    const ids = rollbackableSelectedRows.map((row) => String(row.id || "")).filter(Boolean);
    if (!ids.length) {
      notify({ type: "warning", title: "请选择任务", message: "请勾选可撤回的任务" });
      return;
    }
    const confirmed = await confirmAction({
      title: "确认撤回任务",
      message: `会把选中的 ${ids.length} 个可撤回任务加入撤回队列，确认继续？`,
      confirmText: "确认撤回",
      tone: "danger"
    });
    if (!confirmed) return;
    setTaskBusy(true);
    try {
      const resp = await postReq<Row>("/check/aitext/task/rollback/all", { ids, batchPages, concurrency: taskConcurrency });
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "一键撤回", message: `已加入撤回队列：${formatText((resp.data as Row)?.count || 0)} 个任务` });
        setSelectedTaskIds([]);
        await loadTasks(true);
      }
    } finally {
      setTaskBusy(false);
    }
  };

  const clearAllAiTextData = async () => {
    if (taskBusy) return;
    setTaskBusy(true);
    try {
      const resp = await postReq<Row>("/check/aitext/task/clear-all", {});
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "一键清空", message: `已清空 ${formatText((resp.data as Row)?.count || 0)} 张文本分析表` });
        setClearConfirmOpen(false);
        setClearConfirmText("");
        setSelectedTaskIds([]);
        setSummary({});
        await loadTasks(true);
      }
    } finally {
      setTaskBusy(false);
    }
  };

  const dedupeUploadFiles = async () => {
    const checkForm = new FormData();
    uploadFiles.forEach((file) => checkForm.append("files", file));
    checkForm.append("pageTargetChars", String(uploadChars));
    checkForm.append("checkOnly", "true");
    const checkResp = await uploadRecord("/check/aitext/task/create", checkForm);
    if (checkResp.code !== 0 && checkResp.code !== undefined) return false;

    const checkRows = asRows((checkResp.data as Row)?.list);
    const acceptedNameCount = new Map<string, number>();
    checkRows.forEach((item) => {
      if (!item.accepted) return;
      const name = String(item.fileName || "");
      acceptedNameCount.set(name, (acceptedNameCount.get(name) || 0) + 1);
    });
    const acceptedFiles = uploadFiles.filter((file) => {
      const count = acceptedNameCount.get(file.name) || 0;
      if (count <= 0) return false;
      acceptedNameCount.set(file.name, count - 1);
      return true;
    });
    const skippedRows = checkRows.filter((item) => !item.accepted);
    setUploadFiles(acceptedFiles);
    setUploadDeduped(acceptedFiles.length > 0);
    notify({
      type: skippedRows.length ? (acceptedFiles.length ? "warning" : "info") : "success",
      title: skippedRows.length ? "已过滤重复文档" : "去重完成",
      message: skippedRows.length ? `过滤 ${skippedRows.length} 个，保留 ${acceptedFiles.length} 个新文档` : `保留 ${acceptedFiles.length} 个新文档`
    });
    return acceptedFiles.length > 0;
  };

  const createUploadTasks = async () => {
    const form = new FormData();
    uploadFiles.forEach((file) => form.append("files", file));
    form.append("pageTargetChars", String(uploadChars));
    form.append("sourceType", uploadSourceType);
    const resp = await uploadRecord("/check/aitext/task/create", form);
    if (resp.code === 0 || resp.code === undefined) {
      notify({ type: "success", title: "任务已创建", message: `已创建 ${Array.isArray(resp.data) ? resp.data.length : 0} 个文件任务` });
      setUploadOpen(false);
      setUploadFiles([]);
      setUploadDeduped(false);
      await loadTasks(true);
    }
  };

  const uploadTasks = async () => {
    if (uploadBusy) return;
    if (!uploadFiles.length) {
      notify({ type: "warning", title: "请选择文档", message: "支持 txt、md、docx、pdf" });
      return;
    }
    setUploadBusy(true);
    try {
      if (!uploadDeduped) await dedupeUploadFiles();
      else await createUploadTasks();
    } finally {
      setUploadBusy(false);
    }
  };

  const runDetect = async () => {
    if (!detectText.trim()) {
      notify({ type: "warning", title: "请输入待测文本", message: "AI检测需要正文内容" });
      return;
    }
    setDetectDetailOpen(false);
    setDetectLoading(true);
    try {
      const resp = await postReq<Row>("/check/aitext/detect", {
        content: detectText
      });
      if (resp.code === 0 || resp.code === undefined) setDetectResult((resp.data || {}) as Row);
    } finally {
      setDetectLoading(false);
    }
  };

  const openDetectModal = () => {
    setDetectOpen(true);
    setDetectResult(null);
    setDetectDetailOpen(false);
  };

  const openChunkLog = async (row: Row) => {
    setChunkTask(row);
    const next = { ...buildPageState(), filters: { taskId: String(row.id || ""), status: "all" }, loading: true };
    setChunkState(next);
    const resp = await postReq("/check/aitext/task/chunk/page", cleanPayload(next.filters, next.page));
    const normalized = normalizeRows(resp as never);
    setChunkState({ ...next, loading: false, rows: normalized.rows, page: { ...next.page, total: normalized.total, size: normalized.size } });
  };

  const reloadChunkLog = async (pageOverride?: PageState) => {
    const page = pageOverride || chunkState.page;
    const filters = chunkTask ? { ...chunkState.filters, taskId: String(chunkTask.id || "") } : chunkState.filters;
    setChunkState((state) => ({ ...state, page, filters, loading: true }));
    const resp = await postReq("/check/aitext/task/chunk/page", cleanPayload(filters, page));
    const normalized = normalizeRows(resp as never);
    setChunkState((state) => ({ ...state, rows: normalized.rows, loading: false, page: { ...page, total: normalized.total, size: normalized.size } }));
  };

  const loadJobs = async (pageOverride?: PageState) => {
    setJobOpen(true);
    const current = { ...jobState, page: pageOverride || jobState.page, loading: true };
    setJobState(current);
    const resp = await postReq("/check/aitext/task/job/page", cleanPayload(current.filters, current.page));
    const normalized = normalizeRows(resp as never);
    setJobState({ ...current, loading: false, rows: normalized.rows, page: { ...current.page, total: normalized.total, size: normalized.size } });
  };

  async function openCorpusDetail(row: Row) {
    setCorpusDetail(row);
    setCorpusDetailLoading(true);
    try {
      const resp = await postReq<Row>("/check/aitext/novel/corpus/detail", { id: row.id, corpusId: row.id });
      if (resp.code === 0 || resp.code === undefined) setCorpusDetail({ ...row, ...((resp.data || {}) as Row) });
    } finally {
      setCorpusDetailLoading(false);
    }
  }

  const patchDatasetRow = (key: "word" | "detectionWord" | "sensitiveWord" | "pattern", row: Row, patch: Row, sortBlacklisted = false) => {
    const rowId = String(row.id || "");
    setDatasets((old) => {
      const state = old[key] || buildPageState();
      const rows = state.rows.map((item) => (String(item.id || "") === rowId ? { ...item, ...patch } : item));
      return {
        ...old,
        [key]: {
          ...state,
          rows: sortBlacklisted ? sortDetectionWordRows(rows) : rows
        }
      };
    });
  };

  const patchBaselineRow = (source: Row, next: Row) => {
    setBaselineRows((rows) => sortBaselineRowsByScoreWeight(rows.map((item) => (baselineRowMatches(item, source) ? { ...item, ...next } : item))));
    setDatasets((old) => {
      const state = old.baseline || buildPageState();
      return {
        ...old,
        baseline: {
          ...state,
          rows: sortBaselineRowsByScoreWeight(state.rows.map((item) => (baselineRowMatches(item, source) ? { ...item, ...next } : item)))
        }
      };
    });
  };

  const updateBaselineScoreEnabled = async (row: Row, checked: boolean) => {
    const resp = await postReq<Row>("/check/aitext/baseline/score-enabled", {
      baselineVersion: baselineVersionOf(row),
      scopeType: row.scopeType,
      metricKey: row.metricKey,
      scoreEnabled: checked ? 1 : 0
    });
    if (resp.code === 0 || resp.code === undefined) {
      patchBaselineRow(row, (resp.data || { scoreEnabled: checked ? 1 : 0, scoreEligible: checked, useType: checked ? "参与评分" : "仅观察" }) as Row);
    }
  };

  const clearDetectReport = () => {
    setDetectText("");
    setDetectResult(null);
    setDetectDetailOpen(false);
  };

  const updateFilterLike = async (type: "word" | "detectionWord" | "pattern", row: Row, action: "filter" | "lock" | "blacklist", checked: boolean) => {
    const keyMap = { filter: "isFilter", lock: "isLock", blacklist: "isBlacklist" };
    const endpointType = type === "detectionWord" ? "detection/word" : type;
    const endpoint = `/check/aitext/${endpointType}/${action}`;
    const resp = await postReq(endpoint, { id: row.id, [keyMap[action]]: checked ? 1 : 0 });
    if (resp.code === 0 || resp.code === undefined) {
      patchDatasetRow(type, row, { [keyMap[action]]: checked ? 1 : 0 }, type === "detectionWord" && action === "blacklist");
    }
  };

  const updateSensitiveWordEnabled = async (row: Row, checked: boolean) => {
    const resp = await postReq("/check/aitext/sensitive/word/enabled", { id: row.id, enabled: checked ? 1 : 0 });
    if (resp.code === 0 || resp.code === undefined) {
      patchDatasetRow("sensitiveWord", row, { enabled: checked ? 1 : 0 });
    }
  };

  const saveSensitiveWord = async () => {
    const word = sensitiveAddForm.word.trim();
    if (!word) {
      notify({ type: "warning", title: "违规词为空", message: "请先填写违规词。" });
      return;
    }
    setSensitiveAddBusy(true);
    try {
      const resp = await postReq("/check/aitext/sensitive/word/save", {
        word,
        replacement: sensitiveAddForm.replacement.trim(),
        remark: sensitiveAddForm.remark.trim(),
        enabled: sensitiveAddForm.enabled
      });
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "新增成功", message: "违规词已保存。" });
        setSensitiveAddOpen(false);
        await loadDataset("sensitiveWord", datasetConfigs.sensitiveWord, false);
      }
    } finally {
      setSensitiveAddBusy(false);
    }
  };

  const deleteWordPattern = async (type: "word" | "detectionWord" | "sensitiveWord" | "pattern", row: Row) => {
    const label = type === "pattern" ? "句式" : type === "detectionWord" ? "检测词汇" : type === "sensitiveWord" ? "违规词" : "词汇";
    const confirmed = await confirmAction({
      title: `确认删除${label}`,
      message: `将删除该${label}，此操作不可撤销。`,
      confirmText: "确认删除",
      tone: "danger"
    });
    if (!confirmed) return;
    const endpointType = type === "detectionWord" ? "detection/word" : type === "sensitiveWord" ? "sensitive/word" : type;
    const resp = await postReq(`/check/aitext/${endpointType}/delete`, { id: row.id });
    if (resp.code === 0 || resp.code === undefined) await loadDataset(type, datasetConfigs[type], false);
  };

  const normalizeSensitiveCandidates = (values: string[]) => {
    const seen = new Set<string>();
    return values
      .flatMap((value) => value.split(/[\n\r,，、;；]+/))
      .map((item) => item.trim())
      .filter((item) => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      });
  };

  const updateSensitiveCandidate = (index: number, value: string) => {
    setSensitiveExtractCandidates((items) => items.map((item, itemIndex) => (itemIndex === index ? value : item)));
  };

  const removeSensitiveCandidate = (index: number) => {
    setSensitiveExtractCandidates((items) => items.filter((_, itemIndex) => itemIndex !== index));
  };

  const extractSensitiveWords = async () => {
    if (!sensitiveExtractContent.trim()) {
      notify({ type: "warning", title: "内容为空", message: "请先粘贴需要提取的审核清单。" });
      return;
    }
    setSensitiveExtractBusy(true);
    setSensitiveExtractResult(null);
    setSensitiveExtractCandidates([]);
    try {
      const resp = await postReq<Row>("/check/aitext/sensitive/word/ai-extract", {
        content: sensitiveExtractContent,
        model: sensitiveExtractModel
      });
      if (resp.code === 0 || resp.code === undefined) {
        const data = (resp.data || {}) as Row;
        const candidateWords = normalizeSensitiveCandidates(Array.isArray(data.candidateWords) ? data.candidateWords.map((item) => String(item)) : []);
        setSensitiveExtractResult(data);
        setSensitiveExtractCandidates(candidateWords);
        notify({
          type: "success",
          title: "提取完成",
          message: `候选 ${formatText(data.candidateCount || candidateWords.length)} 个，已存在 ${formatText(data.existingCount || 0)} 个。`
        });
      }
    } finally {
      setSensitiveExtractBusy(false);
    }
  };

  const saveSensitiveExtractWords = async () => {
    const words = normalizeSensitiveCandidates(sensitiveExtractCandidates);
    if (!words.length) {
      notify({ type: "warning", title: "候选为空", message: "请先保留至少一个需要保存的违规词。" });
      return;
    }
    setSensitiveExtractBusy(true);
    try {
      const resp = await postReq<Row>("/check/aitext/sensitive/word/batch-save", {
        words,
        remark: "AI提取违规词",
        enabled: 1
      });
      if (resp.code === 0 || resp.code === undefined) {
        const data = (resp.data || {}) as Row;
        setSensitiveExtractResult(data);
        notify({
          type: "success",
          title: "保存完成",
          message: `新增 ${formatText(data.createdCount || 0)} 个，已存在 ${formatText(data.existingCount || 0)} 个。`
        });
        await loadDataset("sensitiveWord", datasetConfigs.sensitiveWord, false);
        setSensitiveExtractOpen(false);
      }
    } finally {
      setSensitiveExtractBusy(false);
    }
  };

  const reloadActive = async (key = activeTab) => {
    if (key === "tasks") await loadTasks();
    else if (key === "dashboard" || key === "visualization") await loadSummary();
    else {
      const config = datasetConfigs[key as DatasetKey];
      if (config?.split) await Promise.all(config.split.map((item) => loadDataset(item.key, item, false)));
      else if (config?.endpoint) await loadDataset(key, config, false);
    }
  };

  useEffect(() => {
    localStorage.setItem("wse.aitext.activeTab", activeTab);
    void reloadActive(activeTab);
  }, [activeTab]);

  useEffect(() => {
    setSelectedTaskIds((ids) => {
      const visibleIds = new Set(taskState.rows.map((row) => String(row.id || "")).filter(Boolean));
      const next = ids.filter((id) => visibleIds.has(id));
      return next.length === ids.length ? ids : next;
    });
  }, [taskState.rows]);

  useEffect(() => {
    void Promise.all([loadTasks(), loadBaseline()]);
  }, []);

  useEffect(() => {
    if (!sensitiveExtractOpen) return;
    void loadSensitiveExtractModels();
  }, [sensitiveExtractOpen]);

  useEffect(() => {
    if (!taskState.rows.some((row) => activeStatuses.has(String(row.status || "")))) return;
    const timer = window.setInterval(() => {
      void loadTasks(true);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [taskState.rows]);

  const dashboardKpis = [
    { label: "AI语料", value: sourceStats.find((item) => item.sourceType === "ai")?.corpusCount || 0, note: "已完成采集块" },
    { label: "人工语料", value: sourceStats.find((item) => item.sourceType === "human")?.corpusCount || 0, note: "已完成采集块" },
    { label: "特征类型", value: featureRows.length, note: "可参与检测基准" },
    { label: "研究资产", value: dataAssets.reduce((sum, item) => sum + Number(item.count || 0), 0), note: `缓存 ${summary.cacheHit ? "命中" : "未命中"}` }
  ];

  return (
    <div className="aitext-react-page">
      <section className="aitext-topbar">
        <button className="primary-button" onClick={openDetectModal}>
          <Bot size={18} /> AI检测
        </button>
        <button onClick={() => { setUploadFiles([]); setUploadDeduped(false); setUploadOpen(true); }}>
          <Upload size={18} /> 上传文档采集
        </button>
        <button onClick={() => setBaselineConfirmOpen(true)} disabled={baselineLoading}>
          {baselineLoading ? <Loader2 className="spin" size={18} /> : <WandSparkles size={18} />} 重建检测基准
        </button>
        <SmallBadge tone={baseline.ready ? "success" : "running"}>{baseline.ready ? `基准 ${formatText(baseline.metricCount || 0)} 项 · 评分 ${formatText(baseline.scoringMetricCount || 0)} 项` : "基准不足"}</SmallBadge>
      </section>

      <nav className="aitext-tabs">
        {tabs.map((tab) => (
          <button key={tab.key} className={activeTab === tab.key ? "active" : ""} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="aitext-tab-body">
        {activeTab === "tasks" ? (
          <>
            <SearchBar fields={[{ key: "fileName", label: "文件名", placeholder: "搜索文件名" }, { key: "sourceType", label: "类型", type: "select", options: sourceOptions }, { key: "status", label: "状态", type: "select", options: taskStatusOptions }]} values={taskState.filters as Record<string, string | number>} onChange={setTaskFilter} onSearch={() => void loadTasks()} onReset={resetTaskFilters}>
              <label className="aitext-inline-number">
                每批块数 <input type="number" min={1} max={3} value={batchPages} onChange={(event) => setBatchPages(Number(event.target.value || 1))} />
              </label>
              <label className="aitext-inline-number">
                同时任务数 <input type="number" min={1} max={3} value={taskConcurrency} onChange={(event) => setTaskConcurrency(Number(event.target.value || 1))} />
              </label>
              <button onClick={() => void loadTasks()}>
                <RefreshCw size={18} /> 刷新
              </button>
              <span className="aitext-selected-count">已选 {selectedTaskRows.length} 个</span>
              <button className="primary-button" disabled={taskBusy} onClick={() => void executeAll()}>
                执行选中{executableSelectedRows.length ? ` ${executableSelectedRows.length}` : ""}
              </button>
              <button disabled={taskBusy} onClick={() => void stopAll()}>
                停止执行{stoppableSelectedRows.length ? ` ${stoppableSelectedRows.length}` : ""}
              </button>
              <button disabled={taskBusy} onClick={() => void rollbackAll()}>
                撤回选中{rollbackableSelectedRows.length ? ` ${rollbackableSelectedRows.length}` : ""}
              </button>
              <button className="danger-text" disabled={taskBusy} onClick={() => { setClearConfirmText(""); setClearConfirmOpen(true); }}>
                一键清空
              </button>
              <button onClick={() => void loadJobs()}>作业记录</button>
            </SearchBar>
            <DataTable
              columns={taskColumns}
              rows={taskState.rows}
              loading={taskState.loading}
              page={taskState.page}
              onPage={(page) => {
                setSelectedTaskIds([]);
                setTaskState((state) => ({ ...state, page }));
                void loadTasks(false, page);
              }}
              minWidth={2900}
            />
          </>
        ) : activeTab === "dashboard" ? (
          <section className="aitext-dashboard">
            <div className="aitext-cache-row">
              <span>累计更新：{summary.cacheUpdatedAt ? formatTime(summary.cacheUpdatedAt) : "暂无数据"}</span>
            </div>
            <div className="aitext-kpi-grid">
              {dashboardKpis.map((item) => (
                <div className="aitext-kpi" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{formatText(item.value)}</strong>
                  <small>{item.note}</small>
                </div>
              ))}
            </div>
            <div className="aitext-dashboard-grid">
              <section className="aitext-panel">
                <h3>样本构成</h3>
                <SampleDonutD3 sourceStats={sourceStats} />
              </section>
              <section className="aitext-panel">
                <h3>数据资产</h3>
                <div className="aitext-asset-grid">
                  {dataAssets.map((item) => (
                    <div key={String(item.assetKey)}>
                      <span>{formatText(item.assetKey)}</span>
                      <strong>{formatText(item.count)}</strong>
                    </div>
                  ))}
                </div>
              </section>
              <section className="aitext-panel">
                <h3>任务健康</h3>
                <div className="aitext-status-grid">
                  {taskStatusStats.map((item) => (
                    <div key={String(item.status)}>
                      <span>{taskStatusName(item.status)}</span>
                      <strong>{formatText(item.count)}</strong>
                    </div>
                  ))}
                  {taskStatusStats.length === 0 ? <div className="aitext-empty">暂无任务状态数据</div> : null}
                </div>
              </section>
              <section className="aitext-panel">
                <h3>分析运行</h3>
                <div className="aitext-status-grid">
                  {runStatusStats.map((item) => (
                    <div key={String(item.status)}>
                      <span>{taskStatusName(item.status)}</span>
                      <strong>{formatText(item.count)}</strong>
                    </div>
                  ))}
                  {runStatusStats.length === 0 ? <div className="aitext-empty">暂无运行状态数据</div> : null}
                </div>
              </section>
              <section className="aitext-panel wide">
                <h3>特征类型覆盖</h3>
                <div className="aitext-feature-bars">
                  {featureRows.map((row) => (
                    <div key={String(row.featureType)}>
                      <span>{featureTypeName(row.featureType)}</span>
                      <i style={{ width: `${normalizedBarWidth(row.featureCount || row.count, featureMax)}%` }} />
                      <strong>{formatText(row.featureCount || row.count)}</strong>
                    </div>
                  ))}
                  {featureRows.length === 0 ? <div className="aitext-empty">暂无特征覆盖数据</div> : null}
                </div>
              </section>
              <section className="aitext-panel">
                <h3>AI偏向特征</h3>
                <div className="aitext-rank-list">
                  {topAiFeatures.slice(0, 12).map((row, index) => (
                    <div key={`${row.featureText}-${index}`}>
                      <b>{index + 1}</b>
                      <span>{formatText(row.featureText || row.word || row.pattern)}</span>
                      <strong className="text-ai">{formatNumber(row.frequencyDiff ?? row.effectSize)}</strong>
                    </div>
                  ))}
                </div>
              </section>
              <section className="aitext-panel">
                <h3>人工偏向特征</h3>
                <div className="aitext-rank-list">
                  {topHumanFeatures.slice(0, 12).map((row, index) => (
                    <div key={`${row.featureText}-${index}`}>
                      <b>{index + 1}</b>
                      <span>{formatText(row.featureText || row.word || row.pattern)}</span>
                      <strong className="text-human">{formatNumber(row.frequencyDiff ?? row.effectSize)}</strong>
                    </div>
                  ))}
                </div>
              </section>
              <section className="aitext-panel wide">
                <h3>成熟度检测</h3>
                <div className="aitext-maturity-grid">
                  {maturityRows.map((row) => (
                    <div key={String(row.name || row.key)}>
                      <span>{formatText(row.name || row.key)}</span>
                      <strong>{formatText(row.status || row.level || row.value)}</strong>
                      <small>{formatText(row.description || row.note)}</small>
                    </div>
                  ))}
                  {maturityRows.length === 0 ? <div className="aitext-empty">暂无成熟度数据</div> : null}
                </div>
              </section>
            </div>
            <DataTable columns={[
              { key: "metricKey", title: "指标", width: 220, render: (row) => metricName(row.metricKey) },
              { key: "aiAverage", title: "AI均值", width: 120, render: (row) => formatNumber(row.aiAverage) },
              { key: "humanAverage", title: "人工均值", width: 120, render: (row) => formatNumber(row.humanAverage) },
              { key: "difference", title: "均值差", width: 120, render: (row) => <span className={Number(row.difference) >= 0 ? "text-ai" : "text-human"}>{formatNumber(row.difference)}</span> },
              { key: "relativeGap", title: "对称差异", width: 120, render: (row) => formatPercent(row.relativeGap) },
              { key: "aiCount", title: "AI样本", width: 100 },
              { key: "humanCount", title: "人工样本", width: 100 }
            ]} rows={metricRows} loading={summaryLoading} minWidth={980} />
          </section>
        ) : activeTab === "visualization" ? (
          <section className="aitext-visualization">
            <div className="aitext-cache-row">
              <span>累计更新：{summary.cacheUpdatedAt ? formatTime(summary.cacheUpdatedAt) : "暂无数据"}</span>
            </div>
            <div className="aitext-chart-grid">
              <section className="aitext-panel">
                <h3>样本构成</h3>
                <p>按语料字数观察 AI 文与人工文的数据平衡。</p>
                <SampleDonutD3 sourceStats={sourceStats} />
              </section>
              <section className="aitext-panel">
                <h3>处理健康度</h3>
                <p>采集、分析与研究数据的实际覆盖率。</p>
                <ProcessingHealthD3 rows={coverageRows} />
              </section>
              <section className={`aitext-panel ${radarZoomed ? "radar-zoomed" : ""}`}>
                <RadarTitle zoomed={radarZoomed} onZoom={() => setRadarZoomed((value) => !value)}>AI / 人工指标轮廓</RadarTitle>
                <p>保留 8 个核心指标雷达图，仅比较轮廓，不替代原始值。</p>
                {radarRows.length ? <MetricRadarD3 rows={radarRows} zoomed={radarZoomed} /> : <div className="aitext-empty">暂无可比较指标</div>}
              </section>
              <section className={`aitext-panel ${radarZoomed ? "radar-zoomed" : ""}`}>
                <RadarTitle zoomed={radarZoomed} onZoom={() => setRadarZoomed((value) => !value)}>评分项雷达图</RadarTitle>
                <p>展示参与 AI 检测评分的全部基准指标，并按评分权重排序。</p>
                {scoringRadarRows.length ? <MetricRadarD3 rows={scoringRadarRows} full zoomed={radarZoomed} hideScopePrefix /> : <div className="aitext-empty">暂无评分项数据，请先重建检测基准</div>}
              </section>
              <section className="aitext-panel full aitext-heatmap-panel">
                <div className="aitext-panel-sticky-title">
                  <h3>评分项热力矩阵</h3>
                  <p>每个评分项一行，展示 AI 均值、人工均值、差异强度与偏向。</p>
                </div>
                <MetricHeatmapD3 rows={scoringRadarRows} />
              </section>
              <section className="aitext-panel wide">
                <h3>指标偏向强度</h3>
                <p>横向发散条展示 AI 均值相对人工均值的差异，红色偏 AI，绿色偏人工。</p>
                <MetricBiasD3 rows={comparableMetricRows} />
              </section>
              <section className="aitext-panel">
                <h3>模板特征与显著性</h3>
                <p>聚焦模板化表达、篇章标记与叙事特征。</p>
                <FeatureSignificanceD3 rows={featureRows} />
              </section>
              <section className="aitext-panel">
                <h3>高区分度写法</h3>
                <p>最能区分 AI 文与人工文的模板化表达和叙事特征。</p>
                <FeatureBiasD3 aiRows={topAiFeatures} humanRows={topHumanFeatures} />
              </section>
              <section className="aitext-panel full">
                <h3>研究数据资产</h3>
                <p>各阶段已沉淀的数据规模，面积越大表示记录越多；为避免极大值吞没其他资产，面积按对数缩放。</p>
                <AssetTreemapD3 rows={dataAssets} />
              </section>
            </div>
          </section>
        ) : (
          <DatasetPane
            config={datasetConfigs[activeTab as DatasetKey]}
            datasets={datasets}
            setDatasetFilter={setDatasetFilter}
            loadDataset={loadDataset}
            resetDatasetFilters={resetDatasetFilters}
            setDatasets={setDatasets}
          />
        )}
      </main>

      {clearConfirmOpen ? (
        <div className="confirm-mask" role="dialog" aria-modal="true">
          <section className="confirm-panel aitext-clear-confirm">
            <h3>确认清空文本分析数据</h3>
            <p>将保留任务列表，并清空作业、语料、指标、特征、词汇、句式、检测基准和可视化累计数据。任务会重置为待执行，此操作不可恢复。</p>
            <label>
              <span>输入“清空文本分析”确认</span>
              <input value={clearConfirmText} onChange={(event) => setClearConfirmText(event.target.value)} autoFocus />
            </label>
            <div>
              <button type="button" disabled={taskBusy} onClick={() => { setClearConfirmOpen(false); setClearConfirmText(""); }}>
                取消
              </button>
              <button className="danger-button" type="button" disabled={taskBusy || clearConfirmText !== "清空文本分析"} onClick={() => void clearAllAiTextData()}>
                确认清空
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {baselineConfirmOpen ? (
        <div className="confirm-mask" role="dialog" aria-modal="true">
          <section className="confirm-panel">
            <h3>确认重建检测基准</h3>
            <p>重建会重新计算 AI/人工样本的检测指标基准，可能影响后续 AI 文本检测结果。</p>
            <div>
              <button type="button" onClick={() => setBaselineConfirmOpen(false)}>
                取消
              </button>
              <button className="primary-button" type="button" onClick={() => void rebuildBaseline()} disabled={baselineLoading}>
                确认重建
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {uploadOpen ? (
        <div className="confirm-mask">
          <section className="crud-modal aitext-upload-modal">
            <header>
              <strong>批量文档采集</strong>
              <button className="icon-button" disabled={uploadBusy} onClick={() => { setUploadOpen(false); setUploadDeduped(false); }}>
                <X size={18} />
              </button>
            </header>
            <div className="aitext-upload-grid">
              <label>
                文本类型
                <AppSelect
                  value={uploadSourceType}
                  options={[
                    { value: "ai", label: "AI文" },
                    { value: "human", label: "人工文" }
                  ]}
                  onChange={setUploadSourceType}
                />
              </label>
              <label>
                兜底字数
                <input type="number" min={200} max={20000} value={uploadChars} onChange={(event) => { setUploadDeduped(false); setUploadChars(Number(event.target.value || 2000)); }} />
              </label>
              <div className="aitext-upload-field wide">
                <span>选择文档</span>
                <FileUploadField
                  accept=".txt,.md,.docx,.pdf"
                  disabled={uploadBusy}
                  files={uploadFiles}
                  label="选择文档"
                  multiple
                  note="支持 TXT、Markdown、Word、PDF"
                  onChange={(files) => { setUploadDeduped(false); setUploadFiles(files); }}
                />
              </div>
            </div>
            <footer className="modal-actions aitext-modal-actions">
              <button disabled={uploadBusy} onClick={() => { setUploadOpen(false); setUploadDeduped(false); }}>取消</button>
              <button className="primary-button" disabled={!uploadFiles.length || uploadBusy} onClick={() => void uploadTasks()}>
                {uploadBusy ? <Loader2 className="spin" size={18} /> : null}
                {uploadBusy ? (uploadDeduped ? "创建中" : "去重中") : (uploadDeduped ? "创建任务" : "去重")}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {detectOpen ? (
        <div className="confirm-mask">
          <section className={`crud-modal aitext-detect-modal ${detectResult ? "report-mode" : ""}`}>
            <header>
              <div className="aitext-detect-title">
                <strong>{detectResult ? "AI文本检测报告" : "AI文本检测"}</strong>
                {detectResult ? (
                  <span>
                    文件：{formatText(detectResult.docName || "待测文本")} · 平台字数：{detectPlatformChars.toLocaleString()} · 句子数：{detectSentenceCount.toLocaleString()}
                    {` · ${formatText(((detectResult.report as Row) || {}).baselineLabel || ((detectResult.baselineStatus as Row) || {}).label || "样本基准")}`}
                  </span>
                ) : (
                  <span>输入文本后生成痕迹报告</span>
                )}
              </div>
              <div className="aitext-detect-header-actions">
                {detectResult ? <button type="button" onClick={() => notify({ type: "info", title: "导出报告", message: "报告导出接口待接入" })}>导出报告</button> : null}
                {detectResult ? <button type="button" onClick={() => setDetectDetailOpen(true)}>详细报告</button> : null}
                {detectResult ? <button className="primary-button" type="button" disabled={detectLoading} onClick={() => void runDetect()}>重新检测</button> : null}
                <button className="icon-button" onClick={() => { setDetectDetailOpen(false); setDetectOpen(false); }}>
                  <X size={18} />
                </button>
              </div>
            </header>
            {!detectResult ? (
              <div className="aitext-detect-start">
                <section className="aitext-detect-input-panel">
                  <div className="aitext-detect-panel-title">
                    <div className="aitext-detect-title-copy">
                      <strong>待测文本</strong>
                      <span>{detectPlatformChars.toLocaleString()} 字</span>
                    </div>
                  </div>
                  <textarea value={detectText} onChange={(event) => setDetectText(event.target.value)} placeholder="请输入需要检测 AI 痕迹的文章" />
                  {detectLoading ? (
                    <div className="aitext-detect-loading">
                      <LoadingState text="检测中" width={80} height={18} />
                    </div>
                  ) : null}
                </section>
              </div>
            ) : (
              <DetectReport result={detectResult} detailOpen={detectDetailOpen} onCloseDetail={() => setDetectDetailOpen(false)} onClear={clearDetectReport} />
            )}
            {!detectResult ? (
              <footer className="modal-actions aitext-modal-actions">
                <button onClick={() => setDetectOpen(false)}>取消</button>
                <button className="primary-button" disabled={detectLoading} onClick={() => void runDetect()}>
                  {detectLoading ? <Loader2 className="spin" size={16} /> : null}
                  开始检测
                </button>
              </footer>
            ) : null}
          </section>
        </div>
      ) : null}

      {taskErrorDetail ? (
        <div className="confirm-mask">
          <section className="crud-modal aitext-error-modal">
            <header>
              <strong>错误详情</strong>
              <button className="icon-button" onClick={() => setTaskErrorDetail(null)}>
                <X size={18} />
              </button>
            </header>
            <div className="aitext-error-detail">
              <div className="aitext-error-meta">
                <span>任务ID</span>
                <strong>{formatText(taskErrorDetail.id || taskErrorDetail.taskId || "-")}</strong>
                <span>文件</span>
                <strong>{formatText(taskErrorDetail.fileName || taskErrorDetail.docName || "-")}</strong>
                <span>状态</span>
                <strong>{taskStatusName(taskErrorDetail.status)}</strong>
              </div>
              <pre>{formatText(taskErrorDetail.errorMessage)}</pre>
            </div>
            <footer className="modal-actions aitext-modal-actions">
              <button onClick={() => setTaskErrorDetail(null)}>关闭</button>
            </footer>
          </section>
        </div>
      ) : null}

      {sensitiveAddOpen ? (
        <div className="confirm-mask" role="dialog" aria-modal="true">
          <section className="crud-modal aitext-sensitive-add-modal">
            <header>
              <strong>新增违规词</strong>
              <button className="icon-button" disabled={sensitiveAddBusy} onClick={() => setSensitiveAddOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="aitext-sensitive-add-body">
              <label>
                违规词 <span>*</span>
                <input
                  value={sensitiveAddForm.word}
                  onChange={(event) => setSensitiveAddForm((form) => ({ ...form, word: event.target.value }))}
                  placeholder="请输入违规词"
                  disabled={sensitiveAddBusy}
                  autoFocus
                />
              </label>
              <label>
                建议替换
                <input
                  value={sensitiveAddForm.replacement}
                  onChange={(event) => setSensitiveAddForm((form) => ({ ...form, replacement: event.target.value }))}
                  placeholder="选填"
                  disabled={sensitiveAddBusy}
                />
              </label>
              <label>
                备注
                <textarea
                  value={sensitiveAddForm.remark}
                  onChange={(event) => setSensitiveAddForm((form) => ({ ...form, remark: event.target.value }))}
                  placeholder="选填"
                  disabled={sensitiveAddBusy}
                />
              </label>
              <div className="aitext-sensitive-add-switch">
                <span>启用</span>
                <SwitchCell checked={sensitiveAddForm.enabled === 1} disabled={sensitiveAddBusy} onChange={(checked) => setSensitiveAddForm((form) => ({ ...form, enabled: checked ? 1 : 0 }))} />
              </div>
            </div>
            <footer className="modal-actions aitext-modal-actions">
              <button disabled={sensitiveAddBusy} onClick={() => setSensitiveAddOpen(false)}>取消</button>
              <button className="primary-button" disabled={sensitiveAddBusy || !sensitiveAddForm.word.trim()} onClick={() => void saveSensitiveWord()}>
                {sensitiveAddBusy ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
                保存
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {sensitiveExtractOpen ? (
        <div className="confirm-mask" role="dialog" aria-modal="true">
          <section className="crud-modal aitext-sensitive-extract-modal">
            <header>
              <strong>AI提取违规词</strong>
              <button className="icon-button" disabled={sensitiveExtractBusy} onClick={() => setSensitiveExtractOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="aitext-sensitive-extract-body">
              <label className="aitext-sensitive-model-field">
                模型
                <AppSelect
                  className="aitext-sensitive-model-select"
                  triggerClassName="aitext-sensitive-model-trigger"
                  menuClassName="aitext-sensitive-model-menu"
                  value={sensitiveExtractModel}
                  options={sensitiveExtractModelOptions}
                  onChange={setSensitiveExtractModel}
                  placeholder={sensitiveExtractModelLoading ? "加载模型中" : "请选择模型"}
                  disabled={sensitiveExtractBusy || sensitiveExtractModelLoading || !sensitiveExtractModelOptions.length}
                  maxMenuHeight={280}
                />
              </label>
              <label className="aitext-sensitive-source-field">
                <span className="aitext-sensitive-field-head">
                  <span>审核清单</span>
                </span>
                <textarea
                  className="aitext-sensitive-source-textarea"
                  value={sensitiveExtractContent}
                  onChange={(event) => setSensitiveExtractContent(event.target.value)}
                  placeholder="粘贴番茄审核词、敏感词说明或词表。点击 AI 提取后会生成可编辑候选词。"
                  disabled={sensitiveExtractBusy}
                />
              </label>
              {sensitiveExtractResult ? (
                <div className="aitext-sensitive-extract-result">
                  <div>
                    <span>提取</span>
                    <strong>{formatText(sensitiveExtractResult.extractedCount)}</strong>
                  </div>
                  <div>
                    <span>候选</span>
                    <strong>{formatText(normalizeSensitiveCandidates(sensitiveExtractCandidates).length)}</strong>
                  </div>
                  <div>
                    <span>已存在</span>
                    <strong>{formatText(sensitiveExtractResult.existingCount)}</strong>
                  </div>
                </div>
              ) : null}
              <label className="aitext-sensitive-candidate-field">
                候选违规词
                <div className="aitext-sensitive-candidate-tags">
                  {sensitiveExtractCandidates.length ? sensitiveExtractCandidates.map((word, index) => (
                    <span className="aitext-sensitive-candidate-tag" key={`${word}-${index}`}>
                      <input
                        value={word}
                        onChange={(event) => updateSensitiveCandidate(index, event.target.value)}
                        disabled={sensitiveExtractBusy}
                        aria-label={`候选违规词 ${index + 1}`}
                      />
                      <button type="button" disabled={sensitiveExtractBusy} onClick={() => removeSensitiveCandidate(index)} aria-label={`删除 ${word || "候选词"}`}>
                        <X size={14} />
                      </button>
                    </span>
                  )) : (
                    <span className="aitext-sensitive-candidate-empty">AI 提取后会在这里回显候选词，可编辑，删除后不会保存。</span>
                  )}
                </div>
              </label>
            </div>
            <footer className="modal-actions aitext-modal-actions">
              <button disabled={sensitiveExtractBusy} onClick={() => setSensitiveExtractOpen(false)}>关闭</button>
              <button
                className="primary-button"
                disabled={sensitiveExtractBusy || (sensitiveExtractCandidates.length ? !normalizeSensitiveCandidates(sensitiveExtractCandidates).length : (!sensitiveExtractContent.trim() || !sensitiveExtractModel))}
                onClick={() => void (sensitiveExtractCandidates.length ? saveSensitiveExtractWords() : extractSensitiveWords())}
              >
                {sensitiveExtractBusy ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />}
                {sensitiveExtractCandidates.length ? "保存词条" : "AI提取"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {chunkTask ? (
        <div className="confirm-mask">
          <section className="crud-modal aitext-job-modal">
            <header>
              <strong>任务块日志：{formatText(chunkTask.fileName)}</strong>
              <button className="icon-button" onClick={() => setChunkTask(null)}>
                <X size={18} />
              </button>
            </header>
            <DataTable columns={[
              { key: "chunkIndex", title: "块序号", width: 90 },
              { key: "status", title: "状态", width: 100, render: (row) => taskStatusName(row.status) },
              { key: "charCount", title: "字数", width: 80 },
              { key: "paragraphCount", title: "段落", width: 80 },
              { key: "sentenceCount", title: "句子", width: 80 },
              { key: "totalCostMs", title: "总耗时ms", width: 110 },
              { key: "retryCount", title: "重试", width: 70 },
              { key: "startedAt", title: "开始时间", width: 180, render: (row) => formatTime(row.startedAt) },
              { key: "completedAt", title: "完成时间", width: 180, render: (row) => formatTime(row.completedAt) },
              { key: "errorMessage", title: "错误", width: 120, render: (row) => row.errorMessage ? <button onClick={() => setTaskErrorDetail({ ...row, fileName: chunkTask.fileName })}>查看错误</button> : "-" }
            ]} rows={chunkState.rows} loading={chunkState.loading} page={chunkState.page} onPage={(page) => void reloadChunkLog(page)} minWidth={1200} />
          </section>
        </div>
      ) : null}

      {jobOpen ? (
        <div className="confirm-mask">
          <section className="crud-modal aitext-job-modal">
            <header>
              <strong>AI文本作业队列</strong>
              <button className="icon-button" onClick={() => setJobOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <DataTable columns={[
              { key: "id", title: "作业ID", width: 90 },
              { key: "jobNo", title: "作业编号", width: 210 },
              { key: "jobType", title: "类型", width: 120 },
              { key: "targetId", title: "任务ID", width: 100 },
              { key: "status", title: "状态", width: 110, render: (row) => taskStatusName(row.status) },
              { key: "progress", title: "进度", width: 120, render: (row) => `${formatNumber(row.progress, 0)}%` },
              { key: "currentStep", title: "当前步骤", width: 180 },
              { key: "errorMessage", title: "错误", width: 220 },
              { key: "createdAt", title: "创建时间", width: 180, render: (row) => formatTime(row.createdAt) },
              { key: "updatedAt", title: "更新时间", width: 180, render: (row) => formatTime(row.updatedAt) }
            ]} rows={jobState.rows} loading={jobState.loading} page={jobState.page} onPage={(page) => void loadJobs(page)} minWidth={1450} />
          </section>
        </div>
      ) : null}

      {corpusDetail ? (
        <div className="confirm-mask">
          <section className="crud-modal aitext-job-modal aitext-corpus-modal">
            <header>
              <strong>语料详情：{formatText(corpusDetail.docName || corpusDetail.fileName || corpusDetail.id)}</strong>
              <button className="icon-button" onClick={() => setCorpusDetail(null)}>
                <X size={18} />
              </button>
            </header>
            {corpusDetailLoading ? (
              <div className="aitext-empty">
                <LoadingState text="加载中" compact />
              </div>
            ) : (
              <div className="aitext-detail-layout">
                <div className="aitext-detail-grid">
                  {[
                    ["任务ID", corpusDetail.taskId],
                    ["来源", sourceTypeName(corpusDetail.sourceType)],
                    ["文档", corpusDetail.docName],
                    ["分片", corpusDetail.sourceIndex],
                    ["字数", corpusDetail.charCount],
                    ["段落", corpusDetail.paragraphCount],
                    ["句子", corpusDetail.sentenceCount],
                    ["对白占比", formatPercent(corpusDetail.dialogueRatio)],
                    ["均段字数", formatNumber(corpusDetail.avgParagraphChars)],
                    ["均句字数", formatNumber(corpusDetail.avgSentenceChars)]
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <span>{formatText(label)}</span>
                      <strong>{formatText(value)}</strong>
                    </div>
                  ))}
                </div>
                <JsonViewer value={corpusDetail} />
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function DatasetPane({
  config,
  datasets,
  setDatasetFilter,
  loadDataset,
  resetDatasetFilters,
  setDatasets
}: {
  config: DatasetConfig;
  datasets: Record<string, DataState>;
  setDatasetFilter: (key: string, field: string, value: string | number) => void;
  loadDataset: (key: string, config: { endpoint?: string; search?: DatasetConfig["search"] }, reset?: boolean, pageOverride?: PageState, filtersOverride?: Record<string, string | number>) => Promise<void>;
  resetDatasetFilters: (key: string, fields: DatasetConfig["search"], config: { endpoint?: string; search?: DatasetConfig["search"] }) => void;
  setDatasets: React.Dispatch<React.SetStateAction<Record<string, DataState>>>;
}) {
  if (!config) return null;
  if (config.split) {
    return (
      <div className="aitext-split-stack">
        {config.split.map((item) => {
          const state = datasets[item.key] || buildPageState();
          return (
            <section key={item.key} className="aitext-split-panel">
              <h3>{item.title}</h3>
              <SearchBar
                fields={item.search || []}
                values={state.filters as Record<string, string | number>}
                onChange={(field, value) => setDatasetFilter(item.key, field, value)}
                onSearch={() => void loadDataset(item.key, item, true)}
                onReset={() => resetDatasetFilters(item.key, item.search || [], item)}
              />
              <DataTable
                columns={item.columns}
                rows={state.rows}
                loading={state.loading}
                page={state.page}
                onPage={(page) => {
                  setDatasets((old) => ({ ...old, [item.key]: { ...(old[item.key] || buildPageState()), page } }));
                  void loadDataset(item.key, item, false, page);
                }}
                minWidth={1250}
              />
            </section>
          );
        })}
      </div>
    );
  }
  const state = datasets[config.key] || buildPageState();
  return (
    <>
      <SearchBar
        fields={config.search}
        values={state.filters as Record<string, string | number>}
        onChange={(field, value) => setDatasetFilter(config.key, field, value)}
        onSearch={() => void loadDataset(config.key, config as { endpoint: string; search?: DatasetConfig["search"] }, true)}
        onReset={() => resetDatasetFilters(config.key, config.search, config as { endpoint: string; search?: DatasetConfig["search"] })}
      >
        {config.toolbarExtra}
      </SearchBar>
      <DataTable
        columns={config.columns}
        rows={state.rows}
        loading={state.loading}
        page={state.page}
        onPage={(page) => {
          setDatasets((old) => ({ ...old, [config.key]: { ...(old[config.key] || buildPageState()), page } }));
          void loadDataset(config.key, config as { endpoint: string; search?: DatasetConfig["search"] }, false, page);
        }}
        minWidth={1350}
      />
    </>
  );
}

