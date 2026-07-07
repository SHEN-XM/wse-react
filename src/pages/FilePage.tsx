import { ExternalLink, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import AppSelect from "../components/AppSelect";
import { postReq } from "../utils/request";
import { notify } from "../utils/notify";

type FileRow = {
  id?: string | number;
  unid?: string | number;
  type?: string;
  path?: string;
  eTag?: string;
  originName?: string;
  size?: string | number;
  snow?: string;
  bucketName?: string;
  createId?: string | number;
  updateId?: string | number;
  createTime?: string;
  updateTime?: string;
  [key: string]: unknown;
};

type FileForm = {
  id?: string | number | null;
  unid: string;
  type: string;
  path: string;
  eTag: string;
  originName: string;
  size: string;
  snow: string;
  bucketName: string;
};

const emptyForm: FileForm = {
  id: null,
  unid: "",
  type: "",
  path: "",
  eTag: "",
  originName: "",
  size: "",
  snow: "",
  bucketName: ""
};

function normalizePage(data: unknown) {
  if (data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    const list = Array.isArray(row.list) ? (row.list as FileRow[]) : Array.isArray(row.records) ? (row.records as FileRow[]) : [];
    return {
      list,
      total: Number(row.total || list.length || 0),
      size: Number(row.size || list.length || 0)
    };
  }
  return { list: [], total: 0, size: 0 };
}

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function formatDate(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function FilePage() {
  const [rows, setRows] = useState<FileRow[]>([]);
  const [total, setTotal] = useState(0);
  const [size, setSize] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [originName, setOriginName] = useState("");
  const [unid, setUnid] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [form, setForm] = useState<FileForm>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<FileRow | null>(null);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { pageNum, pageSize };
      if (originName.trim()) payload.originName = originName.trim();
      if (unid.trim()) payload.unid = unid.trim();
      if (type.trim()) payload.type = type.trim();
      const resp = await postReq("/check/file/page", payload);
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
    void loadFiles();
  }, [pageNum, pageSize]);

  const runSearch = () => {
    if (pageNum === 1) void loadFiles();
    else setPageNum(1);
  };

  const openAdd = () => {
    setFormMode("add");
    setForm(emptyForm);
    setErrors({});
    setFormOpen(true);
  };

  const openEdit = (row: FileRow) => {
    setFormMode("edit");
    setForm({
      id: row.id ?? null,
      unid: String(row.unid || ""),
      type: String(row.type || ""),
      path: String(row.path || ""),
      eTag: String(row.eTag || ""),
      originName: String(row.originName || ""),
      size: String(row.size || ""),
      snow: String(row.snow || ""),
      bucketName: String(row.bucketName || "")
    });
    setErrors({});
    setFormOpen(true);
  };

  const updateForm = (key: keyof FileForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.originName.trim()) next.originName = "请填写文件名";
    if (!form.path.trim()) next.path = "请填写文件路径";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submitForm = async () => {
    if (!validate()) {
      notify({ type: "warning", title: "请完善表单" });
      return;
    }
    setLoading(true);
    try {
      const payload = {
        id: form.id,
        unid: form.unid.trim(),
        type: form.type.trim(),
        path: form.path.trim(),
        eTag: form.eTag.trim(),
        originName: form.originName.trim(),
        size: form.size.trim(),
        snow: form.snow.trim(),
        bucketName: form.bucketName.trim()
      };
      const resp = await postReq(formMode === "add" ? "/check/file/add" : "/check/file/update", payload);
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: formMode === "add" ? "新增成功" : "保存成功", message: form.originName });
        setFormOpen(false);
        await loadFiles();
      }
    } finally {
      setLoading(false);
    }
  };

  const deleteFile = async () => {
    if (!pendingDelete?.id) return;
    setLoading(true);
    try {
      const resp = await postReq("/check/file/delete", [pendingDelete.id]);
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "删除成功", message: String(pendingDelete.originName || pendingDelete.id) });
        setPendingDelete(null);
        await loadFiles();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="workspace module-workspace file-page">
      <section className="data-panel data-panel-full data-panel-compact file-list-panel">
        <div className="table-toolbar crud-toolbar file-toolbar">
          <label className="table-search">
            <Search size={16} />
            <input value={originName} onChange={(event) => setOriginName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runSearch()} placeholder="搜索文件名" />
            {originName ? <button type="button" onClick={() => setOriginName("")}>x</button> : null}
          </label>
          <label className="table-search">
            <Search size={16} />
            <input value={unid} onChange={(event) => setUnid(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runSearch()} placeholder="搜索业务 ID" />
            {unid ? <button type="button" onClick={() => setUnid("")}>x</button> : null}
          </label>
          <label className="table-search">
            <Search size={16} />
            <input value={type} onChange={(event) => setType(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runSearch()} placeholder="搜索类型" />
            {type ? <button type="button" onClick={() => setType("")}>x</button> : null}
          </label>
          <button type="button" onClick={runSearch} disabled={loading}>查询</button>
          <button type="button" onClick={() => void loadFiles()} disabled={loading}>
            <RefreshCw size={16} />
            刷新
          </button>
          <button className="primary-button" type="button" onClick={openAdd} disabled={loading}>
            <Plus size={16} />
            新增
          </button>
        </div>

        <div className="file-table">
          <div className="file-row file-head">
            <span>文件名</span>
            <span>业务 ID</span>
            <span>类型</span>
            <span>大小</span>
            <span>存储桶</span>
            <span>创建时间</span>
            <span>路径</span>
            <span>操作</span>
          </div>
          {loading ? (
            <div className="table-empty">
              <Loader2 className="spin" size={22} />
              正在加载文件
            </div>
          ) : rows.length ? (
            rows.map((row, index) => (
              <div className="file-row" key={String(row.id ?? index)}>
                <span className="cell-ellipsis">{text(row.originName)}</span>
                <span className="cell-ellipsis">{text(row.unid)}</span>
                <span className="cell-ellipsis">{text(row.type)}</span>
                <span>{text(row.size)}</span>
                <span className="cell-ellipsis">{text(row.bucketName)}</span>
                <span>{formatDate(row.createTime)}</span>
                <span className="file-path-cell">
                  <span className="cell-ellipsis">{text(row.path)}</span>
                  {row.path ? (
                    <a href={String(row.path)} target="_blank" rel="noreferrer">
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                </span>
                <span className="table-actions">
                  <button type="button" onClick={() => openEdit(row)}>
                    <Pencil size={14} />
                    编辑
                  </button>
                  <button className="text-danger" type="button" onClick={() => setPendingDelete(row)}>
                    <Trash2 size={14} />
                    删除
                  </button>
                </span>
              </div>
            ))
          ) : (
            <div className="table-empty">暂无文件数据</div>
          )}
        </div>

        <div className="pager">
          <span>当前第 {pageNum} 页，本页 {size} 条，共 {total} 条</span>
          <button type="button" disabled={pageNum <= 1 || loading} onClick={() => setPageNum((value) => Math.max(1, value - 1))}>上一页</button>
          <button type="button" disabled={loading || rows.length < pageSize} onClick={() => setPageNum((value) => value + 1)}>下一页</button>
          <AppSelect value={pageSize} options={[10, 20, 50, 100].map((value) => ({ value, label: `${value} / 页` }))} onChange={setPageSize} />
        </div>
      </section>

      {formOpen ? (
        <div className="confirm-mask" role="dialog" aria-modal="true">
          <section className="crud-modal file-modal">
            <header>
              <strong>{formMode === "add" ? "新增文件" : "编辑文件"}</strong>
              <button className="icon-button" type="button" onClick={() => setFormOpen(false)}>
                <X size={16} />
              </button>
            </header>
            <div className="file-form">
              <label className={errors.originName ? "has-error" : ""}>
                <span>文件名 <em>*</em></span>
                <input value={form.originName} onChange={(event) => updateForm("originName", event.target.value)} />
                {errors.originName ? <small>{errors.originName}</small> : null}
              </label>
              <label>
                <span>业务 ID</span>
                <input value={form.unid} onChange={(event) => updateForm("unid", event.target.value)} />
              </label>
              <label>
                <span>类型</span>
                <input value={form.type} onChange={(event) => updateForm("type", event.target.value)} />
              </label>
              <label>
                <span>大小</span>
                <input value={form.size} onChange={(event) => updateForm("size", event.target.value)} />
              </label>
              <label>
                <span>ETag</span>
                <input value={form.eTag} onChange={(event) => updateForm("eTag", event.target.value)} />
              </label>
              <label>
                <span>Snow</span>
                <input value={form.snow} onChange={(event) => updateForm("snow", event.target.value)} />
              </label>
              <label>
                <span>存储桶</span>
                <input value={form.bucketName} onChange={(event) => updateForm("bucketName", event.target.value)} />
              </label>
              <label className={`wide ${errors.path ? "has-error" : ""}`}>
                <span>文件路径 <em>*</em></span>
                <textarea rows={5} value={form.path} onChange={(event) => updateForm("path", event.target.value)} />
                {errors.path ? <small>{errors.path}</small> : null}
              </label>
            </div>
            <footer className="confirm-actions">
              <button type="button" onClick={() => setFormOpen(false)} disabled={loading}>取消</button>
              <button className="primary-button" type="button" onClick={submitForm} disabled={loading}>保存</button>
            </footer>
          </section>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="confirm-mask" role="dialog" aria-modal="true">
          <section className="confirm-panel">
            <h3>确认删除</h3>
            <p>将删除「{text(pendingDelete.originName || pendingDelete.id)}」。此操作不可撤销。</p>
            <div>
              <button type="button" onClick={() => setPendingDelete(null)} disabled={loading}>取消</button>
              <button className="danger-button" type="button" onClick={deleteFile} disabled={loading}>确认删除</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
