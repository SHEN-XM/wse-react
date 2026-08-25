import { postReq } from "../utils/request";

export type DramaRankRow = {
  id?: string | number;
  rankDate?: string;
  listType?: number;
  rankNo?: number;
  previousRankNo?: number;
  rankChange?: number;
  subjectId?: string | number;
  seasonId?: string | number;
  subjectReadonly?: boolean;
  dramaName?: string;
  alias?: string;
  platform?: string;
  genre?: string;
  coverUrl?: string;
  intro?: string;
  seasonName?: string;
  seasonNo?: number;
  seasonCoverUrl?: string;
  status?: number;
  releaseTime?: string;
  expectedReleaseTime?: string;
  finishTime?: string;
  heatScore?: number;
  reserveCount?: number;
  likeCount?: number;
  commentCount?: number;
  favoriteCount?: number;
  createTime?: string;
  updateTime?: string;
};

export type DramaOcrItem = DramaRankRow & {
  rawTitle?: string;
  confidence?: number;
};

export type DramaOcrResp = {
  items?: DramaOcrItem[];
  model?: string;
};

export type ChatModelOption = {
  label?: string;
  value?: string;
  model?: string;
  name?: string;
};

export type DramaSubjectOption = {
  id: string | number;
  name: string;
  alias?: string;
  platform?: string;
  genre?: string;
  coverUrl?: string;
  intro?: string;
  firstReleaseTime?: string;
  status?: number;
};

export type DramaSubjectRow = DramaSubjectOption & {
  seasonCount?: number;
  rankCount?: number;
  createTime?: string;
  updateTime?: string;
};

export type DramaSubjectPayload = {
  dramaName: string;
  alias?: string;
  platform?: string;
  genre?: string;
  coverUrl?: string;
  intro?: string;
};

export type DramaSubjectUpdatePayload = DramaSubjectPayload & {
  id: string | number;
};

export type DramaRankPage = {
  list?: DramaRankRow[];
  pageNum?: number;
  pageSize?: number;
  size?: number;
  pages?: number;
  total?: number;
};

export type DramaSubjectPage = {
  list?: DramaSubjectRow[];
  pageNum?: number;
  pageSize?: number;
  size?: number;
  pages?: number;
  total?: number;
};

export type DramaRankPagePayload = {
  rankDate?: string;
  listType: number;
  keyword?: string;
  status?: number;
  pageNum: number;
  pageSize: number;
};

export function getDramaRankPage(payload: DramaRankPagePayload) {
  return postReq<DramaRankPage>("/check/drama/hot/rank/page", payload);
}

export function getDramaSubjectOptions(payload: { keyword?: string; limit?: number } = {}) {
  return postReq<DramaSubjectOption[]>("/check/drama/hot/subject/options", payload);
}

export function getDramaSubjectPage(payload: { keyword?: string; pageNum: number; pageSize: number }) {
  return postReq<DramaSubjectPage>("/check/drama/hot/subject/page", payload);
}

export function addDramaSubject(payload: DramaSubjectPayload) {
  return postReq("/check/drama/hot/subject/add", payload);
}

export function updateDramaSubject(payload: DramaSubjectUpdatePayload) {
  return postReq("/check/drama/hot/subject/update", payload);
}

export function deleteDramaSubject(id: string | number) {
  return postReq("/check/drama/hot/subject/delete", { id: String(id) });
}

export function addDramaRank(payload: DramaRankRow) {
  return postReq("/check/drama/hot/rank/add", payload);
}

export function updateDramaRank(payload: DramaRankRow) {
  return postReq("/check/drama/hot/rank/update", payload);
}

export function deleteDramaRank(id: string | number) {
  return postReq("/check/drama/hot/rank/delete", { id: String(id) });
}

export function clearDramaRank(payload: { listType: number }) {
  return postReq("/check/drama/hot/rank/clear", payload);
}

export function moveDramaRank(payload: { id?: string | number; listType?: number; fromRankNo?: number; toRankNo?: number; rankNo?: number }) {
  return postReq("/check/drama/rank/move", payload);
}

export function getChatModelOptions() {
  return postReq<ChatModelOption[]>("/check/chat/param/option", {});
}

export function getActiveChatModel() {
  return postReq<{ model?: string }>("/check/chat/param/model", {});
}

export function parseDramaRankScreenshot(payload: { rankDate: string; listType: number; model: string; textModel?: string; files: File[] }) {
  const formData = new FormData();
  formData.append("rankDate", payload.rankDate);
  formData.append("listType", String(payload.listType));
  formData.append("model", payload.model);
  if (payload.textModel) formData.append("textModel", payload.textModel);
  payload.files.forEach((file) => {
    formData.append("images", file);
  });
  return postReq<DramaOcrResp>("/check/drama/hot/ocr/parse", formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    },
    timeout: 180000
  });
}

export function saveDramaOcrRows(payload: { rankDate: string; listType: number; items: DramaRankRow[] }) {
  return postReq<{ total?: number; created?: number; updated?: number }>("/check/drama/hot/ocr/save", payload);
}

export function uploadDramaCover(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return postReq<string>("/check/drama/hot/cover/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    },
    timeout: 120000
  });
}
