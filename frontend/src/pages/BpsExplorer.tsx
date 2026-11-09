import { Search, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api";
import { Notice, Spinner } from "../components";

interface BpsOption { val: string; label: string }
interface BpsVariable { id: string; title: string; subject: string | null; unit: string | null; description: string }
interface BpsSearch { total: number; pages: number; page: number; results: BpsVariable[] }
interface BpsRow { tahun: number; nilai: number | string | null; satuan: string | null; vervar: string; vervar_label: string; turvar: string; turvar_label: string; turtahun: string }
interface BpsDetail {
  variable: { id: string; title: string; unit: string | null; subject: string | null; note: string | null };
  vervar_label: string | null;
  vervars: BpsOption[];
  turvars: BpsOption[];
  turtahuns: BpsOption[];
  years: number[];
  row_count: number;
  suggested_vervar: string | null;
  suggested_vervar_reason: "single" | "kapuas" | null;
  rows: BpsRow[];
  mapping_suggestion: {
    source_code: string; external_dataset_id: string; resource_url: string; year_field: string; value_field: string;
    unit_field: string; geography_code: string; expected_unit: string | null;
    transform_json: { bps: { vervar: string | null; turvar: string | null; turtahun: string | null } };
  };
}

export interface BpsMappingSuggestion {
  source_code: string; external_dataset_id: string; resource_url: string; year_field: string; value_field: string;
  unit_field: string; geography_code: string; expected_unit: string; transform_json: Record<string, unknown>;
}

const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 });

/**
 * Penelusur BPS: cari variabel -> pilih kategori -> isi form mapping otomatis.
 * Hanya membaca metadata dan contoh nilai lewat backend; kunci API BPS tidak pernah sampai ke browser.
 */
export function BpsExplorer({ onApply }: { onApply(suggestion: BpsMappingSuggestion): void }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState<BpsSearch | null>(null);
  const [detail, setDetail] = useState<BpsDetail | null>(null);
  const [vervar, setVervar] = useState("");
  const [turvar, setTurvar] = useState("");
  const [applied, setApplied] = useState(false);

  const run = async (nextPage: number) => {
    setBusy(true); setError(""); setDetail(null); setApplied(false);
    try {
      setSearch(await api<BpsSearch>(`/connectors/bps/variables?q=${encodeURIComponent(query.trim())}&page=${nextPage}`));
      setPage(nextPage);
    } catch (cause) {
      setSearch(null);
      setError(cause instanceof Error ? cause.message : "Pencarian BPS gagal.");
    } finally { setBusy(false); }
  };

  const pick = async (item: BpsVariable) => {
    setDetailBusy(true); setError(""); setApplied(false);
    try {
      const loaded = await api<BpsDetail>(`/connectors/bps/variables/${encodeURIComponent(item.id)}`);
      setDetail(loaded);
      setVervar(loaded.suggested_vervar ?? "");
      setTurvar(loaded.mapping_suggestion.transform_json.bps.turvar ?? (loaded.turvars[0]?.val ?? ""));
    } catch (cause) {
      setDetail(null);
      setError(cause instanceof Error ? cause.message : "Detail variabel BPS gagal dimuat.");
    } finally { setDetailBusy(false); }
  };

  const rows = useMemo(() => (detail?.rows ?? []).filter((row) => (!vervar || row.vervar === vervar) && (!turvar || row.turvar === turvar)), [detail, vervar, turvar]);
  const duplicateYears = useMemo(() => {
    const counts = new Map<number, number>();
    for (const row of rows) counts.set(row.tahun, (counts.get(row.tahun) ?? 0) + 1);
    return [...counts].filter(([, count]) => count > 1).map(([year]) => year);
  }, [rows]);
  const needsVervar = (detail?.vervars.length ?? 0) > 1 && !vervar;
  const canApply = Boolean(detail) && !needsVervar && duplicateYears.length === 0;

  const apply = () => {
    if (!detail || !canApply) return;
    const base = detail.mapping_suggestion;
    onApply({
      source_code: base.source_code,
      external_dataset_id: base.external_dataset_id,
      resource_url: base.resource_url,
      year_field: base.year_field,
      value_field: base.value_field,
      unit_field: base.unit_field,
      geography_code: base.geography_code,
      expected_unit: base.expected_unit ?? "",
      transform_json: { bps: { vervar: vervar || null, turvar: turvar || null, turtahun: base.transform_json.bps.turtahun } },
    });
    setApplied(true);
    document.getElementById("mapping-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="panel connector-panel bps-explorer" aria-label="Penelusur variabel BPS">
      <header className="panel-heading">
        <div>
          <h2>Cari variabel BPS Kabupaten Kapuas</h2>
          <p>Cari kata kunci, pilih variabel dan kategorinya, lalu form mapping terisi otomatis. Data baru masuk setelah mapping disimpan dan disetujui.</p>
        </div>
        <Search />
      </header>
      <div className="toolbar connector-toolbar">
        <input aria-label="Kata kunci variabel BPS" value={query} placeholder="Contoh: pengangguran, IPM, kemiskinan" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && query.trim()) void run(1); }} />
        <button className="button secondary" disabled={busy || !query.trim()} onClick={() => void run(1)}><Search />{busy ? "Mencari…" : "Cari BPS"}</button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {busy && <Spinner />}
      {search && !busy && (
        search.results.length === 0
          ? <p className="bps-empty">Tidak ada variabel BPS yang cocok. Coba kata kunci yang lebih umum.</p>
          : <div className="bps-results">
            <p className="bps-count">{search.total} variabel ditemukan · halaman {search.page} dari {search.pages}</p>
            <ul>
              {search.results.map((item) => (
                <li key={item.id} className={detail?.variable.id === item.id ? "selected" : undefined}>
                  <span><strong>{item.title}</strong><small>{[item.subject, item.unit ? `satuan ${item.unit}` : null, `ID ${item.id}`].filter(Boolean).join(" · ")}</small></span>
                  <button className="button secondary compact" disabled={detailBusy} onClick={() => void pick(item)}>{detailBusy ? "Memuat…" : "Pilih"}</button>
                </li>
              ))}
            </ul>
            {search.pages > 1 && <div className="bps-pager">
              <button className="button secondary compact" disabled={busy || page <= 1} onClick={() => void run(page - 1)}>Sebelumnya</button>
              <button className="button secondary compact" disabled={busy || page >= search.pages} onClick={() => void run(page + 1)}>Berikutnya</button>
            </div>}
          </div>
      )}
      {detail && (
        <div className="bps-detail">
          <h3>{detail.variable.title}</h3>
          <p className="bps-count">{[detail.variable.subject, detail.variable.unit ? `satuan ${detail.variable.unit}` : null].filter(Boolean).join(" · ")}</p>
          {detail.years.length === 0
            ? <Notice tone="warning">BPS tidak memiliki nilai variabel ini untuk 2021-2029 (mungkin hanya tersedia untuk tahun yang lebih lama). Mapping tidak akan menghasilkan data 2024 dan seterusnya.</Notice>
            : <p className="bps-count">Tahun tersedia: <strong>{detail.years.join(", ")}</strong>{detail.years.every((year) => year < 2024) ? " — belum ada data 2024 atau lebih baru." : ""}</p>}
          {detail.vervars.length > 1 && (
            <label className="field">
              <span>{detail.vervar_label ?? "Kategori"}</span>
              <select data-field="vervar" value={vervar} onChange={(event) => { setVervar(event.target.value); setApplied(false); }}>
                <option value="">Pilih kategori</option>
                {detail.vervars.map((option) => <option key={option.val} value={option.val}>{option.label}</option>)}
              </select>
              <small>{detail.suggested_vervar_reason === "kapuas" ? "Baris Kabupaten Kapuas dipilih otomatis dari tabel tingkat provinsi." : "Pilih satu kategori agar tiap tahun hanya punya satu nilai."}</small>
            </label>
          )}
          {detail.turvars.length > 1 && (
            <label className="field">
              <span>Rincian tambahan</span>
              <select data-field="turvar" value={turvar} onChange={(event) => { setTurvar(event.target.value); setApplied(false); }}>
                {detail.turvars.map((option) => <option key={option.val} value={option.val}>{option.label}</option>)}
              </select>
            </label>
          )}
          {duplicateYears.length > 0 && <Notice tone="warning">Masih ada lebih dari satu nilai pada tahun {duplicateYears.join(", ")}. Pilih kategori atau rincian yang lebih spesifik.</Notice>}
          {rows.length > 0 && duplicateYears.length === 0 && (
            <div className="table-scroll">
              <table>
                <caption className="sr-only">Pratinjau nilai variabel BPS</caption>
                <thead><tr><th>Tahun</th><th>Nilai</th><th>Satuan</th></tr></thead>
                <tbody>{rows.map((row) => <tr key={`${row.tahun}-${row.vervar}-${row.turvar}`}><td>{row.tahun}</td><td>{typeof row.nilai === "number" ? number.format(row.nilai) : row.nilai ?? "-"}</td><td>{row.satuan ?? "-"}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <div className="panel-actions">
            <button className="button primary" disabled={!canApply} onClick={apply}><Wand2 />Isi form mapping otomatis</button>
            {applied && <span className="bps-applied" role="status">Form mapping terisi. Pilih indikator, lalu simpan sebagai kandidat.</span>}
          </div>
        </div>
      )}
    </section>
  );
}
