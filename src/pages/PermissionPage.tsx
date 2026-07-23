import { ChevronDown, ChevronRight, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import AppSelect from "../components/AppSelect";
import SegmentedControl from "../components/SegmentedControl";
import { deleteReq, getReq, postReq } from "../utils/request";
import { notify } from "../utils/notify";
import { formatAppDateTime } from "../utils/dateFormat";
import { confirmAction } from "../utils/confirm";

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
  return formatAppDateTime(value);
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
    <span className="permission-icon-preview">
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
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
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

  const loadRows = async (options: { silent?: boolean; resetExpanded?: boolean } = {}) => {
    const { silent = false, resetExpanded = true } = options;
    if (!silent) setLoading(true);
    try {
      const resp = await getReq("/check/permission/list");
      if (resp.code === 0 || resp.code === undefined) {
        const list = normalizeArray(resp.data);
        setRows(list);
        if (resetExpanded) setExpanded(new Set());
      }
    } finally {
      if (!silent) setLoading(false);
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
    const type = parent && Number(parent.type) >= 2 ? 3 : 1;
    setForm({ ...emptyForm, pid: parent ? String(parent.id) : selectedId || "0", type, method: type === 3 ? "POST" : "" });
    setFormErrors({});
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
    setFormErrors({});
    setFormOpen(true);
  };

  const updateForm = <K extends keyof PermissionForm>(key: K, value: PermissionForm[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "type" && Number(value) === 3 && !next.method.trim()) {
        next.method = "POST";
      }
      return next;
    });
    if (formErrors[key]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const removeRow = async (row: PermissionRow) => {
    const confirmed = await confirmAction({
      title: "确认删除权限",
      message: `将删除「${row.title || row.id}」，子权限也可能受到影响。`,
      confirmText: "确认删除",
      tone: "danger"
    });
    if (!confirmed) return;
    const resp = await deleteReq(`/check/permission/delete/${row.id}`);
    if (resp.code === 0 || resp.code === undefined) {
      notify({ type: "success", title: "删除成功", message: String(row.title || row.id) });
      if (selectedId === String(row.id)) setSelectedId("");
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(String(row.id));
        return next;
      });
      await loadRows({ silent: true, resetExpanded: false });
    }
  };

  const submitForm = async () => {
    const nextErrors: Record<string, string> = {};
    if (!form.pid && form.pid !== "0") nextErrors.pid = "请选择所属菜单";
    if (!form.title.trim()) nextErrors.title = "请填写菜单名称";
    if (form.type === 3 && !form.permissionCode.trim()) nextErrors.permissionCode = "请填写授权标识";
    if (form.type === 3 && !form.menuCode.trim()) nextErrors.menuCode = "请填写按钮标识";
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
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
        if (form.pid && form.pid !== "0") {
          setExpanded((prev) => new Set(prev).add(String(form.pid)));
        }
        setFormOpen(false);
        await loadRows({ silent: true, resetExpanded: false });
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
                    <strong>{valueText(row.title)}</strong>
                  </span>
                  <span><IconPreview icon={row.icon} /></span>
                  <span><PermissionTag kind="type" value={row.type} /></span>
                  <span>{valueText(row.path)}</span>
                  <span><PermissionTag kind="method" value={row.method} /></span>
                  <span><PermissionTag kind="code" value={row.permissionCode} /></span>
                  <span><PermissionTag kind="code" value={row.menuCode} /></span>
                  <span><PermissionTag kind="name" value={row.name} /></span>
                  <span>{valueText(row.orderNum)}</span>
                  <span>{formatDate(row.createTime)}</span>
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
                <span>菜单类型 <em>*</em></span>
                <SegmentedControl value={form.type} options={permissionTypeOptions} onChange={(type) => updateForm("type", type)} />
              </label>
              <label className={formErrors.pid ? "has-error" : ""}>
                <span>所属菜单 <em>*</em></span>
                <AppSelect
                  value={form.pid}
                  options={[
                    { value: "0", label: "根菜单" },
                    ...parentOptions
                      .filter((item) => String(item.id) !== String(form.id ?? ""))
                      .map((item) => ({
                        value: String(item.id),
                        label: `${"|--".repeat(item.level + 1)} ${item.title || item.path || item.id}`
                      }))
                  ]}
                  menuClassName="permission-parent-menu"
                  maxMenuHeight={460}
                  onChange={(pid) => updateForm("pid", pid)}
                />
                {formErrors.pid ? <small>{formErrors.pid}</small> : null}
              </label>
              <label className={formErrors.title ? "has-error" : ""}>
                <span>菜单名称 <em>*</em></span>
                <input value={form.title} onChange={(event) => updateForm("title", event.target.value)} />
                {formErrors.title ? <small>{formErrors.title}</small> : null}
              </label>
              <label>
                <span>{form.type === 3 ? "接口路径" : "页面路径"}</span>
                <input value={form.path} onChange={(event) => updateForm("path", event.target.value)} />
              </label>
              {form.type !== 3 ? (
                <>
                  <label>
                    <span>图标</span>
                    <input value={form.icon} onChange={(event) => updateForm("icon", event.target.value)} />
                  </label>
                  <label>
                    <span>路由名称</span>
                    <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
                  </label>
                </>
              ) : (
                <>
                  <label className={formErrors.permissionCode ? "has-error" : ""}>
                    <span>授权标识 <em>*</em></span>
                    <input value={form.permissionCode} onChange={(event) => updateForm("permissionCode", event.target.value)} />
                    {formErrors.permissionCode ? <small>{formErrors.permissionCode}</small> : null}
                  </label>
                  <label>
                    <span>请求方式</span>
                    <AppSelect value={form.method} options={[{ value: "", label: "请选择" }, ...methodList.map((method) => ({ value: method, label: method }))]} onChange={(method) => updateForm("method", method)} />
                  </label>
                  <label className={formErrors.menuCode ? "has-error" : ""}>
                    <span>按钮标识 <em>*</em></span>
                    <input value={form.menuCode} onChange={(event) => updateForm("menuCode", event.target.value)} />
                    {formErrors.menuCode ? <small>{formErrors.menuCode}</small> : null}
                  </label>
                </>
              )}
              <label>
                <span>排序</span>
                <input type="number" value={form.orderNum} onChange={(event) => updateForm("orderNum", Number(event.target.value))} />
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
