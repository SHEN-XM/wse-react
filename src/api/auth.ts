import { Md5 } from "ts-md5";
import { getReq, postReq, type ApiResponse } from "../utils/request";
import type { StoredUser } from "../utils/authState";

export type LoginPayload = {
  username: string;
  password: string;
  captcha?: string;
};

export async function login(payload: LoginPayload): Promise<ApiResponse<StoredUser>> {
  return postReq<StoredUser>("/check/base/login", {
    username: payload.username,
    password: Md5.hashStr(payload.password).toString(),
    captcha: payload.captcha || ""
  });
}

export async function getCaptcha(username: string): Promise<ApiResponse<string>> {
  return getReq<string>(`/check/base/captcha/${encodeURIComponent(username)}`);
}
