import { Check, Copy, Edit3, ImagePlus, Plus, RefreshCw, Search, Trash2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import AppSelect from "../components/AppSelect";
import LoadingState from "../components/LoadingState";
import SegmentedControl from "../components/SegmentedControl";
import {
  addDramaRank,
  addDramaSubject,
  clearDramaRank,
  deleteDramaRank,
  getActiveChatModel,
  getChatModelOptions,
  getDramaRankPage,
  getDramaSubjectOptions,
  parseDramaRankScreenshot,
  saveDramaOcrRows,
  updateDramaRank,
  updateDramaSubject,
  uploadDramaCover,
  type DramaOcrItem,
  type DramaSubjectOption,
  type DramaRankRow
} from "../api/dramaHot";
import { confirmAction } from "../utils/confirm";
import { notify } from "../utils/notify";

const listTypeOptions = [
  { label: "新剧榜", value: 1 },
  { label: "预约榜", value: 2 }
];

const statusOptions = [
  { label: "全部状态", value: 0 },
  { label: "预约中", value: 1 },
  { label: "已完结", value: 3 }
];

const pureStatusOptions = statusOptions.filter((item) => item.value > 0);
const reserveStatusOptions = [{ label: "预约中", value: 1 }];
const newRankStatusOptions = [
  { label: "全部状态", value: 0 },
  { label: "已完结", value: 3 }
];
const newSeasonStatusOptions = newRankStatusOptions.filter((item) => item.value > 0);

const addTargetOptions: Array<{ label: string; value: "subject" | "season" }> = [
  { label: "新增漫剧主体", value: "subject" },
  { label: "新增季", value: "season" }
];

const editTargetOptions: Array<{ label: string; value: "subject" | "season" }> = [
  { label: "编辑主体", value: "subject" },
  { label: "编辑季", value: "season" }
];

const pageSize = 20;
const visionModelKeywords = [
  "vision",
  "image",
  "ocr",
  "multimodal",
  "multi-modal",
  "vl",
  "glm-4v",
  "glm-ocr",
  "qwen-vl",
  "qwen2-vl",
  "qwen2.5-vl",
  "qvq",
  "gpt-4o",
  "gpt-4.1",
  "o4-mini",
  "gemini",
  "claude-3",
  "doubao-vision"
];

const emptyForm: DramaRankRow = {
  rankNo: 1,
  listType: 1,
  dramaName: "",
  seasonName: "第一季",
  seasonNo: 1,
  status: 3,
  heatScore: 0,
  reserveCount: 0
};

function todayText() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isLikelyVisionModelName(option: { label: string; value: string }) {
  const value = `${option.label} ${option.value}`.toLowerCase();
  return visionModelKeywords.some((keyword) => value.includes(keyword));
}

function toDateInput(value: unknown) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function statusLabel(status?: number, rowListType?: number) {
  if (Number(rowListType) === 2) return "预约中";
  if (Number(rowListType) === 1) return "已完结";
  return pureStatusOptions.find((item) => item.value === Number(status))?.label || "-";
}

function fixedStatusLabel(listType: number) {
  return listType === 2 ? "预约中" : "已完结";
}

function fixedStatusValue(listType: number) {
  return listType === 2 ? 1 : 3;
}

function coverInitial(name?: string) {
  const value = String(name || "").trim();
  return value ? value.slice(0, 1) : "剧";
}

function subjectOptionLabel(item: DramaSubjectOption) {
  return `${item.name || "未命名主体"}${item.alias ? ` / ${item.alias}` : ""}`;
}

function subjectLabelFromRank(row: DramaRankRow) {
  return `${row.dramaName || "未命名主体"}${row.alias ? ` / ${row.alias}` : ""}`;
}

function formatMetric(value?: number) {
  return Number(value || 0).toLocaleString();
}

function formatWanMetric(value?: number) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return "0";
  if (num < 10000) return formatMetric(num);
  const valueText = (num / 10000).toFixed(num >= 1000000 ? 0 : 1).replace(/\.0$/, "");
  return `${valueText}万`;
}

function onlineTimeText(row: DramaRankRow) {
  if (Number(row.status) === 3) return "";
  return toDateInput(row.releaseTime) || row.expectedReleaseTime || "";
}

function isTodayOnlineTime(value: string) {
  const text = value.trim();
  if (!text) return false;
  if (/^(今天|今日)/.test(text)) return true;
  const today = new Date();
  const dateText = toDateInput(text);
  if (dateText && dateText === todayText()) return true;
  const monthDayMatch = text.match(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)/);
  if (!monthDayMatch) return false;
  const year = monthDayMatch[1] ? Number(monthDayMatch[1]) : today.getFullYear();
  const month = Number(monthDayMatch[2]);
  const day = Number(monthDayMatch[3]);
  return year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate();
}

function onlineTimeDisplay(row: DramaRankRow) {
  const text = onlineTimeText(row).trim();
  const isToday = isTodayOnlineTime(text);
  return {
    text: isToday ? "今日上线" : text,
    isToday
  };
}

function parseSeasonNo(name: string) {
  const text = String(name || "");
  const digitMatch = text.match(/(?:S|第)\s*(\d{1,2})\s*(?:季)?/i);
  if (digitMatch) return Number(digitMatch[1]) || 1;
  const chineseMatch = text.match(/第\s*([一二三四五六七八九十两]{1,4})\s*季/);
  if (!chineseMatch) return 1;
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const value = chineseMatch[1];
  if (value === "十") return 10;
  const tenIndex = value.indexOf("十");
  if (tenIndex >= 0) {
    const left = tenIndex === 0 ? 1 : digits[value[tenIndex - 1]] || 1;
    const right = tenIndex === value.length - 1 ? 0 : digits[value[tenIndex + 1]] || 0;
    return left * 10 + right;
  }
  return digits[value] || 1;
}

function mergeRankRows(prev: DramaRankRow[], next: DramaRankRow[]) {
  const exists = new Set(prev.map((item) => String(item.id || `${item.rankDate}-${item.listType}-${item.rankNo}`)));
  const merged = [...prev];
  next.forEach((item) => {
    const key = String(item.id || `${item.rankDate}-${item.listType}-${item.rankNo}`);
    if (!exists.has(key)) {
      exists.add(key);
      merged.push(item);
    }
  });
  return merged;
}

type DramaHotPageProps = {
  fixedListType?: 1 | 2;
};

export default function DramaHotPage({ fixedListType }: DramaHotPageProps) {
  const [rankDate] = useState(todayText);
  const [listType, setListType] = useState<number>(fixedListType ?? 1);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState(0);
  const [rows, setRows] = useState<DramaRankRow[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [coverUploading, setCoverUploading] = useState<"" | "subject" | "season">("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [addTarget, setAddTarget] = useState<"subject" | "season">("subject");
  const [form, setForm] = useState<DramaRankRow>(emptyForm);
  const [subjectOptions, setSubjectOptions] = useState<DramaSubjectOption[]>([]);
  const [subjectKeyword, setSubjectKeyword] = useState("");
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrFiles, setOcrFiles] = useState<File[]>([]);
  const [ocrRows, setOcrRows] = useState<DramaOcrItem[]>([]);
  const [ocrModelOptions, setOcrModelOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [ocrTextModelOptions, setOcrTextModelOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [ocrModel, setOcrModel] = useState("");
  const [ocrTextModel, setOcrTextModel] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrSaving, setOcrSaving] = useState(false);
  const [copiedDramaId, setCopiedDramaId] = useState("");
  const cardsRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const subjectPickerRef = useRef<HTMLDivElement | null>(null);
  const subjectCoverInputRef = useRef<HTMLInputElement | null>(null);
  const seasonCoverInputRef = useRef<HTMLInputElement | null>(null);
  const ocrInputRef = useRef<HTMLInputElement | null>(null);
  const editSubjectDraftRef = useRef<DramaRankRow | null>(null);
  const editSeasonDraftRef = useRef<DramaRankRow | null>(null);

  const selectedListLabel = useMemo(() => listTypeOptions.find((item) => item.value === listType)?.label || "新剧榜", [listType]);
  const isSubjectForm = addTarget === "subject";
  const isSeasonForm = addTarget === "season";
  const isAddSubjectOnly = formMode === "add" && isSubjectForm;
  const formStatusOptions = listType === 2 ? reserveStatusOptions : newSeasonStatusOptions;
  const isFixedListType = Boolean(fixedListType);

  const changeListType = (value: number) => {
    if (isFixedListType) return;
    setListType(value);
    setStatus(value === 2 ? 1 : 0);
  };

  const loadData = useCallback(async (targetPage = 1, reset = true) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const queryStatus = listType === 2 ? 1 : (status === 3 ? 3 : 0);
      const pageResp = await getDramaRankPage({ listType, keyword, status: queryStatus, pageNum: targetPage, pageSize });
      if (pageResp.code === 0) {
        const list = pageResp.data?.list || [];
        const nextPages = Number(pageResp.data?.pages || 1);
        setRows((prev) => (reset ? list : mergeRankRows(prev, list)));
        setTotal(Number(pageResp.data?.total || 0));
        setPageNum(targetPage);
        setHasMore(targetPage < nextPages && list.length > 0);
      }
    } finally {
      if (reset) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, [keyword, listType, status]);

  const loadSubjectOptions = useCallback(async (keywordText = "") => {
    const resp = await getDramaSubjectOptions({ keyword: keywordText.trim(), limit: 80 });
    if (resp.code === 0) {
      setSubjectOptions(resp.data || []);
    }
  }, []);

  useEffect(() => {
    if (!formOpen || !isSeasonForm) return undefined;
    const timer = window.setTimeout(() => {
      void loadSubjectOptions(subjectKeyword);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [formOpen, isSeasonForm, loadSubjectOptions, subjectKeyword]);

  useEffect(() => {
    const closeSubjectPicker = (event: PointerEvent) => {
      const target = event.target as Node;
      if (subjectPickerRef.current?.contains(target)) return;
      setSubjectPickerOpen(false);
    };
    window.addEventListener("pointerdown", closeSubjectPicker);
    return () => window.removeEventListener("pointerdown", closeSubjectPicker);
  }, []);

  useEffect(() => {
    setRows([]);
    setHasMore(true);
    void loadData(1, true);
  }, [loadData]);

  useEffect(() => {
    if (!fixedListType) return;
    setListType(fixedListType);
    setStatus(fixedListType === 2 ? 1 : 0);
  }, [fixedListType]);

  useEffect(() => {
    const root = cardsRef.current;
    const target = loadMoreRef.current;
    if (!root || !target || !hasMore || loading || loadingMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadData(pageNum + 1, false);
        }
      },
      { root, rootMargin: "160px 0px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadData, loading, loadingMore, pageNum]);

  const openAdd = () => {
    setFormMode("add");
    setAddTarget("subject");
    editSubjectDraftRef.current = null;
    editSeasonDraftRef.current = null;
    setSubjectKeyword("");
    setSubjectPickerOpen(false);
    setForm({ ...emptyForm, listType, rankDate, rankNo: Math.min(total + 1, 99), status: listType === 2 ? 1 : 3 });
    setFormOpen(true);
    void loadSubjectOptions();
  };

  const openEdit = (row: DramaRankRow) => {
    const nextForm = {
      ...row,
      status: listType === 2 ? 1 : 3,
      rankDate: toDateInput(row.rankDate) || rankDate,
      releaseTime: toDateInput(row.releaseTime),
      expectedReleaseTime: row.expectedReleaseTime || "",
      finishTime: toDateInput(row.finishTime)
    };
    setFormMode("edit");
    setAddTarget("season");
    editSubjectDraftRef.current = nextForm;
    editSeasonDraftRef.current = nextForm;
    setSubjectKeyword(subjectLabelFromRank(row));
    setSubjectPickerOpen(false);
    setForm(nextForm);
    setFormOpen(true);
    void loadSubjectOptions(row.dramaName || "");
  };

  const selectedSubject = useMemo(
    () => subjectOptions.find((item) => String(item.id) === String(form.subjectId)),
    [form.subjectId, subjectOptions]
  );

  const updateForm = (key: keyof DramaRankRow, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateFormStatus = (_value: number) => {
    const nextValue = listType === 2 ? 1 : 3;
    setForm((prev) => ({
      ...prev,
      status: nextValue,
      reserveCount: nextValue === 1 ? prev.reserveCount : 0,
      expectedReleaseTime: nextValue === 1 ? prev.expectedReleaseTime : "",
      releaseTime: nextValue === 3 ? "" : prev.releaseTime
    }));
  };

  const selectSubject = (subjectId: string) => {
    const subject = subjectOptions.find((item) => String(item.id) === String(subjectId));
    if (!subject) {
      updateForm("subjectId", subjectId);
      setSubjectKeyword("");
      return;
    }
    setSubjectKeyword(subjectOptionLabel(subject));
    setSubjectPickerOpen(false);
    setForm((prev) => ({
      ...prev,
      subjectId: String(subject.id),
      dramaName: subject.name,
      alias: subject.alias || "",
      platform: subject.platform || "",
      genre: subject.genre || "",
      coverUrl: subject.coverUrl || "",
      intro: subject.intro || ""
    }));
  };

  const changeAddTarget = (value: "subject" | "season") => {
    setAddTarget(value);
    if (value === "season") {
      setSubjectKeyword("");
      setSubjectPickerOpen(false);
      void loadSubjectOptions();
      setForm((prev) => ({
        ...prev,
        subjectId: "",
        dramaName: "",
        alias: "",
        platform: "",
        genre: "",
        coverUrl: "",
        intro: "",
        seasonName: "",
        seasonNo: 2,
        seasonCoverUrl: ""
      }));
      return;
    }
    setSubjectKeyword("");
    setSubjectPickerOpen(false);
    setForm((prev) => ({
      ...prev,
      subjectId: "",
      dramaName: "",
      alias: "",
      platform: "",
      genre: "",
      coverUrl: "",
      intro: "",
      seasonName: "第一季",
      seasonNo: 1,
      seasonCoverUrl: ""
    }));
  };

  const changeFormTarget = (value: "subject" | "season") => {
    if (formMode === "edit") {
      if (isSubjectForm) {
        editSubjectDraftRef.current = form;
      } else {
        editSeasonDraftRef.current = form;
      }
      const nextForm = value === "subject" ? editSubjectDraftRef.current : editSeasonDraftRef.current;
      setAddTarget(value);
      if (nextForm) {
        setForm(nextForm);
        setSubjectKeyword(value === "season" ? subjectLabelFromRank(nextForm) : "");
        if (value === "season") {
          void loadSubjectOptions(nextForm.dramaName || "");
        }
      } else {
        setSubjectKeyword("");
      }
      setSubjectPickerOpen(false);
      return;
    }
    changeAddTarget(value);
  };

  const patchSubjectRows = (nextSubject: DramaRankRow) => {
    setRows((prev) =>
      prev.map((item) => {
        const sameSubject = nextSubject.subjectId && String(item.subjectId) === String(nextSubject.subjectId);
        if (!sameSubject) return item;
        return {
          ...item,
          dramaName: nextSubject.dramaName || item.dramaName,
          alias: nextSubject.alias || "",
          platform: nextSubject.platform || "",
          genre: nextSubject.genre || "",
          coverUrl: nextSubject.coverUrl || "",
          intro: nextSubject.intro || ""
        };
      })
    );
  };

  const patchSeasonRow = (nextSeason: DramaRankRow) => {
    setRows((prev) => {
      const nextRows = prev.map((item) => {
        const sameRank = nextSeason.id && String(item.id) === String(nextSeason.id);
        if (!sameRank) return item;
        return {
          ...item,
          ...nextSeason,
          rankDate: item.rankDate,
          listType: item.listType || listType,
          status: fixedStatusValue(listType),
          releaseTime: listType === 2 ? item.releaseTime : "",
          expectedReleaseTime: listType === 2 ? nextSeason.expectedReleaseTime || "" : "",
          heatScore: Number(nextSeason.heatScore || 0),
          reserveCount: listType === 2 ? Number(nextSeason.reserveCount || 0) : 0
        };
      });
      if (listType === 1) {
        return nextRows.sort((a, b) => Number(a.rankNo || 0) - Number(b.rankNo || 0));
      }
      return nextRows.sort((a, b) => Number(b.reserveCount || 0) - Number(a.reserveCount || 0));
    });
  };

  const saveForm = async () => {
    if (isSeasonForm && !form.subjectId) {
      notify({ type: "warning", title: "无法保存", message: "请先选择漫剧主体" });
      return;
    }
    if (isSubjectForm && !form.dramaName?.trim()) {
      notify({ type: "warning", title: "无法保存", message: "请填写漫剧名称" });
      return;
    }
    if (isAddSubjectOnly) {
      const resp = await addDramaSubject({
        dramaName: form.dramaName || "",
        alias: form.alias || "",
        platform: form.platform || "",
        genre: form.genre || "",
        coverUrl: form.coverUrl || "",
        intro: form.intro || ""
      });
      if (resp.code === 0) {
        setFormOpen(false);
        notify({ type: "success", title: "已保存", message: "漫剧主体已新增，新增季时可直接选择" });
        await loadSubjectOptions();
      }
      return;
    }
    if (formMode === "edit" && isSubjectForm) {
      if (!form.subjectId) {
        notify({ type: "warning", title: "无法保存", message: "漫剧主体不存在" });
        return;
      }
      const resp = await updateDramaSubject({
        id: form.subjectId,
        dramaName: form.dramaName || "",
        alias: form.alias || "",
        platform: form.platform || "",
        genre: form.genre || "",
        coverUrl: form.coverUrl || "",
        intro: form.intro || ""
      });
      if (resp.code === 0) {
        setFormOpen(false);
        notify({ type: "success", title: "已保存", message: "漫剧主体已更新" });
        patchSubjectRows(form);
        await loadSubjectOptions();
      }
      return;
    }
    const payload = {
      ...form,
      rankDate,
      listType,
      subjectReadonly: Boolean(form.subjectId),
      status: listType === 2 ? 1 : 3,
      releaseTime: Number(form.status) === 1 || Number(form.status) === 3 ? "" : form.releaseTime,
      expectedReleaseTime: Number(form.status) === 1 ? form.expectedReleaseTime : ""
    };
    const resp = formMode === "edit" ? await updateDramaRank(payload) : await addDramaRank(payload);
    if (resp.code === 0) {
      setFormOpen(false);
      notify({ type: "success", title: "已保存", message: "榜单记录已更新" });
      if (formMode === "edit") {
        patchSeasonRow(payload);
      } else {
        await loadData(1, true);
      }
    }
  };

  const handleCoverFile = async (file: File | undefined, target: "subject" | "season") => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify({ type: "warning", title: "无法上传", message: "请选择图片文件" });
      return;
    }
    setCoverUploading(target);
    try {
      const resp = await uploadDramaCover(file);
      if (resp.code === 0 && resp.data) {
        updateForm(target === "subject" ? "coverUrl" : "seasonCoverUrl", resp.data);
        notify({ type: "success", title: "已上传", message: "封面已更新" });
      }
    } finally {
      setCoverUploading("");
      const inputRef = target === "subject" ? subjectCoverInputRef : seasonCoverInputRef;
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeRow = async (row: DramaRankRow) => {
    if (!row.id) return;
    const confirmed = await confirmAction({
      title: "确认删除",
      message: `将删除「${row.dramaName || "-"}」的榜单记录。`,
      confirmText: "删除",
      tone: "danger"
    });
    if (!confirmed) return;
    const resp = await deleteDramaRank(row.id);
    if (resp.code === 0) {
      notify({ type: "success", title: "已删除", message: "榜单记录已删除" });
      await loadData(1, true);
    }
  };

  const clearCurrentRank = async () => {
    const confirmed = await confirmAction({
      title: "确认清空",
      message: `将清空「${selectedListLabel}」当前全部榜单记录，漫剧主体和季资料会保留。此操作不可撤销。`,
      confirmText: "清空",
      tone: "danger"
    });
    if (!confirmed) return;
    const resp = await clearDramaRank({ listType });
    if (resp.code === 0) {
      notify({ type: "success", title: "已清空", message: `${selectedListLabel} 已清空` });
      await loadData(1, true);
    }
  };

  const copyDramaName = async (event: MouseEvent<HTMLButtonElement>, row: DramaRankRow) => {
    event.preventDefault();
    event.stopPropagation();
    const text = String(row.dramaName || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const key = String(row.id || row.subjectId || text);
      setCopiedDramaId(key);
      window.setTimeout(() => setCopiedDramaId((current) => (current === key ? "" : current)), 1200);
    } catch {}
  };

  const loadOcrModels = useCallback(async () => {
    const [optionsResp, activeResp] = await Promise.all([getChatModelOptions(), getActiveChatModel()]);
    const options = (optionsResp.data || [])
      .map((item) => {
        const value = String(item.value || item.model || item.name || item.label || "").trim();
        return value ? { label: String(item.label || item.name || value), value } : null;
      })
      .filter(Boolean) as Array<{ label: string; value: string }>;
    const visionOptions = options.filter(isLikelyVisionModelName);
    const displayOptions = visionOptions.length > 0 ? visionOptions : options;
    setOcrModelOptions(displayOptions);
    setOcrTextModelOptions(options);
    const activeModel = String(activeResp.data?.model || "").trim();
    const activeInList = displayOptions.some((item) => item.value === activeModel);
    const textActiveInList = options.some((item) => item.value === activeModel);
    setOcrModel((prev) => prev || (activeInList ? activeModel : "") || displayOptions[0]?.value || "");
    setOcrTextModel((prev) => prev || (textActiveInList ? activeModel : "") || options.find((item) => !isLikelyVisionModelName(item))?.value || options[0]?.value || "");
  }, []);

  const openOcr = () => {
    setOcrFiles([]);
    setOcrRows([]);
    setOcrOpen(true);
    void loadOcrModels();
  };

  const handleOcrFiles = (fileList: FileList | null) => {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) {
      notify({ type: "warning", title: "无法识别", message: "请选择榜单截图图片" });
      return;
    }
    setOcrFiles((prev) => [...prev, ...files].slice(0, 6));
    if (ocrInputRef.current) ocrInputRef.current.value = "";
  };

  const removeOcrFile = (index: number) => {
    setOcrFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const runOcrParse = async () => {
    if (!ocrModel) {
      notify({ type: "warning", title: "无法识别", message: "请先选择 OCR 模型" });
      return;
    }
    if (!ocrTextModel) {
      notify({ type: "warning", title: "无法识别", message: "请先选择文本处理模型" });
      return;
    }
    if (ocrFiles.length === 0) {
      notify({ type: "warning", title: "无法识别", message: "请先上传榜单截图" });
      return;
    }
    setOcrLoading(true);
    try {
      const resp = await parseDramaRankScreenshot({ rankDate, listType, model: ocrModel, textModel: ocrTextModel, files: ocrFiles });
      if (resp.code === 0) {
        const items = (resp.data?.items || []).map((item, index) => ({
          ...item,
          rankDate,
          listType,
          rankNo: listType === 1 ? Number(item.rankNo || index + 1) : index + 1,
          status: fixedStatusValue(listType),
          reserveCount: listType === 2 ? Number(item.reserveCount || 0) : 0
        }));
        setOcrRows(items);
        notify({ type: "success", title: "识别完成", message: `已识别 ${items.length} 条，可编辑后保存` });
      }
    } finally {
      setOcrLoading(false);
    }
  };

  const updateOcrRow = (index: number, key: keyof DramaRankRow, value: string | number) => {
    setOcrRows((prev) => prev.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (key === "status") {
        const nextStatus = fixedStatusValue(listType);
        return {
          ...item,
          status: nextStatus,
          reserveCount: nextStatus === 1 ? item.reserveCount : 0,
          expectedReleaseTime: nextStatus === 1 ? item.expectedReleaseTime : ""
        };
      }
      if (key === "seasonName") {
        const seasonName = String(value || "").trim();
        return { ...item, seasonName, seasonNo: parseSeasonNo(seasonName) };
      }
      return { ...item, [key]: value };
    }));
  };

  const removeOcrRow = (index: number) => {
    setOcrRows((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const saveOcr = async () => {
    const sourceRows = ocrRows
      .filter((item) => item.dramaName?.trim())
      .map((item) => ({
        ...item,
        rankDate,
        listType,
        status: fixedStatusValue(listType),
        reserveCount: listType === 2 ? Number(item.reserveCount || 0) : 0
      }));
    if (sourceRows.length === 0) {
      notify({ type: "warning", title: "无法保存", message: "没有可保存的识别结果" });
      return;
    }
    if (listType !== 2) {
      const missingRankIndex = sourceRows.findIndex((item) => Number(item.rankNo || 0) <= 0);
      if (missingRankIndex >= 0) {
        notify({ type: "warning", title: "排名缺失", message: `第 ${missingRankIndex + 1} 条缺少排名，请补齐后保存` });
        return;
      }
    }
    const items = sourceRows
      .sort((a, b) => {
        if (listType !== 2) return Number(a.rankNo || 0) - Number(b.rankNo || 0);
        return Number(b.reserveCount || 0) - Number(a.reserveCount || 0) || Number(b.heatScore || 0) - Number(a.heatScore || 0);
      })
      .slice(0, 99)
      .map((item, index) => ({ ...item, rankNo: listType === 2 ? index + 1 : Number(item.rankNo || 0) }));
    const confirmed = await confirmAction({
      title: "保存识别结果",
      message: `将按「主体 + 季号」保存或更新 ${items.length} 条 ${selectedListLabel} 数据，不会覆盖当天其他记录。`,
      confirmText: "保存/更新"
    });
    if (!confirmed) return;
    setOcrSaving(true);
    try {
      const resp = await saveDramaOcrRows({ rankDate, listType, items });
      if (resp.code === 0) {
        setOcrOpen(false);
        notify({
          type: "success",
          title: "已保存",
          message: `处理 ${resp.data?.total || items.length} 条，新增 ${resp.data?.created || 0} 条，更新 ${resp.data?.updated || 0} 条`
        });
        await loadData(1, true);
      }
    } finally {
      setOcrSaving(false);
    }
  };

  return (
    <div className="workspace module-workspace drama-hot-page">
      <div className="data-panel data-panel-full">
        <div className="table-toolbar drama-hot-toolbar">
          {!isFixedListType ? <SegmentedControl value={listType} options={listTypeOptions} onChange={changeListType} className="drama-list-tabs" /> : null}
          <label className="table-search">
            <Search size={16} />
            <input value={keyword} placeholder="搜索漫剧、别名、季名" onChange={(event) => setKeyword(event.target.value)} />
          </label>
          {listType === 1 ? <AppSelect value={status} options={newRankStatusOptions} onChange={setStatus} /> : null}
          <button type="button" onClick={() => void loadData(1, true)}>
            <Search size={16} />
            查询
          </button>
          <button type="button" onClick={openAdd}>
            <Plus size={16} />
            新增
          </button>
          <button type="button" onClick={openOcr}>
            <ImagePlus size={16} />
            截图识别
          </button>
          <button type="button" onClick={() => void loadData(1, true)}>
            <RefreshCw size={16} />
            刷新
          </button>
          <span className="drama-toolbar-spacer" />
          <button className="text-danger" type="button" onClick={() => void clearCurrentRank()}>
            <Trash2 size={16} />
            一键清空
          </button>
        </div>

        <div className="drama-rank-cards" ref={cardsRef}>
          {loading && rows.length === 0 ? (
            <div className="drama-card-empty">
              <LoadingState text="加载中" compact />
            </div>
          ) : rows.length === 0 ? (
            <div className="drama-card-empty">暂无榜单数据</div>
          ) : (
            rows.map((row) => {
              const onlineTime = onlineTimeDisplay(row);
              return (
                <article className="drama-rank-card" key={String(row.id)}>
                  <div className="drama-card-cover">
                    {row.seasonCoverUrl || row.coverUrl ? <img src={row.seasonCoverUrl || row.coverUrl} alt={row.dramaName || "漫剧封面"} /> : <span className="drama-cover-fallback" />}
                    <span className="drama-cover-type">漫剧</span>
                    {listType === 1 ? (
                      <span className="drama-cover-rank">{String(row.rankNo || "-").padStart(2, "0")}</span>
                    ) : (
                      <span className="drama-cover-reserve">{formatWanMetric(row.reserveCount)}预约</span>
                    )}
                    {row.seasonName ? <span className="drama-cover-season">{row.seasonName}</span> : null}
                    {listType === 2 && onlineTime.text ? <span className={`drama-cover-release${onlineTime.isToday ? " is-today" : ""}`}>{onlineTime.text}</span> : null}
                    <div className={`drama-cover-info${listType === 2 ? " drama-cover-info-single" : ""}`}>
                      {listType === 1 ? <span>{formatWanMetric(row.heatScore)}热度</span> : null}
                      <span>{statusLabel(row.status, row.listType || listType)}</span>
                    </div>
                    <div className="drama-card-foot">
                      <div className="table-actions">
                        <button type="button" aria-label="编辑" onClick={() => openEdit(row)}>
                          <Edit3 size={15} />
                        </button>
                        <button className="text-danger" type="button" aria-label="删除" onClick={() => void removeRow(row)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="drama-card-body">
                    <div className="drama-card-title-row">
                      <strong className="drama-card-title" title={row.dramaName || "-"}>{row.dramaName || "-"}</strong>
                      {row.dramaName ? (
                        <button
                          type="button"
                          className={`drama-card-copy${copiedDramaId === String(row.id || row.subjectId || row.dramaName) ? " copied" : ""}`}
                          aria-label="复制主题名称"
                          title="复制主题名称"
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => void copyDramaName(event, row)}
                        >
                          {copiedDramaId === String(row.id || row.subjectId || row.dramaName) ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      ) : null}
                    </div>
                    <div className="drama-card-meta-line">
                      <span>{row.seasonName || "第一季"}</span>
                      {row.genre ? <span>{row.genre}</span> : null}
                    </div>
                    {listType === 1 && onlineTime.text ? (
                      <div className="drama-card-subtitle">
                        <span>{`上线 ${onlineTime.text}`}</span>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
          {rows.length > 0 ? (
            <div className="drama-load-more" ref={loadMoreRef}>
              {loadingMore ? <LoadingState text="加载更多" compact /> : hasMore ? "下滑加载更多" : `已加载全部 ${total} 条`}
            </div>
          ) : null}
        </div>
      </div>

      {formOpen ? (
        <div className="confirm-mask">
          <div className="drama-modal">
            <header>
              <h3>{formMode === "edit" ? (isSubjectForm ? "编辑漫剧主体" : "编辑季榜单") : isAddSubjectOnly ? "新增漫剧主体" : "新增季榜单"}</h3>
              <button type="button" onClick={() => setFormOpen(false)}>×</button>
            </header>
            <div className="drama-form-mode">
              <SegmentedControl value={addTarget} options={formMode === "edit" ? editTargetOptions : addTargetOptions} onChange={changeFormTarget} />
            </div>
            <div className="drama-form-grid">
              {isSeasonForm ? (
                <>
                  {listType === 1 ? (
                  <label>
                    排名 *
                    <input type="number" min={1} max={99} value={form.rankNo || 1} onChange={(event) => updateForm("rankNo", Number(event.target.value || 0))} />
                  </label>
                  ) : null}
                  <label>
                    状态 *
                    <AppSelect value={Number(form.status || 1)} options={formStatusOptions} onChange={updateFormStatus} />
                  </label>
                </>
              ) : null}
              {isSeasonForm ? (
                <>
                  <label className="wide">
                    漫剧主体 *
                    <div className="drama-subject-combobox" ref={subjectPickerRef}>
                      <div className="drama-subject-input">
                        <Search size={16} />
                        <input
                          value={subjectKeyword}
                          placeholder="输入漫剧名 / 别名匹配主体"
                          onFocus={() => {
                            setSubjectPickerOpen(true);
                            void loadSubjectOptions(subjectKeyword);
                          }}
                          onChange={(event) => {
                            setSubjectKeyword(event.target.value);
                            setSubjectPickerOpen(true);
                            updateForm("subjectId", "");
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            if (subjectOptions[0]) {
                              selectSubject(String(subjectOptions[0].id));
                            }
                          }}
                        />
                      </div>
                      {subjectPickerOpen ? (
                        <div className="drama-subject-options">
                          {subjectOptions.length > 0 ? (
                            subjectOptions.map((item) => (
                              <button
                                type="button"
                                key={String(item.id)}
                                className={String(item.id) === String(form.subjectId) ? "selected" : ""}
                                onClick={() => selectSubject(String(item.id))}
                              >
                                <span className="drama-subject-option-cover">
                                  {item.coverUrl ? <img src={item.coverUrl} alt={`${item.name || "漫剧"}封面`} /> : <span>{coverInitial(item.name)}</span>}
                                </span>
                                <span className="drama-subject-option-info">
                                  <strong>{item.name || "未命名主体"}</strong>
                                  <small>{[item.alias, item.platform, item.genre].filter(Boolean).join(" / ") || "暂无平台与类型"}</small>
                                </span>
                              </button>
                            ))
                          ) : (
                            <div className="drama-subject-empty">暂无匹配主体</div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </label>
	                  <div className="wide drama-subject-summary">
	                    <div className="drama-cover-preview">
	                      {selectedSubject?.coverUrl || form.coverUrl ? <img src={selectedSubject?.coverUrl || form.coverUrl} alt="主体封面" /> : <span>{coverInitial(selectedSubject?.name || form.dramaName)}</span>}
	                    </div>
	                    <div>
	                      <strong>{selectedSubject?.name || form.dramaName || "请选择漫剧主体"}</strong>
	                      <p>{[selectedSubject?.platform || form.platform, selectedSubject?.genre || form.genre].filter(Boolean).join(" / ") || "选择后自动带出主体信息"}</p>
	                      <p>{selectedSubject?.intro || form.intro || "季资料独立维护，主体信息不会被季编辑改写。"}</p>
	                    </div>
	                  </div>
                </>
              ) : isSubjectForm ? (
                <label>
                  漫剧名称 *
                  <input value={form.dramaName || ""} onChange={(event) => updateForm("dramaName", event.target.value)} />
                </label>
              ) : null}
              {isSeasonForm ? (
                <label>
                  季名
                  <input value={form.seasonName || ""} onChange={(event) => updateForm("seasonName", event.target.value)} />
                </label>
              ) : null}
              {isSubjectForm ? (
                <>
                  <label>
                    别名
                    <input value={form.alias || ""} onChange={(event) => updateForm("alias", event.target.value)} />
                  </label>
                  <label>
                    平台
                    <input value={form.platform || ""} onChange={(event) => updateForm("platform", event.target.value)} />
                  </label>
                  <label>
                    类型
                    <input value={form.genre || ""} onChange={(event) => updateForm("genre", event.target.value)} />
                  </label>
                  <label className="wide drama-cover-field">
                    主体默认封面
                    <div className="drama-cover-editor">
                      <div className="drama-cover-preview">
                        {form.coverUrl ? <img src={form.coverUrl} alt="主体默认封面预览" /> : <span>{coverInitial(form.dramaName)}</span>}
                      </div>
                      <div>
                        <input value={form.coverUrl || ""} placeholder="整部漫剧的默认封面" onChange={(event) => updateForm("coverUrl", event.target.value)} />
                        <p>属于漫剧主体信息，同名漫剧新增新季会自动复用。</p>
                      </div>
                      <button type="button" disabled={Boolean(coverUploading)} onClick={() => subjectCoverInputRef.current?.click()}>
                        <ImagePlus size={16} />
                        {coverUploading === "subject" ? "上传中" : "上传"}
                      </button>
                      <input ref={subjectCoverInputRef} type="file" accept="image/*" hidden onChange={(event) => void handleCoverFile(event.target.files?.[0], "subject")} />
                    </div>
                  </label>
                </>
              ) : null}
              {isSeasonForm ? (
                <>
                  <label className="wide drama-cover-field">
                    本季封面
                    <div className="drama-cover-editor">
                      <div className="drama-cover-preview">
                        {form.seasonCoverUrl ? <img src={form.seasonCoverUrl} alt="本季封面预览" /> : <span>{coverInitial(form.seasonName || form.dramaName)}</span>}
                      </div>
                      <div>
                        <input value={form.seasonCoverUrl || ""} placeholder="当前季专属封面；为空时使用主体默认封面" onChange={(event) => updateForm("seasonCoverUrl", event.target.value)} />
                        <p>只影响当前季，适合预约海报、上线海报或不同季视觉。</p>
                      </div>
                      <button type="button" disabled={Boolean(coverUploading)} onClick={() => seasonCoverInputRef.current?.click()}>
                        <ImagePlus size={16} />
                        {coverUploading === "season" ? "上传中" : "上传"}
                      </button>
                      <input ref={seasonCoverInputRef} type="file" accept="image/*" hidden onChange={(event) => void handleCoverFile(event.target.files?.[0], "season")} />
                    </div>
                  </label>
                  <label>
                    热度
                    <input type="number" value={form.heatScore || 0} onChange={(event) => updateForm("heatScore", Number(event.target.value || 0))} />
                  </label>
                  {Number(form.status) === 1 ? (
                    <label>
                      预约数
                      <input type="number" value={form.reserveCount || 0} onChange={(event) => updateForm("reserveCount", Number(event.target.value || 0))} />
                    </label>
                  ) : null}
                  {Number(form.status) === 1 ? (
                    <label>
                      预约上线
                      <input value={form.expectedReleaseTime || ""} placeholder="即将上线 / 8月上线 / 2026-08-20" onChange={(event) => updateForm("expectedReleaseTime", event.target.value)} />
                    </label>
                  ) : null}
                  {Number(form.status) !== 1 && Number(form.status) !== 3 ? (
                    <label>
                      开播时间
                      <input type="date" value={toDateInput(form.releaseTime)} onChange={(event) => updateForm("releaseTime", event.target.value)} />
                    </label>
                  ) : null}
                </>
              ) : null}
              {isSubjectForm ? (
                <label className="wide">
                  简介
                  <textarea rows={3} value={form.intro || ""} onChange={(event) => updateForm("intro", event.target.value)} />
                </label>
              ) : null}
            </div>
            <footer>
              <button type="button" onClick={() => setFormOpen(false)}>取消</button>
              <button className="primary-button" type="button" onClick={() => void saveForm()}>{isSubjectForm ? "保存主体" : "保存季"}</button>
            </footer>
          </div>
        </div>
      ) : null}

      {ocrOpen ? (
        <div className="confirm-mask">
          <div className="drama-modal drama-ocr-modal">
            <header>
              <h3>截图识别 {selectedListLabel}</h3>
              <button type="button" onClick={() => setOcrOpen(false)}>×</button>
            </header>
            <div className="drama-ocr-layout">
              <section className="drama-ocr-panel">
                <label>
                  OCR模型
                  <AppSelect value={ocrModel} options={ocrModelOptions} onChange={setOcrModel} />
                  <small className="drama-ocr-model-hint">只负责识别截图文字，建议选择 glm-ocr 或视觉模型。</small>
                </label>
                <label>
                  文本处理模型
                  <AppSelect value={ocrTextModel} options={ocrTextModelOptions} onChange={setOcrTextModel} />
                  <small className="drama-ocr-model-hint">负责把 OCR 文字整理成排名、主体、类型、季、热度等字段。</small>
                </label>
                <button className="drama-ocr-upload" type="button" onClick={() => ocrInputRef.current?.click()}>
                  <Upload size={18} />
                  <span>上传榜单截图</span>
                  <small>支持多张图片，最多 6 张</small>
                </button>
                <input ref={ocrInputRef} hidden type="file" accept="image/*" multiple onChange={(event) => handleOcrFiles(event.target.files)} />
                <div className="drama-ocr-files">
                  {ocrFiles.length === 0 ? (
                    <p>暂无图片</p>
                  ) : (
                    ocrFiles.map((file, index) => (
                      <div key={`${file.name}-${index}`}>
                        <span>{index + 1}. {file.name}</span>
                        <button type="button" aria-label="移除图片" onClick={() => removeOcrFile(index)}>
                          <X size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>
              <section className="drama-ocr-result">
                <div>
                  <strong>识别结果</strong>
                  <span>除封面外会自动拆分主体与季，保存前可二次编辑</span>
                </div>
                <div className="drama-ocr-table">
                  {ocrRows.length === 0 ? (
                    <p>{ocrLoading ? "识别中" : "暂无识别结果"}</p>
                  ) : (
                    ocrRows.map((item, index) => (
                      <div className="drama-ocr-row" key={`${index}-${item.rawTitle || item.dramaName}`}>
                        {listType === 1 ? (
                          <input type="number" min={1} max={99} value={item.rankNo || index + 1} onChange={(event) => updateOcrRow(index, "rankNo", Number(event.target.value || 0))} />
                        ) : (
                          <span className="drama-batch-rank-muted">按预约数排序</span>
                        )}
                        <input value={item.dramaName || ""} placeholder="漫剧主体" onChange={(event) => updateOcrRow(index, "dramaName", event.target.value)} />
                        <input value={item.genre || ""} placeholder="类型" onChange={(event) => updateOcrRow(index, "genre", event.target.value)} />
                        <input value={item.seasonName || ""} placeholder="季" onChange={(event) => updateOcrRow(index, "seasonName", event.target.value)} />
                        <span className={`drama-fixed-status${listType === 2 ? " is-reserve" : ""}`}>{fixedStatusLabel(listType)}</span>
                        {Number(item.status) === 1 ? (
                          <input value={item.expectedReleaseTime || ""} placeholder="上线时间" onChange={(event) => updateOcrRow(index, "expectedReleaseTime", event.target.value)} />
                        ) : (
                          <input value="" placeholder="-" disabled />
                        )}
                        <button className="text-danger" type="button" aria-label="删除识别行" onClick={() => removeOcrRow(index)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
            <footer>
              <button type="button" onClick={() => setOcrOpen(false)}>取消</button>
              <button type="button" disabled={ocrFiles.length === 0 || !ocrModel || !ocrTextModel || ocrLoading} onClick={() => void runOcrParse()}>{ocrLoading ? "识别中" : "开始识别"}</button>
              <button className="primary-button" type="button" disabled={ocrRows.length === 0 || ocrSaving} onClick={() => void saveOcr()}>{ocrSaving ? "保存中" : "保存/更新"}</button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
