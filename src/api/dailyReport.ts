import { postReq } from "../utils/request";

export type DailySource = {
  title?: string;
  siteName?: string;
  url?: string;
  summary?: string;
  publishTime?: string;
  rankScore?: number;
  query?: string;
};

export type DailyIdeaCard = {
  title?: string;
  direction?: string;
  hook?: string;
  characters?: string[];
  conflict?: string;
  risk?: string;
  targetGenre?: string;
};

export type DailyItem = {
  title?: string;
  desc?: string;
  url?: string;
  category?: string;
  heatScore?: number;
  confidence?: number;
  trend?: string;
  audience?: string;
  genres?: string[];
  keywords?: string[];
  creativeValue?: string;
  risk?: string;
  sourceCount?: number;
  sources?: DailySource[];
  ideas?: DailyIdeaCard[];
};

export type TodayDailyReport = {
  num?: number;
  date?: string;
  weekday?: string;
  dailyItem?: DailyItem[];
};

export type DailyReportRow = {
  id: string | number;
  num?: number;
  type?: number;
  content?: string;
  createTime?: string;
};

export type DailyReportPage = {
  list?: DailyReportRow[];
  total?: number;
  size?: number;
  pageNum?: number;
  pageSize?: number;
  pages?: number;
};

export function getTodayDailyReport() {
  return postReq<TodayDailyReport>("/check/report/daily", {});
}

export function getDailyReportPage(payload: { pageNum: number; pageSize: number; type?: number; content?: string }) {
  return postReq<DailyReportPage>("/check/report/page", payload);
}

export function generateDailyReport() {
  return postReq("/check/report/gen", {});
}

export function updateDailyReport(payload: { id: string; content: string }) {
  return postReq("/check/report/update", payload);
}

export function deleteDailyReport(id: string) {
  return postReq("/check/report/delete", { id });
}
