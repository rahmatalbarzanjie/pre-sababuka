import { CornerDownLeft, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface PaletteItem {
  id: string;
  label: string;
  group: string;
  hint?: string;
  run(): void;
}

/** Palet perintah: Ctrl/Cmd+K membuka pencarian cepat menu dan tindakan. */
export function CommandPalette({ items, onClose }: { items: PaletteItem[]; onClose(): void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const returnFocus = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const words = q.split(/\s+/);
    return items.filter((item) => {
      const hay = `${item.label} ${item.group} ${item.hint ?? ""}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [items, query]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => () => { (returnFocus.current as HTMLElement | null)?.focus?.(); }, []);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => results.length ? (value + 1) % results.length : 0); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => results.length ? (value - 1 + results.length) % results.length : 0); }
    else if (event.key === "Enter") { event.preventDefault(); choose(results[active]); }
    else if (event.key === "Tab") event.preventDefault();
  };

  let lastGroup = "";
  return <div className="palette-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="palette" role="dialog" aria-modal="true" aria-label="Pencarian cepat" onKeyDown={onKeyDown}>
      <label className="palette-input"><Search aria-hidden />
        <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari menu atau tindakan…" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined} autoComplete="off" spellCheck={false} />
        <kbd>Esc</kbd>
      </label>
      <ul id="palette-list" role="listbox" ref={listRef} className="palette-list">
        {results.length === 0 && <li className="palette-empty" role="presentation">Tidak ada hasil untuk “{query}”.</li>}
        {results.map((item, index) => {
          const header = item.group !== lastGroup ? <li key={`g-${item.group}-${index}`} className="palette-group" role="presentation">{item.group}</li> : null;
          lastGroup = item.group;
          return <span key={item.id} style={{ display: "contents" }}>
            {header}
            <li id={`palette-${item.id}`} role="option" aria-selected={index === active} data-index={index} className={index === active ? "active" : ""} onMouseMove={() => setActive(index)} onClick={() => choose(item)}>
              <span>{item.label}</span>
              {item.hint && <small>{item.hint}</small>}
              {index === active && <CornerDownLeft aria-hidden />}
            </li>
          </span>;
        })}
      </ul>
      <footer className="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> pilih</span><span><kbd>Enter</kbd> buka</span><span><kbd>Esc</kbd> tutup</span></footer>
    </div>
  </div>;
}
