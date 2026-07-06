import { Download, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

const colors = ["#ce0b00", "#7b00bb", "#0055b4", "#006d1b", "#c27200"];

function normalizeWord(item: RawHotWord): HotWord | null {
  const label = item.key || item.name || item.word || item.title || "";
  if (!label) return null;
  return {
    label,
    value: Number(item.value ?? item.count ?? item.hot ?? 0)
  };
}

function colorAt(index: number, total: number) {
  return colors[Math.min(colors.length - 1, Math.floor((index / Math.max(1, total - 1)) * colors.length))];
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
          <select value={topN} onChange={(event) => setTopN(Number(event.target.value))}>
            {countOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={type} onChange={(event) => setType(Number(event.target.value))}>
            {typeOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
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
                  title={`${word.label}：${word.value}`}
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
