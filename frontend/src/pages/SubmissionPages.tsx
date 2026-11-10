import { BadgeCheck, BookCheck, CheckCircle2, ClipboardList, Download, FileCheck2, Plus, Save, Send, Trash2, Undo2, Upload } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, apiPath, jsonBody } from "../api";
import { useAuth } from "../auth";
import { Badge, capaianStatusLabel, EmptyState, ErrorState, formatDate, formatDateOnly, formatTanggal, Modal, Notice, PageSizeControl, Pagination, SortableHeader, Spinner, useAsync, type SortDirection, type StatusViewpoint } from "../components";
import { navigate } from "../router";
import type { Organization, PageResponse, Period, StatisticalGuidanceNote, Submission, SubmissionEvidence, SubmissionObservation } from "../types";

function formatIndicatorValue(value: string | number | null | undefined, dataType: string, unit?: string | null) {
  if (value === null || value === undefined || value === "") return "-";
  const suffix = unit ? ` ${unit}` : "";
  if (!["text", "boolean"].includes(dataType)) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(numericValue)}${suffix}`;
    }
  }
  return `${String(value)}${suffix}`;
}

interface AvailablePeriod extends Period { indicator_count: number; submission_id: string | null; submission_status: Submission["status"] | null }
const frequencyLabel = (value: string) => ({ annual: "Tahunan", semester: "Semesteran", quarter: "Triwulanan", monthly: "Bulanan", weekly: "Mingguan", custom: "Insidental" }[value] ?? value);

export function SubmissionsPage({ review = false, guidance = false }: { review?: boolean; guidance?: boolean }) {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState(() => new URLSearchParams(window.location.search).get("status") ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("id"));
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortOrder, setSortOrder] = useState<SortDirection>("desc");
  const writableOrganizationIds = (user?.roles ?? []).filter((role) => role.scope_type === "organization" && role.organization_id).map((role) => role.organization_id!);
  const ownOrganizationId = writableOrganizationIds[0] ?? "";
  const url = `/submissions?page=${page}&page_size=${pageSize}&sort_by=${sortBy}&sort_order=${sortOrder}${status ? `&status=${status}` : ""}${!review && !guidance && ownOrganizationId ? `&organization_id=${ownOrganizationId}` : ""}`;
  const submissions = useAsync(() => api<PageResponse<Submission>>(url), [url]);
  const changeSort = (column: string, direction: SortDirection) => { setSortBy(column); setSortOrder(direction); setPage(1); };
  const refs = useAsync(async () => {
    const organizations = await api<PageResponse<Organization>>("/organizations?page_size=100&active=true&sort_by=name&sort_order=asc");
    return { organizations: organizations.data };
  }, []);
  const canCreate = !review && !guidance && writableOrganizationIds.length > 0 && (user?.permissions.includes("submission.create") ?? false);
  const statusViewpoint: StatusViewpoint = review ? "bapperida" : guidance ? "pembina_statistik" : "opd";

  return <>
    {review && <section className="review-guidance"><span><ClipboardList /></span><div><strong>Antrean pemeriksaan BAPPERIDA</strong><p>Buka capaian, periksa nilai dan dokumen pendukung, lalu pilih setujui atau kembalikan dengan catatan yang spesifik.</p></div></section>}
    {guidance && <section className="review-guidance statistical-guidance-banner"><span><BookCheck /></span><div><strong>Ruang Pembina Data Statistik BPS</strong><p>Telaah standar, metadata, metodologi, dan konsistensi. Rekomendasi tidak mengubah nilai atau status pelaporan; perbaikan tetap dilakukan PIC instansi pemilik.</p></div></section>}
    <div className="toolbar data-toolbar">
      <div className="status-filter" role="group" aria-label="Filter status capaian">
        {[
          ["", review ? "Semua" : "Semua"],
          ...(review ? [["submitted", "Perlu Anda periksa"], ["under_review", "Sedang Anda periksa"], ["returned", "Dikembalikan ke OPD"], ["approved", "Disetujui"]] : guidance ? [["submitted", "Menunggu pemeriksaan BAPPERIDA"], ["under_review", "Sedang diperiksa BAPPERIDA"], ["returned", "Perlu ditinjau kembali"], ["approved", "Disetujui"]] : [["draft", "Perlu Anda lengkapi"], ["returned", "Perlu Anda perbaiki"], ["submitted", "Menunggu pemeriksaan BAPPERIDA"], ["approved", "Disetujui"]]),
        ].map(([value, label]) => <button key={value} className={status === value ? "active" : ""} onClick={() => { setStatus(value); setPage(1); }}>{label}</button>)}
      </div>
      <PageSizeControl value={pageSize} onChange={(size) => { setPageSize(size); setPage(1); }} />
      {canCreate && <button className="button primary" onClick={() => setCreateOpen(true)}><Plus />Mulai pelaporan</button>}
    </div>
    <Notice tone="success">Setiap formulir hanya memuat indikator aktif yang frekuensinya sesuai periode-tahunan, semesteran, triwulanan, bulanan, mingguan, atau insidental.</Notice>
    <section className="panel table-panel governance-table">
      {submissions.loading ? <div className="panel-loading"><Spinner /></div>
        : submissions.error ? <ErrorState title={review ? "Antrean verifikasi belum dapat dimuat" : guidance ? "Daftar pembinaan belum dapat dimuat" : "Pelaporan realisasi belum dapat dimuat"} onRetry={submissions.reload}>{submissions.error}</ErrorState>
        : !submissions.data?.data.length ? <EmptyState title={`Tidak ada capaian berstatus ${status ? capaianStatusLabel(status, statusViewpoint) : "pada daftar ini"}`}>{status ? "Pilih status lain untuk melihat pekerjaan yang sudah atau belum diproses." : review ? "Pengiriman OPD akan tampil setelah diajukan." : guidance ? "Pelaporan instansi akan tampil untuk pembinaan setelah tersedia." : "Mulai pelaporan berdasarkan instansi dan periode."}</EmptyState>
        : <><div className="table-scroll submission-desktop-table"><table><thead><tr><SortableHeader label="OPD" column="organization" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Periode" column="period" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Kelengkapan" column="row_count" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Diperbarui" column="updated_at" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Status" column="status" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /></tr></thead><tbody>
          {submissions.data.data.map((item) => <tr key={item.id} className="clickable-row" tabIndex={0} aria-label={`Buka capaian ${item.organization_name}`} onClick={() => setSelectedId(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(item.id); } }}>
            <td><div className="identity-cell"><span className="table-icon"><ClipboardList /></span><span><strong>{item.organization_name}</strong><small>{item.organization_code}</small></span></div></td>
            <td><strong>{item.period_label ?? "-"}</strong><small className="table-subtitle">{frequencyLabel(item.period_type)}</small></td><td>{item.row_count}/{item.indicator_count ?? 0} indikator</td>
            <td>{formatDate(item.updated_at)}</td>
            <td><Badge tone={item.status === "approved" ? "success" : item.status === "returned" ? "warning" : "neutral"}>{capaianStatusLabel(item.status, statusViewpoint)}</Badge></td>
          </tr>)}
        </tbody></table></div><div className="submission-mobile-list">{submissions.data.data.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)}><header><span><strong>{item.organization_name}</strong><small>{item.organization_code}</small></span><Badge tone={item.status === "approved" ? "success" : item.status === "returned" ? "warning" : "neutral"}>{capaianStatusLabel(item.status, statusViewpoint)}</Badge></header><dl><div><dt>Periode</dt><dd>{item.period_label ?? "-"} · {frequencyLabel(item.period_type)}</dd></div><div><dt>Kelengkapan</dt><dd>{item.row_count}/{item.indicator_count ?? 0} indikator</dd></div><div><dt>Diperbarui</dt><dd>{formatDate(item.updated_at)}</dd></div></dl><span className="mobile-card-action">{review ? "Periksa capaian" : guidance ? "Telaah statistik" : ["draft", "returned"].includes(item.status) ? "Lanjutkan pengisian" : "Lihat rincian"}</span></button>)}</div></>}
      {submissions.data && <Pagination page={submissions.data.meta.page} pageSize={submissions.data.meta.page_size} totalItems={submissions.data.meta.total_items} totalPages={submissions.data.meta.total_pages} sortLabel={`${({ updated_at: "Diperbarui", organization: "OPD", period: "Periode", row_count: "Jumlah indikator", status: "Status" } as Record<string, string>)[sortBy] ?? "Diperbarui"} ${sortBy === "updated_at" ? (sortOrder === "desc" ? "terbaru" : "terlama") : (sortOrder === "desc" ? "menurun" : "menaik")}`} onChange={setPage} showPageSize={false} />}
    </section>
    {createOpen && refs.data && <CreateSubmission organizations={refs.data.organizations.filter((organization) => writableOrganizationIds.includes(organization.id))} preferredOrganizationId={ownOrganizationId} onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); submissions.reload(); setSelectedId(id); }} />}
    {selectedId && <SubmissionDetailModal id={selectedId} review={review} guidance={guidance} statusViewpoint={statusViewpoint} permissions={user?.permissions ?? []} writableOrganizationIds={writableOrganizationIds} onClose={() => setSelectedId(null)} onChanged={() => submissions.reload()} />}
  </>;
}

function CreateSubmission({ organizations, preferredOrganizationId, onClose, onCreated }: {
  organizations: Organization[]; preferredOrganizationId?: string;
  onClose(): void; onCreated(id: string): void;
}) {
  const [organizationId, setOrganizationId] = useState(preferredOrganizationId ?? organizations[0]?.id ?? "");
  const available = useAsync(() => organizationId ? api<{ data: AvailablePeriod[] }>(`/submissions/available-periods?organization_id=${organizationId}`) : Promise.resolve({ data: [] }), [organizationId]);
  const frequencies = useMemo(() => [...new Set((available.data?.data ?? []).map((item) => item.period_type))], [available.data]);
  const [periodType, setPeriodType] = useState("");
  const periods = useMemo(() => (available.data?.data ?? []).filter((item) => !periodType || item.period_type === periodType), [available.data,periodType]);
  const [periodId, setPeriodId] = useState("");
  useEffect(() => { const nextType = frequencies.includes(periodType) ? periodType : frequencies[0] ?? ""; if (nextType !== periodType) setPeriodType(nextType); }, [frequencies,periodType]);
  useEffect(() => { if (!periods.some((item) => item.id === periodId)) setPeriodId(periods[0]?.id ?? ""); }, [periods,periodId]);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api<Submission>("/submissions", { method: "POST", mutation: true, body: jsonBody({ organization_id: organizationId, period_id: periodId }) });
      onCreated(result.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Form gagal dibuat."); }
    finally { setBusy(false); }
  };
  const selectedOrganization = organizations.find((item) => item.id === organizationId);
  const selectedPeriod = periods.find((item) => item.id === periodId);
  return <Modal title="Mulai pelaporan capaian" onClose={onClose}>
    {error && <Notice tone="error">{error}</Notice>}
    <form className="form-stack" onSubmit={submit}>
      <label className="field"><span>OPD pelapor</span><select data-field="organization_id" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} required>{organizations.map((item) => <option key={item.id} value={item.id}>{item.short_name ?? item.name}</option>)}</select></label>
      {available.loading ? <Spinner /> : available.error ? <Notice tone="error">{available.error}</Notice> : !available.data?.data.length ? <Notice tone="warning">Belum ada indikator aktif yang memiliki frekuensi pelaporan untuk OPD ini.</Notice> : <><label className="field"><span>Frekuensi indikator</span><select data-field="period_type" value={periodType} onChange={(e) => setPeriodType(e.target.value)} required>{frequencies.map((item) => <option key={item} value={item}>{frequencyLabel(item)}</option>)}</select></label><label className="field"><span>Periode</span><select data-field="period_id" value={periodId} onChange={(e) => setPeriodId(e.target.value)} required>{periods.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.indicator_count} indikator{item.submission_id ? ` · ${capaianStatusLabel(item.submission_status ?? "draft", "opd")}` : ""}</option>)}</select></label>
      <Notice tone={selectedPeriod?.submission_id ? "warning" : "success"}><strong>{selectedOrganization?.short_name ?? selectedOrganization?.name}</strong>&nbsp;memiliki <strong>{selectedPeriod?.indicator_count ?? 0} indikator {frequencyLabel(periodType).toLowerCase()}</strong> untuk {selectedPeriod?.label}. {selectedPeriod?.submission_id ? "Form periode ini sudah tersedia; buka dari daftar untuk melanjutkan." : "Sistem akan membuat satu form dan mencegah duplikasi periode."}</Notice></>}
      <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Batal</button><button className="button primary" disabled={busy || !selectedPeriod || Boolean(selectedPeriod.submission_id)}>{busy ? "Menyiapkan…" : "Lanjutkan ke pengisian"}</button></footer>
    </form>
  </Modal>;
}

function SubmissionDetailModal({ id, review, guidance, statusViewpoint, permissions, writableOrganizationIds, onClose, onChanged }: { id: string; review: boolean; guidance: boolean; statusViewpoint: StatusViewpoint; permissions: string[]; writableOrganizationIds: string[]; onClose(): void; onChanged(): void }) {
  const detail = useAsync(() => api<Submission>(`/submissions/${id}`), [id]);
  const evidence = useAsync(() => api<{ data: SubmissionEvidence[] }>(`/submissions/${id}/evidence`), [id]);
  const guidanceNotes = useAsync(() => api<{ data: StatisticalGuidanceNote[] }>(`/submissions/${id}/guidance`), [id]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState("");
  const [guidanceType, setGuidanceType] = useState<StatisticalGuidanceNote["guidance_type"]>("methodology");
  const [guidanceIndicatorId, setGuidanceIndicatorId] = useState("");
  const [guidanceText, setGuidanceText] = useState("");
  const [checks, setChecks] = useState({ values: false, evidence: false });
  const [affected, setAffected] = useState<Set<string>>(new Set());
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const currentValue = (item: SubmissionObservation) => values[item.indicator_version_id] ?? String(item.numeric_value ?? item.text_value ?? "");
  const ownsSubmission = detail.data ? writableOrganizationIds.includes(detail.data.organization_id) : false;
  const editable = detail.data ? !review && !guidance && ownsSubmission && ["draft", "returned"].includes(detail.data.status) && permissions.includes("submission.update") : false;

  const addGuidance = async () => {
    if (!guidanceText.trim()) return;
    setBusy(true); setError("");
    try {
      await api(`/submissions/${id}/guidance`, { method: "POST", mutation: true, body: jsonBody({ indicator_version_id: guidanceIndicatorId || null, guidance_type: guidanceType, notes: guidanceText.trim() }) });
      setGuidanceText(""); setGuidanceIndicatorId(""); guidanceNotes.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Rekomendasi gagal disimpan."); }
    finally { setBusy(false); }
  };

  const resolveGuidance = async (guidanceId: string) => {
    setBusy(true); setError("");
    try { await api(`/submissions/${id}/guidance/${guidanceId}/resolve`, { method: "POST", mutation: true, body: jsonBody({ notes: "Telah ditindaklanjuti oleh PIC instansi." }) }); guidanceNotes.reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Tindak lanjut gagal disimpan."); }
    finally { setBusy(false); }
  };

  const persist = async (item: SubmissionObservation) => {
    const raw = currentValue(item); const value = ["text", "boolean"].includes(item.data_type) ? raw : Number(raw);
    await api(`/submissions/${id}/observations/${item.indicator_version_id}`, { method: "PUT", mutation: true, body: jsonBody({ value, notes: notes[item.indicator_version_id] ?? item.notes ?? null }) });
  };
  const save = async (item: SubmissionObservation) => {
    setBusy(true); setError("");
    try { await persist(item); setSavedAt(formatTanggal(new Date(), "waktu")); detail.reload(); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Capaian gagal disimpan."); }
    finally { setBusy(false); }
  };
  const saveAll = async () => {
    if (!detail.data) return;
    setBusy(true); setError("");
    try {
      const filled = detail.data.observations.filter((item) => currentValue(item).trim());
      await Promise.all(filled.map(persist));
      setSavedAt(formatTanggal(new Date(), "waktu")); detail.reload(); onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Sebagian perubahan belum dapat disimpan."); }
    finally { setBusy(false); }
  };
  const upload = async (file: File, indicatorVersionId: string) => {
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.append("file", file);
      await api(`/submissions/${id}/evidence?indicator_version_id=${indicatorVersionId}`, { method: "POST", mutation: true, body: form });
      evidence.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Bukti dukung gagal diunggah."); }
    finally { setBusy(false); }
  };
  const removeEvidence = async (evidenceId: string) => {
    setBusy(true); setError("");
    try { await api(`/submissions/${id}/evidence/${evidenceId}`, { method: "DELETE", mutation: true }); evidence.reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Bukti dukung gagal dihapus."); }
    finally { setBusy(false); }
  };
  const act = async (action: "submit" | "start-review" | "return" | "approve", actionNotes: string | null = null) => {
    setBusy(true); setError("");
    try { const structuredNotes = action === "return" && affected.size ? `Indikator yang perlu diperbaiki: ${detail.data?.observations.filter((item) => affected.has(item.indicator_version_id)).map((item) => item.indicator_name).join(", ")}\n\n${actionNotes ?? ""}` : actionNotes; await api(`/submissions/${id}/actions/${action}`, { method: "POST", mutation: true, body: jsonBody({ notes: structuredNotes }) }); detail.reload(); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Status gagal diubah."); }
    finally { setBusy(false); }
  };
  const action = (detail.data?.status === "draft" || detail.data?.status === "returned") && ownsSubmission
    ? (permissions.includes("submission.submit") ? "submit" : null)
    : review && detail.data?.status === "submitted" && permissions.includes("submission.review") ? "start-review"
    : review && detail.data?.status === "under_review" && permissions.includes("submission.approve") ? "approve" : null;

  const staleTarget = detail.error?.message.toLowerCase().includes("tidak ditemukan") ?? false;
  return <Modal title="Rincian capaian indikator" onClose={onClose} wide>
    {detail.loading ? <div className="panel-loading"><Spinner /></div> : detail.error ? staleTarget ? <div className="form-stack"><Notice tone="warning">Data capaian ini sudah direset atau tidak tersedia. Daftar yang tampil sekarang berisi data terbaru.</Notice><button className="button secondary" onClick={() => { onClose(); navigate(review ? "/reviews" : "/submissions"); }}>Kembali ke daftar capaian</button></div> : <Notice tone="error">{detail.error}</Notice> : detail.data && <div className="submission-detail">
      {error && <Notice tone="error">{error}</Notice>}
      <div className="detail-grid"><div><span>OPD</span><strong>{detail.data.organization_name}</strong></div><div><span>Periode</span><strong>{detail.data.period_label} · {frequencyLabel(detail.data.period_type)}</strong></div><div><span>Status capaian</span><strong>{capaianStatusLabel(detail.data.status, statusViewpoint)}</strong></div><div><span>Kelengkapan</span><strong>{detail.data.row_count}/{detail.data.observations.length} indikator</strong></div></div>
      <div className="workflow-steps" aria-label="Tahapan pelaporan"><span className={["submitted", "under_review", "approved"].includes(detail.data.status) ? "done" : "active"}>1<strong>Diisi OPD</strong></span><span className={detail.data.status === "under_review" ? "active" : detail.data.status === "approved" ? "done" : ""}>2<strong>Diperiksa BAPPERIDA</strong></span><span className={detail.data.status === "approved" ? "done" : ""}>3<strong>Disetujui</strong></span></div>
      {detail.data.status === "returned" && <Notice tone="warning">Catatan peninjau: {detail.data.review_notes ?? "Silakan periksa kembali data dan bukti dukung."}</Notice>}
      {!detail.data.observations.length ? <EmptyState title="Belum ada indikator pada pelaporan ini">Hubungi BAPPERIDA jika indikator yang menjadi tanggung jawab OPD belum muncul.</EmptyState>
        : <><div className="realization-progress"><div><strong>{detail.data.observations.filter((item) => currentValue(item).trim()).length} dari {detail.data.observations.length} indikator terisi</strong><small>{savedAt ? `Perubahan terakhir disimpan pukul ${savedAt}` : "Isi nilai kemudian simpan semua perubahan sebelum dikirim."}</small></div>{editable && <button className="button primary" disabled={busy || !detail.data.observations.some((item) => currentValue(item).trim())} onClick={() => void saveAll()}><Save />Simpan semua perubahan</button>}</div><div className="realization-list">{detail.data.observations.map((item) => <section key={item.indicator_version_id} className="realization-card">
          <header><div><strong>{item.indicator_name}</strong><small>{item.indicator_code} - target {formatIndicatorValue(item.target_numeric_value ?? item.target_text_value, item.data_type, item.unit_symbol)}</small></div>{item.observation_id && <Badge tone="success">Sudah diisi</Badge>}</header>
          {editable ? <div className="form-grid"><label className="field"><span>Realisasi <small>({item.unit_symbol || "sesuai definisi"})</small></span><input type={["text", "boolean"].includes(item.data_type) ? "text" : "number"} step="any" value={currentValue(item)} onChange={(event) => setValues((current) => ({ ...current, [item.indicator_version_id]: event.target.value }))} /></label><label className="field"><span>Catatan realisasi <small>(opsional)</small></span><input value={notes[item.indicator_version_id] ?? item.notes ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.indicator_version_id]: event.target.value }))} placeholder="Jelaskan sumber, metode, atau penyebab deviasi" /></label></div>
            : <div className="realization-readonly"><div><span>Realisasi</span><strong>{formatIndicatorValue(item.numeric_value ?? item.text_value, item.data_type, item.unit_symbol)}</strong></div><div><span>Catatan</span><strong>{item.notes?.trim() || "-"}</strong></div></div>}
          {editable && <div className="realization-actions"><button className="button secondary compact" disabled={busy || !currentValue(item)} onClick={() => save(item)}><Save />Simpan indikator</button><label className="button secondary compact upload-button"><Upload />Bukti dukung<input type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, item.indicator_version_id); event.target.value = ""; }} /></label></div>}
          {editable && numericDeviation(item, currentValue(item)) && <Notice tone="warning">Nilai berbeda lebih dari 50% terhadap target. Periksa kembali satuan dan angka, lalu jelaskan penyebabnya pada catatan jika memang benar.</Notice>}
        </section>)}</div></>}
      <section className="evidence-panel"><h3><FileCheck2 />Dokumen pendukung internal</h3><p>Lampirkan sumber perhitungan, rekap, atau dokumen pengesahan bila tersedia. PDF, JPG, PNG, atau XLSX; maksimum 10 MB. Dokumen hanya dapat dilihat instansi terkait serta petugas pemeriksaan dan pembinaan yang berwenang.</p>
        {evidence.loading ? <Spinner /> : !evidence.data?.data.length ? <small>Belum ada bukti dukung.</small> : <div className="evidence-list">{evidence.data.data.map((item) => <div key={item.id}><span><strong>{item.original_filename}</strong><small>{item.indicator_code ?? "Umum"} - {(Number(item.byte_size) / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 })} KB</small></span><span><a className="icon-button" aria-label="Unduh bukti" href={apiPath(`/submissions/${id}/evidence/${item.id}/download`)}><Download /></a>{editable && <button className="icon-button danger-text" aria-label="Hapus bukti" onClick={() => removeEvidence(item.id)}><Trash2 /></button>}</span></div>)}</div>}
      </section>
      <section className="evidence-panel statistical-guidance-panel"><h3><BookCheck />Rekomendasi Pembina Data Statistik</h3><p>Catatan BPS bersifat pembinaan. Nilai tidak berubah otomatis dan status pelaporan tetap diputuskan melalui alur daerah.</p>
        {guidanceNotes.loading ? <Spinner /> : guidanceNotes.error ? <Notice tone="error">{guidanceNotes.error.message}</Notice> : !guidanceNotes.data?.data.length ? <small>Belum ada rekomendasi statistik.</small> : <div className="guidance-note-list">{guidanceNotes.data.data.map((item) => <article key={item.id} className={item.resolved_at ? "resolved" : ""}><header><span><Badge tone={item.resolved_at ? "success" : "warning"}>{item.resolved_at ? "Ditindaklanjuti" : "Perlu ditinjau"}</Badge><strong>{({ standard: "Standar data", metadata: "Metadata", methodology: "Metodologi", consistency: "Konsistensi" } as const)[item.guidance_type]}</strong></span><small>{formatDateOnly(item.created_at)} - {item.created_by_name}</small></header>{item.indicator_name && <small>Indikator: {item.indicator_name}</small>}<p>{item.notes}</p>{item.resolution_notes && <small>Tindak lanjut: {item.resolution_notes}</small>}{ownsSubmission && !item.resolved_at && <button className="button secondary compact" disabled={busy} onClick={() => void resolveGuidance(item.id)}><CheckCircle2 />Tandai sudah ditindaklanjuti</button>}</article>)}</div>}
        {guidance && permissions.includes("statistical_guidance.comment") && <div className="guidance-form"><div className="form-grid"><label className="field"><span>Jenis pembinaan</span><select data-field="guidance_type" value={guidanceType} onChange={(event) => setGuidanceType(event.target.value as StatisticalGuidanceNote["guidance_type"])}><option value="standard">Standar data</option><option value="metadata">Metadata</option><option value="methodology">Metodologi</option><option value="consistency">Konsistensi</option></select></label><label className="field"><span>Indikator <small>(opsional)</small></span><select data-field="indicator_version_id" value={guidanceIndicatorId} onChange={(event) => setGuidanceIndicatorId(event.target.value)}><option value="">Seluruh pelaporan</option>{detail.data.observations.map((item) => <option key={item.indicator_version_id} value={item.indicator_version_id}>{item.indicator_name}</option>)}</select></label></div><label className="field"><span>Rekomendasi perbaikan</span><textarea rows={4} data-field="notes" value={guidanceText} onChange={(event) => setGuidanceText(event.target.value)} placeholder="Jelaskan standar atau metode yang perlu diperbaiki. Jangan mengubah nilai atas nama produsen data." /></label><button className="button primary" disabled={busy || guidanceText.trim().length < 3} onClick={() => void addGuidance()}><BookCheck />Simpan rekomendasi</button></div>}
      </section>
      {review && detail.data.status === "under_review" && <section className="review-decision-panel"><header><span><CheckCircle2 /></span><div><h3>Keputusan pemeriksaan</h3><p>Gunakan checklist singkat ini agar keputusan mudah dipahami OPD dan dapat dipertanggungjawabkan.</p></div></header><label className="review-check"><input type="checkbox" checked={checks.values} onChange={(event) => setChecks((current) => ({ ...current, values: event.target.checked }))} /><span><strong>Nilai dan satuan sudah diperiksa</strong><small>Angka sesuai periode, target, dan konteks indikator.</small></span></label><label className="review-check"><input type="checkbox" checked={checks.evidence} onChange={(event) => setChecks((current) => ({ ...current, evidence: event.target.checked }))} /><span><strong>Sumber dan dokumen pendukung sudah diperiksa</strong><small>Catatan atau bukti cukup untuk menjelaskan asal data.</small></span></label><fieldset className="affected-indicators"><legend>Indikator yang perlu diperbaiki <small>(pilih untuk pengembalian)</small></legend>{detail.data.observations.map((item) => <label key={item.indicator_version_id}><input type="checkbox" checked={affected.has(item.indicator_version_id)} onChange={(event) => setAffected((current) => { const next = new Set(current); if (event.target.checked) next.add(item.indicator_version_id); else next.delete(item.indicator_version_id); return next; })} /><span>{item.indicator_name}</span></label>)}</fieldset><label className="field"><span>Catatan keputusan</span><textarea rows={4} data-field="notes" value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} placeholder="Jelaskan nilai, sumber, dokumen, atau bagian yang perlu diperbaiki." /></label><footer><button className="button secondary" disabled={busy || !reviewNotes.trim() || !affected.size} onClick={() => void act("return", reviewNotes.trim())}><Undo2 />Kembalikan indikator terpilih</button><button className="button primary" disabled={busy || !checks.values || !checks.evidence} onClick={() => void act("approve", reviewNotes.trim() || null)}><BadgeCheck />Setujui capaian</button></footer></section>}
      <footer className="detail-actions">
        {action && action !== "approve" && <button className="button primary" disabled={busy || (action === "submit" && !detail.data.row_count)} onClick={() => void act(action)}>{action === "submit" ? <Send /> : <ClipboardList />}{action === "submit" ? "Kirim ke BAPPERIDA" : "Mulai pemeriksaan"}</button>}
      </footer>
    </div>}
  </Modal>;
}

function numericDeviation(item: SubmissionObservation, raw: string) {
  const value = Number(raw); const target = Number(item.target_numeric_value);
  return raw.trim() !== "" && Number.isFinite(value) && Number.isFinite(target) && target !== 0 && Math.abs(value - target) / Math.abs(target) > .5;
}
