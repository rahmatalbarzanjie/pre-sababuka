import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Info, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { SababukaMark } from "./branding/SababukaBrand";
import { formatTanggal } from "./utils/date";

export { formatTanggal } from "./utils/date";
export { capaianStatusLabel, statusLabel } from "./utils/status-label";
export type { StatusViewpoint } from "./utils/status-label";

export function Spinner({ label = "Memuat" }: { label?: string }) {
  return <span className="spinner" role="status" aria-live="polite"><LoaderCircle size={17} aria-hidden /> {label}</span>;
}

export function LoadingScreen() {
  return <div className="loading-screen" role="status" aria-live="polite" aria-busy="true">
    <SababukaMark className="loading-brand-mark" label="SABABUKA sedang menyiapkan ruang kerja" />
    <h1 className="loading-brand-label">Menyiapkan ruang kerja</h1>
  </div>;
}

export function PageLoading({ label = "Memuat data" }: { label?: string }) {
  return <div className="page-state page-state-loading" role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}</span>
    <div className="state-skeleton-heading" aria-hidden><span /><span /></div>
    <div className="state-skeleton-row" aria-hidden><span /><span /><span /></div>
    <div className="state-skeleton-row" aria-hidden><span /><span /><span /></div>
    <div className="state-skeleton-row" aria-hidden><span /><span /><span /></div>
  </div>;
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="page-state empty-state" role="status"><Inbox className="page-state-icon" aria-hidden /><h3>{title}</h3><p>{children}</p>{action && <div className="page-state-actions">{action}</div>}</div>;
}

export function ErrorState({ title = "Data belum dapat dimuat", children, onRetry }: { title?: string; children: ReactNode | Error; onRetry?(): void }) {
  return <div className="page-state error-state" role="alert">
    <AlertTriangle className="page-state-icon" aria-hidden />
    <h3>{title}</h3>
    <p>{children instanceof Error ? children.message : children}</p>
    {onRetry && <div className="page-state-actions"><button type="button" className="button secondary" onClick={onRetry}><RefreshCw aria-hidden />Coba lagi</button></div>}
  </div>;
}

export function Badge({ tone = "neutral", children }: { tone?: "success" | "warning" | "danger" | "info" | "neutral"; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function ContextHelp({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const helpId = useId();
  useEffect(() => {
    const closeFromPointer = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeFromKeyboard = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const closeFromScroll = () => setOpen(false);
    document.addEventListener("mousedown", closeFromPointer);
    document.addEventListener("keydown", closeFromKeyboard);
    window.addEventListener("scroll", closeFromScroll, true);
    return () => {
      document.removeEventListener("mousedown", closeFromPointer);
      document.removeEventListener("keydown", closeFromKeyboard);
      window.removeEventListener("scroll", closeFromScroll, true);
    };
  }, []);
  useEffect(() => {
    if (!open || !rootRef.current || !popoverRef.current) return;
    const anchor = rootRef.current.getBoundingClientRect();
    const popover = popoverRef.current.getBoundingClientRect();
    const left = Math.min(Math.max(anchor.left + (anchor.width / 2) - (popover.width / 2), 12), window.innerWidth - popover.width - 12);
    const top = anchor.bottom + popover.height + 12 > window.innerHeight ? anchor.top - popover.height - 8 : anchor.bottom + 8;
    popoverRef.current.style.left = `${left}px`;
    popoverRef.current.style.top = `${Math.max(12, top)}px`;
  }, [open]);
  return <span className="context-help" ref={rootRef}>
    <button type="button" aria-label={`Penjelasan ${label}`} aria-expanded={open} aria-describedby={open ? helpId : undefined} onClick={() => setOpen((value) => !value)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={(event) => { if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false); }}><Info aria-hidden /></button>
    {open && <span ref={popoverRef} id={helpId} role="tooltip" className="context-help-popover"><strong>{label}</strong><span>{children}</span></span>}
  </span>;
}

export type SortDirection = "asc" | "desc";

export function SortableHeader({ label, column, sortBy, direction, onSort, className }: {
  label: string; column: string; sortBy: string; direction: SortDirection;
  onSort(column: string, direction: SortDirection): void; className?: string;
}) {
  const active = sortBy === column;
  const nextDirection: SortDirection = active && direction === "asc" ? "desc" : "asc";
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return <th scope="col" className={className} aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
    <button type="button" className={`sortable-header${active ? " active" : ""}`} onClick={() => onSort(column, nextDirection)} title={`Urutkan ${label} ${nextDirection === "asc" ? "menaik" : "menurun"}`}>
      <span>{label}</span><Icon aria-hidden />
    </button>
  </th>;
}

export function Modal({ title, onClose, children, wide = false, className = "" }: { title: string; onClose(): void; children: ReactNode; wide?: boolean; className?: string }) {
  const modalRef = useRef<HTMLElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section ref={modalRef} tabIndex={-1} className={`modal ${wide ? "wide" : ""} ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><div><h2 id={titleId}>{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Tutup dialog"><X size={20} aria-hidden /></button></header>
      <div className="modal-content">{children}</div>
    </section>
  </div>;
}

export function Notice({ tone, children }: { tone: "error" | "success" | "warning" | "info"; children: ReactNode | Error }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"} aria-live="polite"><Icon size={18} aria-hidden /><div>{children instanceof Error ? children.message : children}</div></div>;
}

export function PageSizeControl({ value, onChange }: { value: number; onChange(pageSize: number): void }) {
  return <label className="page-size page-size-top"><span>Baris per halaman</span><select aria-label="Jumlah baris per halaman" value={value} onChange={(event) => onChange(Number(event.target.value))}>{[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>;
}

export function Pagination({ page, totalPages, totalItems, pageSize, sortLabel, onChange, onPageSizeChange, showPageSize = true }: {
  page: number;
  totalPages: number;
  totalItems?: number;
  pageSize?: number;
  sortLabel?: string;
  onChange(page: number): void;
  onPageSizeChange?(pageSize: number): void;
  showPageSize?: boolean;
}) {
  if (totalPages <= 1 && totalItems === undefined) return null;
  const safePageSize = pageSize ?? Math.max(totalItems ?? 0, 1);
  const firstItem = totalItems ? ((page - 1) * safePageSize) + 1 : 0;
  const lastItem = totalItems ? Math.min(page * safePageSize, totalItems) : 0;
  return <div className="pagination">
    {totalItems !== undefined && <span className="pagination-summary"><span>Menampilkan <strong>{firstItem}-{lastItem}</strong> dari <strong>{totalItems}</strong> data</span>{sortLabel ? <span className="pagination-sort"> · Urutan: <strong>{sortLabel}</strong></span> : null}</span>}
    {showPageSize && onPageSizeChange && <PageSizeControl value={safePageSize} onChange={onPageSizeChange} />}
    <div className="pagination-nav"><button className="button secondary pagination-button" aria-label="Halaman sebelumnya" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={16} /><span>Sebelumnya</span></button>
      <span className="pagination-page-label">{`Halaman ${page} dari ${Math.max(totalPages, 1)}`}</span>
      <button className="button secondary pagination-button" aria-label="Halaman berikutnya" disabled={page >= totalPages} onClick={() => onChange(page + 1)}><span>Berikutnya</span><ChevronRight size={16} /></button></div>
  </div>;
}

/** @deprecated Gunakan formatTanggal(value, "tanggal-waktu"). */
export function formatDate(value: string | null | undefined): string {
  return formatTanggal(value, "tanggal-waktu");
}

/** @deprecated Gunakan formatTanggal(value). */
export function formatDateOnly(value: string | null | undefined): string {
  return formatTanggal(value);
}

export function formatCategoryCode(value: string | null | undefined): string {
  const match = value?.match(/^RPJMD_(\d+)_(\d+)$/u);
  return match ? `Fokus ${match[1]} · Kelompok isu ${match[2]}` : value ?? "-";
}

export function riskLabel(value: string | null | undefined): string {
  const labels: Record<string, string> = { low: "Rendah", medium: "Sedang", high: "Tinggi", critical: "Kritis" };
  return value ? labels[value.toLowerCase()] ?? value : "-";
}

export function useAsync<T>(loader: () => Promise<T>, dependencies: readonly unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loader().then((value) => { if (active) setData(value); }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason : new Error(String(reason)));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, revision]);
  return { data, error, loading, reload: () => setRevision((value) => value + 1), setData };
}
