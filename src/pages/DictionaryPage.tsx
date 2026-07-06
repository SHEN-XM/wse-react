import { ChevronDown, ChevronRight, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { deleteReq, getReq, postReq } from "../utils/request";
import { notify } from "../utils/notify";

type DictionaryRow = {
  id: string | number;
  parentId?: string | number;
  key?: string | number;
  code?: string;
  nameZh?: string;
  nameEn?: string;
  value?: string | number;
  description?: string;
  orderNum?: number;
  rank?: number;
  children?: DictionaryRow[];
};

type DictionaryForm = {
  id?: string | number | null;
  parentId: string;
  code: string;
  nameZh: string;
  nameEn: string;
  value: string | number;
  description: string;
  orderNum: number;
};

const emptyForm: DictionaryForm = {
  id: null,
  parentId: "0",
  code: "",
  nameZh: "",
  nameEn: "",
  value: 1,
  description: "",
  orderNum: 0
};

function normalizeArray(data: unknown): DictionaryRow[] {
  if (Array.isArray(data)) return data as DictionaryRow[];
  if (data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    const list = row.list || row.records || row.data;
    if (Array.isArray(list)) return list as DictionaryRow[];
  }
  return [];
}

function buildTree(rows: DictionaryRow[]) {
  const map = new Map<string, DictionaryRow>();
  const roots: DictionaryRow[] = [];
  rows.forEach((row) => {
    const id = String(row.id);
    map.set(id, { ...row, key: row.id, children: [] });
  });
  map.forEach((row) => {
    const parentId = String(row.parentId ?? "0");
    const parent = map.get(parentId);
    if (parent && parent.id !== row.id) {
      parent.children = parent.children || [];
      parent.children.push(row);
    } else {
      roots.push(row);
    }
  });
  const sortTree = (items: DictionaryRow[]) => {
    items.sort((a, b) => Number(a.orderNum || 0) - Number(b.orderNum || 0) || String(a.nameZh || "").localeCompare(String(b.nameZh || ""), "zh-Hans-CN"));
    items.forEach((item) => item.children?.length && sortTree(item.children));
  };
  sortTree(roots);
  return roots;
}

function flattenTree(rows: DictionaryRow[], expanded: Set<string>, level = 0): Array<DictionaryRow & { level: number }> {
  return rows.flatMap((row) => {
    const id = String(row.id);
    const current = { ...row, level };
    if (!row.children?.length || !expanded.has(id)) return [current];
    return [current, ...flattenTree(row.children, expanded, level + 1)];
  });
}

function flattenOptions(rows: DictionaryRow[], level = 0): Array<DictionaryRow & { level: number }> {
  return rows.flatMap((row) => [{ ...row, level }, ...flattenOptions(row.children || [], level + 1)]);
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function matches(row: DictionaryRow, keyword: string): boolean {
  if (!keyword) return true;
  const text = [row.nameZh, row.nameEn, row.code, row.value, row.description].map(formatValue).join(" ").toLowerCase();
  if (text.includes(keyword.toLowerCase())) return true;
  return Boolean(row.children?.some((child) => matches(child, keyword)));
}

function collectIds(rows: DictionaryRow[]) {
  return new Set(rows.flatMap((row): string[] => [String(row.id), ...collectIds(row.children || [])]));
}

export default function DictionaryPage() {
  const [rows, setRows] = useState<DictionaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string>("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [form, setForm] = useState<DictionaryForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const treeRows = useMemo(() => buildTree(rows), [rows]);
  const filteredTree = useMemo(() => {
    if (!keyword.trim()) return treeRows;
    const filterNode = (node: DictionaryRow): DictionaryRow | null => {
      const children = (node.children || []).map(filterNode).filter(Boolean) as DictionaryRow[];
      const selfHit = matches({ ...node, children: [] }, keyword.trim());
      if (!selfHit && !children.length) return null;
      return { ...node, children };
    };
    return treeRows.map(filterNode).filter(Boolean) as DictionaryRow[];
  }, [treeRows, keyword]);
  const visibleExpanded = useMemo(() => (keyword.trim() ? collectIds(filteredTree) : expanded), [expanded, filteredTree, keyword]);
  const displayRows = useMemo(() => flattenTree(filteredTree, visibleExpanded), [filteredTree, visibleExpanded]);
  const parentOptions = useMemo(() => flattenOptions(treeRows), [treeRows]);

  const loadRows = async () => {
    setLoading(true);
    try {
      const resp = await getReq("/check/dic/list");
      if (resp.code === 0 || resp.code === undefined) {
        const list = normalizeArray(resp.data);
        setRows(list);
        setExpanded(new Set());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  const openAdd = () => {
    setFormMode("add");
    setForm({ ...emptyForm, parentId: selectedId || "0" });
    setFormOpen(true);
  };

  const openEdit = (row: DictionaryRow) => {
    setFormMode("edit");
    setForm({
      id: row.id,
      parentId: String(row.parentId ?? "0"),
      code: String(row.code || ""),
      nameZh: String(row.nameZh || ""),
      nameEn: String(row.nameEn || ""),
      value: row.value ?? "",
      description: String(row.description || ""),
      orderNum: Number(row.orderNum || 0)
    });
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (!form.parentId) {
      notify({ type: "warning", title: "请选择父级字典" });
      return;
    }
    if (!form.nameZh.trim() || !form.nameEn.trim() || !form.code.trim()) {
      notify({ type: "warning", title: "请完善字典信息", message: "中文名、英文名、代码不能为空" });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, value: form.value === "" ? null : Number.isFinite(Number(form.value)) ? Number(form.value) : form.value };
      const resp = await postReq(formMode === "add" ? "/check/dic/add" : "/check/dic/update", payload);
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: formMode === "add" ? "新增成功" : "保存成功", message: form.nameZh });
        setFormOpen(false);
        await loadRows();
      }
    } finally {
      setSaving(false);
    }
  };

  const removeRow = async (row: DictionaryRow) => {
    if (!window.confirm(`确定删除「${row.nameZh || row.code || row.id}」吗？`)) return;
    setLoading(true);
    try {
      const resp = await deleteReq(`/check/dic/delete/${row.id}`);
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "删除成功", message: String(row.nameZh || row.code || row.id) });
        await loadRows();
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (row: DictionaryRow) => {
    const id = String(row.id);
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  return (
    <section className="workspace module-workspace dictionary-page">
      <section className="data-panel data-panel-full data-panel-compact dictionary-panel">
        <div className="table-toolbar crud-toolbar dictionary-toolbar">
          <label className="table-search">
            <Search size={16} />
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索中文名、英文名、代码" />
            {keyword ? (
              <button type="button" onClick={() => setKeyword("")}>
                <X size={14} />
              </button>
            ) : null}
          </label>
          <button type="button" onClick={() => void loadRows()} disabled={loading}>
            <RefreshCw size={16} />
            刷新
          </button>
          <button className="primary-button" type="button" onClick={openAdd} disabled={loading}>
            <Plus size={16} />
            新增
          </button>
          <span className="dictionary-count">共 {rows.length} 条</span>
        </div>

        <div className="dictionary-table">
          <div className="dictionary-row dictionary-head">
            <span>中文名</span>
            <span>英文名</span>
            <span>值</span>
            <span>代码</span>
            <span>描述</span>
            <span>操作</span>
          </div>
          {loading ? (
            <div className="table-empty">
              <Loader2 className="spin" size={22} />
              正在加载字典
            </div>
          ) : displayRows.length ? (
            displayRows.map((row) => {
              const id = String(row.id);
              const hasChildren = Boolean(row.children?.length);
              return (
                <div className={`dictionary-row ${selectedId === id ? "selected" : ""}`} key={id} onClick={() => setSelectedId(id)}>
                  <span className="dictionary-name" style={{ paddingLeft: 10 + row.level * 22 }}>
                    {hasChildren ? (
                      <button className="dictionary-expand" type="button" onClick={(event) => { event.stopPropagation(); toggleExpanded(row); }}>
                        {expanded.has(id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    ) : (
                      <i className="dictionary-spacer" />
                    )}
                    <strong>{formatValue(row.nameZh)}</strong>
                  </span>
                  <span title={formatValue(row.nameEn)}>{formatValue(row.nameEn)}</span>
                  <span>{formatValue(row.value)}</span>
                  <span title={formatValue(row.code)}>{formatValue(row.code)}</span>
                  <span title={formatValue(row.description)}>{formatValue(row.description)}</span>
                  <span className="table-actions" onClick={(event) => event.stopPropagation()}>
                    <button type="button" onClick={() => openEdit(row)}>
                      <Pencil size={15} />
                      编辑
                    </button>
                    <button className="text-danger" type="button" onClick={() => void removeRow(row)}>
                      <Trash2 size={15} />
                      删除
                    </button>
                  </span>
                </div>
              );
            })
          ) : (
            <div className="table-empty">暂无字典数据</div>
          )}
        </div>
      </section>

      {formOpen ? (
        <div className="confirm-mask">
          <section className="crud-modal dictionary-modal">
            <header>
              <strong>{formMode === "add" ? "新增字典" : "编辑字典"}</strong>
              <button className="icon-button" type="button" onClick={() => setFormOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="crud-form dictionary-form">
              <label>
                <span>父级字典 *</span>
                <select value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })}>
                  <option value="0">根字典</option>
                  {parentOptions
                    .filter((item) => String(item.id) !== String(form.id ?? ""))
                    .map((item) => (
                      <option key={String(item.id)} value={String(item.id)}>
                        {"|--".repeat(item.level + 1)} {item.nameZh || item.code}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span>中文名 *</span>
                <input value={form.nameZh} onChange={(event) => setForm({ ...form, nameZh: event.target.value })} />
              </label>
              <label>
                <span>英文名 *</span>
                <input value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} />
              </label>
              <label>
                <span>代码 *</span>
                <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
              </label>
              <label>
                <span>值</span>
                <input type="number" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} />
              </label>
              <label>
                <span>排序</span>
                <input type="number" value={form.orderNum} onChange={(event) => setForm({ ...form, orderNum: Number(event.target.value) })} />
              </label>
              <label className="wide">
                <span>描述</span>
                <textarea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
              </label>
            </div>
            <footer className="modal-actions">
              <button type="button" onClick={() => setFormOpen(false)}>
                取消
              </button>
              <button className="primary-button" type="button" onClick={() => void submitForm()} disabled={saving}>
                {saving ? "保存中" : "保存"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
