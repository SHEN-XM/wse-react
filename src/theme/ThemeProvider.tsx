import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";

export type ThemeName = "light" | "dark" | "green" | "protection";

const THEME_KEY = "wse-react-theme";

const labels: Record<ThemeName, string> = {
  light: "浅色",
  dark: "暗色",
  green: "护眼绿",
  protection: "护眼黄"
};

type ThemeContextValue = {
  theme: ThemeName;
  themes: Array<{ value: ThemeName; label: string }>;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readTheme(): ThemeName {
  const stored = localStorage.getItem(THEME_KEY) as ThemeName | null;
  if (stored && stored in labels) return stored;
  return "light";
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<ThemeName>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => {
    const themes = (Object.keys(labels) as ThemeName[]).map((item) => ({ value: item, label: labels[item] }));
    return {
      theme,
      themes,
      setTheme: setThemeState,
      toggleTheme: () => {
        setThemeState((current) => (current === "dark" ? "light" : "dark"));
      }
    };
  }, [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return value;
}
