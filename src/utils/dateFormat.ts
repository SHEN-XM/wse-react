export function formatAppDateTime(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const raw = typeof value === "number" ? value : String(value).trim();
  let date: Date;
  if (typeof raw === "number") {
    const timestamp = raw > 0 && raw < 100000000000 ? raw * 1000 : raw;
    date = new Date(timestamp);
  } else if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    const timestamp = numeric > 0 && numeric < 100000000000 ? numeric * 1000 : numeric;
    date = new Date(timestamp);
  } else {
    date = new Date(raw);
  }
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
