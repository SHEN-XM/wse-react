import { Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Upload, WandSparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  createRecord,
  fetchPage,
  normalizeRows,
  removeRecord,
  runAction,
  updateRecord,
  uploadRecord,
  type PagePayload
} from "../api/admin";
import AppSelect from "../components/AppSelect";
import CrudForm from "../components/CrudForm";
import { menuLeaves, type FormField, type ImportAction, type TableColumn, type ToolbarAction } from "../data/menu";
import { notify } from "../utils/notify";
import { formatAppDateTime } from "../utils/dateFormat";
import { buildTableLayout } from "../utils/tableLayout";
import { confirmAction } from "../utils/confirm";

type Props = {
  menuKey: string;
};

const preferredColumns = ["id", "num", "title", "name", "username", "realname", "fileName", "content", "status", "type", "createTime", "updateTime"];

const columnTitles: Record<string, string> = {
  id: "ID",
  num: "编号",
  title: "标题",
  name: "名称",
  username: "账号",
  realname: "姓名",
  fileName: "文件名",
  content: "内容",
  raw: "原内容",
  status: "状态",
  type: "类型",
  createTime: "创建时间",
  updateTime: "更新时间"
};

const fallbackStatusText: Record<string, string> = {
  "0": "正常",
  "1": "撤回",
  "2": "删除",
  "3": "屏蔽"
};
const dateColumnKeys = new Set(["createTime", "updateTime", "createdAt", "updatedAt", "reviewTime", "startedAt", "completedAt"]);

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "number") return String(value);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return formatAppDateTime(text);
  return text;
}

function formatColumnCell(column: TableColumn, value: unknown) {
  if (column.type === "date" || dateColumnKeys.has(column.key)) return formatAppDateTime(value);
  if (column.type === "enum" && column.enumMap) {
    const mapped = column.enumMap[String(value ?? "")];
    if (mapped) return typeof mapped === "string" ? mapped : mapped.label;
  }
  if (column.key === "status") {
    const key = String(value ?? "");
    return fallbackStatusText[key] || formatCell(value);
  }
  return formatCell(value);
}

function buildColumns(rows: Record<string, unknown>[], configuredColumns?: TableColumn[]): TableColumn[] {
  if (configuredColumns?.length) return configuredColumns;
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const ordered = [...preferredColumns.filter((key) => keys.includes(key)), ...keys.filter((key) => !preferredColumns.includes(key))];
  return ordered.slice(0, 8).map((key) => ({ key, title: columnTitles[key] || key }));
}

function initialForm(fields: FormField[] = [], row?: Record<string, unknown>) {
  return Object.fromEntries(
    fields.map((field) => {
      const value = row ? row[field.key] : undefined;
      if (value !== undefined && value !== null) return [field.key, value];
      if (field.type === "switch") return [field.key, false];
      return [field.key, ""];
    })
  );
}

function payloadFromValues(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== "" && value !== undefined && value !== null));
}

function isSwitchOn(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

export default function ModulePage({ menuKey }: Props) {
  const activeItem = useMemo(() => menuLeaves.find((item) => item.key === menuKey) ?? menuLeaves[0], [menuKey]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [size, setSize] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [searchValues, setSearchValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Record<string, unknown> | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [importAction, setImportAction] = useState<ImportAction | null>(null);
  const [importValues, setImportValues] = useState<Record<string, unknown>>({});
  const [importFile, setImportFile] = useState<File | null>(null);

  const columns = useMemo(
    () =>
      buildColumns(rows, activeItem.columns).map((column) =>
        column.type === "date" || dateColumnKeys.has(column.key) ? { ...column, width: 180 } : column
      ),
    [rows, activeItem.columns]
  );
  const hasRowActions = Boolean(activeItem.api?.update || activeItem.api?.delete);
  const tableGridStyle = useMemo(() => {
    const layout = buildTableLayout({
      columns,
      rows,
      minWidth: 980,
      actionWidth: hasRowActions ? 220 : 0,
      expandLastFixedColumn: true
    });
    return { gridTemplateColumns: layout.gridTemplateColumns, minWidth: layout.minWidth };
  }, [columns, hasRowActions, rows]);

  const formFields = activeItem.formFields || [];
  const searchFields = activeItem.searchFields || [];

  const loadData = async () => {
    setMessage("");
    if (!activeItem.api?.page) {
      setRows([]);
      setTotal(0);
      setSize(0);
      setMessage("当前模块还没有配置分页接口");
      return;
    }
    setLoading(true);
    try {
      const payload: PagePayload = { pageNum, pageSize, ...payloadFromValues(searchValues) };
      if (!searchFields.length && keyword.trim()) {
        payload.content = keyword.trim();
        payload.name = keyword.trim();
        payload.username = keyword.trim();
        payload.fileName = keyword.trim();
      }
      if (activeItem.key === "hot-words") {
        payload.num = Number(payload.num || pageSize);
        payload.type = payload.type || 2;
      }
      const resp = await fetchPage(activeItem.api.page, payload);
      if (resp.code === 0 || resp.code === undefined) {
        const normalized = normalizeRows(resp);
        setRows(normalized.rows);
        setTotal(normalized.total);
        setSize(normalized.size);
      } else {
        setRows([]);
        setTotal(0);
        setSize(0);
        setMessage(resp.msg || "接口返回异常");
      }
    } catch (err) {
      setRows([]);
      setTotal(0);
      setSize(0);
      setMessage(err instanceof Error ? err.message : "接口请求失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setRows([]);
    setTotal(0);
    setSize(0);
    setMessage("");
    setKeyword("");
    setSearchValues({});
    setPageNum(1);
  }, [activeItem.key]);

  useEffect(() => {
    void loadData();
  }, [activeItem.key, pageNum, pageSize]);

  const runSearch = () => {
    if (pageNum === 1) void loadData();
    else setPageNum(1);
  };

  const handleToolAction = async (action: Pick<ToolbarAction, "api" | "label" | "method" | "confirm">) => {
    const { api: endpoint, label, method, confirm } = action;
    if (!endpoint) return;
    if (confirm) {
      const confirmed = await confirmAction({
        title: `确认${label}`,
        message: confirm,
        confirmText: "确认",
        tone: /删除|清空|撤回/.test(label + confirm) ? "danger" : "default"
      });
      if (!confirmed) return;
    }
    setLoading(true);
    try {
      const resp = await runAction(endpoint, payloadFromValues(searchValues), method);
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "操作成功", message: label });
        await loadData();
      } else {
        setMessage(resp.msg || "操作失败");
      }
    } finally {
      setLoading(false);
    }
  };

  const openForm = (mode: "add" | "edit", row?: Record<string, unknown>) => {
    setFormMode(mode);
    setEditingRow(row || null);
    setFormValues(initialForm(formFields, row));
    setFormErrors({});
    setFormOpen(true);
  };

  const submitForm = async () => {
    const nextErrors = Object.fromEntries(
      formFields
        .filter((field) => field.required !== false && !String(formValues[field.key] ?? "").trim())
        .map((field) => [field.key, `请填写${field.label}`])
    );
    setFormErrors(nextErrors);
    const missing = formFields.find((field) => nextErrors[field.key]);
    if (missing) {
      notify({ type: "warning", title: "请完善表单", message: missing.label });
      return;
    }
    const endpoint = formMode === "add" ? activeItem.api?.add : activeItem.api?.update;
    if (!endpoint) return;
    const payload = {
      ...(formMode === "edit" && editingRow?.id ? { id: editingRow.id } : {}),
      ...payloadFromValues(formValues)
    };
    setLoading(true);
    try {
      const resp = formMode === "add" ? await createRecord(endpoint, payload) : await updateRecord(endpoint, payload);
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: formMode === "add" ? "新增成功" : "保存成功", message: activeItem.label });
        setFormOpen(false);
        await loadData();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete || !activeItem.api?.delete) return;
    const name = formatCell(pendingDelete.name ?? pendingDelete.title ?? pendingDelete.username ?? pendingDelete.fileName ?? pendingDelete.id);
    setLoading(true);
    try {
      const resp = await removeRecord(activeItem.api.delete, pendingDelete);
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "删除成功", message: name });
        setPendingDelete(null);
        await loadData();
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleColumnSwitch = async (column: TableColumn, row: Record<string, unknown>, checked: boolean) => {
    if (!column.switchApi) return;
    setLoading(true);
    try {
      const payload = column.switchPayload ? column.switchPayload(checked, row) : { id: row.id, [column.key]: checked ? 1 : 0 };
      const resp = await runAction(column.switchApi, payload);
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "保存成功", message: column.title });
        await loadData();
      } else {
        setMessage(resp.msg || "保存失败");
      }
    } finally {
      setLoading(false);
    }
  };

  const openImport = (item: ImportAction) => {
    setImportAction(item);
    setImportValues(initialForm(item.fields || []));
    setImportFile(null);
  };

  const submitImport = async () => {
    if (!importAction || !importFile) {
      notify({ type: "warning", title: "请选择文件" });
      return;
    }
    const formData = new FormData();
    formData.append("file", importFile);
    Object.entries(payloadFromValues(importValues)).forEach(([key, value]) => formData.append(key, String(value)));
    setLoading(true);
    try {
      const resp = await uploadRecord(importAction.api, formData);
      if (resp.code === 0 || resp.code === undefined) {
        notify({ type: "success", title: "导入成功", message: importAction.label });
        setImportAction(null);
        await loadData();
      }
    } finally {
      setLoading(false);
    }
  };

  const renderField = (field: FormField, values: Record<string, unknown>, setValues: (next: Record<string, unknown>) => void) => {
    const value = values[field.key] ?? "";
    const update = (nextValue: unknown) => {
      setValues({ ...values, [field.key]: nextValue });
      if (formErrors[field.key]) {
        setFormErrors((prev) => {
          const next = { ...prev };
          delete next[field.key];
          return next;
        });
      }
    };
    if (field.type === "textarea") {
      return <textarea rows={field.rows || 4} value={String(value)} onChange={(event) => update(event.target.value)} />;
    }
    if (field.type === "select") {
      return (
        <AppSelect
          value={String(value)}
          options={[{ value: "", label: "请选择" }, ...(field.options || []).map((option) => ({ value: String(option.value), label: option.label }))]}
          onChange={update}
        />
      );
    }
    if (field.type === "switch") {
      return <input type="checkbox" checked={Boolean(value)} onChange={(event) => update(event.target.checked)} />;
    }
    return <input type={field.type === "number" ? "number" : "text"} value={String(value)} onChange={(event) => update(field.type === "number" ? Number(event.target.value) : event.target.value)} />;
  };

  return (
    <section className="workspace module-workspace">
      {!activeItem.hideOverview && (
        <div className="module-header compact-module-header">
          <div>
            <p className="eyebrow">{activeItem.description}</p>
            <h2>{activeItem.label}</h2>
          </div>
          <div className="module-actions">
            {activeItem.api?.gen && (
              <button className="primary-button" type="button" onClick={() => handleToolAction({ label: "生成", api: activeItem.api?.gen || "" })} disabled={loading}>
                <WandSparkles size={16} />
                生成
              </button>
            )}
            <button type="button" onClick={loadData} disabled={loading}>
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        </div>
      )}

      <section className={`data-panel data-panel-full ${activeItem.hideOverview ? "data-panel-compact" : ""}`}>
        <div className="table-toolbar crud-toolbar">
          {searchFields.length ? (
            searchFields.map((field) => (
              <label className="table-search" key={field.key}>
                <Search size={16} />
                {field.type === "select" ? (
                  <AppSelect
                    className="table-filter-select"
                    triggerClassName="table-filter-select-trigger"
                    value={String(searchValues[field.key] ?? "")}
                    options={[{ value: "", label: field.placeholder || "全部" }, ...(field.options || []).map((option) => ({ value: String(option.value), label: option.label }))]}
                    onChange={(value) => setSearchValues({ ...searchValues, [field.key]: value })}
                  />
                ) : (
                  <input value={String(searchValues[field.key] ?? "")} onChange={(event) => setSearchValues({ ...searchValues, [field.key]: event.target.value })} onKeyDown={(event) => event.key === "Enter" && runSearch()} placeholder={field.placeholder} />
                )}
              </label>
            ))
          ) : (
            <label className="table-search">
              <Search size={16} />
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runSearch()} placeholder={activeItem.searchPlaceholder || "搜索"} />
              {keyword && (
                <button type="button" onClick={() => setKeyword("")}>
                  x
                </button>
              )}
            </label>
          )}
          <button type="button" onClick={runSearch} disabled={loading}>
            查询
          </button>
          {activeItem.api?.add && formFields.length ? (
            <button className="primary-button" type="button" onClick={() => openForm("add")} disabled={loading}>
              <Plus size={16} />
              新增
            </button>
          ) : null}
          {activeItem.imports?.map((item) => (
            <button type="button" key={item.label} onClick={() => openImport(item)} disabled={loading}>
              <Upload size={16} />
              {item.label}
            </button>
          ))}
          {activeItem.actions?.map((item) => (
            <button className="primary-button" type="button" key={item.label} onClick={() => handleToolAction(item)} disabled={loading}>
              {item.label}
            </button>
          ))}
        </div>

        <div className="admin-table real-table">
          <div className="table-head" style={tableGridStyle}>
            {columns.length ? columns.map((column) => <span key={column.key}>{column.title}</span>) : <span>数据</span>}
            {hasRowActions && <span>操作</span>}
          </div>
          {loading && (
            <div className="table-empty">
              <Loader2 className="spin" size={22} />
              正在加载接口数据
            </div>
          )}
          {!loading && !rows.length && <div className="table-empty">{message || "暂无数据"}</div>}
          {!loading &&
            rows.map((row, index) => (
              <div className="table-row" key={String(row.id ?? index)} style={tableGridStyle}>
                {columns.map((column) =>
                  column.type === "switch" ? (
                    <span className="cell-ellipsis" key={column.key}>
                      <button
                        className={`table-switch ${isSwitchOn(row[column.key]) ? "is-on" : ""}`}
                        type="button"
                        aria-pressed={isSwitchOn(row[column.key])}
                        disabled={loading || !column.switchApi}
                        onClick={() => toggleColumnSwitch(column, row, !isSwitchOn(row[column.key]))}
                      >
                        <span />
                      </button>
                    </span>
                  ) : (
                    <span className="cell-ellipsis" key={column.key}>
                      {formatColumnCell(column, row[column.key])}
                    </span>
                  )
                )}
                {hasRowActions && (
                  <span className="table-actions">
                    {activeItem.api?.update && formFields.length ? (
                      <button type="button" onClick={() => openForm("edit", row)}>
                        <Pencil size={14} />
                        编辑
                      </button>
                    ) : null}
                    {activeItem.api?.delete ? (
                      <button className="text-danger" type="button" onClick={() => setPendingDelete(row)}>
                        <Trash2 size={14} />
                        删除
                      </button>
                    ) : null}
                  </span>
                )}
              </div>
            ))}
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

      {formOpen && (
        <div className="confirm-mask" role="dialog" aria-modal="true">
          <section className="crud-modal">
            <header>
              <strong>{formMode === "add" ? `新增${activeItem.label}` : `编辑${activeItem.label}`}</strong>
              <button type="button" onClick={() => setFormOpen(false)}>
                <X size={16} />
              </button>
            </header>
            <CrudForm fields={formFields} values={formValues} errors={formErrors} onChange={setFormValues} renderField={renderField} />
            <footer className="confirm-actions">
              <button type="button" onClick={() => setFormOpen(false)} disabled={loading}>
                取消
              </button>
              <button className="primary-button" type="button" onClick={submitForm} disabled={loading}>
                保存
              </button>
            </footer>
          </section>
        </div>
      )}

      {importAction && (
        <div className="confirm-mask" role="dialog" aria-modal="true">
          <section className="crud-modal">
            <header>
              <strong>{importAction.label}</strong>
              <button type="button" onClick={() => setImportAction(null)}>
                <X size={16} />
              </button>
            </header>
            <div className="crud-form">
              {(importAction.fields || []).map((field) => (
                <label key={field.key}>
                  <span>{field.label}</span>
                  {renderField(field, importValues, setImportValues)}
                </label>
              ))}
              <label className="wide">
                <span>文件</span>
                <input type="file" accept={importAction.accept} onChange={(event) => setImportFile(event.target.files?.[0] || null)} />
              </label>
            </div>
            <footer className="confirm-actions">
              <button type="button" onClick={() => setImportAction(null)} disabled={loading}>
                取消
              </button>
              <button className="primary-button" type="button" onClick={submitImport} disabled={loading}>
                上传
              </button>
            </footer>
          </section>
        </div>
      )}

      {pendingDelete && (
        <div className="confirm-mask" role="dialog" aria-modal="true">
          <section className="confirm-panel">
            <h3>确认删除</h3>
            <p>
              将删除「{formatCell(pendingDelete.name ?? pendingDelete.title ?? pendingDelete.username ?? pendingDelete.fileName ?? pendingDelete.id)}」。
              此操作不可撤销。
            </p>
            <div>
              <button type="button" onClick={() => setPendingDelete(null)} disabled={loading}>
                取消
              </button>
              <button className="danger-button" type="button" onClick={handleDelete} disabled={loading}>
                确认删除
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
