import { Copy, Eye, Loader2, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import AppSelect from "../components/AppSelect";
import JsonViewer from "../components/JsonViewer";
import { notify } from "../utils/notify";
import { postReq } from "../utils/request";

type LogRow = {
  id?: string | number;
  username?: string;
  method?: string;
  params?: unknown;
  execption?: unknown;
  exception?: unknown;
  error?: unknown;
  stackTrace?: unknown;
  time?: string | number;
  ip?: string;
  createTime?: string;
  [key: string]: unknown;
};

type DetailState = {
  title: string;
  subtitle?: string;
  content: unknown;
  row?: LogRow;
  variant?: "raw";
} | null;

function normalizePage(data: unknown) {
  if (data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    const list = Array.isArray(row.list) ? (row.list as LogRow[]) : Array.isArray(row.records) ? (row.records as LogRow[]) : [];
    return {
      list,
      total: Number(row.total || list.length || 0),
      size: Number(row.size || list.length || 0)
    };
  }
  return { list: [], total: 0, size: 0 };
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatDate(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatCost(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const text = String(value);
  return /\d$/.test(text) ? `${text} ms` : text;
}

function exceptionOf(row: LogRow) {
  return row.execption ?? row.exception ?? row.error ?? row.stackTrace ?? "";
}

function prettyContent(content: unknown) {
  if (content === null || content === undefined || content === "") return "-";
  if (typeof content === "object") return JSON.stringify(content, null, 2);
  const text = String(content);
  const trimmed = text.trim();
  if (!trimmed) return "-";
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return text;
  }
}

function preview(content: unknown, maxLength = 86) {
  const text = prettyContent(content).replace(/\s+/g, " ").trim();
  if (!text || text === "-") return "-";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function hasContent(content: unknown) {
  const text = valueText(content);
  return text !== "-";
}

function parseJsonContent(content: unknown) {
  if (content && typeof content === "object") return content;
  if (typeof content !== "string") return null;
  const trimmed = content.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function LogJsonBlock({ content, className }: { content: unknown; className?: string }) {
  const parsed = parseJsonContent(content);
  if (parsed) return <JsonViewer value={parsed} />;
  return <pre className={className}>{prettyContent(content)}</pre>;
}

export default function LogPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [size, setSize] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [username, setUsername] = useState("");
  const [exceptionKeyword, setExceptionKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<DetailState>(null);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { pageNum, pageSize };
      if (username.trim()) payload.username = username.trim();
      if (exceptionKeyword.trim()) payload.execption = exceptionKeyword.trim();
      const resp = await postReq("/check/log/page", payload);
      if (resp.code === 0 || resp.code === undefined) {
        const page = normalizePage(resp.data);
        setRows(page.list);
        setTotal(page.total);
        setSize(page.size);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, [pageNum, pageSize]);

  const runSearch = () => {
    if (pageNum === 1) void loadLogs();
    else setPageNum(1);
  };

  const copyDetail = async () => {
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(prettyContent(detail.content));
      notify({ type: "success", title: "已复制", message: detail.title });
    } catch {
      notify({ type: "warning", title: "复制失败", message: "浏览器未允许写入剪贴板" });
    }
  };

  const rawError = detail?.row ? exceptionOf(detail.row) : "";

  return (
    <section className="workspace module-workspace log-page">
      <section className="data-panel data-panel-full data-panel-compact log-panel">
        <div className="table-toolbar crud-toolbar log-toolbar">
          <label className="table-search">
            <Search size={16} />
            <input value={username} onChange={(event) => setUsername(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runSearch()} placeholder="搜索用户名" />
            {username ? <button type="button" onClick={() => setUsername("")}>x</button> : null}
          </label>
          <label className="table-search log-search-wide">
            <Search size={16} />
            <input value={exceptionKeyword} onChange={(event) => setExceptionKeyword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runSearch()} placeholder="搜索异常信息" />
            {exceptionKeyword ? <button type="button" onClick={() => setExceptionKeyword("")}>x</button> : null}
          </label>
          <button type="button" onClick={runSearch} disabled={loading}>查询</button>
          <button type="button" onClick={() => void loadLogs()} disabled={loading}>
            <RefreshCw size={16} />
            刷新
          </button>
        </div>

        <div className="log-table">
          <div className="log-row log-head">
            <span>用户名</span>
            <span>请求方法</span>
            <span>请求参数</span>
            <span>响应时间</span>
            <span>IP地址</span>
            <span>创建时间</span>
            <span>详情</span>
          </div>

          {loading ? (
            <div className="table-empty">
              <Loader2 className="spin" size={22} />
              正在加载日志
            </div>
          ) : rows.length ? (
            rows.map((row, index) => {
              const errorContent = exceptionOf(row);
              return (
                <div className={`log-row ${hasContent(errorContent) ? "has-error" : ""}`} key={String(row.id ?? index)}>
                  <span className="cell-ellipsis">{valueText(row.username)}</span>
                  <span className="cell-ellipsis">
                    <em className="log-method-tag">{valueText(row.method)}</em>
                  </span>
                  <span className="log-preview">{preview(row.params)}</span>
                  <span>{formatCost(row.time)}</span>
                  <span className="cell-ellipsis">{valueText(row.ip)}</span>
                  <span className="log-date">{formatDate(row.createTime)}</span>
                  <span className="table-actions log-actions">
                    <button type="button" onClick={() => setDetail({ title: "详情", subtitle: `${valueText(row.username)} · ${formatDate(row.createTime)}`, content: row, row, variant: "raw" })}>
                      <Eye size={15} />
                      详情
                    </button>
                  </span>
                </div>
              );
            })
          ) : (
            <div className="table-empty">暂无日志数据</div>
          )}
        </div>

        <div className="pager">
          <span>
            当前第 {pageNum} 页，本页 {size} 条，共 {total} 条
          </span>
          <button type="button" disabled={pageNum <= 1 || loading} onClick={() => setPageNum((value) => Math.max(1, value - 1))}>
            上一页
          </button>
          <button type="button" disabled={loading || rows.length < pageSize} onClick={() => setPageNum((value) => value + 1)}>
            下一页
          </button>
          <AppSelect value={pageSize} options={[20, 50, 100, 200].map((value) => ({ value, label: `${value} / 页` }))} onChange={setPageSize} />
        </div>
      </section>

      {detail ? (
        <div className="confirm-mask" role="dialog" aria-modal="true">
          <section className="crud-modal log-detail-modal">
            <header>
              <div>
                <strong>{detail.title}</strong>
                {detail.subtitle ? <p>{detail.subtitle}</p> : null}
              </div>
              <button className="icon-button" type="button" onClick={() => setDetail(null)}>
                <X size={18} />
              </button>
            </header>
            {detail.variant === "raw" && detail.row ? (
              <div className="log-raw-detail">
                <div className="log-raw-grid">
                  <div><span>用户名</span><strong>{valueText(detail.row.username)}</strong></div>
                  <div><span>请求方法</span><strong>{valueText(detail.row.method)}</strong></div>
                  <div><span>响应时间</span><strong>{formatCost(detail.row.time)}</strong></div>
                  <div><span>IP地址</span><strong>{valueText(detail.row.ip)}</strong></div>
                  <div><span>创建时间</span><strong>{formatDate(detail.row.createTime)}</strong></div>
                </div>
                <section>
                  <h4>请求参数</h4>
                  <LogJsonBlock content={detail.row.params} />
                </section>
                {hasContent(rawError) ? (
                  <section className="log-raw-error">
                    <h4>异常信息</h4>
                    <LogJsonBlock content={rawError} />
                  </section>
                ) : null}
                <section>
                  <h4>完整原始记录</h4>
                  <LogJsonBlock content={detail.row} />
                </section>
              </div>
            ) : (
              <LogJsonBlock content={detail.content} className="log-detail-content" />
            )}
            <footer className="modal-actions log-modal-actions">
              <button type="button" onClick={() => void copyDetail()}>
                <Copy size={15} />
                复制
              </button>
              <button className="primary-button" type="button" onClick={() => setDetail(null)}>
                关闭
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
