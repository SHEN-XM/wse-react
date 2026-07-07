import { Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SelectOption<T extends string | number = string | number> = {
  value: T;
  label: string;
};

type Props<T extends string | number> = {
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  maxMenuHeight?: number;
  ariaLabel?: string;
};

type MenuStyle = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

export default function AppSelect<T extends string | number>({
  value,
  options,
  onChange,
  placeholder = "请选择",
  disabled = false,
  className = "",
  triggerClassName = "",
  menuClassName = "",
  maxMenuHeight = 340,
  ariaLabel
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<MenuStyle | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const active = options.find((item) => String(item.value) === String(value));
  const contentWidth = useMemo(() => {
    const textWidth = Math.max(...options.map((item) => item.label.length * 9 + 54), 0);
    return Math.min(Math.max(textWidth, 104), 340);
  }, [options]);

  useEffect(() => {
    if (!open) return;

    const syncMenu = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const estimatedHeight = Math.min(maxMenuHeight, options.length * 40 + 8);
      const width = Math.min(Math.max(rect.width, contentWidth), Math.min(340, window.innerWidth - 16));
      const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const openUp = below < 160 && above > below;
      const availableHeight = Math.max(120, openUp ? above - 6 : below - 6);
      setMenuStyle({
        left,
        top: openUp ? Math.max(8, rect.top - Math.min(estimatedHeight, availableHeight) - 6) : rect.bottom + 6,
        width,
        maxHeight: Math.min(maxMenuHeight, availableHeight)
      });
    };

    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    syncMenu();
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", syncMenu);
    window.addEventListener("scroll", syncMenu, true);
    window.addEventListener("keydown", closeOnEsc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", syncMenu);
      window.removeEventListener("scroll", syncMenu, true);
      window.removeEventListener("keydown", closeOnEsc);
    };
  }, [contentWidth, maxMenuHeight, open, options.length]);

  return (
    <div className={`app-select ${className}`.trim()} ref={rootRef} style={{ minWidth: contentWidth }}>
      <button
        className={`app-select-trigger ${triggerClassName} ${open ? "open" : ""}`.trim()}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((next) => !next)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{active?.label || placeholder}</span>
        <ChevronDown size={15} />
      </button>
      {open && menuStyle
        ? createPortal(
            <div
              className={`app-select-menu ${menuClassName}`.trim()}
              ref={menuRef}
              role="listbox"
              style={{
                position: "fixed",
                left: menuStyle.left,
                top: menuStyle.top,
                width: menuStyle.width,
                maxHeight: menuStyle.maxHeight
              }}
            >
              {options.map((item) => (
                <button
                  className={String(item.value) === String(value) ? "selected" : ""}
                  type="button"
                  key={String(item.value)}
                  role="option"
                  aria-selected={String(item.value) === String(value)}
                  onClick={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Check size={15} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
