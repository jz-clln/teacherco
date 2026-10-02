// src/components/ui/select.tsx

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

const OTHER = "__other__";

export type SelectOption = string | { value: string; label: string };

type SelectProps = {
  name: string;
  label: string;
  options: SelectOption[];
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  /** Adds a first option with value "" (for filters, e.g. "All classes"). */
  emptyLabel?: string;
  /** Adds an "Other…" option that switches to a free-text input. */
  allowCustom?: boolean;
  customPlaceholder?: string;
  /** Shorter field for toolbars and filters. */
  compact?: boolean;
  /** Hide the visible label (it is still read by screen readers). */
  hideLabel?: boolean;
  /** Called with the new value whenever the selection changes. */
  onChange?: (value: string) => void;
  /** Make the selection controlled by the parent. */
  value?: string;
  disabled?: boolean;
  className?: string;
};

type Item = { value: string; label: string };

export function Select({
  name,
  label,
  options,
  placeholder = "Select…",
  defaultValue = "",
  required,
  emptyLabel,
  allowCustom,
  customPlaceholder = "Type here",
  compact,
  hideLabel,
  onChange,
  value: controlled,
  disabled,
  className,
}: SelectProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [inner, setValue] = useState(defaultValue);
  const value = controlled ?? inner;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [custom, setCustom] = useState(false);

  const items: Item[] = [
    ...(emptyLabel ? [{ value: "", label: emptyLabel }] : []),
    ...options.map((o) => (typeof o === "string" ? { value: o, label: o } : o)),
    ...(allowCustom ? [{ value: OTHER, label: "Other…" }] : []),
  ];
  const selected = items.find((i) => i.value === value && i.value !== OTHER);

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  function openList() {
    if (items.length === 0 || disabled) return;
    const i = items.findIndex((it) => it.value === value);
    setActive(i >= 0 ? i : 0);
    setOpen(true);
  }

  function choose(item: Item) {
    if (item.value === OTHER) {
      setCustom(true);
      setValue("");
    } else {
      setValue(item.value);
      onChange?.(item.value);
    }
    setOpen(false);
    trigger.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openList();
        else setActive((a) => Math.min(a + 1, items.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openList();
        else setActive((a) => Math.max(a - 1, 0));
        break;
      case "Home":
        if (open) { e.preventDefault(); setActive(0); }
        break;
      case "End":
        if (open) { e.preventDefault(); setActive(items.length - 1); }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (open) choose(items[active]);
        else openList();
        break;
      case "Escape":
        if (open) { e.preventDefault(); setOpen(false); }
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        // Type a letter to jump to the next option starting with it.
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const key = e.key.toLowerCase();
          const start = open ? active + 1 : 0;
          for (let n = 0; n < items.length; n++) {
            const i = (start + n) % items.length;
            if (items[i].label.toLowerCase().startsWith(key)) {
              if (!open) setOpen(true);
              setActive(i);
              break;
            }
          }
        }
    }
  }

  const fieldClass = cn(
    "w-full rounded-xl border border-[#E3E5E1] bg-white px-3 text-left outline-none transition focus:border-[#4F6F52]",
    compact ? "py-2.5 text-sm" : "py-3",
  );

  return (
    <div className={cn("block", className)}>
      <span id={`${id}-label`} className={hideLabel ? "sr-only" : "text-sm font-medium"}>
        {label}
      </span>

      {custom ? (
        <div className={cn("relative", !hideLabel && "mt-1.5")}>
          <input
            name={name}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              onChange?.(e.target.value);
            }}
            placeholder={customPlaceholder}
            required={required}
            autoFocus
            autoComplete="off"
            aria-labelledby={`${id}-label`}
            className={cn(fieldClass, "pr-11")}
          />
          <button
            type="button"
            aria-label="Back to the list"
            onClick={() => {
              setCustom(false);
              setValue("");
            }}
            className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#606861] hover:bg-[#EAF0EA]"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div ref={root} className={cn("relative", !hideLabel && "mt-1.5")}>
          <button
            ref={trigger}
            type="button"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-labelledby={`${id}-label`}
            aria-activedescendant={open ? `${id}-${active}` : undefined}
            onClick={() => (open ? setOpen(false) : openList())}
            disabled={disabled}
            onKeyDown={onKeyDown}
            className={cn(
              fieldClass,
              "flex items-center justify-between gap-2",
              open && "border-[#4F6F52]",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <span className={cn("truncate", !selected && "text-[#8B928C]")}>{selected?.label ?? placeholder}</span>
            <ChevronDown
              size={18}
              className={cn("shrink-0 text-[#606861] transition-transform", open && "rotate-180")}
            />
          </button>

          {/* Carries the value in the form and powers the browser's "required" check. */}
          <input
            name={name}
            value={value}
            onChange={() => {}}
            required={required}
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />

          {open ? (
            <ul
              id={`${id}-list`}
              role="listbox"
              aria-labelledby={`${id}-label`}
              className="teacherco-card absolute z-20 mt-1.5 max-h-60 min-w-full w-max max-w-[90vw] sm:max-w-md overflow-auto rounded-xl p-1"
            >
              {items.map((item, i) => (
                <li
                  key={item.value || "__empty__"}
                  id={`${id}-${i}`}
                  role="option"
                  aria-selected={item.value === value}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(item)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm",
                    i === active && "bg-[#EAF0EA]",
                    item.value === value && "font-semibold text-[#1A4D2E]",
                  )}
                >
                  <span className="truncate">{item.label}</span>
                  {item.value === value ? <Check size={16} className="shrink-0 text-[#1A4D2E]" /> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}