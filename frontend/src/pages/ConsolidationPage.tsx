import { CheckCircle2, GitCompare } from "lucide-react";
import { useState } from "react";
import { api, jsonBody } from "../api";
import { useAuth } from "../auth";
import { Badge, EmptyState, ErrorState, formatTanggal, Notice, Spinner, useAsync } from "../components";

interface SourceRow {
  id: string; numeric_value: string | number | null; text_value: string | null; source_name: string | null; source_url: string | null;
  source_status: string | null; source_retrieved_at: string | null; created_at: string; notes: string | null;
  submission_method: string; organization_name: string;
}
interface Conflict {
  slot_id: string; status: "open" | "resolved"; chosen_observation_id: string | null; decision_note: string | null;
  decided_at: string | null; decided_by_name: string | null; indicator_code: string; indicator_name: string; period_label: string;
  geography_name: string | null; unit: string; unit_symbol: string | null; owner_organization_name: string | null; observations: SourceRow[];
}
interface ConflictList { open_count: number; resolved_count: number; data: Conflict[] }

const methodLabel = (method: string) => method === "api_import" ? "Impor sumber eksternal" : method === "manual" ? "Input manual" : method === "file_upload" ? "Unggah berkas" : method;
const valueText = (row: SourceRow, symbol: string | null) => {
  const raw = row.numeric_value ?? row.text_value;
  if (raw === null) return "-";
  const shown = typeof raw === "string" && !Number.isNaN(Number(raw)) && row.numeric_value !== null ? new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(Number(raw)) : String(raw);
  return symbol ? `${shown} ${symbol}` : shown;
};

function ConflictCard({ conflict, canResolve, onDecided }: { conflict: Conflict; canResolve: boolean; onDecided(): void }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const decide = conflict.status === "open" || editing;
  const submit = async () => {
    if (!choice) return;
    setBusy(true); setError("");
    try {
      await api("/consolidation/decisions", { method: "POST", mutation: true, body: jsonBody({ chosen_observation_id: choice, note: note.trim() }) });
      onDecided();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Keputusan gagal disimpan.");
    } finally { setBusy(false); }
  };
  const labelId = `konflik-${conflict.slot_id}`;
  return (
    <article className="panel consolidation-card" aria-labelledby={labelId}>
      <header className="panel-heading">
        <div>
          <h2 id={labelId}>{conflict.indicator_name}</h2>
          <p>{[conflict.indicator_code, conflict.period_label, conflict.geography_name, conflict.owner_organization_name].filter(Boolean).join(" · ")}</p>
        </div>
        {conflict.status === "open" ? <Badge tone="warning">Menunggu keputusan</Badge> : <Badge tone="success">Sudah diputuskan</Badge>}
      </header>
      <div className="table-scroll">
        <table>
          <caption className="sr-only">Nilai {conflict.indicator_name} dari tiap sumber</caption>
          <thead><tr><th>Sumber</th><th>Nilai</th><th>Cara masuk</th><th>Diambil</th>{(decide && canResolve) || conflict.status === "resolved" ? <th>Status</th> : null}</tr></thead>
          <tbody>
            {conflict.observations.map((row) => {
              const chosen = conflict.chosen_observation_id === row.id;
              const selected = choice === row.id;
              return (
                <tr key={row.id} className={chosen && !editing ? "consolidation-chosen" : selected ? "consolidation-selected" : undefined}>
                  <td data-label="Sumber">
                    <strong>{row.source_name ?? "Sumber belum dicatat"}</strong>
                    <small>{row.organization_name}{row.source_url ? <> · <a href={row.source_url} target="_blank" rel="noreferrer">tautan sumber</a></> : null}</small>
                  </td>
                  <td data-label="Nilai"><strong>{valueText(row, conflict.unit_symbol ?? conflict.unit)}</strong></td>
                  <td data-label="Cara masuk">{methodLabel(row.submission_method)}</td>
                  <td data-label="Diambil">{formatTanggal(row.source_retrieved_at ?? row.created_at, "tanggal-waktu")}</td>
                  {(decide && canResolve) ? (
                    <td data-label="Status"><button type="button" className={selected ? "button primary compact" : "button secondary compact"} aria-pressed={selected} onClick={() => setChoice(row.id)}>{selected ? "Dipilih" : "Pilih sebagai valid"}</button></td>
                  ) : conflict.status === "resolved" ? (
                    <td data-label="Status">{chosen ? <Badge tone="success">Nilai valid</Badge> : <Badge>Tidak dipilih</Badge>}</td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {conflict.status === "resolved" && !editing && (
        <div className="consolidation-decision">
          <p><CheckCircle2 aria-hidden /> Ditetapkan oleh <strong>{conflict.decided_by_name ?? "pengguna"}</strong>{conflict.decided_at ? ` pada ${formatTanggal(conflict.decided_at, "tanggal-waktu")}` : ""}.</p>
          {conflict.decision_note && <blockquote>{conflict.decision_note}</blockquote>}
          <small>Nilai lain tetap tersimpan bersama sumbernya, tetapi tidak dapat dikurasi ke dashboard pimpinan.</small>
          {canResolve && <button type="button" className="button secondary compact" onClick={() => { setEditing(true); setChoice(conflict.chosen_observation_id); }}>Ubah keputusan</button>}
        </div>
      )}
      {decide && canResolve && (
        <div className="consolidation-form">
          <label className="field">
            <span>Alasan penetapan (wajib)</span>
            <textarea rows={3} data-field="note" value={note} minLength={10} maxLength={2000} placeholder="Contoh: sesuai rilis resmi BPS terbaru setelah dikonfirmasi ke OPD pemilik data." onChange={(event) => setNote(event.target.value)} />
            <small>Minimal 10 karakter. Catatan ini masuk jejak audit.</small>
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="panel-actions">
            <button type="button" className="button primary" disabled={busy || !choice || note.trim().length < 10} onClick={() => void submit()}>{busy ? "Menyimpan…" : "Tetapkan nilai valid"}</button>
            {editing && <button type="button" className="button secondary" onClick={() => { setEditing(false); setChoice(null); setNote(""); }}>Batal</button>}
          </div>
        </div>
      )}
      {decide && !canResolve && <Notice tone="info">Anda dapat melihat konflik ini, tetapi penetapan nilai valid dilakukan oleh BAPPERIDA atau OPD pemilik indikator.</Notice>}
    </article>
  );
}

export function ConsolidationPage() {
  const { user } = useAuth();
  const canResolve = user?.permissions.includes("consolidation.resolve") ?? false;
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const list = useAsync(() => api<ConflictList>(`/consolidation/conflicts?status=${tab}`), [tab]);
  const data = list.data;
  return (
    <div className="page-stack consolidation-page">
      <section className="panel consolidation-summary" aria-live="polite">
        <div>
          <h2><GitCompare aria-hidden /> {data ? (data.open_count > 0 ? `${data.open_count} nilai menunggu keputusan` : "Semua nilai antarsumber konsisten") : "Konsolidasi sumber"}</h2>
          <p>Jika dua sumber melaporkan nilai berbeda untuk indikator, periode, dan wilayah yang sama, sistem tidak memilih sendiri. Kedua nilai ditampilkan bersama sumbernya; BAPPERIDA atau OPD pemilik indikator menetapkan yang valid. Nilai yang sama dari sumber berbeda bukan konflik dan tetap tampil sebagai baris bersumber.</p>
          <p>Capaian yang masih berkonflik ditahan dari kurasi publikasi, sehingga dashboard pimpinan hanya memuat nilai yang sudah tervalidasi.</p>
        </div>
      </section>
      <div className="toolbar" role="tablist" aria-label="Status konflik">
        <button role="tab" aria-selected={tab === "open"} className={tab === "open" ? "button primary" : "button secondary"} onClick={() => setTab("open")}>Menunggu keputusan{data ? ` (${data.open_count})` : ""}</button>
        <button role="tab" aria-selected={tab === "resolved"} className={tab === "resolved" ? "button primary" : "button secondary"} onClick={() => setTab("resolved")}>Riwayat keputusan{data ? ` (${data.resolved_count})` : ""}</button>
      </div>
      {list.loading && <Spinner />}
      {list.error && <ErrorState onRetry={list.reload}>{list.error}</ErrorState>}
      {data && data.data.length === 0 && !list.loading && (
        <EmptyState title={tab === "open" ? "Tidak ada konflik yang perlu diputuskan" : "Belum ada keputusan"}>
          {tab === "open" ? "Setiap kali sumber baru melaporkan nilai yang berbeda, konfliknya muncul di sini." : "Keputusan nilai valid yang sudah ditetapkan akan tercatat di sini."}
        </EmptyState>
      )}
      {data?.data.map((conflict) => <ConflictCard key={`${conflict.slot_id}-${conflict.status}-${conflict.decided_at ?? ""}`} conflict={conflict} canResolve={canResolve} onDecided={list.reload} />)}
    </div>
  );
}
