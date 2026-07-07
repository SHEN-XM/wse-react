import { CalendarDays, ExternalLink, Loader2, Pencil, Search, Trash2, WandSparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  deleteDailyReport,
  generateDailyReport,
  getDailyReportPage,
  getTodayDailyReport,
  updateDailyReport,
  type DailyItem,
  type DailyReportRow,
  type TodayDailyReport
} from "../api/dailyReport";
import AppSelect from "../components/AppSelect";
import { notify } from "../utils/notify";

const DAILY_TYPE_HOT = 1;

function formatDateTime(value?: string) {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value.replace("T", " ").slice(0, 19);
  return value;
}

function safeParseItems(content?: string): DailyItem[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? (parsed as DailyItem[]) : [];
  } catch {
    return [];
  }
}

function contentSummary(content?: string) {
  const items = safeParseItems(content);
  if (items.length) return items.map((item) => item.title).filter(Boolean).slice(0, 3).join(" / ");
  return (content || "").replace(/\s+/g, " ").slice(0, 96) || "-";
}

function reportItemsFromSelection(today: TodayDailyReport | null, selected: DailyReportRow | null) {
  if (selected) return safeParseItems(selected.content);
  return today?.dailyItem || [];
}

function typeLabel(type?: number) {
  if (type === 1) return "每日热点";
  if (type === 2) return "小说资讯";
  if (type === 3) return "用户日报";
  return "日报";
}

export default function DailyHotPage() {
  const [today, setToday] = useState<TodayDailyReport | null>(null);
  const [rows, setRows] = useState<DailyReportRow[]>([]);
  const [selected, setSelected] = useState<DailyReportRow | null>(null);
  const [keyword, setKeyword] = useState("");
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState<DailyReportRow | null>(null);
  const [editItems, setEditItems] = useState<DailyItem[]>([]);
  const [pendingDelete, setPendingDelete] = useState<DailyReportRow | null>(null);

  const previewItems = useMemo(() => reportItemsFromSelection(today, selected), [today, selected]);
  const previewTitle = selected ? `第 ${selected.num || "-"} 期历史日报` : "今日日报";
  const todayEmpty = !today?.dailyItem?.length;

  const loadToday = async () => {
    const resp = await getTodayDailyReport();
    if (resp.code === 0 && resp.data) {
      setToday(resp.data);
    } else {
      setToday(null);
      if (resp.code !== 0) notify({ type: "warning", title: "今日日报读取失败", message: resp.msg || "接口返回异常" });
    }
  };

  const loadList = async () => {
    setLoading(true);
    try {
      const resp = await getDailyReportPage({
        pageNum,
        pageSize,
        type: DAILY_TYPE_HOT,
        content: keyword.trim()
      });
      if (resp.code === 0 && resp.data) {
        const list = resp.data.list || [];
        setRows(list);
        setTotal(Number(resp.data.total || 0));
        setPages(Number(resp.data.pages || 0));
        if (selected && !list.some((item) => String(item.id) === String(selected.id))) {
          setSelected(null);
        }
      } else {
        setRows([]);
        setTotal(0);
        setPages(0);
        notify({ type: "error", title: "历史日报读取失败", message: resp.msg || "接口返回异常" });
      }
    } finally {
      setLoading(false);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([loadToday(), loadList()]);
    } finally {
      setLoading(false);
    }
  };

  const runSearch = () => {
    if (pageNum === 1) {
      void loadList();
    } else {
      setPageNum(1);
    }
  };

  useEffect(() => {
    void loadToday();
  }, []);

  useEffect(() => {
    void loadList();
  }, [pageNum, pageSize]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const resp = await generateDailyReport();
      if (resp.code === 0) {
        notify({ type: "success", title: "生成完成", message: "今日日报已生成或已存在" });
        setSelected(null);
        await loadAll();
      } else {
        notify({ type: "error", title: "生成失败", message: resp.msg || "请稍后重试" });
      }
    } finally {
      setGenerating(false);
    }
  };

  const openEdit = (row: DailyReportRow) => {
    const parsed = safeParseItems(row.content);
    setEditing(row);
    setEditItems(parsed.length ? parsed : [{ title: "", desc: "" }]);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const normalized = editItems
      .map((item) => ({
        ...item,
        title: String(item.title || "").trim(),
        desc: String(item.desc || "").trim()
      }))
      .filter((item) => item.title || item.desc);
    if (!normalized.length) {
      notify({ type: "warning", title: "至少保留一条热点" });
      return;
    }
    const nextContent = JSON.stringify(normalized);
    setLoading(true);
    try {
      const resp = await updateDailyReport({ id: String(editing.id), content: nextContent });
      if (resp.code === 0) {
        notify({ type: "success", title: "保存成功" });
        setEditing(null);
        setSelected(null);
        await loadAll();
      } else {
        notify({ type: "error", title: "保存失败", message: resp.msg || "接口返回异常" });
      }
    } finally {
      setLoading(false);
    }
  };

  const updateEditItem = (index: number, patch: Partial<DailyItem>) => {
    setEditItems((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  const removeEditItem = (index: number) => {
    setEditItems((items) => (items.length <= 1 ? items : items.filter((_, itemIndex) => itemIndex !== index)));
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setLoading(true);
    try {
      const resp = await deleteDailyReport(String(pendingDelete.id));
      if (resp.code === 0) {
        notify({ type: "success", title: "删除成功", message: `第 ${pendingDelete.num || "-"} 期` });
        if (selected && String(selected.id) === String(pendingDelete.id)) setSelected(null);
        setPendingDelete(null);
        await loadAll();
      } else {
        notify({ type: "error", title: "删除失败", message: resp.msg || "接口返回异常" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="workspace daily-hot-page">
      <div className="daily-layout">
        <section className="daily-preview data-panel">
          <div className="daily-panel-title">
            <div>
              <strong>{previewTitle}</strong>
              <span>
                {selected
                  ? formatDateTime(selected.createTime)
                  : today?.date
                    ? `${today.date} ${today.weekday || ""} · 第 ${today.num || "-"} 期 · ${today.dailyItem?.length || 0} 条热点`
                    : "未生成"}
              </span>
            </div>
            {selected && (
              <button type="button" onClick={() => setSelected(null)}>
                <X size={15} />
                回到今日
              </button>
            )}
          </div>

          {todayEmpty && !selected ? (
            <div className="daily-empty">
              <CalendarDays size={34} />
              <strong>今天还没有日报</strong>
              <span>点击“生成今日日报”后，系统会拉取热点并写入日报。</span>
            </div>
          ) : (
            <div className="daily-card-list">
              {previewItems.map((item, index) => (
                <article className="daily-hot-card" key={`${item.title || "item"}-${index}`}>
                  <div className="daily-card-index">{String(index + 1).padStart(2, "0")}</div>
                  <div className="daily-card-main">
                    <div className="daily-card-head">
                      <h3>{item.title || "未命名热点"}</h3>
                      <div className="daily-card-tags">
                        {item.category && <span>{item.category}</span>}
                        {item.trend && <span>{item.trend}</span>}
                        {item.heatScore ? <span>热度 {item.heatScore}</span> : null}
                        {item.confidence ? <span>可信度 {item.confidence}</span> : null}
                      </div>
                    </div>
                    <p>{item.desc || "暂无简介"}</p>
                    <div className="daily-chip-row">
                      {(item.genres || []).slice(0, 6).map((genre) => (
                        <span key={genre}>{genre}</span>
                      ))}
                      {(item.keywords || []).slice(0, 8).map((keywordItem) => (
                        <span key={keywordItem}>{keywordItem}</span>
                      ))}
                    </div>
                    {(item.creativeValue || item.risk || item.audience) && (
                      <div className="daily-insight-grid">
                        {item.audience && (
                          <div>
                            <b>受众</b>
                            <span>{item.audience}</span>
                          </div>
                        )}
                        {item.creativeValue && (
                          <div>
                            <b>创作价值</b>
                            <span>{item.creativeValue}</span>
                          </div>
                        )}
                        {item.risk && (
                          <div>
                            <b>风险</b>
                            <span>{item.risk}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {item.ideas?.length ? (
                      <div className="daily-ideas">
                        {item.ideas.slice(0, 3).map((idea, ideaIndex) => (
                          <section key={`${idea.title || "idea"}-${ideaIndex}`}>
                            <strong>{idea.title || "创意方向"}</strong>
                            <p>{idea.hook || idea.direction || "暂无钩子"}</p>
                            {idea.conflict && <span>{idea.conflict}</span>}
                          </section>
                        ))}
                      </div>
                    ) : null}
                    {item.sources?.length ? (
                      <details className="daily-sources">
                        <summary>来源线索 {item.sourceCount || item.sources.length}</summary>
                        {item.sources.slice(0, 5).map((source, sourceIndex) => (
                          <a key={`${source.url || source.title}-${sourceIndex}`} href={source.url || "#"} target="_blank" rel="noreferrer">
                            <span>{source.siteName || "来源"}</span>
                            <b>{source.title || source.summary || source.url}</b>
                            <ExternalLink size={14} />
                          </a>
                        ))}
                      </details>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="daily-history data-panel">
          <div className="table-toolbar daily-history-toolbar">
            <label className="table-search">
              <Search size={16} />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    runSearch();
                  }
                }}
                placeholder="搜索日报内容"
              />
              {keyword && (
                <button type="button" onClick={() => setKeyword("")}>
                  x
                </button>
              )}
            </label>
            <button
              type="button"
              onClick={runSearch}
            >
              查询
            </button>
            <button className="primary-button" type="button" onClick={handleGenerate} disabled={loading || generating}>
              {generating ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />}
              生成
            </button>
          </div>

          <div className="daily-history-list">
            {loading && (
              <div className="table-empty">
                <Loader2 className="spin" size={20} />
                正在加载
              </div>
            )}
            {!loading && !rows.length && <div className="table-empty">暂无历史日报</div>}
            {!loading &&
              rows.map((row) => (
                <article className={`daily-history-card ${selected && String(selected.id) === String(row.id) ? "active" : ""}`} key={String(row.id)} onClick={() => setSelected(row)}>
                  <div>
                    <strong>第 {row.num || "-"} 期</strong>
                    <span>{typeLabel(row.type)}</span>
                  </div>
                  <p>{contentSummary(row.content)}</p>
                  <footer>
                    <span>{formatDateTime(row.createTime)}</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEdit(row);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="text-danger"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDelete(row);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </footer>
                </article>
              ))}
          </div>

          <div className="pager daily-history-pager">
            <span>
              {pageNum}/{pages || 1}，共 {total} 条
            </span>
            <button type="button" disabled={pageNum <= 1 || loading} onClick={() => setPageNum((value) => Math.max(1, value - 1))}>
              上一页
            </button>
            <button type="button" disabled={loading || (pages > 0 && pageNum >= pages)} onClick={() => setPageNum((value) => value + 1)}>
              下一页
            </button>
            <AppSelect value={pageSize} options={[10, 20, 50].map((value) => ({ value, label: String(value) }))} onChange={setPageSize} />
          </div>
        </aside>
      </div>

      {editing && (
        <div className="confirm-mask" role="dialog" aria-modal="true">
          <section className="daily-edit-panel">
            <div className="daily-panel-title">
              <div>
                <strong>编辑日报内容</strong>
                <span>第 {editing.num || "-"} 期，结构化编辑后仍按原接口保存</span>
              </div>
              <button type="button" onClick={() => setEditing(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="daily-edit-body">
              <div className="daily-edit-toolbar">
                <button type="button" onClick={() => setEditItems((items) => [...items, { title: "", desc: "" }])}>
                  新增热点
                </button>
              </div>
              <div className="daily-edit-list">
                {editItems.map((item, index) => (
                  <article className="daily-edit-card" key={"edit-" + index}>
                    <header>
                      <strong>热点 {index + 1}</strong>
                      <input className="daily-edit-title-input" value={item.title || ""} onChange={(event) => updateEditItem(index, { title: event.target.value })} placeholder="标题" />
                      <button className="text-danger" type="button" onClick={() => removeEditItem(index)} disabled={editItems.length <= 1}>
                        删除
                      </button>
                    </header>
                    <label className="daily-edit-field wide">
                      <span>简介</span>
                      <textarea value={item.desc || ""} onChange={(event) => updateEditItem(index, { desc: event.target.value })} />
                    </label>
                  </article>
                ))}
              </div>
            </div>
            <div className="confirm-actions">
              <button type="button" onClick={() => setEditing(null)} disabled={loading}>
                取消
              </button>
              <button className="primary-button" type="button" onClick={saveEdit} disabled={loading}>
                保存
              </button>
            </div>
          </section>
        </div>
      )}

      {pendingDelete && (
        <div className="confirm-mask" role="dialog" aria-modal="true">
          <section className="confirm-panel">
            <h3>确认删除日报</h3>
            <p>将删除第 {pendingDelete.num || "-"} 期日报。此操作不可撤销。</p>
            <div>
              <button type="button" onClick={() => setPendingDelete(null)} disabled={loading}>
                取消
              </button>
              <button className="danger-button" type="button" onClick={confirmDelete} disabled={loading}>
                确认删除
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

