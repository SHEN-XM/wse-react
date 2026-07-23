import { Eye, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import AppSelect from "../components/AppSelect";
import { confirmAction } from "../utils/confirm";
import { formatAppDateTime } from "../utils/dateFormat";
import { notify } from "../utils/notify";
import { postReq } from "../utils/request";
import { getStoredUser } from "../utils/authState";

type ApplyRow = {
  id: string | number;
  email?: string;
  userType?: number | string;
  reason?: string;
  status?: number | string;
  reviewRemark?: string;
  reviewUserId?: string | number;
  reviewTime?: string | null;
  inviteCodeId?: string | number;
  accountUserId?: string | number;
  applyIp?: string;
  deleted?: number | string;
  createTime?: string;
  updateTime?: string;
};

type ApplyForm = {
  id?: string | number | null;
  email: string;
  userType: string;
  reason: string;
  status: string;
  reviewRemark: string;
  reviewUserId: string;
  reviewTime: string;
  inviteCodeId: string;
  accountUserId: string;
  applyIp: string;
};

type PageState = {
  pageNum: number;
  pageSize: number;
  total: number;
  size: number;
};

const emptyForm: ApplyForm = {
  id: null,
  email: "",
  userType: "",
  reason: "",
  status: "1",
  reviewRemark: "",
  reviewUserId: "",
  reviewTime: "",
  inviteCodeId: "",
  accountUserId: "",
  applyIp: ""
};

const userTypeOptions = [
  { value: "", label: "全部用户类型" },
  { value: "1", label: "小说作者" },
  { value: "2", label: "网文作者" },
  { value: "3", label: "编剧" },
  { value: "4", label: "内容运营" },
  { value: "99", label: "其他" }
];

const formUserTypeOptions = userTypeOptions.slice(1);

const statusOptions = [
  { value: "", label: "全部申请状态" },
  { value: "1", label: "待审核" },
  { value: "2", label: "审核通过" },
  { value: "3", label: "审核拒绝" },
  { value: "4", label: "已发放账号" },
  { value: "5", label: "已取消" }
];

const reviewStatusOptions = statusOptions.filter((item) => ["1", "2", "3", "5"].includes(item.value));

function normalizePage(data: unknown) {
  if (data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    const list = Array.isArray(row.list) ? (row.list as ApplyRow[]) : Array.isArray(row.records) ? (row.records as ApplyRow[]) : [];
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
  return String(value);
}

function optionText(options: Array<{ value: string; label: string }>, value: unknown) {
  return options.find((item) => item.value === String(value ?? ""))?.label || "-";
}

function statusTone(value: unknown) {
  const key = String(value ?? "");
  if (key === "1") return "warning";
  if (key === "2" || key === "4") return "success";
  if (key === "3") return "danger";
  return "muted";
}

function rowToForm(row: ApplyRow): ApplyForm {
  return {
    id: row.id,
    email: String(row.email || ""),
    userType: row.userType === null || row.userType === undefined || row.userType === "" ? "" : String(row.userType),
    reason: String(row.reason || ""),
    status: row.status === null || row.status === undefined || row.status === "" ? "1" : String(row.status),
    reviewRemark: String(row.reviewRemark || ""),
    reviewUserId: String(row.reviewUserId || ""),
    reviewTime: row.reviewTime ? String(row.reviewTime).replace("T", " ").slice(0, 19) : "",
    inviteCodeId: String(row.inviteCodeId || ""),
    accountUserId: String(row.accountUserId || ""),
    applyIp: String(row.applyIp || "")
  };
}

function buildUpdatePayload(form: ApplyForm) {
  return {
    id: String(form.id || ""),
    email: form.email.trim(),
    userType: form.userType ? Number(form.userType) : 0,
    reason: form.reason.trim(),
    status: form.status ? Number(form.status) : 1,
    reviewRemark: form.reviewRemark.trim(),
    reviewUserId: form.reviewUserId.trim(),
    reviewTime: form.reviewTime.trim(),
    inviteCodeId: form.inviteCodeId.trim(),
    accountUserId: form.accountUserId.trim(),
    applyIp: form.applyIp.trim()
  };
}

function nowTime() {
  const date = new Date();
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getReviewUserId() {
  const user = getStoredUser();
  const id = user?.id || user?.userId || user?.uid;
  return id === null || id === undefined ? "" : String(id);
}

function ApplyBadge({ value }: { value: unknown }) {
  return <span className={`apply-status apply-status-${statusTone(value)}`}>{optionText(statusOptions, value)}</span>;
}

export default function ApplyAccountPage() {
  const [rows, setRows] = useState<ApplyRow[]>([]);
  const [page, setPage] = useState<PageState>({ pageNum: 1, pageSize: 20, total: 0, size: 0 });
  const [filters, setFilters] = useState({ email: "", userType: "", status: "", startTime: "", endTime: "" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "review">("add");
  const [form, setForm] = useState<ApplyForm>(emptyForm);
  const [reviewOriginalStatus, setReviewOriginalStatus] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<ApplyRow | null>(null);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(page.total / page.pageSize)), [page.pageSize, page.total]);

  const loadRows = async (nextPage: Partial<PageState> = {}, nextFilters = filters) => {
    const current = { ...page, ...nextPage };
    setLoading(true);
    try {
      const payload = {
        email: nextFilters.email.trim(),
        userType: nextFilters.userType,
        status: nextFilters.status,
        startTime: nextFilters.startTime.trim(),
        endTime: nextFilters.endTime.trim(),
        pageNum: current.pageNum,
        pageSize: current.pageSize
      };
      const resp = await postReq("/check/account/apply/page", payload);
      if (resp.code === 0 || resp.code === undefined) {
        const normalized = normalizePage(resp.data);
        setRows(normalized.list);
        setPage({ pageNum: current.pageNum, pageSize: current.pageSize, total: normalized.total, size: normalized.size });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  const runSearch = () => {
    void loadRows({ pageNum: 1 });
  };

  const resetSearch = () => {
    const nextFilters = { email: "", userType: "", status: "", startTime: "", endTime: "" };
    setFilters(nextFilters);
    void loadRows({ pageNum: 1 }, nextFilters);
  };

  const getInfo = async (row: ApplyRow) => {
    const resp = await postReq<ApplyRow>("/check/account/apply/info", { id: String(row.id) });
    if (resp.code === 0 || resp.code === undefined) return (resp.data || row) as ApplyRow;
    return null;
  };

  const openInfo = async (row: ApplyRow) => {
    const data = await getInfo(row);
    if (data) setInfo(data);
  };

  const openAdd = () => {
    setFormMode("add");
    setForm(emptyForm);
    setReviewOriginalStatus("");
    setFormErrors({});
    setFormOpen(true);
  };

  const openReview = async (row: ApplyRow) => {
    const data = await getInfo(row);
    if (!data) return;
    if (Number(data.status) === 4) {
      notify({ type: "info", title: "已发放账号", message: "已发放账号的申请不能通过审核弹框修改，请查看详情。" });
      return;
    }
    setFormMode("review");
    setForm(rowToForm(data));
    setReviewOriginalStatus(String(data.status || ""));
    setFormErrors({});
    setFormOpen(true);
  };

  const updateForm = <K extends keyof ApplyForm>(key: K, value: ApplyForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (formErrors[key]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.email.trim()) errors.email = "请填写邮箱";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "邮箱格式不正确";
    if (formMode === "review" && !form.status) errors.status = "请选择申请状态";
    if (formMode === "review" && reviewOriginalStatus === "2" && form.status === "2") errors.status = "已审核通过，请勿重复提交";
    if (formMode === "review" && form.status === "4") errors.status = "请使用开号按钮发放账号";
    setFormErrors(errors);
    return !Object.keys(errors).length;
  };

  const submitForm = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const reviewUserId = getReviewUserId();
      const resp =
        formMode === "add"
          ? await postReq("/check/base/account/apply/add", {
              email: form.email.trim(),
              userType: form.userType ? Number(form.userType) : 0,
              reason: form.reason.trim(),
              inviteCodeId: form.inviteCodeId.trim()
            })
          : await postReq("/check/account/apply/update", buildUpdatePayload({
              ...form,
              reviewUserId: form.status && form.status !== "1" ? form.reviewUserId || reviewUserId : form.reviewUserId,
              reviewTime: form.status && form.status !== "1" ? form.reviewTime || nowTime() : form.reviewTime
            }));
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: formMode === "add" ? "添加成功" : "审核已保存", message: form.email });
        setFormOpen(false);
        await loadRows();
      }
    } finally {
      setSaving(false);
    }
  };

  const quickUpdateStatus = async (row: ApplyRow, status: number) => {
    const label = optionText(statusOptions, status);
    const confirmed = await confirmAction({
      title: `确认${label}`,
      message: `将申请「${row.email || row.id}」更新为「${label}」。`,
      confirmText: "确认",
      tone: status === 3 || status === 5 ? "danger" : "default"
    });
    if (!confirmed) return;
    setLoading(true);
    try {
      const data = rowToForm(row);
      const reviewUserId = getReviewUserId();
      const resp = await postReq("/check/account/apply/update", buildUpdatePayload({
        ...data,
        status: String(status),
        reviewRemark: data.reviewRemark || label,
        reviewUserId: data.reviewUserId || reviewUserId,
        reviewTime: data.reviewTime || nowTime()
      }));
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "状态已更新", message: label });
        await loadRows();
      }
    } finally {
      setLoading(false);
    }
  };

  const issueAccount = async (row: ApplyRow) => {
    if (!row.email) {
      notify({ type: "warning", title: "邮箱不能为空" });
      return;
    }
    const confirmed = await confirmAction({
      title: "确认开号",
      message: `将为「${row.email}」创建账号并发送通知。`,
      confirmText: "确认开号"
    });
    if (!confirmed) return;
    setLoading(true);
    try {
      const resp = await postReq("/check/account/apply/issue", { email: row.email });
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "开号成功", message: row.email });
        await loadRows();
      }
    } finally {
      setLoading(false);
    }
  };

  const deleteRow = async (row: ApplyRow) => {
    const confirmed = await confirmAction({
      title: "确认删除申请",
      message: `将删除申请「${row.email || row.id}」，此操作不可撤销。`,
      confirmText: "确认删除",
      tone: "danger"
    });
    if (!confirmed) return;
    setLoading(true);
    try {
      const resp = await postReq("/check/account/apply/delete", [String(row.id)]);
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "删除成功", message: String(row.email || row.id) });
        await loadRows();
      }
    } finally {
      setLoading(false);
    }
  };

  const changePage = (pageNum: number) => {
    void loadRows({ pageNum: Math.min(Math.max(1, pageNum), pageCount) });
  };

  return (
    <section className="workspace module-workspace apply-account-page">
      <section className="data-panel data-panel-full data-panel-compact apply-account-panel">
        <div className="table-toolbar crud-toolbar apply-account-toolbar">
          <label className="table-search">
            <Search size={16} />
            <input value={filters.email} onChange={(event) => setFilters((prev) => ({ ...prev, email: event.target.value }))} onKeyDown={(event) => event.key === "Enter" && runSearch()} placeholder="搜索邮箱" />
            {filters.email ? <button type="button" onClick={() => setFilters((prev) => ({ ...prev, email: "" }))}>x</button> : null}
          </label>
          <AppSelect className="apply-filter-select" value={filters.userType} options={userTypeOptions} onChange={(userType) => setFilters((prev) => ({ ...prev, userType }))} />
          <AppSelect className="apply-filter-select" value={filters.status} options={statusOptions} onChange={(status) => setFilters((prev) => ({ ...prev, status }))} />
          <input className="apply-date-input" value={filters.startTime} onChange={(event) => setFilters((prev) => ({ ...prev, startTime: event.target.value }))} placeholder="开始日期" />
          <input className="apply-date-input" value={filters.endTime} onChange={(event) => setFilters((prev) => ({ ...prev, endTime: event.target.value }))} placeholder="结束日期" />
          <button type="button" onClick={runSearch} disabled={loading}>查询</button>
          <button type="button" onClick={resetSearch} disabled={loading}>重置</button>
          <button type="button" onClick={() => void loadRows()} disabled={loading}>
            <RefreshCw size={16} />
            刷新
          </button>
          <button className="primary-button" type="button" onClick={openAdd} disabled={loading}>
            <Plus size={16} />
            新增
          </button>
        </div>

        <div className="apply-account-table">
          <div className="apply-account-row apply-account-head">
            <span>邮箱</span>
            <span>用户类型</span>
            <span>申请状态</span>
            <span>申请理由</span>
            <span>审核备注</span>
            <span>申请 IP</span>
            <span>审核时间</span>
            <span>创建时间</span>
            <span>操作</span>
          </div>
          {loading ? (
            <div className="table-empty">
              <Loader2 className="spin" size={22} />
              正在加载账号申请
            </div>
          ) : rows.length ? (
            rows.map((row) => {
              const status = Number(row.status || 0);
              return (
                <div className="apply-account-row" key={String(row.id)}>
                  <span className="cell-ellipsis">{valueText(row.email)}</span>
                  <span>{optionText(formUserTypeOptions, row.userType)}</span>
                  <span><ApplyBadge value={row.status} /></span>
                  <span className="cell-ellipsis">{valueText(row.reason)}</span>
                  <span className="cell-ellipsis">{valueText(row.reviewRemark)}</span>
                  <span>{valueText(row.applyIp)}</span>
                  <span>{formatAppDateTime(row.reviewTime)}</span>
                  <span>{formatAppDateTime(row.createTime)}</span>
                  <span className="table-actions apply-account-actions">
                    <button type="button" onClick={() => void openInfo(row)}><Eye size={15} />详情</button>
                    <button type="button" onClick={() => void openReview(row)}><Pencil size={15} />审核</button>
                    {status === 1 ? <button type="button" onClick={() => void quickUpdateStatus(row, 2)}>通过</button> : null}
                    {status === 1 ? <button className="text-danger" type="button" onClick={() => void quickUpdateStatus(row, 3)}>拒绝</button> : null}
                    {status === 2 ? <button type="button" onClick={() => void issueAccount(row)}>开号</button> : null}
                    {status === 1 || status === 2 ? <button type="button" onClick={() => void quickUpdateStatus(row, 5)}>取消</button> : null}
                    <button className="text-danger" type="button" onClick={() => void deleteRow(row)}><Trash2 size={15} />删除</button>
                  </span>
                </div>
              );
            })
          ) : (
            <div className="table-empty">暂无账号申请</div>
          )}
        </div>

        <footer className="pager">
          <span>当前 {page.size} 条，共 {page.total} 条</span>
          <button type="button" disabled={loading || page.pageNum <= 1} onClick={() => changePage(page.pageNum - 1)}>上一页</button>
          <span>{page.pageNum} / {pageCount}</span>
          <button type="button" disabled={loading || page.pageNum >= pageCount} onClick={() => changePage(page.pageNum + 1)}>下一页</button>
          <AppSelect value={String(page.pageSize)} options={["10", "20", "30", "40"].map((value) => ({ value, label: `${value} 条/页` }))} onChange={(value) => void loadRows({ pageNum: 1, pageSize: Number(value) })} />
        </footer>
      </section>

      {formOpen ? (
        <div className="confirm-mask">
          <section className="crud-modal apply-account-modal">
            <header>
              <strong>{formMode === "add" ? "新增账号申请" : "审核账号申请"}</strong>
              <button className="icon-button" type="button" onClick={() => setFormOpen(false)} disabled={saving}>
                <X size={18} />
              </button>
            </header>
            <div className="crud-form apply-account-form">
              <label className={formErrors.email ? "has-error" : ""}>
                <span>邮箱 <em>*</em></span>
                <input value={form.email} onChange={(event) => updateForm("email", event.target.value)} />
                {formErrors.email ? <small>{formErrors.email}</small> : null}
              </label>
              <label>
                <span>用户类型</span>
                <AppSelect value={form.userType} options={[{ value: "", label: "请选择用户类型" }, ...formUserTypeOptions]} onChange={(userType) => updateForm("userType", userType)} />
              </label>
              {formMode === "review" ? (
                <label className={formErrors.status ? "has-error" : ""}>
                  <span>申请状态 <em>*</em></span>
                  <AppSelect value={form.status} options={reviewStatusOptions} onChange={(status) => updateForm("status", status)} />
                  {formErrors.status ? <small>{formErrors.status}</small> : null}
                </label>
              ) : null}
              <label>
                <span>邀请码 ID</span>
                <input value={form.inviteCodeId} onChange={(event) => updateForm("inviteCodeId", event.target.value)} />
              </label>
              <label className="wide">
                <span>申请理由</span>
                <textarea value={form.reason} onChange={(event) => updateForm("reason", event.target.value)} />
              </label>
              {formMode === "review" ? (
                <>
                  <label className="wide">
                    <span>审核备注</span>
                    <textarea value={form.reviewRemark} onChange={(event) => updateForm("reviewRemark", event.target.value)} />
                  </label>
                  <label>
                    <span>审核人 ID</span>
                    <input value={form.reviewUserId} onChange={(event) => updateForm("reviewUserId", event.target.value)} />
                  </label>
                  <label>
                    <span>审核时间</span>
                    <input value={form.reviewTime} onChange={(event) => updateForm("reviewTime", event.target.value)} placeholder="YYYY-MM-DD HH:mm:ss" />
                  </label>
                  <label>
                    <span>用户 ID</span>
                    <input value={form.accountUserId} onChange={(event) => updateForm("accountUserId", event.target.value)} />
                  </label>
                  <label>
                    <span>申请 IP</span>
                    <input value={form.applyIp} onChange={(event) => updateForm("applyIp", event.target.value)} />
                  </label>
                </>
              ) : null}
            </div>
            <footer className="modal-actions apply-account-modal-actions">
              <button type="button" onClick={() => setFormOpen(false)} disabled={saving}>取消</button>
              <button className="primary-button" type="button" onClick={() => void submitForm()} disabled={saving}>
                {saving ? <Loader2 className="spin" size={16} /> : null}
                提交
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {info ? (
        <div className="confirm-mask">
          <section className="crud-modal apply-account-info-modal">
            <header>
              <strong>申请详情</strong>
              <button className="icon-button" type="button" onClick={() => setInfo(null)}>
                <X size={18} />
              </button>
            </header>
            <div className="apply-account-detail">
              {[
                ["申请 ID", info.id],
                ["邮箱", info.email],
                ["用户类型", optionText(formUserTypeOptions, info.userType)],
                ["申请状态", optionText(statusOptions, info.status)],
                ["申请理由", info.reason],
                ["审核备注", info.reviewRemark],
                ["审核人 ID", info.reviewUserId],
                ["审核时间", formatAppDateTime(info.reviewTime)],
                ["邀请码 ID", info.inviteCodeId],
                ["最终用户 ID", info.accountUserId],
                ["申请 IP", info.applyIp],
                ["创建时间", formatAppDateTime(info.createTime)],
                ["更新时间", formatAppDateTime(info.updateTime)]
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <span>{label}</span>
                  <strong>{valueText(value)}</strong>
                </div>
              ))}
            </div>
            <footer className="modal-actions apply-account-modal-actions">
              <button type="button" onClick={() => setInfo(null)}>关闭</button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
