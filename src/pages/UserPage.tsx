import { KeyRound, Loader2, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import AppSelect from "../components/AppSelect";
import RoleTransferSelector, { type RoleTransferItem } from "../components/RoleTransferSelector";
import { getReq, postReq } from "../utils/request";
import { notify } from "../utils/notify";
import { formatAppDateTime } from "../utils/dateFormat";
import { confirmAction } from "../utils/confirm";

type UserRow = {
  id: string | number;
  username?: string;
  nickName?: string;
  email?: string;
  phone?: string;
  status?: boolean | number | string;
  createTime?: string;
  updateTime?: string;
};

type UserForm = {
  id?: string | number | null;
  username: string;
  password: string;
  nickName: string;
  phone: string;
  email: string;
};

const emptyForm: UserForm = {
  id: null,
  username: "",
  password: "",
  nickName: "",
  phone: "",
  email: ""
};

function normalizePage(data: unknown) {
  if (data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    const list = Array.isArray(row.list) ? (row.list as UserRow[]) : Array.isArray(row.records) ? (row.records as UserRow[]) : [];
    return {
      list,
      total: Number(row.total || list.length || 0),
      size: Number(row.size || list.length || 0)
    };
  }
  return { list: [], total: 0, size: 0 };
}

function statusToBool(value: UserRow["status"]) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function formatDate(value: unknown) {
  return formatAppDateTime(value);
}

function roleLevel(value: unknown) {
  const level = Number(value || 1);
  return Number.isFinite(level) && level > 0 ? level : 1;
}

function sortRoles(list: RoleTransferItem[]) {
  return [...list].sort((a, b) => {
    const levelDiff = roleLevel(b.level) - roleLevel(a.level);
    if (levelDiff !== 0) return levelDiff;
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}

export default function UserPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [size, setSize] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [username, setUsername] = useState("");
  const [nickName, setNickName] = useState("");
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleUser, setRoleUser] = useState<UserRow | null>(null);
  const [roles, setRoles] = useState<RoleTransferItem[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<Array<string | number>>([]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { pageNum, pageSize };
      if (username.trim()) payload.username = username.trim();
      if (nickName.trim()) payload.nickName = nickName.trim();
      const resp = await postReq("/check/user/page", payload);
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

  useEffect(() => {
    void loadUsers();
  }, [pageNum, pageSize]);

  const runSearch = () => {
    if (pageNum === 1) void loadUsers();
    else setPageNum(1);
  };

  const openAdd = () => {
    setFormMode("add");
    setForm(emptyForm);
    setFormErrors({});
    setFormOpen(true);
  };

  const openEdit = (row: UserRow) => {
    setFormMode("edit");
    setForm({
      id: row.id,
      username: String(row.username || ""),
      password: "",
      nickName: String(row.nickName || ""),
      phone: String(row.phone || ""),
      email: String(row.email || "")
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const updateForm = <K extends keyof UserForm>(key: K, value: UserForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (formErrors[key]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const submitForm = async () => {
    const nextErrors: Record<string, string> = {};
    if (!form.username.trim()) nextErrors.username = "请填写账号";
    if (formMode === "add" && !form.password.trim()) nextErrors.password = "请填写密码";
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        id: form.id,
        username: form.username.trim(),
        nickName: form.nickName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim()
      };
      if (formMode === "add") {
        payload.password = form.password;
        payload.createWhere = 1;
        payload.sex = 1;
        payload.status = 1;
      }
      const resp = await postReq(formMode === "add" ? "/check/user/add" : "/check/user/update", payload);
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: formMode === "add" ? "新增成功" : "保存成功", message: form.username });
        setFormOpen(false);
        await loadUsers();
      }
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (row: UserRow, checked: boolean) => {
    setLoading(true);
    try {
      const resp = await postReq("/check/user/update", { id: row.id, status: checked ? 1 : 2 });
      if (resp.code === 0 || resp.code === undefined || resp.status === 200) {
        notify({ type: "success", title: "状态已更新", message: String(row.username || row.id) });
        await loadUsers();
      }
    } finally {
      setLoading(false);
    }
  };

  const removeUser = async (row: UserRow) => {
    const confirmed = await confirmAction({
      title: "确认删除用户",
      message: `将删除用户「${row.username || row.id}」，此操作不可撤销。`,
      confirmText: "确认删除",
      tone: "danger"
    });
    if (!confirmed) return;
    setLoading(true);
    try {
      const resp = await postReq("/check/user/delete", [row.id]);
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "删除成功", message: String(row.username || row.id) });
        await loadUsers();
      }
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (row: UserRow) => {
    const confirmed = await confirmAction({
      title: "确认重置密码",
      message: `将重置「${row.username || row.id}」的登录密码。`,
      confirmText: "确认重置"
    });
    if (!confirmed) return;
    const resp = await getReq(`/check/user/reset/${row.id}`);
    if (resp.code === 0 || resp.code === undefined) {
      notify({ type: "success", title: "密码已重置", message: `新密码为 ${String(resp.data || "")}` });
    }
  };

  const openRoleConfig = async (row: UserRow) => {
    setRoleUser(row);
    setRoles([]);
    setSelectedRoleIds([]);
    const resp = await getReq(`/check/user/role-info/${row.id}`);
    if (resp.code === 0 || resp.code === undefined) {
      const data = (resp.data || {}) as { allRole?: Array<{ id: string | number; name: string; level?: number | string; status?: number | boolean }>; ownRoleIds?: Array<string | number> };
      setRoles(sortRoles((data.allRole || []).map((item) => ({ id: item.id, name: item.name, level: item.level, disabled: item.status === 0 || item.status === false }))));
      setSelectedRoleIds(data.ownRoleIds || []);
      setRoleOpen(true);
    }
  };

  const submitRoles = async () => {
    if (!roleUser) return;
    setSaving(true);
    try {
      const resp = await postReq("/check/user/set-role", { userId: roleUser.id, roleIds: selectedRoleIds });
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "角色已保存", message: String(roleUser.username || roleUser.id) });
        setRoleOpen(false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="workspace module-workspace user-page">
      <section className="data-panel data-panel-full data-panel-compact user-panel">
        <div className="table-toolbar crud-toolbar user-toolbar">
          <label className="table-search">
            <Search size={16} />
            <input value={username} onChange={(event) => setUsername(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runSearch()} placeholder="搜索账号" />
            {username ? <button type="button" onClick={() => setUsername("")}>x</button> : null}
          </label>
          <label className="table-search">
            <Search size={16} />
            <input value={nickName} onChange={(event) => setNickName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runSearch()} placeholder="搜索昵称" />
            {nickName ? <button type="button" onClick={() => setNickName("")}>x</button> : null}
          </label>
          <button type="button" onClick={runSearch} disabled={loading}>查询</button>
          <button type="button" onClick={() => void loadUsers()} disabled={loading}>
            <RefreshCw size={16} />
            刷新
          </button>
          <button className="primary-button" type="button" onClick={openAdd} disabled={loading}>
            <Plus size={16} />
            新增
          </button>
        </div>

        <div className="user-table">
          <div className="user-row user-head">
            <span>账号</span>
            <span>昵称</span>
            <span>邮箱</span>
            <span>手机号</span>
            <span>状态</span>
            <span>创建时间</span>
            <span>更新时间</span>
            <span>操作</span>
          </div>
          {loading ? (
            <div className="table-empty">
              <Loader2 className="spin" size={22} />
              正在加载用户
            </div>
          ) : rows.length ? (
            rows.map((row) => (
              <div className="user-row" key={String(row.id)}>
                <span>{text(row.username)}</span>
                <span>{text(row.nickName)}</span>
                <span>{text(row.email)}</span>
                <span>{text(row.phone)}</span>
                <span>
                  <button className={`table-switch ${statusToBool(row.status) ? "is-on" : ""}`} type="button" onClick={() => void updateStatus(row, !statusToBool(row.status))}>
                    <span />
                  </button>
                </span>
                <span>{formatDate(row.createTime)}</span>
                <span>{formatDate(row.updateTime)}</span>
                <span className="table-actions">
                  <button type="button" onClick={() => void openRoleConfig(row)}>
                    <ShieldCheck size={15} />
                    角色
                  </button>
                  <button type="button" onClick={() => openEdit(row)}>
                    <Pencil size={15} />
                    编辑
                  </button>
                  <button type="button" onClick={() => void resetPassword(row)}>
                    <KeyRound size={15} />
                    重置
                  </button>
                  <button className="text-danger" type="button" onClick={() => void removeUser(row)}>
                    <Trash2 size={15} />
                    删除
                  </button>
                </span>
              </div>
            ))
          ) : (
            <div className="table-empty">暂无用户数据</div>
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
          <AppSelect value={pageSize} options={[10, 20, 50, 100].map((value) => ({ value, label: `${value} / 页` }))} onChange={setPageSize} />
        </div>
      </section>

      {formOpen ? (
        <div className="confirm-mask">
          <section className="crud-modal user-modal">
            <header>
              <strong>{formMode === "add" ? "新增用户" : "编辑用户"}</strong>
              <button className="icon-button" type="button" onClick={() => setFormOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="user-form">
              <label className={formErrors.username ? "has-error" : ""}>
                <span>账号 <em>*</em></span>
                <input disabled={formMode === "edit"} value={form.username} onChange={(event) => updateForm("username", event.target.value)} />
                {formErrors.username ? <small>{formErrors.username}</small> : null}
              </label>
              {formMode === "add" ? (
                <label className={formErrors.password ? "has-error" : ""}>
                  <span>密码 <em>*</em></span>
                  <input type="password" value={form.password} onChange={(event) => updateForm("password", event.target.value)} />
                  {formErrors.password ? <small>{formErrors.password}</small> : null}
                </label>
              ) : null}
              <label>
                <span>昵称</span>
                <input value={form.nickName} onChange={(event) => updateForm("nickName", event.target.value)} />
              </label>
              <label>
                <span>手机号</span>
                <input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} />
              </label>
              <label>
                <span>邮箱</span>
                <input value={form.email} onChange={(event) => updateForm("email", event.target.value)} />
              </label>
            </div>
            <footer className="modal-actions">
              <button type="button" onClick={() => setFormOpen(false)}>取消</button>
              <button className="primary-button" type="button" onClick={() => void submitForm()} disabled={saving}>
                {saving ? "保存中" : "保存"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {roleOpen ? (
        <div className="confirm-mask">
          <section className="crud-modal user-role-modal">
            <header>
              <strong>配置角色：{text(roleUser?.username)}</strong>
              <button className="icon-button" type="button" onClick={() => setRoleOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <RoleTransferSelector roles={roles} selectedIds={selectedRoleIds} onChange={setSelectedRoleIds} />
            <footer className="modal-actions">
              <button type="button" onClick={() => setRoleOpen(false)}>取消</button>
              <button className="primary-button" type="button" onClick={() => void submitRoles()} disabled={saving}>
                {saving ? "保存中" : "保存"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
