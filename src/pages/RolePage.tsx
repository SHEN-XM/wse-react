import { Loader2, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import AttributeTreeSelector, { type AttributeTreeNode } from "../components/AttributeTreeSelector";
import { deleteReq, getReq, postReq } from "../utils/request";
import { notify } from "../utils/notify";

type RoleRow = {
  id: string | number;
  name?: string;
  description?: string;
  status?: boolean | number | string;
  createTime?: string;
  updateTime?: string;
};

type PermissionRow = {
  id: string | number;
  pid?: string | number | null;
  title?: string;
  type?: number | string | null;
  orderNum?: number | string;
  children?: PermissionRow[];
};

type RoleForm = {
  id?: string | number | null;
  name: string;
  description: string;
  status: boolean;
};

const emptyForm: RoleForm = {
  id: null,
  name: "",
  description: "",
  status: true
};

function normalizePage(data: unknown) {
  if (data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    const list = Array.isArray(row.list) ? (row.list as RoleRow[]) : Array.isArray(row.records) ? (row.records as RoleRow[]) : [];
    return {
      list,
      total: Number(row.total || list.length || 0),
      size: Number(row.size || list.length || 0)
    };
  }
  return { list: [], total: 0, size: 0 };
}

function normalizeArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    const list = row.list || row.records || row.data;
    if (Array.isArray(list)) return list as T[];
  }
  return [];
}

function statusToBool(value: RoleRow["status"]) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function formatDate(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function flattenInput(rows: PermissionRow[]): PermissionRow[] {
  return rows.flatMap((row) => [{ ...row, children: [] }, ...flattenInput(row.children || [])]);
}

function buildPermissionTree(rows: PermissionRow[]): AttributeTreeNode[] {
  const flatRows = flattenInput(rows);
  const map = new Map<string, PermissionRow & { children: PermissionRow[] }>();
  const roots: Array<PermissionRow & { children: PermissionRow[] }> = [];

  flatRows.forEach((row) => map.set(String(row.id), { ...row, children: [] }));
  map.forEach((row) => {
    const parentId = String(row.pid ?? "0");
    const parent = map.get(parentId);
    if (parent && parent.id !== row.id) parent.children.push(row);
    else roots.push(row);
  });

  const sortTree = (items: Array<PermissionRow & { children: PermissionRow[] }>) => {
    items.sort((a, b) => Number(a.orderNum || 0) - Number(b.orderNum || 0) || String(a.title || "").localeCompare(String(b.title || ""), "zh-Hans-CN"));
    items.forEach((item) => sortTree(item.children as Array<PermissionRow & { children: PermissionRow[] }>));
  };
  sortTree(roots);

  const convert = (item: PermissionRow): AttributeTreeNode => ({
    id: item.id,
    title: item.title || String(item.id),
    type: item.type,
    children: (item.children || []).map(convert)
  });
  return roots.map(convert);
}

function permissionTypeLabel(type: AttributeTreeNode["type"]) {
  if (String(type) === "1") return "目录";
  if (String(type) === "2") return "菜单";
  if (String(type) === "3") return "按钮";
  return String(type ?? "");
}

export default function RolePage() {
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [size, setSize] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [form, setForm] = useState<RoleForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [permissionRows, setPermissionRows] = useState<PermissionRow[]>([]);
  const [checkedPermissionIds, setCheckedPermissionIds] = useState<Array<string | number>>([]);

  const permissionTree = useMemo(() => buildPermissionTree(permissionRows), [permissionRows]);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { pageNum, pageSize };
      if (keyword.trim()) payload.name = keyword.trim();
      const resp = await postReq("/check/role/page", payload);
      if (resp.code === 0 || resp.code === undefined) {
        const page = normalizePage(resp.data);
        setRows(page.list.map((row) => ({ ...row, status: statusToBool(row.status) })));
        setTotal(page.total);
        setSize(page.size);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadPermissions = async () => {
    const resp = await getReq("/check/permission/list");
    if (resp.code === 0 || resp.code === undefined) {
      setPermissionRows(normalizeArray<PermissionRow>(resp.data));
    }
  };

  useEffect(() => {
    void loadRoles();
  }, [pageNum, pageSize]);

  const runSearch = () => {
    if (pageNum === 1) void loadRoles();
    else setPageNum(1);
  };

  const openAdd = async () => {
    setFormMode("add");
    setForm(emptyForm);
    setCheckedPermissionIds([]);
    await loadPermissions();
    setFormOpen(true);
  };

  const openEdit = async (row: RoleRow) => {
    setFormMode("edit");
    setForm({
      id: row.id,
      name: String(row.name || ""),
      description: String(row.description || ""),
      status: statusToBool(row.status)
    });
    setCheckedPermissionIds([]);
    await loadPermissions();
    const resp = await getReq(`/check/role/permits-role-id/${row.id}`);
    if (resp.code === 0 || resp.code === undefined) {
      setCheckedPermissionIds(normalizeArray<string | number>(resp.data));
      setFormOpen(true);
    }
  };

  const submitForm = async () => {
    if (!form.name.trim()) {
      notify({ type: "warning", title: "角色名称不能为空" });
      return;
    }
    if (!checkedPermissionIds.length) {
      notify({ type: "warning", title: "请选择权限" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        id: form.id,
        name: form.name.trim(),
        description: form.description.trim(),
        status: form.status ? 1 : 0,
        permissionsIds: checkedPermissionIds
      };
      const resp = await postReq(formMode === "add" ? "/check/role/add" : "/check/role/update", payload);
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: formMode === "add" ? "新增成功" : "保存成功", message: form.name });
        setFormOpen(false);
        await loadRoles();
      }
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (row: RoleRow, checked: boolean) => {
    setLoading(true);
    try {
      const resp = await postReq(`/check/role/update-status/${row.id}/${checked ? 1 : 0}`);
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "状态已更新", message: String(row.name || row.id) });
        await loadRoles();
      }
    } finally {
      setLoading(false);
    }
  };

  const removeRole = async (row: RoleRow) => {
    if (!window.confirm(`确定删除角色「${row.name || row.id}」吗？`)) return;
    setLoading(true);
    try {
      const resp = await deleteReq(`/check/role/delete/${row.id}`);
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "删除成功", message: String(row.name || row.id) });
        await loadRoles();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="workspace module-workspace role-page">
      <section className="data-panel data-panel-full data-panel-compact role-panel">
        <div className="table-toolbar crud-toolbar role-toolbar">
          <label className="table-search">
            <Search size={16} />
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runSearch()} placeholder="搜索角色名称" />
            {keyword ? (
              <button type="button" onClick={() => setKeyword("")}>
                <X size={14} />
              </button>
            ) : null}
          </label>
          <button type="button" onClick={runSearch} disabled={loading}>
            查询
          </button>
          <button type="button" onClick={() => void loadRoles()} disabled={loading}>
            <RefreshCw size={16} />
            刷新
          </button>
          <button className="primary-button" type="button" onClick={() => void openAdd()} disabled={loading}>
            <Plus size={16} />
            新增
          </button>
        </div>

        <div className="role-table">
          <div className="role-row role-head">
            <span>角色名称</span>
            <span>描述</span>
            <span>状态</span>
            <span>创建时间</span>
            <span>更新时间</span>
            <span>操作</span>
          </div>
          {loading ? (
            <div className="table-empty">
              <Loader2 className="spin" size={22} />
              正在加载角色
            </div>
          ) : rows.length ? (
            rows.map((row) => (
              <div className="role-row" key={String(row.id)}>
                <span title={valueText(row.name)}>{valueText(row.name)}</span>
                <span title={valueText(row.description)}>{valueText(row.description)}</span>
                <span>
                  <button className={`table-switch ${statusToBool(row.status) ? "is-on" : ""}`} type="button" onClick={() => void updateStatus(row, !statusToBool(row.status))}>
                    <span />
                  </button>
                </span>
                <span title={formatDate(row.createTime)}>{formatDate(row.createTime)}</span>
                <span title={formatDate(row.updateTime)}>{formatDate(row.updateTime)}</span>
                <span className="table-actions">
                  <button type="button" onClick={() => void openEdit(row)}>
                    <Pencil size={15} />
                    编辑
                  </button>
                  <button className="text-danger" type="button" onClick={() => void removeRole(row)}>
                    <Trash2 size={15} />
                    删除
                  </button>
                </span>
              </div>
            ))
          ) : (
            <div className="table-empty">暂无角色数据</div>
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
          <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            {[10, 20, 50, 100].map((value) => (
              <option key={value} value={value}>
                {value} / 页
              </option>
            ))}
          </select>
        </div>
      </section>

      {formOpen ? (
        <div className="confirm-mask">
          <section className="crud-modal role-modal">
            <header>
              <strong>{formMode === "add" ? "新增角色" : "编辑角色"}</strong>
              <button className="icon-button" type="button" onClick={() => setFormOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="role-form">
              <div className="role-base-form">
                <label>
                  <span>角色名称 *</span>
                  <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </label>
                <label>
                  <span>描述</span>
                  <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
                </label>
                <label className="role-status-field">
                  <span>状态</span>
                  <button className={`table-switch ${form.status ? "is-on" : ""}`} type="button" onClick={() => setForm({ ...form, status: !form.status })}>
                    <span />
                  </button>
                </label>
              </div>
              <AttributeTreeSelector nodes={permissionTree} checkedIds={checkedPermissionIds} onChange={setCheckedPermissionIds} typeLabel={permissionTypeLabel} placeholder="搜索菜单或按钮权限" />
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
