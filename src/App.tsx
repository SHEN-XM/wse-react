import { RouterProvider } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import ToastProvider from "./components/ToastProvider";
import { router } from "./router";
import { ThemeProvider } from "./theme/ThemeProvider";

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
