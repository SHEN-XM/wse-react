import { ChevronDown, ChevronRight, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SegmentedControl from "../components/SegmentedControl";
import { deleteReq, getReq, postReq } from "../utils/request";
import { notify } from "../utils/notify";

type PermissionRow = {
  id: string | number;
  key?: string | number;
  pid?: string | number | null;
  type?: number | string | null;
  title?: string;
  icon?: string;
  path?: string;
  name?: string;
  method?: string;
  permissionCode?: string;
  menuCode?: string;
  orderNum?: number | string;
  createTime?: string;
  children?: PermissionRow[];
};

type PermissionForm = {
  id?: string | number | null;
  type: number;
  title: string;
  pid: string;
  path: string;
  name: string;
  icon: string;
  permissionCode: string;
  method: string;
  menuCode: string;
  orderNum: number;
};

const emptyForm: PermissionForm = {
  id: null,
  type: 1,
  title: "",
  pid: "0",
  path: "",
  name: "",
  icon: "",
  permissionCode: "",
  method: "",
  menuCode: "",
  orderNum: 0
};

const typeText: Record<string, string> = {
  "1": "目录",
  "2": "菜单",
  "3": "按钮"
};

const methodList = ["GET", "POST", "PUT", "DELETE", "PATCH"];
const permissionTypeOptions = [
  { label: "目录", value: 1 },
  { label: "菜单", value: 2 },
  { label: "按钮", value: 3 }
];
const iconfontScript = "//at.alicdn.com/t/font_2671759_3dvl62oxgtz.js";

function normalizeArray(data: unknown): PermissionRow[] {
  if (Array.isArray(data)) return data as PermissionRow[];
  if (data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    const list = row.list || row.records || row.data;
    if (Array.isArray(list)) return list as PermissionRow[];
  }
  return [];
}

function cloneWithoutChildren(row: PermissionRow): PermissionRow {
  const { children: _children, ...rest } = row;
  return { ...rest, key: row.id, children: [] };
}

function flattenInput(rows: PermissionRow[]): PermissionRow[] {
  return rows.flatMap((row) => [cloneWithoutChildren(row), ...flattenInput(row.children || [])]);
}

function buildTree(rows: PermissionRow[]) {
  const flatRows = flattenInput(rows);
  const map = new Map<string, PermissionRow>();
  const roots: PermissionRow[] = [];

  flatRows.forEach((row) => {
    map.set(String(row.id), { ...row, children: [] });
  });

  map.forEach((row) => {
    const parentId = String(row.pid ?? "0");
    const parent = map.get(parentId);
    if (parent && parent.id !== row.id) {
      parent.children = parent.children || [];
      parent.children.push(row);
    } else {
      roots.push(row);
    }
  });

  const sortTree = (items: PermissionRow[]) => {
    items.sort((a, b) => Number(a.orderNum || 0) - Number(b.orderNum || 0) || String(a.title || "").localeCompare(String(b.title || ""), "zh-Hans-CN"));
    items.forEach((item) => item.children?.length && sortTree(item.children));
  };
  sortTree(roots);
  return roots;
}

function flattenTree(rows: PermissionRow[], expanded: Set<string>, level = 0): Array<PermissionRow & { level: number }> {
  return rows.flatMap((row) => {
    const id = String(row.id);
    const current = { ...row, level };
    if (!row.children?.length || !expanded.has(id)) return [current];
    return [current, ...flattenTree(row.children, expanded, level + 1)];
  });
}

function flattenOptions(rows: PermissionRow[], level = 0): Array<PermissionRow & { level: number }> {
  return rows.flatMap((row) => [{ ...row, level }, ...flattenOptions(row.children || [], level + 1)]);
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function formatDate(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function matches(row: PermissionRow, keyword: string): boolean {
  if (!keyword) return true;
  const lower = keyword.toLowerCase();
  const text = [row.title, row.path, row.name, row.method, row.permissionCode, row.menuCode, row.icon].map(valueText).join(" ").toLowerCase();
  if (text.includes(lower)) return true;
  return Boolean(row.children?.some((child) => matches(child, keyword)));
}

function PermissionTag({ kind, value }: { kind: "type" | "method" | "code" | "name"; value?: unknown }) {
  const text = kind === "type" ? typeText[String(value ?? "")] || "-" : valueText(value);
  if (text === "-") return <span className="muted-text">-</span>;
  const className = `permission-tag permission-tag-${kind} ${kind === "method" ? `permission-method-${String(value).toLowerCase()}` : ""}`;
  return <span className={className}>{text}</span>;
}

function collectIds(rows: PermissionRow[]) {
  return new Set(flattenInput(rows).map((item) => String(item.id)));
}

function IconPreview({ icon }: { icon?: string }) {
  if (!icon) return <span className="muted-text">-</span>;
  return (
    <span className="permission-icon-preview" title={icon}>
      <svg aria-hidden="true">
        <use href={`#${icon}`} />
      </svg>
    </span>
  );
}

export default function PermissionPage() {
  const [rows, setRows] = useState<PermissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [form, setForm] = useState<PermissionForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const treeRows = useMemo(() => buildTree(rows), [rows]);
  const filteredTree = useMemo(() => {
    const word = keyword.trim();
    if (!word) return treeRows;
    const filterNode = (node: PermissionRow): PermissionRow | null => {
      const children = (node.children || []).map(filterNode).filter(Boolean) as PermissionRow[];
      const selfHit = matches({ ...node, children: [] }, word);
      if (!selfHit && !children.length) return null;
      return { ...node, children };
    };
    return treeRows.map(filterNode).filter(Boolean) as PermissionRow[];
  }, [treeRows, keyword]);
  const visibleExpanded = useMemo(() => (keyword.trim() ? collectIds(filteredTree) : expanded), [expanded, filteredTree, keyword]);
  const visibleRows = useMemo(() => flattenTree(filteredTree, visibleExpanded), [filteredTree, visibleExpanded]);
  const parentOptions = useMemo(() => flattenOptions(treeRows).filter((item) => Number(item.type) !== 3), [treeRows]);
  const menuCount = useMemo(() => flattenOptions(treeRows).length, [treeRows]);

  useEffect(() => {
    if (document.querySelector(`script[src="${iconfontScript}"]`)) return;
    const script = document.createElement("script");
    script.src = iconfontScript;
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const loadRows = async () => {
    setLoading(true);
    try {
      const resp = await getReq("/check/permission/list");
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

  const toggleExpanded = (row: PermissionRow) => {
    const id = String(row.id);
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const openAdd = (parent?: PermissionRow) => {
    setFormMode("add");
    setForm({ ...emptyForm, pid: parent ? String(parent.id) : selectedId || "0", type: parent && Number(parent.type) >= 2 ? 3 : 1 });
    setFormOpen(true);
  };

  const openEdit = (row: PermissionRow) => {
    setFormMode("edit");
    setForm({
      id: row.id,
      type: Number(row.type || 1),
      title: String(row.title || ""),
      pid: String(row.pid ?? "0"),
      path: String(row.path || ""),
      name: String(row.name || ""),
      icon: String(row.icon || ""),
      permissionCode: String(row.permissionCode || ""),
      method: String(row.method || ""),
      menuCode: String(row.menuCode || ""),
      orderNum: Number(row.orderNum || 0)
    });
    setFormOpen(true);
  };

  const removeRow = async (row: PermissionRow) => {
    if (!window.confirm(`确定删除「${row.title || row.id}」吗？子权限也可能受到影响。`)) return;
    setLoading(true);
    try {
      const resp = await deleteReq(`/check/permission/delete/${row.id}`);
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "删除成功", message: String(row.title || row.id) });
        await loadRows();
      }
    } finally {
      setLoading(false);
    }
  };

  const submitForm = async () => {
    if (!form.title.trim()) {
      notify({ type: "warning", title: "菜单名称不能为空" });
      return;
    }
    if (!form.pid && form.pid !== "0") {
      notify({ type: "warning", title: "请选择所属菜单" });
      return;
    }
    if (form.type === 3 && (!form.permissionCode.trim() || !form.menuCode.trim())) {
      notify({ type: "warning", title: "请完善按钮权限", message: "授权标识、按钮标识不能为空" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        method: form.method.trim().toUpperCase(),
        permissionCode: form.type === 3 ? form.permissionCode.trim() : null,
        menuCode: form.type === 3 ? form.menuCode.trim() : null,
        icon: form.type === 3 ? null : form.icon.trim(),
        name: form.type === 3 ? null : form.name.trim(),
        orderNum: Number(form.orderNum || 0)
      };
      const resp = await postReq(formMode === "add" ? "/check/permission/add" : "/check/permission/update", payload);
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: formMode === "add" ? "新增成功" : "保存成功", message: form.title });
        setFormOpen(false);
        await loadRows();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="workspace module-workspace permission-page">
      <section className="data-panel data-panel-full data-panel-compact permission-panel">
        <div className="table-toolbar crud-toolbar permission-toolbar">
          <label className="table-search">
            <Search size={16} />
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索菜单、路径、权限标识" />
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
          <button className="primary-button" type="button" onClick={() => openAdd()} disabled={loading}>
            <Plus size={16} />
            新增
          </button>
          <span className="permission-count">共 {menuCount} 项</span>
        </div>

        <div className="permission-table">
          <div className="permission-row permission-head">
            <span>菜单名称</span>
            <span>图标</span>
            <span>类型</span>
            <span>路径</span>
            <span>请求</span>
            <span>资源标识</span>
            <span>按钮标识</span>
            <span>路由名称</span>
            <span>排序</span>
            <span>创建时间</span>
            <span>操作</span>
          </div>
          {loading ? (
            <div className="table-empty">
              <Loader2 className="spin" size={22} />
              正在加载权限
            </div>
          ) : visibleRows.length ? (
            visibleRows.map((row) => {
              const id = String(row.id);
              const hasChildren = Boolean(row.children?.length);
              return (
                <div className={`permission-row ${selectedId === id ? "selected" : ""}`} key={id} onClick={() => setSelectedId(id)}>
                  <span className="permission-name" style={{ paddingLeft: 10 + row.level * 24 }}>
                    {hasChildren ? (
                      <button className="permission-expand" type="button" onClick={(event) => { event.stopPropagation(); toggleExpanded(row); }}>
                        {expanded.has(id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    ) : (
                      <i className="permission-spacer" />
                    )}
                    <strong title={valueText(row.title)}>{valueText(row.title)}</strong>
                  </span>
                  <span><IconPreview icon={row.icon} /></span>
                  <span><PermissionTag kind="type" value={row.type} /></span>
                  <span title={valueText(row.path)}>{valueText(row.path)}</span>
                  <span><PermissionTag kind="method" value={row.method} /></span>
                  <span><PermissionTag kind="code" value={row.permissionCode} /></span>
                  <span><PermissionTag kind="code" value={row.menuCode} /></span>
                  <span><PermissionTag kind="name" value={row.name} /></span>
                  <span>{valueText(row.orderNum)}</span>
                  <span title={formatDate(row.createTime)}>{formatDate(row.createTime)}</span>
                  <span className="table-actions" onClick={(event) => event.stopPropagation()}>
                    {Number(row.type) !== 3 ? (
                      <button type="button" onClick={() => openAdd(row)}>
                        <Plus size={15} />
                        子级
                      </button>
                    ) : null}
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
            <div className="table-empty">暂无权限数据</div>
          )}
        </div>
      </section>

      {formOpen ? (
        <div className="confirm-mask">
          <section className="crud-modal permission-modal">
            <header>
              <strong>{formMode === "add" ? "新增权限" : "编辑权限"}</strong>
              <button className="icon-button" type="button" onClick={() => setFormOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="crud-form permission-form">
              <label>
                <span>菜单类型 *</span>
                <SegmentedControl value={form.type} options={permissionTypeOptions} onChange={(type) => setForm({ ...form, type })} />
              </label>
              <label>
                <span>菜单名称 *</span>
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
              </label>
              <label>
                <span>所属菜单 *</span>
                <select value={form.pid} onChange={(event) => setForm({ ...form, pid: event.target.value })}>
                  <option value="0">根菜单</option>
                  {parentOptions
                    .filter((item) => String(item.id) !== String(form.id ?? ""))
                    .map((item) => (
                      <option key={String(item.id)} value={String(item.id)}>
                        {"|--".repeat(item.level + 1)} {item.title || item.path || item.id}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span>{form.type === 3 ? "接口路径" : "页面路径"}</span>
                <input value={form.path} onChange={(event) => setForm({ ...form, path: event.target.value })} />
              </label>
              {form.type !== 3 ? (
                <>
                  <label>
                    <span>图标</span>
                    <input value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })} />
                  </label>
                  <label>
                    <span>路由名称</span>
                    <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    <span>授权标识 *</span>
                    <input value={form.permissionCode} onChange={(event) => setForm({ ...form, permissionCode: event.target.value })} />
                  </label>
                  <label>
                    <span>请求方式</span>
                    <select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>
                      <option value="">请选择</option>
                      {methodList.map((method) => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>按钮标识 *</span>
                    <input value={form.menuCode} onChange={(event) => setForm({ ...form, menuCode: event.target.value })} />
                  </label>
                </>
              )}
              <label>
                <span>排序</span>
                <input type="number" value={form.orderNum} onChange={(event) => setForm({ ...form, orderNum: Number(event.target.value) })} />
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
