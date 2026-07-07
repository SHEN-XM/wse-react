import { Eye, EyeOff, Loader2, LockKeyhole, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getCaptcha, login } from "../api/auth";
import { persistUser } from "../utils/authState";
import { notify } from "../utils/notify";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirect = useMemo(() => {
    const state = location.state as { from?: string } | null;
    return state?.from || new URLSearchParams(location.search).get("redirect") || "/";
  }, [location.search, location.state]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaUrl, setCaptchaUrl] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const canGetCaptcha = username.trim().length > 0;

  const validateUsername = () => {
    const next: Record<string, string> = {};
    if (!username.trim()) next.username = "请输入账号";
    else if (username.trim().length < 3) next.username = "账号至少 3 个字符";
    setErrors((prev) => ({ ...prev, ...next }));
    return Object.keys(next).length === 0;
  };

  const validateBase = () => {
    const next: Record<string, string> = {};
    if (!username.trim()) next.username = "请输入账号";
    else if (username.trim().length < 3) next.username = "账号至少 3 个字符";
    if (!password) next.password = "请输入密码";
    else if (password.length < 6) next.password = "密码至少 6 个字符";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const refreshCaptcha = async () => {
    if (!validateUsername()) return;
    setLoading(true);
    try {
      const resp = await getCaptcha(username.trim());
      if (resp.code === 0 && resp.data) {
        setCaptcha("");
        setCaptchaUrl(resp.data);
        setErrors((prev) => ({ ...prev, captcha: "" }));
      } else {
        notify({ type: "error", title: "验证码获取失败", message: resp.msg || "请稍后重试" });
      }
    } catch (err) {
      notify({ type: "error", title: "验证码获取失败", message: err instanceof Error ? err.message : "接口异常" });
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!captchaUrl) {
      if (!validateUsername()) return;
      await refreshCaptcha();
      if (canGetCaptcha) notify({ type: "info", title: "请输入验证码", message: "验证码已生成，填写后再次登录" });
      return;
    }
    if (!validateBase()) return;
    if (!captcha.trim()) {
      setErrors((prev) => ({ ...prev, captcha: "请输入验证码" }));
      notify({ type: "warning", title: "验证码不能为空" });
      return;
    }
    setLoading(true);
    try {
      const resp = await login({ username: username.trim(), password, captcha: captcha.trim() });
      if (resp.code === 0 && resp.data) {
        persistUser(resp.data);
        notify({ type: "success", title: "登录成功", message: resp.data.nickname || resp.data.realname || resp.data.username });
        navigate(redirect, { replace: true });
      } else {
        notify({ type: "error", title: "登录失败", message: resp.msg || "请检查账号、密码或验证码" });
        if (resp.code === 7) setErrors((prev) => ({ ...prev, captcha: "验证码错误，请重新输入" }));
        await refreshCaptcha();
      }
    } catch (err) {
      notify({ type: "error", title: "登录接口异常", message: err instanceof Error ? err.message : "请稍后重试" });
      if (captchaUrl) await refreshCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-brand">
          <div>
            <h1>写作后台情报局</h1>
          </div>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label>
            <span>账号</span>
            <div className={`field-box ${errors.username ? "is-invalid" : ""}`}>
              <UserRound size={18} />
              <input
                autoFocus
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setCaptchaUrl("");
                  setErrors((prev) => ({ ...prev, username: "" }));
                }}
                placeholder="请输入账号"
                autoComplete="username"
              />
            </div>
            {errors.username && <em className="field-error">{errors.username}</em>}
          </label>
          <label>
            <span>密码</span>
            <div className={`field-box ${errors.password ? "is-invalid" : ""}`}>
              <LockKeyhole size={18} />
              <input
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrors((prev) => ({ ...prev, password: "" }));
                }}
                placeholder="请输入密码"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
              />
              <button className="ghost-icon" type="button" onClick={() => setVisible((value) => !value)}>
                {visible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {errors.password && <em className="field-error">{errors.password}</em>}
          </label>
          {captchaUrl && (
            <label>
              <span>验证码</span>
              <div className="captcha-row">
                <div className={`field-box ${errors.captcha ? "is-invalid" : ""}`}>
                  <ShieldCheck size={18} />
                  <input
                    value={captcha}
                    onChange={(event) => {
                      setCaptcha(event.target.value);
                      setErrors((prev) => ({ ...prev, captcha: "" }));
                    }}
                    placeholder="请输入验证码"
                    autoComplete="off"
                  />
                </div>
                <button className="captcha-image-button" type="button" onClick={refreshCaptcha}>
                  <img src={captchaUrl} alt="验证码" />
                </button>
                <button className="captcha-refresh-button" type="button" onClick={refreshCaptcha}>
                  <RefreshCw size={16} />
                </button>
              </div>
              {errors.captcha && <em className="field-error">{errors.captcha}</em>}
            </label>
          )}
          <button className="login-button" type="submit" disabled={loading || (!captchaUrl && !canGetCaptcha)}>
            {loading ? <Loader2 className="spin" size={18} /> : null}
            {captchaUrl ? "登录" : "获取验证码"}
          </button>
        </form>
      </section>
    </main>
  );
}
