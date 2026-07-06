import * as d3 from "d3";
import { Bot, Loader2, Maximize2, Minimize2, RefreshCw, Search, Upload, WandSparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeRows, uploadRecord } from "../api/admin";
import { postReq } from "../utils/request";
import { notify } from "../utils/notify";

type Row = Record<string, unknown>;

type Column = {
  key: string;
  title: string;
  width?: number;
  render?: (row: Row) => React.ReactNode;
};

type DatasetKey =
  | "word"
  | "pattern"
  | "feature"
  | "corpus"
  | "paragraph"
  | "runs"
  | "sentences"
  | "metrics"
  | "observations"
  | "experiments"
  | "lexicons"
  | "embeddings"
  | "duplicates";

type MainTab = "tasks" | DatasetKey | "dashboard" | "visualization";

type DatasetConfig = {
  key: DatasetKey;
  label: string;
  endpoint?: string;
  columns: Column[];
  search: Array<{ key: string; label: string; placeholder?: string; type?: "input" | "select"; options?: Array<{ label: string; value: string | number }> }>;
  split?: Array<{ key: string; title: string; endpoint: string; columns: Column[]; search?: DatasetConfig["search"] }>;
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
  { key: "pattern", label: "句式" },
  { key: "feature", label: "特征" },
  { key: "corpus", label: "语料" },
  { key: "paragraph", label: "段落" },
  { key: "runs", label: "分析运行" },
  { key: "sentences", label: "句子" },
  { key: "metrics", label: "指标" },
  { key: "observations", label: "特征观察" },
  { key: "experiments", label: "对比实验" },
  { key: "lexicons", label: "研究词库" },
  { key: "embeddings", label: "向量" },
  { key: "duplicates", label: "重复" },
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
  { label: "已完成", value: "completed" },
  { label: "失败", value: "failed" },
  { label: "已撤回", value: "rolled_back" },
  { label: "等待撤回", value: "rollback_pending" },
  { label: "撤回中", value: "rolling_back" },
  { label: "撤回失败", value: "rollback_failed" },
  { label: "等待删除", value: "delete_pending" },
  { label: "删除中", value: "deleting" },
  { label: "删除失败", value: "delete_failed" }
];

const featureTypeOptions = [
  { label: "全部特征", value: "all" },
  { label: "词汇偏向", value: "word" },
  { label: "模板句式", value: "pattern" },
  { label: "表层句式", value: "surface_pattern" },
  { label: "语义依存", value: "semantic_dependency" },
  { label: "依存关系", value: "dependency_relation" },
  { label: "语义角色", value: "semantic_role" },
  { label: "实体类型", value: "entity_type" },
  { label: "篇章标记", value: "discourse_marker" }
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
  comma_count: "逗号数",
  period_count: "句号数",
  quote_count: "引号数",
  question_count: "问号数",
  exclamation_count: "省略号数",
  ellipsis_count: "省略号数",
  dialogue_char_count: "对白字符数",
  surface_pattern_count: "表层模板句式数",
  discourse_marker_count: "篇章标记数",
  action_word_count: "动作词数",
  dependency_max_depth: "依存最大深度",
  semantic_frame_count: "语义框架数",
  named_entity_count: "命名实体数",
  noun_ratio: "名词占比",
  verb_ratio: "动词占比",
  adjective_ratio: "形容词占比",
  adverb_ratio: "副词占比",
  pronoun_ratio: "代词占比",
  conjunction_ratio: "连词占比",
  particle_ratio: "助词占比",
  adjacent_sentence_similarity: "相邻句相似度",
  abstract_density: "抽象表达密度",
  smoothness_score: "平滑度分",
  connector_count: "连接词数",
  paragraph_length_cv: "段长变异系数",
  ai_signal_score: "AI迹象分",
  modifier_density: "修饰语密度",
  information_density: "信息密度",
  repeated_ngram_ratio: "重复片段比例",
  specific_marker_count: "具体标记数",
  sentence_length_entropy: "句子长度熵",
  punctuation_entropy: "标点熵",
  dialogue_ratio: "对白占比",
  abstract_word_count: "抽象词数",
  emotion_word_count: "情绪词数",
  sensory_word_count: "感官词数",
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
  featureDefinitions: "特征字典",
  featureObservations: "特征观察",
  embeddings: "向量映射",
  duplicateEdges: "重复关系",
  comparisonRuns: "比较运行",
  comparisonResults: "比较结果",
  lexicons: "研究词库",
  lexiconEntries: "词库条目"
};

const featureTypeMap: Record<string, string> = {
  word: "词汇偏向",
  pattern: "模板句式",
  surface_pattern: "表层句式",
  semantic_dependency: "语义依存",
  dependency_relation: "依存关系",
  semantic_role: "语义角色",
  entity_type: "实体类型",
  discourse_marker: "篇章标记"
};

const taskStatusMap: Record<string, string> = {
  pending: "待执行",
  queued: "排队中",
  processing: "执行中",
  completed: "已完成",
  failed: "失败",
  skipped: "已跳过",
  rolled_back: "已撤回",
  rollback_pending: "等待撤回",
  rolling_back: "撤回中",
  rollback_failed: "撤回失败",
  delete_pending: "等待删除",
  deleting: "删除中",
  delete_failed: "删除失败"
};

const busyStatuses = new Set(["queued", "processing", "rollback_pending", "rolling_back", "delete_pending", "deleting"]);
const activeStatuses = new Set([...busyStatuses]);

function buildPageState(): DataState {
  return { rows: [], page: { ...pageDefaults }, loading: false, filters: {} };
}

function formatText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "-";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  if (/^\d{13}$/.test(text)) return new Date(Number(text)).toLocaleString();
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text.replace("T", " ").slice(0, 19);
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

function formatTime(value: unknown) {
  if (!value) return "-";
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const raw = Number(value);
    const timestamp = raw < 100000000000 ? raw * 1000 : raw;
    return new Date(timestamp).toLocaleString();
  }
  return formatText(value);
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

function taskStatusName(value: unknown) {
  const key = String(value || "");
  return taskStatusMap[key] || key || "-";
}

function statusClass(value: unknown) {
  const key = String(value || "");
  if (["completed"].includes(key)) return "success";
  if (["processing", "queued", "rolling_back", "deleting"].includes(key)) return "running";
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
  if (status === "processing") return `正在第 ${range} 块 / 共 ${total} 块`;
  if (status === "queued") return `排队，从第 ${next} 块继续`;
  if (status === "failed" && Number(record.nextPageIndex || 0) < total) return `断在第 ${next} 块，可继续`;
  if (status === "completed") return `已完成 ${total} 块`;
  if (status === "rolled_back") return "已撤回";
  return `待执行，从第 ${next} 块开始`;
}

function canExecute(record: Row) {
  const status = String(record.status || "");
  return !busyStatuses.has(status) && ["pending", "failed", "rolled_back"].includes(status);
}

function canRollback(record: Row) {
  const status = String(record.status || "");
  return !busyStatuses.has(status) && status !== "rolled_back";
}

function canDelete(record: Row) {
  return !busyStatuses.has(String(record.status || ""));
}

function SmallBadge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "success" | "running" | "danger" | "muted" | "ai" | "human" }) {
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
  const columnMinWidths = columns.map((column) => column.width || 150);
  const tableMinWidth = Math.max(minWidth, columnMinWidths.reduce((sum, width) => sum + width, 0));
  const flexibleCount = columns.filter((column) => !column.width).length;
  const grid = columns
    .map((column, index) => {
      const width = columnMinWidths[index];
      if (!column.width) return `minmax(${width}px, 1fr)`;
      if (!flexibleCount && index === columns.length - 1) return `minmax(${width}px, 1fr)`;
      return `minmax(${width}px, ${width}px)`;
    })
    .join(" ");
  return (
    <section className="aitext-table-card">
      <div className="aitext-table-scroll">
        <div className="aitext-table" style={{ minWidth: tableMinWidth }}>
          <div className="aitext-tr aitext-th" style={{ gridTemplateColumns: grid }}>
            {columns.map((column) => (
              <div key={column.key}>{column.title}</div>
            ))}
          </div>
          {loading ? (
            <div className="aitext-empty">
              <Loader2 className="spin" size={22} /> 正在加载
            </div>
          ) : rows.length === 0 ? (
            <div className="aitext-empty">暂无数据</div>
          ) : (
            rows.map((row, index) => (
              <div className="aitext-tr" style={{ gridTemplateColumns: grid }} key={String(row.id ?? row.key ?? index)}>
                {columns.map((column) => (
                  <div key={column.key} title={formatText(column.render ? "" : row[column.key])}>
                    {column.render ? column.render(row) : formatText(row[column.key])}
                  </div>
                ))}
              </div>
            ))
          )}
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
          <select value={page.pageSize} onChange={(event) => onPage({ ...page, pageNum: 1, pageSize: Number(event.target.value) })}>
            {[20, 50, 100].map((value) => (
              <option value={value} key={value}>
                {value} / 页
              </option>
            ))}
          </select>
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
          <select key={field.key} value={values[field.key] ?? "all"} onChange={(event) => onChange(field.key, event.target.value)}>
            {field.options?.map((item) => (
              <option key={String(item.value)} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
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

function MetricRadarD3({ rows, full = false, zoomed = false }: { rows: Row[]; full?: boolean; zoomed?: boolean }) {
  const ref = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    const width = full ? 980 : 760;
    const height = full ? 800 : 640;
    const cx = width / 2;
    const cy = height / 2;
    const radius = full ? 215 : 165;
    const values = rows
      .map((row) => {
        const ai = Number(row.aiAverage ?? row.aiMean ?? 0);
        const human = Number(row.humanAverage ?? row.humanMean ?? 0);
        const max = Math.max(Math.abs(ai), Math.abs(human), Number.EPSILON);
        return {
          label: metricName(row.metricKey ?? row.metricName),
          ai: Math.min(1, Math.abs(ai) / max),
          human: Math.min(1, Math.abs(human) / max),
          aiRaw: ai,
          humanRaw: human
        };
      })
      .filter((item) => item.label !== "-");
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
      const labelRadius = radius + (full ? 42 : 30);
      const angleDeg = (angle * 180) / Math.PI;
      const flipLabel = angleDeg > 90 && angleDeg < 270;
      const lx = Math.cos(angle) * labelRadius;
      const ly = Math.sin(angle) * labelRadius;
      const anchor = flipLabel ? "end" : "start";
      const rotate = angleDeg + (flipLabel ? 180 : 0);
      const tone = metricGapToneClass(item.ai, item.human);
      const labelGroup = g.append("g").attr("transform", `translate(${lx},${ly}) rotate(${rotate})`);
      const labelText = labelGroup
        .append("text")
        .attr("class", "aitext-radar-label-text")
        .attr("x", 0)
        .attr("y", 0)
        .attr("text-anchor", anchor)
        .attr("dominant-baseline", "middle")
        .attr("font-size", 17)
        .text(full ? truncateLabel(item.label, 8) : item.label);
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
      labelText
        .append("title")
        .text(`${item.label}\nAI：${formatNumber(item.aiRaw)}\n人工：${formatNumber(item.humanRaw)}\n差值：${formatNumber(item.aiRaw - item.humanRaw)}`);
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
    const drawArea = (key: "ai" | "human", color: string) => {
      const data = values.map((item, index) => pointOf(index, item[key]));
      g.append("path")
        .datum(data)
        .attr("d", line)
        .attr("fill", color)
        .attr("fill-opacity", 0.12)
        .attr("stroke", color)
        .attr("stroke-width", 3);
      values.forEach((item, index) => {
        const point = pointOf(index, item[key]);
        g.append("circle")
          .attr("cx", point.x)
          .attr("cy", point.y)
          .attr("r", full ? 2.5 : 4)
          .attr("fill", color)
          .append("title")
          .text(`${item.label}\nAI：${formatNumber(item.aiRaw)}\n人工：${formatNumber(item.humanRaw)}\n差值：${formatNumber(item.aiRaw - item.humanRaw)}`);
      });
    };
    drawArea("human", "#12b981");
    drawArea("ai", "#ff2f5f");
  }, [rows, full]);
  return <svg className={`aitext-d3-radar ${full ? "full" : ""} ${zoomed ? "zoomed" : ""}`} ref={ref} />;
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
  const hasData = sourceStats.some((item) => Number(item.charCount || item.corpusCount || 0) > 0);
  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    if (!hasData) return;
    const width = 420;
    const height = 300;
    const radius = 105;
    const data = sourceStats.map((item) => ({
      name: sourceTypeName(item.sourceType),
      value: Number(item.charCount || item.corpusCount || 0),
      color: String(item.sourceType) === "human" ? "#12b981" : "#ff2f5f"
    }));
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);
    const pie = d3.pie<(typeof data)[number]>().value((d) => d.value).sort(null);
    const arc = d3.arc<d3.PieArcDatum<(typeof data)[number]>>().innerRadius(62).outerRadius(radius);
    g.selectAll("path")
      .data(pie(data))
      .join("path")
      .attr("d", arc)
      .attr("fill", (d) => d.data.color)
      .attr("stroke", "var(--card-bg)")
      .attr("stroke-width", 2)
      .append("title")
      .text((d) => `${d.data.name}：${formatNumber(d.data.value, 0)}`);
    g.selectAll("text")
      .data(pie(data))
      .join("text")
      .attr("transform", (d) => `translate(${arc.centroid(d)})`)
      .attr("text-anchor", "middle")
      .attr("font-size", 18)
      .attr("fill", "var(--text-color)")
      .text((d) => d.data.name);
  }, [sourceStats, hasData]);
  return hasData ? <svg className="aitext-d3-donut" ref={ref} /> : <div className="aitext-empty">暂无样本构成数据</div>;
}

function MetricBiasD3({ rows }: { rows: Row[] }) {
  const data = rows
    .map((row) => {
      const diff = Number(row.difference ?? row.meanDiff ?? 0);
      const gap = Number(row.relativeGap ?? 0);
      return {
        label: metricName(row.metricKey ?? row.metricName),
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
          <div className="aitext-bias-row" key={item.label} title={`AI ${formatNumber(item.ai)} / 人工 ${formatNumber(item.human)} / 差值 ${formatNumber(item.value)}`}>
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
      .attr("stroke-width", 1.2)
      .append("title")
      .text((d) => `${d.data.name}\n记录数：${formatNumber(d.data.value, 0)}\n面积按对数缩放`);
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
        label: metricName(row.metricKey || row.metricName),
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
          <div className="aitext-heatmap-row" key={String(row.metricKey || row.metricName || row.label)} title={`${row.label}\nAI：${formatNumber(row.aiAverage)}\n人工：${formatNumber(row.humanAverage)}\n差值：${formatNumber(row.difference ?? Number(row.aiAverage || 0) - Number(row.humanAverage || 0))}`}>
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
  ) : <div className="aitext-empty">暂无全量指标数据</div>;
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
          <div key={text} title={text}>
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

function DetectReport({ result }: { result: Row }) {
  const [selected, setSelected] = useState(0);
  const report = (result.report || result.summary || {}) as Row;
  const blocks = asRows(result.blocks || result.paragraphs || result.segments).map((row, index) => ({
    ...row,
    index: row.index ?? row.paragraphIndex ?? row.blockIndex ?? index + 1,
    text: row.text ?? row.content ?? row.paragraphText ?? ""
  })) as Row[];
  useEffect(() => setSelected(0), [result]);
  const current = (blocks[selected] || blocks[0] || {}) as Row;
  const rawEvidence = asRows(current.evidence || current.evidences || current.signals || result.evidence || result.evidences);
  const metricComparisons = asRows(result.metricComparisons || result.metrics || report.metricComparisons);
  const score = normalizeScore(report.score ?? result.score ?? current.aiScore ?? 0);
  const confidence = report.confidence ?? result.confidence ?? 0;
  const highRisk = report.highRiskBlocks ?? result.highRiskBlocks ?? blocks.filter((item) => normalizeScore(item.aiScore ?? item.score) >= 65).length;
  const strength = score >= 65 ? "强" : score >= 26 ? "中" : "弱";

  return (
    <div className="aitext-report">
      <div className="aitext-report-kpis">
        <div><span>综合分</span><strong>{formatNumber(score, 0)}</strong><small>0-25弱，26-64中，65以上强</small></div>
        <div><span>置信度</span><strong>{formatPercent(confidence)}</strong><small>多维痕迹互印证</small></div>
        <div><span>高风险块</span><strong>{formatText(highRisk)}</strong><small>按块定位风险</small></div>
        <div><span>痕迹强度</span><strong>{strength}</strong><small>基于综合评分</small></div>
      </div>
      <div className="aitext-detect-report">
        <div className="aitext-detect-block-list">
          {blocks.length ? blocks.map((block, index) => {
            const displayScore = normalizeScore(block.aiScore ?? block.score ?? 0);
            const risk = displayScore >= 65 ? "高风险" : displayScore >= 26 ? "中风险" : "低风险";
            return (
              <button key={`${block.index}-${index}`} className={selected === index ? "active" : ""} onClick={() => setSelected(index)}>
                <span>第{formatText(block.index)}块</span>
                <b>{risk}</b>
                <strong>{formatNumber(displayScore, 0)}</strong>
                <p>{formatText(block.text)}</p>
              </button>
            );
          }) : <div className="aitext-empty">暂无正文</div>}
        </div>
        <aside className="aitext-evidence-side">
          <h3>第{formatText(current.index || selected + 1)}块痕迹链</h3>
          <div className="aitext-evidence-score">
            <div><span>基准偏离</span><strong>{formatPercent(current.baselineDeviationScore ?? current.baselineScore ?? 0)}</strong></div>
            <div><span>学习命中</span><strong>{formatPercent(current.learningScore ?? 0)}</strong></div>
            <div><span>结构启发</span><strong>{formatPercent(current.structureScore ?? 0)}</strong></div>
          </div>
          <h4>风险来源聚合</h4>
          <div className="aitext-risk-bars">
            {rawEvidence.slice(0, 6).map((item, index) => {
              const contribution = Number(item.contribution ?? item.weight ?? item.score ?? 0);
              return (
                <div key={index}>
                  <span>{formatText(item.typeName || item.name || item.type || item.metricName || item.featureType)}</span>
                  <i style={{ width: `${Math.min(100, Math.max(6, Math.abs(contribution) * 100))}%` }} />
                  <b>{formatPercent(contribution)}</b>
                </div>
              );
            })}
          </div>
          <h4>具体痕迹</h4>
          <div className="aitext-evidence-list">
            {rawEvidence.slice(0, 12).map((item, index) => (
              <div key={index}>
                <strong>{formatText(item.title || item.name || item.typeName || item.metricName || item.featureType || "痕迹")}</strong>
                <span>{formatText(item.description || item.reason || item.text || item.evidence || item.featureText)}</span>
                <small>贡献 {formatPercent(item.contribution ?? item.weight ?? item.score ?? 0)}</small>
              </div>
            ))}
            {!rawEvidence.length ? <div className="aitext-empty">暂无当前块痕迹</div> : null}
          </div>
        </aside>
      </div>
      <DataTable columns={[
        { key: "metricKey", title: "指标", width: 220, render: (row) => metricName(row.metricKey || row.metricName) },
        { key: "currentValue", title: "当前值", width: 120, render: (row) => formatNumber(row.currentValue ?? row.value) },
        { key: "aiAverage", title: "AI均值", width: 120, render: (row) => formatNumber(row.aiAverage ?? row.aiMean) },
        { key: "humanAverage", title: "人工均值", width: 120, render: (row) => formatNumber(row.humanAverage ?? row.humanMean) },
        { key: "contribution", title: "贡献", width: 100, render: (row) => formatPercent(row.contribution ?? row.weight) },
        { key: "explain", title: "解释", width: 360, render: (row) => formatText(row.explain || row.description || row.reason) }
      ]} rows={metricComparisons} minWidth={1120} />
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
  const [summaryRefreshing, setSummaryRefreshing] = useState(false);
  const [radarZoomed, setRadarZoomed] = useState(false);
  const [baseline, setBaseline] = useState<Row>({});
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [batchPages, setBatchPages] = useState(1);
  const [concurrency] = useState(1);
  const [taskBusy, setTaskBusy] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadSourceType, setUploadSourceType] = useState("ai");
  const [uploadChars, setUploadChars] = useState(2000);
  const [detectOpen, setDetectOpen] = useState(false);
  const [detectText, setDetectText] = useState("");
  const [detectModel, setDetectModel] = useState("");
  const [detectModels, setDetectModels] = useState<Array<{ label: string; value: string }>>([]);
  const [detectUseAI, setDetectUseAI] = useState(false);
  const [detectResult, setDetectResult] = useState<Row | null>(null);
  const [detectLoading, setDetectLoading] = useState(false);
  const [chunkTask, setChunkTask] = useState<Row | null>(null);
  const [chunkState, setChunkState] = useState<DataState>(() => ({ ...buildPageState(), filters: { status: "all" } }));
  const [jobOpen, setJobOpen] = useState(false);
  const [jobState, setJobState] = useState<DataState>(() => ({ ...buildPageState(), filters: { jobType: "all", status: "all", targetId: "" } }));
  const [corpusDetail, setCorpusDetail] = useState<Row | null>(null);
  const [corpusDetailLoading, setCorpusDetailLoading] = useState(false);

  const tableAction = async (endpoint: string, payload: Row, success: string) => {
    const resp = await postReq(endpoint, payload);
    if (resp.code === 0 || resp.code === undefined) {
      notify({ type: "success", title: "操作成功", message: success });
      await Promise.all([loadTasks(true), loadSummary()]);
    }
  };

  const updateTaskSource = async (row: Row, sourceType: string) => {
    const resp = await postReq("/check/aitext/task/source", { id: row.id, sourceType });
    if (resp.code === 0 || resp.code === undefined) {
      notify({ type: "success", title: "类型已更新", message: "任务样本类型已同步" });
      await loadTasks(true);
    }
  };

  const taskColumns: Column[] = [
    { key: "id", title: "任务ID", width: 86 },
    { key: "fileName", title: "文件", width: 300 },
    {
      key: "sourceType",
      title: "类型",
      width: 110,
      render: (row) => {
        const locked = busyStatuses.has(String(row.status || "")) || Number(row.nextPageIndex || 0) > 0;
        return (
          <select className="aitext-inline-select" value={String(row.sourceType || "ai")} disabled={locked} onChange={(event) => void updateTaskSource(row, event.target.value)}>
            <option value="ai">AI文</option>
            <option value="human">人工文</option>
          </select>
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
    { key: "executionPoint", title: "执行位置", width: 210, render: executionPoint },
    { key: "pageTargetChars", title: "兜底字数", width: 100 },
    { key: "charCount", title: "字数", width: 95 },
    { key: "paragraphCount", title: "段落", width: 80 },
    { key: "corpusCount", title: "语料", width: 80 },
    { key: "wordCount", title: "词汇", width: 80 },
    { key: "patternCount", title: "句式", width: 80 },
    { key: "featureCount", title: "特征", width: 80 },
    { key: "createdAt", title: "创建时间", width: 210, render: (row) => formatTime(row.createdAt ?? row.createTime) },
    { key: "updatedAt", title: "更新时间", width: 210, render: (row) => formatTime(row.updatedAt ?? row.updateTime) },
    { key: "errorMessage", title: "错误", width: 220 },
    {
      key: "action",
      title: "操作",
      width: 360,
      render: (row) => (
        <div className="aitext-row-actions">
          <button disabled={!canExecute(row) || taskBusy} onClick={() => executeTask(row)}>
            开始执行
          </button>
          <button onClick={() => openChunkLog(row)}>块日志</button>
          {String(row.status) === "processing" ? <button onClick={() => void tableAction("/check/aitext/task/unlock", { id: row.id }, "任务已解锁")}>解锁</button> : null}
          <button disabled={!canRollback(row)} onClick={() => void tableAction("/check/aitext/task/rollback", { id: row.id }, "任务已加入撤回队列")}>
            撤回
          </button>
          <button className="danger-text" disabled={!canDelete(row)} onClick={() => window.confirm("删除任务及其全部研究数据，且不可恢复，确认继续？") && void tableAction("/check/aitext/task/delete", { id: row.id }, "任务已加入删除队列")}>
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
          { key: "pattern", title: "句式", width: 360 },
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
        { key: "featureType", title: "类型", width: 130, render: (row) => featureTypeName(row.featureType) },
        { key: "featureText", title: "特征", width: 360 },
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
        { key: "taskId", title: "任务ID", width: 90 },
        { key: "corpusId", title: "语料块ID", width: 120 },
        { key: "sourceType", title: "来源", width: 90, render: (row) => sourceTypeName(row.sourceType) },
        { key: "paragraphIndex", title: "段序", width: 80 },
        { key: "charCount", title: "字数", width: 80 },
        { key: "sentenceCount", title: "句数", width: 80 },
        { key: "dialogueRatio", title: "对白占比", width: 100, render: (row) => formatPercent(row.dialogueRatio) },
        { key: "avgSentenceChars", title: "均句", width: 80, render: (row) => formatNumber(row.avgSentenceChars) },
        { key: "punctuationEntropy", title: "标点熵", width: 90, render: (row) => formatNumber(row.punctuationEntropy) },
        { key: "abstractWordCount", title: "抽象", width: 80 },
        { key: "emotionWordCount", title: "情绪", width: 80 },
        { key: "sensoryWordCount", title: "感官", width: 80 },
        { key: "templatePatternCount", title: "模板", width: 80 }
      ]),
      runs: dataset("runs", "/check/aitext/research/run/page", "分析运行", [
        { key: "taskId", label: "任务ID", placeholder: "任务ID" },
        { key: "status", label: "状态", type: "select", options: [{ label: "全部状态", value: "all" }, { label: "完成", value: "completed" }, { label: "失败", value: "failed" }] }
      ], [
        { key: "id", title: "ID", width: 90 },
        { key: "taskId", title: "任务ID", width: 90 },
        { key: "requestId", title: "请求ID", width: 190 },
        { key: "pipelineVersion", title: "管线版本", width: 170 },
        { key: "status", title: "状态", width: 100, render: (row) => taskStatusName(row.status) },
        { key: "documentCount", title: "文档数", width: 90 },
        { key: "analyzerVersions", title: "分析器版本", width: 260 },
        { key: "errorMessage", title: "错误", width: 220 },
        { key: "startedAt", title: "开始时间", width: 210, render: (row) => formatTime(row.startedAt) },
        { key: "completedAt", title: "完成时间", width: 210, render: (row) => formatTime(row.completedAt) }
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
        { key: "textHash", title: "文本哈希", width: 220 },
        { key: "metricsJson", title: "完整指标", width: 360 },
        { key: "createTime", title: "创建时间", width: 210, render: (row) => formatTime(row.createTime) }
      ]),
      metrics: dataset("metrics", "/check/aitext/research/metric/page", "指标", [
        { key: "taskId", label: "任务ID", placeholder: "任务ID" },
        { key: "corpusId", label: "语料ID", placeholder: "语料ID" },
        { key: "scopeType", label: "层级", type: "select", options: [{ label: "全部层级", value: "all" }, { label: "语料", value: "corpus" }, { label: "段落", value: "paragraph" }, { label: "句子", value: "sentence" }] },
        { key: "metricKey", label: "指标", placeholder: "指标" }
      ], [
        { key: "taskId", title: "任务ID", width: 90 },
        { key: "corpusId", title: "语料ID", width: 100 },
        { key: "analysisRunId", title: "运行ID", width: 100 },
        { key: "scopeType", title: "层级", width: 90 },
        { key: "scopeIndex", title: "层级序号", width: 100 },
        { key: "metricKey", title: "指标", width: 240, render: (row) => metricName(row.metricKey) },
        { key: "metricValue", title: "数值", width: 130, render: (row) => formatNumber(row.metricValue) },
        { key: "createTime", title: "创建时间", width: 210, render: (row) => formatTime(row.createTime) }
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
        { key: "docName", title: "文档", width: 180 },
        { key: "featureType", title: "特征类型", width: 130, render: (row) => featureTypeName(row.featureType) },
        { key: "featureText", title: "特征内容", width: 360 },
        { key: "featureCount", title: "命中次数", width: 100 },
        { key: "scopeType", title: "层级", width: 90 },
        { key: "featureId", title: "特征ID", width: 100 },
        { key: "analysisRunId", title: "运行ID", width: 100 },
        { key: "createTime", title: "创建时间", width: 210, render: (row) => formatTime(row.createTime) }
      ]),
      experiments: {
        key: "experiments",
        label: "对比实验",
        search: [],
        columns: [],
        split: [
          { key: "comparisonRun", title: "实验运行", endpoint: "/check/aitext/research/comparison/run/page", columns: [
            { key: "id", title: "ID", width: 90 }, { key: "taskId", title: "任务ID", width: 90 }, { key: "name", title: "名称", width: 180 }, { key: "leftCohortJson", title: "左侧队列", width: 240 }, { key: "rightCohortJson", title: "右侧队列", width: 240 }, { key: "pipelineVersion", title: "管线", width: 150 }, { key: "status", title: "状态", width: 90, render: (row) => taskStatusName(row.status) }, { key: "startedAt", title: "开始时间", width: 210, render: (row) => formatTime(row.startedAt) }, { key: "completedAt", title: "完成时间", width: 210, render: (row) => formatTime(row.completedAt) }
          ], search: [{ key: "taskId", label: "任务ID", placeholder: "任务ID" }, { key: "name", label: "名称", placeholder: "实验名称" }, { key: "status", label: "状态", type: "select", options: [{ label: "全部状态", value: "all" }, { label: "完成", value: "completed" }, { label: "失败", value: "failed" }] }] },
          { key: "comparisonResult", title: "实验结果", endpoint: "/check/aitext/research/comparison/result/page", columns: [
            { key: "comparisonRunId", title: "实验ID", width: 100 }, { key: "resultType", title: "类型", width: 90 }, { key: "resultKey", title: "结果键", width: 280, render: (row) => metricName(row.resultKey) }, { key: "leftValue", title: "左值", width: 100, render: (row) => formatNumber(row.leftValue) }, { key: "rightValue", title: "右值", width: 100, render: (row) => formatNumber(row.rightValue) }, { key: "effectSize", title: "效应量", width: 100, render: (row) => formatNumber(row.effectSize) }, { key: "pValue", title: "P值", width: 100, render: (row) => formatNumber(row.pValue, 4) }, { key: "adjustedPValue", title: "FDR", width: 100, render: (row) => formatNumber(row.adjustedPValue, 4) }, { key: "taskId", title: "任务ID", width: 90 }
          ], search: [{ key: "comparisonRunId", label: "实验ID", placeholder: "实验ID" }, { key: "resultType", label: "类型", type: "select", options: [{ label: "全部类型", value: "all" }, { label: "特征", value: "feature" }, { label: "指标", value: "metric" }] }, { key: "name", label: "结果键", placeholder: "结果键" }] }
        ]
      },
      lexicons: {
        key: "lexicons",
        label: "研究词库",
        search: [],
        columns: [],
        split: [
          { key: "lexicon", title: "词库版本", endpoint: "/check/aitext/research/lexicon/page", columns: [
            { key: "id", title: "ID", width: 90 }, { key: "taskId", title: "任务ID", width: 90 }, { key: "lexiconKey", title: "词库键", width: 180 }, { key: "name", title: "名称", width: 180 }, { key: "version", title: "版本", width: 100 }, { key: "description", title: "说明", width: 360 }, { key: "createTime", title: "创建时间", width: 210, render: (row) => formatTime(row.createTime) }
          ], search: [{ key: "name", label: "词库", placeholder: "词库名称或键" }] },
          { key: "lexiconEntry", title: "词库条目", endpoint: "/check/aitext/research/lexicon/entry/page", columns: [
            { key: "id", title: "ID", width: 90 }, { key: "lexiconId", title: "词库ID", width: 100 }, { key: "lexiconName", title: "词库", width: 180 }, { key: "entryText", title: "条目", width: 260 }, { key: "weight", title: "权重", width: 100, render: (row) => formatNumber(row.weight) }, { key: "metadataJson", title: "元数据", width: 360 }, { key: "taskId", title: "任务ID", width: 90 }
          ], search: [{ key: "lexiconId", label: "词库ID", placeholder: "词库ID" }, { key: "name", label: "条目", placeholder: "搜索条目" }] }
        ]
      },
      embeddings: dataset("embeddings", "/check/aitext/research/embedding/page", "向量", [
        { key: "taskId", label: "任务ID", placeholder: "任务ID" },
        { key: "corpusId", label: "语料ID", placeholder: "语料ID" },
        { key: "modelName", label: "模型", placeholder: "模型名称" }
      ], [
        { key: "taskId", title: "任务ID", width: 90 }, { key: "corpusId", title: "语料ID", width: 100 }, { key: "scopeType", title: "层级", width: 90 }, { key: "scopeIndex", title: "序号", width: 80 }, { key: "modelName", title: "模型", width: 180 }, { key: "modelVersion", title: "模型版本", width: 130 }, { key: "vectorId", title: "向量ID", width: 220 }, { key: "contentHash", title: "内容哈希", width: 220 }, { key: "createTime", title: "创建时间", width: 210, render: (row) => formatTime(row.createTime) }
      ]),
      duplicates: dataset("duplicates", "/check/aitext/research/duplicate/page", "重复", [
        { key: "taskId", label: "任务ID", placeholder: "任务ID" },
        { key: "corpusId", label: "语料ID", placeholder: "语料ID" },
        { key: "duplicateType", label: "类型", type: "select", options: [{ label: "全部类型", value: "all" }, { label: "精确重复", value: "exact" }, { label: "MinHash", value: "minhash" }, { label: "模糊重复", value: "fuzzy" }, { label: "语义重复", value: "semantic" }] }
      ], [
        { key: "leftTaskId", title: "左任务", width: 90 }, { key: "rightTaskId", title: "右任务", width: 90 }, { key: "leftCorpusId", title: "左语料", width: 100 }, { key: "rightCorpusId", title: "右语料", width: 100 }, { key: "id", title: "ID", width: 90 }, { key: "duplicateType", title: "重复类型", width: 120 }, { key: "similarity", title: "相似度", width: 100, render: (row) => formatNumber(row.similarity) }, { key: "evidenceJson", title: "痕迹", width: 360 }, { key: "createTime", title: "创建时间", width: 210, render: (row) => formatTime(row.createTime) }
      ])
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
  const fullRadarRows = useMemo(() => comparableMetricRows.slice(0, 48), [comparableMetricRows]);
  const coverageRows = useMemo(() => [
    { label: "段落事实覆盖", value: safeRatio(dataAssetMap.paragraphs, globalTotals.paragraphs), detail: `${dataAssetMap.paragraphs || 0} / ${globalTotals.paragraphs}` },
    { label: "句子事实覆盖", value: safeRatio(dataAssetMap.sentences, globalTotals.sentences), detail: `${dataAssetMap.sentences || 0} / ${globalTotals.sentences}` },
    { label: "任务完成率", value: safeRatio(taskStatusMapData.completed, dataAssetMap.tasks), detail: `${taskStatusMapData.completed || 0} / ${dataAssetMap.tasks || 0}` },
    { label: "分析成功率", value: safeRatio(runStatusMapData.completed, dataAssetMap.analysisRuns), detail: `${runStatusMapData.completed || 0} / ${dataAssetMap.analysisRuns || 0}` },
    { label: "向量覆盖率", value: safeRatio(dataAssetMap.embeddings, globalTotals.corpus), detail: `${dataAssetMap.embeddings || 0} / ${globalTotals.corpus}` }
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
      if (resp.code === 0 || resp.code === undefined) setSummary((resp.data || {}) as Row);
    } finally {
      setSummaryLoading(false);
    }
  };

  const refreshSummary = async () => {
    setSummaryRefreshing(true);
    try {
      const resp = await postReq<Row>("/check/aitext/novel/summary/refresh", {});
      if (resp.code === 0 || resp.code === undefined) {
        setSummary((resp.data || {}) as Row);
        notify({ type: "success", title: "缓存已刷新", message: "全局与可视化数据已更新" });
      }
    } finally {
      setSummaryRefreshing(false);
    }
  };

  const loadBaseline = async () => {
    const resp = await postReq<Row>("/check/aitext/baseline/status", {});
    if (resp.code === 0 || resp.code === undefined) setBaseline((resp.data || {}) as Row);
  };

  const rebuildBaseline = async () => {
    setBaselineLoading(true);
    try {
      const resp = await postReq<Row>("/check/aitext/baseline/rebuild", {});
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "检测基准已重建", message: `指标 ${formatText((resp.data as Row)?.metricCount)} 项` });
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
    setTaskState((state) => ({ ...state, page: { ...state.page, pageNum: 1 }, filters: { ...state.filters, [key]: value } }));
  };

  const resetTaskFilters = () => {
    const filters = { fileName: "", sourceType: "all", status: "all" };
    const page = { ...taskState.page, pageNum: 1 };
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
      const resp = await postReq<Row>("/check/aitext/task/execute", { id: row.id, batchPages, concurrency });
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "任务已提交", message: (resp.data as Row)?.finished ? "处理完成" : "已加入执行队列" });
        await Promise.all([loadTasks(true), loadSummary()]);
      }
    } finally {
      setTaskBusy(false);
    }
  };

  const executeAll = async () => {
    setTaskBusy(true);
    try {
      const resp = await postReq<Row>("/check/aitext/task/execute/all", { ...cleanPayload(taskState.filters, taskState.page), batchPages, concurrency });
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "一键执行", message: `已加入执行队列：${formatText((resp.data as Row)?.count || 0)} 个任务` });
        await loadTasks(true);
      }
    } finally {
      setTaskBusy(false);
    }
  };

  const rollbackAll = async () => {
    if (!window.confirm("会把当前筛选下所有可撤回任务加入撤回队列，确认继续？")) return;
    setTaskBusy(true);
    try {
      const resp = await postReq<Row>("/check/aitext/task/rollback/all", { ...cleanPayload(taskState.filters, taskState.page), batchPages, concurrency });
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "一键撤回", message: `已加入撤回队列：${formatText((resp.data as Row)?.count || 0)} 个任务` });
        await loadTasks(true);
      }
    } finally {
      setTaskBusy(false);
    }
  };

  const uploadTasks = async () => {
    if (!uploadFiles.length) {
      notify({ type: "warning", title: "请选择文档", message: "支持 txt、md、docx、pdf" });
      return;
    }
    const form = new FormData();
    uploadFiles.forEach((file) => form.append("files", file));
    form.append("pageTargetChars", String(uploadChars));
    form.append("sourceType", uploadSourceType);
    const resp = await uploadRecord("/check/aitext/task/create", form);
    if (resp.code === 0 || resp.code === undefined) {
      notify({ type: "success", title: "任务已创建", message: `已创建 ${Array.isArray(resp.data) ? resp.data.length : 0} 个文件任务` });
      setUploadOpen(false);
      setUploadFiles([]);
      await loadTasks(true);
    }
  };

  const loadDetectModels = async () => {
    const [optionResp, defaultResp] = await Promise.all([postReq<unknown[]>("/check/chat/param/option", {}), postReq<Row>("/check/chat/param/model", {})]);
    if (optionResp.code === 0 || optionResp.code === undefined) {
      const models = (Array.isArray(optionResp.data) ? optionResp.data : [])
        .map((item) => {
          if (typeof item === "string") return { label: item, value: item };
          const row = item as Row;
          const value = String(row.value || row.model || row.name || "");
          return value ? { label: String(row.label || row.model || row.name || value), value } : null;
        })
        .filter(Boolean) as Array<{ label: string; value: string }>;
      setDetectModels(models);
    }
    const model = String((defaultResp.data as Row)?.model || "");
    if (model) setDetectModel(model);
  };

  const runDetect = async () => {
    if (!detectText.trim()) {
      notify({ type: "warning", title: "请输入待测文本", message: "AI检测需要正文内容" });
      return;
    }
    setDetectLoading(true);
    try {
      const resp = await postReq<Row>("/check/aitext/detect", {
        content: detectText.trim(),
        useAIEnhance: detectUseAI && Boolean(detectModel),
        aiModel: detectModel,
        aiThinking: "disabled"
      });
      if (resp.code === 0 || resp.code === undefined) setDetectResult((resp.data || {}) as Row);
    } finally {
      setDetectLoading(false);
    }
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

  const updateFilterLike = async (type: "word" | "pattern", row: Row, action: "filter" | "lock" | "blacklist", checked: boolean) => {
    const keyMap = { filter: "isFilter", lock: "isLock", blacklist: "isBlacklist" };
    const endpoint = `/check/aitext/${type}/${action}`;
    const resp = await postReq(endpoint, { id: row.id, [keyMap[action]]: checked ? 1 : 0 });
    if (resp.code === 0 || resp.code === undefined) await loadDataset(type, datasetConfigs[type], false);
  };

  const deleteWordPattern = async (type: "word" | "pattern", row: Row) => {
    if (!window.confirm(`确认删除${type === "word" ? "词汇" : "句式"}?`)) return;
    const resp = await postReq(`/check/aitext/${type}/delete`, { id: row.id });
    if (resp.code === 0 || resp.code === undefined) await loadDataset(type, datasetConfigs[type], false);
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
    void Promise.all([loadTasks(), loadSummary(), loadBaseline(), loadDetectModels()]);
  }, []);

  useEffect(() => {
    if (!taskState.rows.some((row) => activeStatuses.has(String(row.status || "")))) return;
    const timer = window.setInterval(() => {
      void Promise.all([loadTasks(true), loadSummary()]);
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
        <button className="primary-button" onClick={() => setDetectOpen(true)}>
          <Bot size={18} /> AI检测
        </button>
        <button onClick={() => setUploadOpen(true)}>
          <Upload size={18} /> 上传文档采集
        </button>
        <button onClick={rebuildBaseline} disabled={baselineLoading}>
          {baselineLoading ? <Loader2 className="spin" size={18} /> : <WandSparkles size={18} />} 重建检测基准
        </button>
        <SmallBadge tone={baseline.ready ? "success" : "running"}>{baseline.ready ? `基准 ${formatText(baseline.metricCount || 0)} 项` : "基准不足"}</SmallBadge>
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
                串行 <input type="number" min={1} max={1} value={concurrency} disabled />
              </label>
              <button onClick={() => void loadTasks()}>
                <RefreshCw size={18} /> 刷新
              </button>
              <button className="primary-button" disabled={taskBusy} onClick={() => void executeAll()}>
                一键执行
              </button>
              <button disabled={taskBusy} onClick={() => void rollbackAll()}>
                一键撤回
              </button>
              <button onClick={() => void loadJobs()}>作业记录</button>
            </SearchBar>
            <DataTable
              columns={taskColumns}
              rows={taskState.rows}
              loading={taskState.loading}
              page={taskState.page}
              onPage={(page) => {
                setTaskState((state) => ({ ...state, page }));
                void loadTasks(false, page);
              }}
              minWidth={2900}
            />
          </>
        ) : activeTab === "dashboard" ? (
          <section className="aitext-dashboard">
            <div className="aitext-cache-row">
              <span>缓存：{summary.cacheUpdatedAt ? formatTime(summary.cacheUpdatedAt) : "未生成"}</span>
              <button disabled={summaryRefreshing} onClick={() => void refreshSummary()}>
                {summaryRefreshing ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />} 刷新缓存
              </button>
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
              <span>缓存：{summary.cacheUpdatedAt ? formatTime(summary.cacheUpdatedAt) : "未生成"}</span>
              <button disabled={summaryRefreshing} onClick={() => void refreshSummary()}>
                <RefreshCw size={18} /> 刷新缓存
              </button>
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
                <RadarTitle zoomed={radarZoomed} onZoom={() => setRadarZoomed((value) => !value)}>全量指标雷达图</RadarTitle>
                <p>最多展示 48 个指标，标签做截断，详细数值看下方热力矩阵。</p>
                {fullRadarRows.length ? <MetricRadarD3 rows={fullRadarRows} full zoomed={radarZoomed} /> : <div className="aitext-empty">暂无全量指标数据</div>}
              </section>
              <section className="aitext-panel full aitext-heatmap-panel">
                <div className="aitext-panel-sticky-title">
                  <h3>全部指标热力矩阵</h3>
                  <p>每个指标一行，展示 AI 均值、人工均值、差异强度与偏向。</p>
                </div>
                <MetricHeatmapD3 rows={comparableMetricRows} />
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

      {uploadOpen ? (
        <div className="confirm-mask">
          <section className="crud-modal aitext-upload-modal">
            <header>
              <strong>批量文档采集</strong>
              <button className="icon-button" onClick={() => setUploadOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="aitext-upload-grid">
              <label>
                文本类型
                <select value={uploadSourceType} onChange={(event) => setUploadSourceType(event.target.value)}>
                  <option value="ai">AI文</option>
                  <option value="human">人工文</option>
                </select>
              </label>
              <label>
                兜底字数
                <input type="number" min={200} max={20000} value={uploadChars} onChange={(event) => setUploadChars(Number(event.target.value || 2000))} />
              </label>
              <label className="wide">
                选择文档
                <input type="file" multiple accept=".txt,.md,.docx,.pdf" onChange={(event) => setUploadFiles(Array.from(event.target.files || []))} />
              </label>
              {uploadFiles.length ? (
                <div className="aitext-file-summary">
                  <span>已选择 {uploadFiles.length} 个文件</span>
                  <strong>{uploadFiles.slice(0, 3).map((file) => file.name).join("、")}{uploadFiles.length > 3 ? " 等" : ""}</strong>
                  <button type="button" onClick={() => setUploadFiles([])}>清空</button>
                </div>
              ) : null}
            </div>
            <footer className="modal-actions aitext-modal-actions">
              <button onClick={() => setUploadOpen(false)}>取消</button>
              <button className="primary-button" disabled={!uploadFiles.length} onClick={() => void uploadTasks()}>
                创建任务
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {detectOpen ? (
        <div className="confirm-mask">
          <section className="crud-modal aitext-detect-modal">
            <header>
              <strong>AI文本检测</strong>
              <button className="icon-button" onClick={() => setDetectOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="aitext-detect-layout">
              <div>
                <textarea value={detectText} onChange={(event) => setDetectText(event.target.value)} placeholder="请输入需要检测 AI 痕迹的文本" />
                <div className="aitext-detect-controls">
                  <label>
                    <input type="checkbox" checked={detectUseAI} onChange={(event) => setDetectUseAI(event.target.checked)} /> AI语义增强
                  </label>
                  <select value={detectModel} onChange={(event) => setDetectModel(event.target.value)}>
                    <option value="">选择模型</option>
                    {detectModels.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="aitext-detect-result">
                {detectLoading ? (
                  <div className="aitext-empty">
                    <Loader2 className="spin" /> 检测中
                  </div>
                ) : detectResult ? (
                  <DetectReport result={detectResult} />
                ) : (
                  <div className="aitext-empty">输入文本后点击开始检测</div>
                )}
              </div>
            </div>
            <footer className="modal-actions aitext-modal-actions">
              <button onClick={() => setDetectOpen(false)}>取消</button>
              <button className="primary-button" disabled={detectLoading} onClick={() => void runDetect()}>
                开始检测
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
              { key: "startedAt", title: "开始时间", width: 210, render: (row) => formatTime(row.startedAt) },
              { key: "completedAt", title: "完成时间", width: 210, render: (row) => formatTime(row.completedAt) },
              { key: "errorMessage", title: "错误", width: 260 }
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
              { key: "createdAt", title: "创建时间", width: 210, render: (row) => formatTime(row.createdAt) },
              { key: "updatedAt", title: "更新时间", width: 210, render: (row) => formatTime(row.updatedAt) }
            ]} rows={jobState.rows} loading={jobState.loading} page={jobState.page} onPage={(page) => void loadJobs(page)} minWidth={1450} />
          </section>
        </div>
      ) : null}

      {corpusDetail ? (
        <div className="confirm-mask">
          <section className="crud-modal aitext-job-modal">
            <header>
              <strong>语料详情：{formatText(corpusDetail.docName || corpusDetail.fileName || corpusDetail.id)}</strong>
              <button className="icon-button" onClick={() => setCorpusDetail(null)}>
                <X size={18} />
              </button>
            </header>
            {corpusDetailLoading ? (
              <div className="aitext-empty">
                <Loader2 className="spin" /> 加载中
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
                <pre>{JSON.stringify(corpusDetail, null, 2)}</pre>
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
      />
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

