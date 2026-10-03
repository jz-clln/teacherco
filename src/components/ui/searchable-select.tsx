// src/components/ui/searchable-select.tsx

"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { filterOptions } from "@/lib/search-options";
import { cn } from "@/lib/utils";

export type SearchableOption = { value: string; label: string };

type Props = {
  /** Name of the form field that receives the chosen value. */
  name: string;
  label: string;
  options: SearchableOption[];
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Shown when nothing matches what was typed. */
  emptyText?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  className?: string;
};

/**
 * A dropdown with a search box, for long lists such as the learners in a class.
 * Works inside a normal <form>: the chosen value is submitted under `name`.
 * Keyboard: type to search, Up/Down to move, Enter to choose, Esc to close.
 */
export function SearchableSelect({
  name,
  label,
  options,
  required,
  disabled,
  placeholder = "Choose…",
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  defaultValue = "",
  onChange,
  className,
}: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => filterOptions(options, query), [options, query]);
  const isDisabled = disabled || options.length === 0;

  // Start typing right away when the list opens.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Close when tapping or clicking anywhere else.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the highlighted row visible while moving with the arrow keys.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, filtered]);

  function openList() {
    if (isDisabled) return;
    setQuery("");
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  }

  function close(refocus: boolean) {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  }

  function choose(option: SearchableOption) {
    setValue(option.value);
    onChange?.(option.value);
    close(true);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      // Enter must choose a learner, never submit the form.
      event.preventDefault();
      const option = filtered[active];
      if (option) choose(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      openList();
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-[#313832]">
        {label}
      </label>

      <div className="relative mt-1.5">
        <button
          id={id}
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={isDisabled}
          onClick={() => (open ? close(false) : openList())}
          onKeyDown={onTriggerKeyDown}
          className={cn(
            "flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-left text-sm outline-none transition",
            "border-[#D9DCD8] focus-visible:border-[#4F6F52] focus-visible:ring-4 focus-visible:ring-[#4F6F52]/10",
            "disabled:cursor-not-allowed disabled:bg-[#F5F6F4] disabled:text-[#8B928C]",
            open && "border-[#4F6F52] ring-4 ring-[#4F6F52]/10",
          )}
        >
          <span className={cn("truncate", !selected && "text-[#8B928C]")}>{selected ? selected.label : placeholder}</span>
          <ChevronDown size={18} className={cn("shrink-0 text-[#606861] transition-transform", open && "rotate-180")} />
        </button>

        {/* Carries the value into the form, and lets the browser say "please choose" when it is required. */}
        <input
          name={name}
          value={value}
          required={required}
          onChange={() => {}}
          tabIndex={-1}
          aria-hidden="true"
          autoComplete="off"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
        />

        {open ? (
          <div className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-xl border border-[#E3E5E1] bg-white shadow-lg">
            <div className="flex items-center gap-2 border-b border-[#E3E5E1] px-3">
              <Search size={16} className="shrink-0 text-[#8B928C]" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-controls={listId}
                aria-activedescendant={filtered[active] ? `${id}-option-${active}` : undefined}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                // 16px on phones stops iOS from zooming the page when the box is focused.
                className="h-12 w-full bg-transparent text-base outline-none placeholder:text-[#A0A6A1] sm:text-sm"
              />
            </div>

            {filtered.length === 0 ? (
              <p aria-live="polite" className="px-4 py-6 text-center text-sm text-[#606861]">
                {emptyText}
              </p>
            ) : (
              <ul ref={listRef} id={listId} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto p-1.5">
                {filtered.map((option, index) => {
                  const isSelected = option.value === value;
                  return (
                    <li
                      key={option.value}
                      id={`${id}-option-${index}`}
                      role="option"
                      aria-selected={isSelected}
                      data-active={index === active}
                      onClick={() => choose(option)}
                      onMouseMove={() => setActive(index)}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm",
                        index === active && "bg-[#EAF0EA]",
                        isSelected && "font-semibold text-[#1A4D2E]",
                      )}
                    >
                      <span className="truncate">{option.label}</span>
                      {isSelected ? <Check size={16} className="shrink-0 text-[#1A4D2E]" /> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}