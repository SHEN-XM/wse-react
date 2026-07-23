import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

export type RoleTransferItem = {
  id: string | number;
  name: string;
  level?: number | string;
  disabled?: boolean;
};

type RoleTransferSelectorProps = {
  roles: RoleTransferItem[];
  selectedIds: Array<string | number>;
  onChange: (ids: Array<string | number>) => void;
};

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

export default function RoleTransferSelector({ roles, selectedIds, onChange }: RoleTransferSelectorProps) {
  const [keyword, setKeyword] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);
  const availableRoles = useMemo(() => roles.filter((role) => !selectedSet.has(String(role.id))), [roles, selectedSet]);
  const selectedRoles = useMemo(() => roles.filter((role) => selectedSet.has(String(role.id))), [roles, selectedSet]);
  const visibleAvailable = useMemo(() => {
    const lower = keyword.trim().toLowerCase();
    if (!lower) return availableRoles;
    return availableRoles.filter((role) => role.name.toLowerCase().includes(lower) || String(role.id).toLowerCase().includes(lower));
  }, [availableRoles, keyword]);

  const addRole = (role: RoleTransferItem) => {
    if (role.disabled) return;
    onChange([...selectedIds, role.id]);
  };

  const removeRole = (role: RoleTransferItem) => {
    onChange(selectedIds.filter((id) => String(id) !== String(role.id)));
  };

  return (
    <div className="role-transfer">
      <section className="role-transfer-list">
        <header>
          <strong>可选角色</strong>
          <span>{visibleAvailable.length}</span>
        </header>
        <label className="table-search">
          <Search size={16} />
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索角色" />
          {keyword ? (
            <button type="button" onClick={() => setKeyword("")}>
              <X size={14} />
            </button>
          ) : null}
        </label>
        <div className="role-transfer-body">
          {visibleAvailable.length ? (
            visibleAvailable.map((role) => (
              <button className={role.disabled ? "is-disabled" : ""} disabled={role.disabled} key={String(role.id)} type="button" onClick={() => addRole(role)}>
                <span>{text(role.name)}</span>
                <em>{role.disabled ? "停用" : "添加"}</em>
              </button>
            ))
          ) : (
            <div className="table-empty">暂无可选角色</div>
          )}
        </div>
      </section>

      <section className="role-transfer-list">
        <header>
          <strong>已选角色</strong>
          <span>{selectedRoles.length}</span>
        </header>
        <div className="role-transfer-body selected">
          {selectedRoles.length ? (
            selectedRoles.map((role) => (
              <button key={String(role.id)} type="button" onClick={() => removeRole(role)}>
                <span>{text(role.name)}</span>
                <em>移除</em>
              </button>
            ))
          ) : (
            <div className="table-empty">暂无已选角色</div>
          )}
        </div>
      </section>
    </div>
  );
}
