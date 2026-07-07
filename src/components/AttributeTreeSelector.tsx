import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

export type AttributeTreeNode = {
  id: string | number;
  title: string;
  type?: string | number | null;
  children?: AttributeTreeNode[];
};

type AttributeTreeSelectorProps = {
  nodes: AttributeTreeNode[];
  checkedIds: Array<string | number>;
  onChange: (ids: Array<string | number>) => void;
  typeLabel?: (type: AttributeTreeNode["type"]) => string;
  placeholder?: string;
};

function collectNodeIds(node: AttributeTreeNode): string[] {
  return [String(node.id), ...(node.children || []).flatMap(collectNodeIds)];
}

function collectTreeIds(nodes: AttributeTreeNode[]) {
  return new Set(nodes.flatMap(collectNodeIds));
}

function filterTree(nodes: AttributeTreeNode[], keyword: string): AttributeTreeNode[] {
  if (!keyword.trim()) return nodes;
  const lower = keyword.trim().toLowerCase();
  return nodes
    .map((node) => {
      const children = filterTree(node.children || [], keyword);
      const hit = node.title.toLowerCase().includes(lower) || String(node.type ?? "").toLowerCase().includes(lower);
      if (!hit && !children.length) return null;
      return { ...node, children };
    })
    .filter(Boolean) as AttributeTreeNode[];
}

function flattenVisible(nodes: AttributeTreeNode[], expanded: Set<string>, level = 0): Array<AttributeTreeNode & { level: number }> {
  return nodes.flatMap((node) => {
    const id = String(node.id);
    const current = { ...node, level };
    if (!node.children?.length || !expanded.has(id)) return [current];
    return [current, ...flattenVisible(node.children, expanded, level + 1)];
  });
}

function checkedState(node: AttributeTreeNode, checked: Set<string>) {
  const selfChecked = checked.has(String(node.id));
  const childIds = (node.children || []).flatMap(collectNodeIds);
  const childCheckedCount = childIds.filter((id) => checked.has(id)).length;
  return {
    checked: selfChecked,
    partial: !selfChecked && childCheckedCount > 0
  };
}

export default function AttributeTreeSelector({ nodes, checkedIds, onChange, typeLabel, placeholder = "搜索属性" }: AttributeTreeSelectorProps) {
  const [keyword, setKeyword] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const checkedSet = useMemo(() => new Set(checkedIds.map(String)), [checkedIds]);
  const filteredTree = useMemo(() => filterTree(nodes, keyword), [nodes, keyword]);
  const visibleExpanded = useMemo(() => (keyword.trim() ? collectTreeIds(filteredTree) : expanded), [expanded, filteredTree, keyword]);
  const visibleRows = useMemo(() => flattenVisible(filteredTree, visibleExpanded), [filteredTree, visibleExpanded]);

  const toggleExpanded = (node: AttributeTreeNode) => {
    const id = String(node.id);
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const toggleChecked = (node: AttributeTreeNode) => {
    const state = checkedState(node, checkedSet);
    const next = new Set(checkedSet);
    const id = String(node.id);
    if (state.checked) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  return (
    <div className="attribute-selector">
      <div className="attribute-selector-toolbar">
        <label className="table-search">
          <Search size={16} />
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={placeholder} />
          {keyword ? (
            <button type="button" onClick={() => setKeyword("")}>
              <X size={14} />
            </button>
          ) : null}
        </label>
        <span>{checkedSet.size} 已选</span>
      </div>
      <div className="attribute-tree">
        {visibleRows.length ? (
          visibleRows.map((node) => {
            const id = String(node.id);
            const hasChildren = Boolean(node.children?.length);
            const state = checkedState(node, checkedSet);
            return (
              <div className={`attribute-row ${state.checked ? "is-checked" : ""}`} key={id} style={{ paddingLeft: 10 + node.level * 24 }}>
                {hasChildren ? (
                  <button className="attribute-expand" type="button" onClick={() => toggleExpanded(node)}>
                    {visibleExpanded.has(id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                ) : (
                  <i className="attribute-spacer" />
                )}
                <button className={`attribute-check ${state.partial ? "is-partial" : ""}`} type="button" onClick={() => toggleChecked(node)} aria-pressed={state.checked}>
                  <span />
                </button>
                <strong>{node.title}</strong>
                {node.type !== undefined && node.type !== null ? <em>{typeLabel ? typeLabel(node.type) : String(node.type)}</em> : null}
              </div>
            );
          })
        ) : (
          <div className="table-empty">暂无可选属性</div>
        )}
      </div>
    </div>
  );
}
