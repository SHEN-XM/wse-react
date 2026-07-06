import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from "react";

type State = {
  error?: Error;
};

export default class ErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("页面渲染异常", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="fatal-page">
          <section>
            <h1>页面异常</h1>
            <p>{this.state.error.message || "组件渲染失败，请刷新页面或联系管理员。"}</p>
            <button type="button" onClick={() => window.location.reload()}>
              刷新页面
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
