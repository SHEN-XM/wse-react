export type LayoutColumn = {
  key: string;
  title?: string;
  width?: number;
};

type LayoutOptions<Row extends Record<string, unknown>> = {
  columns: LayoutColumn[];
  rows?: Row[];
  minWidth?: number;
  actionWidth?: number;
  gap?: number;
  fallbackWidth?: number;
  expandLastFixedColumn?: boolean;
};

const longTextKeys = [
  "content",
  "description",
  "remark",
  "reason",
  "params",
  "result",
  "message",
  "error",
  "exception",
  "path",
  "url",
  "json",
  "text",
  "raw",
  "prompt"
];

const compactKeys = ["id", "status", "type", "method", "sort", "order", "num", "count", "size", "deleted"];

function textLength(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "object") return JSON.stringify(value).length;
  return String(value).length;
}

function keyWeight(key: string, title = "") {
  const text = `${key} ${title}`.toLowerCase();
  if (longTextKeys.some((item) => text.includes(item))) return 1.8;
  if (compactKeys.some((item) => text === item || text.endsWith(item))) return 0.65;
  if (text.includes("time") || text.includes("date") || title.includes("时间")) return 1.05;
  if (text.includes("name") || title.includes("名称") || title.includes("标题")) return 1.25;
  return 1;
}

export function buildTableLayout<Row extends Record<string, unknown>>({
  columns,
  rows = [],
  minWidth = 980,
  actionWidth = 0,
  gap = 12,
  fallbackWidth = 150,
  expandLastFixedColumn = false
}: LayoutOptions<Row>) {
  const sampleRows = rows.slice(0, 30);
  const flexibleColumns = columns.filter((column) => !column.width);
  const hasFlexible = flexibleColumns.length > 0;
  const lastColumnIndex = columns.length - 1;

  const tracks = columns.map((column, index) => {
    const fixedWidth = column.width;
    if (fixedWidth) {
      if (!hasFlexible && expandLastFixedColumn && index === lastColumnIndex && !actionWidth) {
        return `minmax(${fixedWidth}px, 1fr)`;
      }
      return `minmax(${fixedWidth}px, ${fixedWidth}px)`;
    }

    const maxContentLength = Math.max(
      textLength(column.title),
      ...sampleRows.map((row) => textLength(row[column.key]))
    );
    const contentMinWidth = Math.ceil(Math.min(360, Math.max(110, maxContentLength * 9 + 28)));
    const min = Math.max(fallbackWidth, contentMinWidth);
    const contentWeight = Math.min(2.8, Math.max(0.8, maxContentLength / 18));
    const weight = Math.max(keyWeight(column.key, column.title), contentWeight);

    return `minmax(${min}px, ${Number(weight.toFixed(2))}fr)`;
  });

  if (!tracks.length) tracks.push(`minmax(${fallbackWidth}px, 1fr)`);
  if (actionWidth) tracks.push(`minmax(${actionWidth}px, ${Math.max(actionWidth, 260)}px)`);

  const trackCount = columns.length + (actionWidth ? 1 : 0);
  const dataWidth = columns.reduce((total, column) => {
    if (column.width) return total + column.width;
    const maxContentLength = Math.max(
      textLength(column.title),
      ...sampleRows.map((row) => textLength(row[column.key]))
    );
    return total + Math.max(fallbackWidth, Math.ceil(Math.min(360, Math.max(110, maxContentLength * 9 + 28))));
  }, 0);
  const gapWidth = Math.max(0, trackCount - 1) * gap;

  return {
    gridTemplateColumns: tracks.join(" "),
    minWidth: Math.max(minWidth, dataWidth + actionWidth + gapWidth)
  };
}
