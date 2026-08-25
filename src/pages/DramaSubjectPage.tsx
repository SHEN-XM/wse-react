import { Check, Copy, Edit3, ImagePlus, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import {
  addDramaSubject,
  deleteDramaSubject,
  getDramaSubjectPage,
  updateDramaSubject,
  uploadDramaCover,
  type DramaSubjectRow
} from "../api/dramaHot";
import LoadingState from "../components/LoadingState";
import { confirmAction } from "../utils/confirm";
import { notify } from "../utils/notify";

const subjectPageSize = 24;

type SubjectForm = {
  id?: string | number;
  dramaName: string;
  alias: string;
  platform: string;
  genre: string;
  coverUrl: string;
  intro: string;
};

const emptySubjectForm: SubjectForm = {
  dramaName: "",
  alias: "",
  platform: "",
  genre: "",
  coverUrl: "",
  intro: ""
};

function toSubjectForm(row?: DramaSubjectRow): SubjectForm {
  if (!row) return { ...emptySubjectForm };
  return {
    id: row.id,
    dramaName: row.name || "",
    alias: row.alias || "",
    platform: row.platform || "",
    genre: row.genre || "",
    coverUrl: row.coverUrl || "",
    intro: row.intro || ""
  };
}

export default function DramaSubjectPage() {
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<DramaSubjectRow[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [form, setForm] = useState<SubjectForm>(emptySubjectForm);
  const [saving, setSaving] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [copiedSubjectId, setCopiedSubjectId] = useState("");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = useCallback(async (targetPage = 1, reset = true) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const resp = await getDramaSubjectPage({
        keyword: keyword.trim(),
        pageNum: targetPage,
        pageSize: subjectPageSize
      });
      if (resp.code === 0) {
        const list = resp.data?.list || [];
        const nextPages = Number(resp.data?.pages || 1);
        setRows((prev) => (reset ? list : [...prev, ...list]));
        setPageNum(targetPage);
        setTotal(Number(resp.data?.total || 0));
        setHasMore(targetPage < nextPages && list.length > 0);
      }
    } finally {
      if (reset) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, [keyword]);

  useEffect(() => {
    void loadData(1, true);
  }, [loadData]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && hasMore && !loading && !loadingMore) {
        void loadData(pageNum + 1, false);
      }
    }, { rootMargin: "120px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadData, loading, loadingMore, pageNum]);

  const openAdd = () => {
    setFormMode("add");
    setForm({ ...emptySubjectForm });
    setFormOpen(true);
  };

  const openEdit = (row: DramaSubjectRow) => {
    setFormMode("edit");
    setForm(toSubjectForm(row));
    setFormOpen(true);
  };

  const patchForm = (patch: Partial<SubjectForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleUploadCover = async (file?: File) => {
    if (!file) return;
    setCoverUploading(true);
    try {
      const resp = await uploadDramaCover(file);
      if (resp.code === 0 && resp.data) {
        patchForm({ coverUrl: resp.data });
      }
    } finally {
      setCoverUploading(false);
    }
  };

  const saveSubject = async () => {
    const dramaName = form.dramaName.trim();
    if (!dramaName) {
      notify({ type: "warning", title: "请填写主体名称" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        dramaName,
        alias: form.alias.trim(),
        platform: form.platform.trim(),
        genre: form.genre.trim(),
        coverUrl: form.coverUrl.trim(),
        intro: form.intro.trim()
      };
      const resp = formMode === "edit" && form.id
        ? await updateDramaSubject({ id: form.id, ...payload })
        : await addDramaSubject(payload);
      if (resp.code === 0) {
        notify({ type: "success", title: formMode === "edit" ? "主体已更新" : "主体已新增" });
        setFormOpen(false);
        if (formMode === "edit" && form.id) {
          setRows((prev) => prev.map((row) => (
            String(row.id) === String(form.id)
              ? {
                  ...row,
                  name: payload.dramaName,
                  alias: payload.alias,
                  platform: payload.platform,
                  genre: payload.genre,
                  coverUrl: payload.coverUrl,
                  intro: payload.intro
                }
              : row
          )));
        } else {
          void loadData(1, true);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const removeSubject = async (row: DramaSubjectRow) => {
    const confirmed = await confirmAction({
      title: "确认删除主体",
      message: `将删除「${row.name || "未命名主体"}」及其 ${Number(row.seasonCount || 0)} 个季、${Number(row.rankCount || 0)} 条榜单记录。此操作不可撤销。`,
      confirmText: "删除",
      tone: "danger"
    });
    if (!confirmed || !row.id) return;
    const resp = await deleteDramaSubject(row.id);
    if (resp.code === 0) {
      notify({ type: "success", title: "主体已删除" });
      setRows((prev) => prev.filter((item) => String(item.id) !== String(row.id)));
      setTotal((prev) => Math.max(0, prev - 1));
    }
  };

  const copySubjectName = async (event: MouseEvent<HTMLButtonElement>, row: DramaSubjectRow) => {
    event.stopPropagation();
    const text = String(row.name || "").trim();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    const key = String(row.id || text);
    setCopiedSubjectId(key);
    window.setTimeout(() => {
      setCopiedSubjectId((current) => (current === key ? "" : current));
    }, 1200);
  };

  return (
    <div className="workspace module-workspace drama-hot-page drama-subject-page">
      <section className="data-panel">
        <div className="table-toolbar drama-hot-toolbar">
          <div className="search-control">
            <Search size={16} />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void loadData(1, true);
              }}
              placeholder="搜索漫剧主体、别名、平台、类型"
            />
          </div>
          <button type="button" onClick={() => void loadData(1, true)}>
            <Search size={16} />
            查询
          </button>
          <button type="button" className="primary-button" onClick={openAdd}>
            <Plus size={16} />
            新增主体
          </button>
          <button type="button" onClick={() => void loadData(1, true)}>
            <RefreshCw size={16} />
            刷新
          </button>
          <div className="drama-toolbar-spacer" />
          <span className="drama-subject-total">共 {Number(total || 0)} 个主体</span>
        </div>

        <div className="drama-subject-cards">
          {loading ? (
            <LoadingState text="加载中" />
          ) : rows.length === 0 ? (
            <div className="drama-card-empty">暂无主体</div>
          ) : (
            rows.map((row) => {
              const cover = row.coverUrl || "";
              const title = row.name || "未命名主体";
              return (
                <article className="drama-subject-card" key={String(row.id)}>
                  <div className="drama-subject-card-cover">
                    {cover ? <img src={cover} alt={title} /> : null}
                  </div>
                  <div className="drama-subject-card-body">
                    <div className="drama-card-title-row">
                      <strong title={title}>{title}</strong>
                      <button
                        type="button"
                        className={`drama-card-copy${copiedSubjectId === String(row.id || title) ? " copied" : ""}`}
                        aria-label="复制主体名"
                        title="复制主体名"
                        onClick={(event) => void copySubjectName(event, row)}
                      >
                        {copiedSubjectId === String(row.id || title) ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                    <p title={row.alias || ""}>{row.alias || "无别名"}</p>
                    <div className="drama-subject-card-meta">
                      <span>{row.platform || "未填平台"}</span>
                      <span>{row.genre || "未填类型"}</span>
                    </div>
                    <div className="drama-subject-card-counts">
                      <span>{Number(row.seasonCount || 0)} 季</span>
                      <span>{Number(row.rankCount || 0)} 条榜单</span>
                    </div>
                  </div>
                  <div className="drama-subject-card-actions table-actions">
                    <button type="button" onClick={() => openEdit(row)} aria-label="编辑">
                      <Edit3 size={15} />
                    </button>
                    <button type="button" className="danger-text" onClick={() => void removeSubject(row)} aria-label="删除">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              );
            })
          )}
          {!loading && rows.length > 0 && (
            <div className="drama-load-more" ref={loadMoreRef}>
              {loadingMore ? "加载中" : hasMore ? "继续下滑加载" : "已加载全部"}
            </div>
          )}
        </div>
      </section>

      {formOpen && (
        <div
          className="modal-mask"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setFormOpen(false);
            }
          }}
        >
          <div className="drama-modal drama-subject-modal" role="dialog" aria-modal="true">
            <header>
              <h3>{formMode === "edit" ? "编辑主体" : "新增主体"}</h3>
              <button type="button" onClick={() => setFormOpen(false)} aria-label="关闭">
                <X size={20} />
              </button>
            </header>
            <div className="drama-form-grid drama-subject-edit-grid">
              <label>
                主体名称 *
                <input value={form.dramaName} onChange={(event) => patchForm({ dramaName: event.target.value })} />
              </label>
              <label>
                别名
                <input value={form.alias} onChange={(event) => patchForm({ alias: event.target.value })} />
              </label>
              <label>
                平台
                <input value={form.platform} onChange={(event) => patchForm({ platform: event.target.value })} />
              </label>
              <label>
                类型
                <input value={form.genre} onChange={(event) => patchForm({ genre: event.target.value })} placeholder="如：玄幻、恋爱" />
              </label>
              <label className="wide drama-subject-cover-field">
                主体封面
                <div className="drama-subject-cover-row">
                  <div className="drama-subject-cover-thumb">
                    {form.coverUrl ? <img src={form.coverUrl} alt={form.dramaName || "封面"} /> : <span>暂无封面</span>}
                  </div>
                  <input value={form.coverUrl} onChange={(event) => patchForm({ coverUrl: event.target.value })} placeholder="COS URL 或图片地址" />
                  <button type="button" onClick={() => coverInputRef.current?.click()} disabled={coverUploading}>
                    <ImagePlus size={16} />
                    {coverUploading ? "上传中" : "上传"}
                  </button>
                </div>
                <small>主体封面会作为新增季的默认封面。</small>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void handleUploadCover(file);
                  }}
                />
              </label>
              <label className="wide">
                简介
                <textarea rows={5} value={form.intro} onChange={(event) => patchForm({ intro: event.target.value })} />
              </label>
            </div>
            <footer>
              <button type="button" onClick={() => setFormOpen(false)}>
                取消
              </button>
              <button type="button" className="primary-button" onClick={() => void saveSubject()} disabled={saving}>
                {saving ? "保存中" : "保存"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
