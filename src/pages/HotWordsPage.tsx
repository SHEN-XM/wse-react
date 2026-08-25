import { Download, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import AppSelect from "../components/AppSelect";
import { postReq } from "../utils/request";
import { notify } from "../utils/notify";

type RawHotWord = {
  key?: string;
  name?: string;
  word?: string;
  title?: string;
  value?: number;
  count?: number;
  hot?: number;
};

type HotWord = {
  label: string;
  value: number;
};

const countOptions = [100, 200, 300, 400, 500];
const typeOptions = [
  { label: "整句", value: 1 },
  { label: "单词", value: 2 }
];

const colorStops = [
  { offset: 0, color: "#ff2f5f" },
  { offset: 0.18, color: "#ff7a1a" },
  { offset: 0.36, color: "#d39c00" },
  { offset: 0.56, color: "#12b981" },
  { offset: 0.76, color: "#0ea5e9" },
  { offset: 1, color: "#7c3aed" }
];

function normalizeWord(item: RawHotWord): HotWord | null {
  const label = item.key || item.name || item.word || item.title || "";
  if (!label) return null;
  return {
    label,
    value: Number(item.value ?? item.count ?? item.hot ?? 0)
  };
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function mixColor(from: string, to: string, ratio: number) {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  return rgbToHex(
    start.r + (end.r - start.r) * ratio,
    start.g + (end.g - start.g) * ratio,
    start.b + (end.b - start.b) * ratio
  );
}

function colorAt(index: number, total: number) {
  const position = index / Math.max(1, total - 1);
  const nextStopIndex = colorStops.findIndex((stop) => position <= stop.offset);
  const nextStop = colorStops[Math.max(0, nextStopIndex)];
  const prevStop = colorStops[Math.max(0, nextStopIndex - 1)];
  const span = Math.max(0.001, nextStop.offset - prevStop.offset);
  return mixColor(prevStop.color, nextStop.color, (position - prevStop.offset) / span);
}

function fontSizeAt(index: number, total: number) {
  const max = 42;
  const min = 18;
  return Math.round(max - ((max - min) * index) / Math.max(1, total - 1));
}

export default function HotWordsPage() {
  const [topN, setTopN] = useState(200);
  const [type, setType] = useState(1);
  const [words, setWords] = useState<HotWord[]>([]);
  const [loading, setLoading] = useState(false);
  const cloudRef = useRef<HTMLDivElement | null>(null);

  const sortedWords = useMemo(() => [...words].sort((a, b) => b.value - a.value), [words]);

  const fetchHotWords = async () => {
    setLoading(true);
    try {
      const resp = await postReq<RawHotWord[]>("/check/dy/danmu/hot", { num: topN, type });
      if (resp.code === 0 || resp.code === undefined) {
        const nextWords = Array.isArray(resp.data) ? resp.data.map(normalizeWord).filter(Boolean) as HotWord[] : [];
        setWords(nextWords);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchHotWords();
  }, [topN, type]);

  const saveAsImage = () => {
    if (!sortedWords.length) {
      notify({ type: "warning", title: "暂无热词", message: "没有可导出的词云数据" });
      return;
    }
    const width = Math.max(1280, cloudRef.current?.scrollWidth || 1280);
    const height = Math.max(720, cloudRef.current?.scrollHeight || 720);
    const canvas = document.createElement("canvas");
    const scale = window.devicePixelRatio || 2;
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = "top";
    let x = 28;
    let y = 28;
    sortedWords.forEach((word, index) => {
      const fontSize = fontSizeAt(index, sortedWords.length);
      const label = word.label;
      ctx.font = `${fontSize}px "LXGW WenKai TC", serif`;
      const textWidth = ctx.measureText(label).width;
      const chipWidth = textWidth + 24;
      const chipHeight = Math.round(fontSize * 1.5);
      if (x + chipWidth > width - 28) {
        x = 28;
        y += chipHeight + 12;
      }
      const color = colorAt(index, sortedWords.length);
      ctx.fillStyle = color + "12";
      ctx.fillRect(x, y, chipWidth, chipHeight);
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, chipWidth, chipHeight);
      ctx.fillStyle = color;
      ctx.fillText(label, x + 12, y + Math.max(4, (chipHeight - fontSize) / 2));
      x += chipWidth + 12;
    });
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "word-heat-cloud.png";
    link.click();
  };

  return (
    <section className="workspace hot-words-page">
      <section className="hot-control-panel">
        <div className="hot-controls">
          <AppSelect value={topN} options={countOptions.map((item) => ({ value: item, label: String(item) }))} onChange={setTopN} />
          <AppSelect value={type} options={typeOptions} onChange={setType} />
          <button type="button" onClick={fetchHotWords} disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            刷新
          </button>
          <button className="primary-button" type="button" onClick={saveAsImage} disabled={loading || !sortedWords.length}>
            <Download size={18} />
            保存
          </button>
        </div>
      </section>

      <section className="hot-cloud-panel">
        {loading ? (
          <div className="table-empty">
            <Loader2 className="spin" size={22} />
            正在获取热词
          </div>
        ) : sortedWords.length ? (
          <div className="hot-word-cloud" ref={cloudRef}>
            {sortedWords.map((word, index) => {
              const color = colorAt(index, sortedWords.length);
              return (
                <span
                  className="hot-word-item"
                  key={`${word.label}-${index}`}
                  style={{
                    color,
                    borderColor: color,
                    backgroundColor: `${color}12`,
                    fontSize: fontSizeAt(index, sortedWords.length)
                  }}
                >
                  {word.label}
                </span>
              );
            })}
          </div>
        ) : (
          <div className="table-empty">暂无热词数据</div>
        )}
      </section>
    </section>
  );
}
