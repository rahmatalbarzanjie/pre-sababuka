import { AlertTriangle, CheckCircle2, FolderTree, ListChecks, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, jsonBody } from "../api";
import { markInvalidFields } from "../fieldErrors";
import { useAuth } from "../auth";
import { ReferenceDataPanel } from "./ReferenceDataPanel";
import { Badge, EmptyState, ErrorState, formatCategoryCode, formatDate, Modal, Notice, PageSizeControl, Pagination, SortableHeader, Spinner, statusLabel, useAsync, type SortDirection } from "../components";
import type { BulkTransitionResult, Category, Indicator, Organization, PageResponse, Period, PolicyFocus, Unit } from "../types";

const categorySortLabels: Record<string, string> = {
  hierarchy: "Urutan kelompok isu", name: "Nama kelompok isu", focus: "Fokus pembangunan",
  count: "Jumlah indikator", status: "Status", updated_at: "Terakhir diperbarui",
};
const indicatorSortLabels: Record<string, string> = {
  hierarchy: "Urutan indikator", name: "Nama indikator", focus: "Fokus pembangunan",
  owner: "OPD penanggung jawab", metadata: "Kesiapan metadata", targets: "Jumlah target",
  status: "Tahap", updated_at: "Terakhir diperbarui",
};

export function CategoriesPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortOrder, setSortOrder] = useState<SortDirection>("desc");
  const categories = useAsync(() => api<PageResponse<Category>>(`/categories?page=${page}&page_size=${pageSize}&sort_by=${sortBy}&sort_order=${sortOrder}${query ? `&q=${encodeURIComponent(query)}` : ""}`), [page, pageSize, query, sortBy, sortOrder]);
  const changeSort = (column: string, direction: SortDirection) => { setSortBy(column); setSortOrder(direction); setPage(1); };
  const focuses = useAsync(() => api<PageResponse<PolicyFocus>>("/policy-focuses?page_size=100"), []);
  const canManage = user?.permissions.includes("category.manage") ?? false;
  const canSubmit = user?.permissions.includes("category.submit") ?? false;
  const canApprove = user?.permissions.includes("category.approve") ?? false;
  const categoryActionable = (category: Category) => (category.review_status === "draft" && canSubmit)
    || (category.review_status === "in_review" && canApprove && category.submitted_by !== user?.id);
  const selectedCategories = (categories.data?.data ?? []).filter((item) => selectedIds.includes(item.id));
  const selectedDraftCount = selectedCategories.filter((item) => item.review_status === "draft").length;
  const selectedReviewCount = selectedCategories.filter((item) => item.review_status === "in_review" && item.submitted_by !== user?.id).length;
  const bulkTransition = async (action: "submit" | "approve") => {
    setBulkBusy(true); setActionError(""); setBulkMessage("");
    try {
      const result = await api<BulkTransitionResult>(`/categories/bulk-actions/${action}`, { method: "POST", mutation: true, body: jsonBody({ ids: selectedIds }) });
      setBulkMessage(`${result.processed.length} kelompok isu berhasil diproses${result.skipped.length ? `, ${result.skipped.length} dilewati karena belum memenuhi aturan.` : "."}`);
      setSelectedIds([]); categories.reload();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Aksi massal gagal diproses."); }
    finally { setBulkBusy(false); }
  };
  const submitAllDrafts = async () => {
    setBulkBusy(true); setActionError(""); setBulkMessage("");
    try {
      const result = await api<BulkTransitionResult>("/categories/actions/submit-all", { method: "POST", mutation: true });
      setBulkMessage(result.processed.length
        ? `${result.processed.length} kelompok isu diajukan ke BAPPERIDA untuk diverifikasi${result.skipped.length ? `, ${result.skipped.length} dilewati.` : "."}`
        : "Tidak ada kelompok isu draf yang perlu diajukan.");
      setSelectedIds([]); categories.reload();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Seluruh isu gagal diajukan ke BAPPERIDA."); }
    finally { setBulkBusy(false); }
  };
  const transition = async (category: Category, action: "submit" | "approve" | "reject" | "reopen") => {
    setActionError("");
    setRowError((current) => ({ ...current, [category.id]: "" }));
    setBusyCategoryId(category.id);
    try {
      await api(`/categories/${category.id}/actions/${action}`, { method: "POST", mutation: true });
      categories.reload();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Status kelompok isu gagal diubah.";
      setActionError(message);
      setRowError((current) => ({ ...current, [category.id]: message }));
    } finally { setBusyCategoryId(null); }
  };

  return <>
    <div className="toolbar data-toolbar">
      <div className="table-filters"><form className="search-box" role="search" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(search); }}><Search aria-hidden /><input aria-label="Cari kelompok isu" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kelompok isu" /><button className="button secondary">Cari</button></form><PageSizeControl value={pageSize} onChange={(size) => { setPageSize(size); setPage(1); }} /></div>
      {canSubmit && <button className="button secondary" disabled={bulkBusy} onClick={() => void submitAllDrafts()}><ListChecks />Ajukan semua isu draf</button>}
      {canManage && <button className="button primary" onClick={() => setCreateOpen(true)}><Plus />Tambah kelompok isu</button>}
    </div>
    <Notice tone="warning">Setiap kelompok isu berada di bawah Fokus Pembangunan. Seluruh isu draf diajukan kepada BAPPERIDA untuk diverifikasi sebelum indikator di dalamnya dapat diproses.</Notice>
    {selectedIds.length > 0 && <div className="bulk-action-bar"><span><ListChecks /><strong>{selectedIds.length} kelompok isu dipilih</strong><small>{selectedDraftCount} draf dapat diajukan · {selectedReviewCount} menunggu keputusan</small></span><div>{canSubmit && selectedDraftCount > 0 && <button className="button secondary" disabled={bulkBusy} onClick={() => void bulkTransition("submit")}>Ajukan {selectedDraftCount} draf</button>}{canApprove && selectedReviewCount > 0 && <button className="button primary" disabled={bulkBusy} onClick={() => void bulkTransition("approve")}>Setujui {selectedReviewCount} yang menunggu</button>}<button className="button secondary" onClick={() => setSelectedIds([])}>Bersihkan pilihan</button></div></div>}
    {bulkMessage && <div className="governance-table"><Notice tone="success">{bulkMessage}</Notice></div>}
    {actionError && <div className="governance-table"><Notice tone="error">{actionError}</Notice></div>}
    <section className="panel table-panel governance-table">
      {categories.loading ? <div className="panel-loading"><Spinner /></div> : categories.error ? <ErrorState title="Kelompok isu belum dapat dimuat" onRetry={categories.reload}>{categories.error}</ErrorState> : !categories.data?.data.length ? <EmptyState title="Belum ada kelompok isu">Tambahkan kelompok isu sebagai pengelompokan indikator pembangunan.</EmptyState> : <div className="table-scroll"><table><thead><tr><th className="select-column"><input type="checkbox" aria-label="Pilih semua tugas kelompok isu pada halaman ini" disabled={!categories.data.data.some(categoryActionable)} checked={categories.data.data.some(categoryActionable) && categories.data.data.filter(categoryActionable).every((item) => selectedIds.includes(item.id))} onChange={(event) => setSelectedIds(event.target.checked ? categories.data!.data.filter(categoryActionable).map((item) => item.id) : [])} /></th><SortableHeader label="Kelompok Isu" column="name" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Fokus Pembangunan" column="focus" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Indikator" column="count" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Status" column="status" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Diperbarui" column="updated_at" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><th>Tindakan</th></tr></thead><tbody>
        {categories.data.data.map((category) => {
          const selfSubmitted = category.submitted_by === user?.id;
          const action = category.review_status === "draft" && canSubmit ? ["submit", "Ajukan ke BAPPERIDA"] as const
            : category.review_status === "in_review" && canApprove && !selfSubmitted ? ["approve", "Setujui"] as const
            : category.review_status === "rejected" && canSubmit ? ["reopen", "Perbaiki"] as const : null;
          return (
            <tr key={category.id}>
              <td className="select-column"><input type="checkbox" aria-label={categoryActionable(category) ? `Pilih ${category.name}` : `${category.name} belum menjadi tugas pada tahap ini`} disabled={!categoryActionable(category)} checked={selectedIds.includes(category.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, category.id] : current.filter((id) => id !== category.id))} /></td>
              <td><div className="identity-cell"><span className="table-icon"><FolderTree /></span><span><strong>{category.name}</strong><small>{formatCategoryCode(category.code)} · kode teknis {category.code}</small></span></div></td>
              <td>{category.policy_focus_name ?? "Belum dipetakan"}</td><td><strong>{category.indicator_count}</strong></td>
              <td><Badge tone={category.review_status === "approved" ? "success" : category.review_status === "rejected" ? "danger" : "warning"}>{statusLabel(category.review_status, canApprove && !selfSubmitted ? "bapperida" : "neutral")}</Badge></td><td>{formatDate(category.updated_at)}</td>
              <td>{action ? <><span className="table-actions"><button className="button secondary" disabled={busyCategoryId === category.id} onClick={() => void transition(category, action[0])}>{busyCategoryId === category.id ? "Memproses…" : action[1]}</button>{category.review_status === "in_review" && canApprove && !selfSubmitted && <button className="button secondary" disabled={busyCategoryId === category.id} onClick={() => void transition(category, "reject")}>Tolak</button>}</span>{rowError[category.id] && <small className="field-error">{rowError[category.id]}</small>}</> : selfSubmitted && category.review_status === "in_review" ? <small className="table-subtitle">Menunggu keputusan akun BAPPERIDA lain.</small> : "-"}</td>
            </tr>
          );
        })}
      </tbody></table></div>}
      {categories.data && <Pagination page={categories.data.meta.page} pageSize={categories.data.meta.page_size} totalItems={categories.data.meta.total_items} totalPages={categories.data.meta.total_pages} sortLabel={`${categorySortLabels[sortBy] ?? "Urutan kelompok isu"} ${sortBy === "updated_at" ? (sortOrder === "desc" ? "terbaru" : "terlama") : (sortOrder === "asc" ? "menaik" : "menurun")}`} onChange={setPage} showPageSize={false} />}
    </section>
    {createOpen && focuses.data && <CategoryForm focuses={focuses.data.data} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); categories.reload(); }} />}
  </>;
}

function CategoryForm({ focuses, onClose, onCreated }: { focuses: PolicyFocus[]; onClose(): void; onCreated(): void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [focusId, setFocusId] = useState(focuses[0]?.id ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api("/categories", { method: "POST", mutation: true, body: jsonBody({ code: code.toUpperCase(), name, description: description || null, policy_focus_id: focusId || null }) });
      onCreated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kelompok isu gagal disimpan."); }
    finally { setBusy(false); }
  };
  return <Modal title="Tambah Kelompok Isu" onClose={onClose}>{error && <Notice tone="error">{error}</Notice>}<form className="form-stack" onSubmit={submit}><div className="form-grid"><label className="field"><span>Kode</span><input value={code} onChange={(e) => setCode(e.target.value.replace(/\s+/gu, "_"))} required /></label><label className="field"><span>Fokus Pembangunan</span><select value={focusId} onChange={(e) => setFocusId(e.target.value)}><option value="">Pilih fokus pembangunan</option>{focuses.map((focus) => <option key={focus.id} value={focus.id}>{focus.name}</option>)}</select></label></div><label className="field"><span>Nama Kelompok Isu</span><input value={name} onChange={(e) => setName(e.target.value)} required /></label><label className="field"><span>Deskripsi</span><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label><footer className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Batal</button><button className="button primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan kelompok isu"}</button></footer></form></Modal>;
}

export function IndicatorsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => window.matchMedia("(max-width: 800px)").matches ? 10 : 20);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [status, setStatus] = useState(() => new URLSearchParams(window.location.search).get("status") ?? "");
  const [completeness, setCompleteness] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Indicator | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deepLinkId] = useState(() => new URLSearchParams(window.location.search).get("id"));
  const [editing, setEditing] = useState<Indicator | null>(null);
  const [technicalEditing, setTechnicalEditing] = useState<Indicator | null>(null);
  const [actionError, setActionError] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkConfirmAction, setBulkConfirmAction] = useState<"submit" | "approve" | "verify" | "activate" | null>(null);
  const [bulkMessage, setBulkMessage] = useState("");
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortOrder, setSortOrder] = useState<SortDirection>("desc");
  const url = `/indicators?page=${page}&page_size=${pageSize}&sort_by=${sortBy}&sort_order=${sortOrder}${query ? `&q=${encodeURIComponent(query)}` : ""}${focusId ? `&policy_focus_id=${focusId}` : ""}${categoryId ? `&category_id=${categoryId}` : ""}${organizationId ? `&organization_id=${organizationId}` : ""}${status ? `&status=${status}` : ""}${completeness ? `&completeness=${completeness}` : ""}`;
  const indicators = useAsync(() => api<PageResponse<Indicator>>(url), [url]);
  const changeSort = (column: string, direction: SortDirection) => { setSortBy(column); setSortOrder(direction); setPage(1); };
  const refs = useAsync(async () => {
    const [focuses, categories, units, periods, organizations] = await Promise.all([
      api<PageResponse<PolicyFocus>>("/policy-focuses?page_size=100"),
      api<PageResponse<Category>>("/categories?page_size=100&sort_by=name&sort_order=asc"), api<{ data: Unit[] }>("/units"),
      api<{ data: Period[] }>("/periods"), api<PageResponse<Organization>>("/organizations?page_size=100&active=true&sort_by=name&sort_order=asc"),
    ]);
    return { focuses: focuses.data, categories: categories.data, units: units.data, periods: periods.data, organizations: organizations.data };
  }, []);
  const canManage = user?.permissions.includes("indicator.manage") ?? false;
  const canPropose = user?.permissions.includes("indicator.propose") ?? false;
  const canSubmit = (user?.permissions.includes("indicator.submit") ?? false)
    && (user?.roles.some((role) => role.code === "superadmin" || role.code === "indicator_author") ?? false);
  useEffect(() => {
    if (deepLinkId && indicators.data?.data) {
      setSelected(indicators.data.data.find((item) => item.id === deepLinkId || item.version_id === deepLinkId) ?? null);
    }
  }, [deepLinkId, indicators.data]);
  const transition = async (indicator: Indicator, action: "submit" | "approve" | "verify" | "activate" | "retire") => {
    setActionBusyId(indicator.version_id); setActionError(""); setBulkMessage("");
    try {
      const endpoint = action === "submit" && indicator.origin_type === "opd_manual"
        ? `/opd-indicator-proposals/${indicator.version_id}/submit`
        : `/indicator-versions/${indicator.version_id}/actions/${action}`;
      await api(endpoint, { method: "POST", mutation: true });
      setBulkMessage(`${indicator.name} berhasil diproses ke tahap berikutnya.`);
      setSelected(null); indicators.reload();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Status indikator gagal diubah."); }
    finally { setActionBusyId(null); }
  };
  const bulkTransition = async (action: "submit" | "approve" | "verify" | "activate", ids: string[]) => {
    setBulkBusy(true); setActionError(""); setBulkMessage("");
    try {
      const result = await api<BulkTransitionResult>(`/indicator-versions/bulk-actions/${action}`, { method: "POST", mutation: true, body: jsonBody({ ids }) });
      const reason = result.skipped[0]?.reason;
      setBulkMessage(`${result.processed.length} indikator berhasil diproses${result.skipped.length ? `, ${result.skipped.length} dilewati${reason ? ` (${reason})` : ""}.` : "."}`);
      setSelectedIds((current) => current.filter((id) => !ids.includes(id))); setBulkConfirmAction(null); indicators.reload();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Aksi massal indikator gagal diproses."); }
    finally { setBulkBusy(false); }
  };
  const visible = indicators.data?.data ?? [];
  const completeCount = indicators.data?.meta.metadata_complete_count ?? 0;
  const activeCount = indicators.data?.meta.active_count ?? 0;
  const filteredCategories = refs.data?.categories.filter((category) => !focusId || category.policy_focus_id === focusId) ?? [];
  const canApprove = user?.permissions.includes("indicator.approve") ?? false;
  const canVerify = user?.permissions.includes("indicator.verify") ?? false;
  const canActivate = user?.permissions.includes("indicator.activate") ?? false;
  const organizationScopeIds = new Set([
    ...(user?.organizations.map((organization) => organization.id) ?? []),
    ...(user?.roles.flatMap((role) => role.organization_id ? [role.organization_id] : []) ?? []),
  ]);
  const canVerifyIndicator = (indicator: Indicator) => Boolean(
    canVerify && indicator.owner_organization_id && organizationScopeIds.has(indicator.owner_organization_id),
  );
  const indicatorStatusLabel = (indicator: Indicator) => statusLabel(
    indicator.status,
    indicator.status === "opd_verification" && canVerifyIndicator(indicator) ? "opd"
      : canApprove || canActivate ? "bapperida"
        : canPropose ? "opd" : "neutral",
  );
  const canManageOwnProposal = (indicator: Indicator) => Boolean(
    canPropose && indicator.origin_type === "opd_manual" && indicator.proposed_by_organization_id
      && organizationScopeIds.has(indicator.proposed_by_organization_id),
  );
  const canSubmitIndicator = (indicator: Indicator) => indicator.origin_type === "opd_manual" ? canManageOwnProposal(indicator) : canSubmit;
  const isActionable = (indicator: Indicator) =>
    (indicator.status === "draft" && indicator.origin_type === "rpjmd_master" && canSubmit && indicator.metadata_complete && indicator.category_review_status === "approved")
    || (indicator.status === "in_review" && canApprove)
    || (indicator.status === "opd_verification" && canVerifyIndicator(indicator))
    || (indicator.status === "approved" && canActivate);
  const actionableVisible = visible.filter(isActionable);
  const selectedIndicators = visible.filter((item) => selectedIds.includes(item.version_id));
  const bulkCandidates = (action: "submit" | "approve" | "verify" | "activate") => selectedIndicators.filter((indicator) =>
    action === "submit" ? indicator.status === "draft" && canSubmit && indicator.metadata_complete && indicator.category_review_status === "approved"
      : action === "approve" ? indicator.status === "in_review" && canApprove
        : action === "verify" ? indicator.status === "opd_verification" && canVerifyIndicator(indicator)
          : indicator.status === "approved" && canActivate,
  );
  const bulkConfirmation = bulkConfirmAction ? {
    submit: "Ajukan indikator draf lengkap kepada BAPPERIDA untuk pemeriksaan?",
    approve: "Setujui hasil pemeriksaan BAPPERIDA? Usulan manual OPD masuk tahap siap diaktifkan; master RPJMD diteruskan ke verifikasi teknis OPD.",
    verify: "Konfirmasi metadata teknis indikator atas nama OPD penanggung jawab?",
    activate: "Aktifkan indikator yang sudah melewati pemeriksaan dan verifikasi?",
  }[bulkConfirmAction] : "";
  const activeFilterCount = [query, focusId, categoryId, organizationId, status, completeness].filter(Boolean).length;
  const clearFilters = () => {
    setSearch(""); setQuery(""); setFocusId(""); setCategoryId(""); setOrganizationId(""); setStatus(""); setCompleteness(""); setPage(1);
  };

  return <>
    <section className="readiness-heading">
      <div><h1>Matriks Indikator</h1><p>Finalisasi indikator RPJMD dan selesaikan keputusan sesuai kewenangan Anda.</p></div>
      <div className="readiness-metrics"><span><strong>{indicators.data?.meta.total_items ?? 0}</strong><small>Indikator ditemukan</small></span><span><strong>{completeCount}</strong><small>Metadata lengkap</small></span><span><strong>{activeCount}</strong><small>Sudah aktif</small></span></div>
    </section>
    <div className={`toolbar data-toolbar indicator-toolbar readiness-filters${filtersOpen ? " filters-open" : ""}`}>
      <div className="readiness-filter-primary">
        <form className="search-box" role="search" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(search); }}><Search aria-hidden /><input aria-label="Cari indikator" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kode atau nama indikator" /><button className="button secondary">Cari</button></form>
        <select aria-label="Filter status indikator" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Semua status</option><option value="draft">Draf</option><option value="in_review">{canApprove ? "Perlu Anda periksa" : "Pemeriksaan BAPPERIDA"}</option><option value="opd_verification">{canVerify ? "Perlu Anda verifikasi" : "Menunggu verifikasi OPD"}</option><option value="approved">{canActivate ? "Perlu Anda aktifkan" : "Siap diaktifkan"}</option><option value="active">Aktif</option><option value="retired">Diarsipkan</option></select>
        <button type="button" className="button secondary advanced-filter-toggle" aria-expanded={filtersOpen} aria-controls="indicator-advanced-filters" onClick={() => setFiltersOpen((current) => !current)}>Filter lanjutan{activeFilterCount > Number(Boolean(query || status)) ? ` (${activeFilterCount - Number(Boolean(query || status))})` : ""}</button>
        {(canManage || canPropose) && <button className="button primary readiness-primary-action" onClick={() => setCreateOpen(true)}><Plus />{canPropose && !canManage ? "Usulkan indikator manual" : "Tambah indikator"}</button>}
      </div>
      {filtersOpen && <div className="readiness-filter-secondary" id="indicator-advanced-filters">
        <select aria-label="Filter fokus pembangunan" value={focusId} onChange={(event) => { setFocusId(event.target.value); setCategoryId(""); setPage(1); }}><option value="">Semua fokus pembangunan</option>{refs.data?.focuses.map((focus) => <option key={focus.id} value={focus.id}>{focus.name}</option>)}</select>
        <select aria-label="Filter kelompok isu" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }}><option value="">Semua kelompok isu</option>{filteredCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
        <select aria-label="Filter OPD penanggung jawab" value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); setPage(1); }}><option value="">Semua OPD</option>{refs.data?.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select>
        <select aria-label="Filter kelengkapan metadata" value={completeness} onChange={(event) => { setCompleteness(event.target.value); setPage(1); }}><option value="">Semua kelengkapan</option><option value="complete">Metadata lengkap</option><option value="incomplete">Perlu dilengkapi</option></select>
        <PageSizeControl value={pageSize} onChange={(size) => { setPageSize(size); setPage(1); }} />
        <button type="button" className="text-button" disabled={!activeFilterCount} onClick={clearFilters}>Bersihkan semua filter</button>
      </div>}
      <div className="mobile-sort-controls"><label><span>Urutkan</span><select aria-label="Urutkan indikator" value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPage(1); }}><option value="hierarchy">Urutan indikator</option><option value="name">Nama indikator</option><option value="focus">Fokus pembangunan</option><option value="owner">OPD penanggung jawab</option><option value="metadata">Kesiapan metadata</option><option value="targets">Jumlah target</option><option value="status">Tahap</option><option value="updated_at">Terakhir diperbarui</option></select></label><button type="button" className="button secondary" onClick={() => { setSortOrder((current) => current === "asc" ? "desc" : "asc"); setPage(1); }}>{sortOrder === "asc" ? "Menaik ↑" : "Menurun ↓"}</button><button type="button" className="text-button" disabled={!activeFilterCount} onClick={clearFilters}>Bersihkan filter</button></div>
    </div>
    <Notice tone="warning">{canPropose && !canManage ? "Indikator Renstra/Renja diusulkan satu per satu melalui formulir ini. Tidak tersedia impor dokumen atau pembuatan otomatis. BAPPERIDA memeriksa sebelum indikator dapat diaktifkan." : "Urutan kerja: penyusun mengajukan → BAPPERIDA memeriksa → OPD penanggung jawab memverifikasi → BAPPERIDA mengaktifkan. Aksi massal tetap mematuhi urutan dan pemisahan petugas ini."}</Notice>
      {selectedIds.length > 0 && <div className="bulk-action-bar"><span><ListChecks /><strong>{selectedIds.length} indikator dipilih</strong><small>{bulkConfirmAction ? bulkConfirmation : "Setiap keputusan hanya memproses indikator pada tahap yang sesuai."}</small></span><div>{bulkConfirmAction ? <><button className="button secondary" disabled={bulkBusy} onClick={() => setBulkConfirmAction(null)}>Kembali</button><button className="button primary" disabled={bulkBusy} onClick={() => void bulkTransition(bulkConfirmAction, bulkCandidates(bulkConfirmAction).map((item) => item.version_id))}>{bulkBusy ? "Memproses…" : `Lanjutkan (${bulkCandidates(bulkConfirmAction).length})`}</button></> : <>{bulkCandidates("submit").length > 0 && <button className="button secondary" onClick={() => setBulkConfirmAction("submit")}>Ajukan draf ({bulkCandidates("submit").length})</button>}{bulkCandidates("approve").length > 0 && <button className="button secondary" onClick={() => setBulkConfirmAction("approve")}>Setujui review ({bulkCandidates("approve").length})</button>}{bulkCandidates("verify").length > 0 && <button className="button secondary" onClick={() => setBulkConfirmAction("verify")}>Konfirmasi OPD ({bulkCandidates("verify").length})</button>}{bulkCandidates("activate").length > 0 && <button className="button primary" onClick={() => setBulkConfirmAction("activate")}>Aktifkan ({bulkCandidates("activate").length})</button>}<button className="button secondary" onClick={() => { setSelectedIds([]); setBulkConfirmAction(null); }}>Batal pilih</button></>}</div></div>}
    {bulkMessage && <div className="governance-table"><Notice tone="success">{bulkMessage}</Notice></div>}
    {actionError && <div className="governance-table"><Notice tone="error">{actionError}</Notice></div>}
    <section className="panel table-panel governance-table">
      {indicators.loading ? <IndicatorLoadingState /> : indicators.error ? <IndicatorErrorState message={indicators.error.message} onRetry={indicators.reload} /> : !indicators.data?.data.length ? <IndicatorEmptyState filtered={activeFilterCount > 0} onReset={clearFilters} canCreate={canManage || canPropose} onCreate={() => setCreateOpen(true)} /> : <>
        <div className="readiness-mobile-list">{visible.map((indicator) => <IndicatorReadinessCard key={indicator.id} indicator={indicator} statusText={indicatorStatusLabel(indicator)} actionable={isActionable(indicator)} checked={selectedIds.includes(indicator.version_id)} onToggle={(checked) => setSelectedIds((current) => checked ? [...current, indicator.version_id] : current.filter((id) => id !== indicator.version_id))} onOpen={() => setSelected(indicator)} />)}</div>
        <div className="table-scroll readiness-desktop-table"><table className="readiness-table"><thead><tr><th className="select-column"><input type="checkbox" aria-label="Pilih semua tugas yang dapat diproses pada halaman ini" disabled={!actionableVisible.length} checked={actionableVisible.length > 0 && actionableVisible.every((item) => selectedIds.includes(item.version_id))} onChange={(event) => setSelectedIds(event.target.checked ? actionableVisible.map((item) => item.version_id) : [])} /></th><SortableHeader label="Indikator" column="name" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Fokus & kelompok isu" column="focus" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="OPD penanggung jawab" column="owner" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Kesiapan metadata" column="metadata" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Target tahunan" column="targets" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Tahap" column="status" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Diperbarui" column="updated_at" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /></tr></thead><tbody>{visible.map((indicator) => { const missing = readinessMissing(indicator); const actionable = isActionable(indicator); return <tr key={indicator.id} className="clickable-row" tabIndex={0} aria-label={`Buka detail ${indicator.name}`} onClick={() => setSelected(indicator)} onKeyDown={(event) => { if (event.currentTarget !== event.target) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(indicator); } }}><td className="select-column"><input type="checkbox" aria-label={actionable ? `Pilih ${indicator.name}` : `${indicator.name} belum menjadi tugas pada tahap ini`} disabled={!actionable} checked={selectedIds.includes(indicator.version_id)} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, indicator.version_id] : current.filter((id) => id !== indicator.version_id))} /></td><td><div className="identity-cell"><span><strong>{indicator.name}</strong><small>{indicator.code} · {indicator.unit_symbol ?? indicator.unit_name}{indicator.origin_type === "opd_manual" ? " · Usulan manual OPD" : ""}</small></span></div></td><td><strong>{indicator.policy_focus_name ?? "Belum dipetakan"}</strong><small>{indicator.category_name}</small></td><td>{indicator.owner_organization_name ?? <span className="missing-text">Belum ditetapkan</span>}</td><td><span className={`readiness-state ${indicator.metadata_complete ? "complete" : "incomplete"}`}>{indicator.metadata_complete ? <CheckCircle2 /> : <AlertTriangle />}{indicator.metadata_complete ? "Lengkap" : `${missing.length} perlu dilengkapi`}</span>{missing.length > 0 && <small>{missing.join(", ")}</small>}</td><td><strong>{indicator.target_count}/5 tahun</strong><small>{indicator.has_rpjmd_targets ? "2025-2029 tersedia" : "Target belum lengkap"}</small></td><td><span className={`workflow-status status-${indicator.status}`}><Badge tone={indicator.status === "active" ? "success" : indicator.status === "in_review" ? "warning" : "neutral"}>{indicatorStatusLabel(indicator)}</Badge></span></td><td className="date-cell">{formatDate(indicator.updated_at)}</td></tr>; })}</tbody></table></div>
      </>}
      {indicators.data && <Pagination page={indicators.data.meta.page} pageSize={indicators.data.meta.page_size} totalItems={indicators.data.meta.total_items} totalPages={indicators.data.meta.total_pages} sortLabel={`${indicatorSortLabels[sortBy] ?? "Urutan indikator"} ${sortBy === "updated_at" ? (sortOrder === "desc" ? "terbaru" : "terlama") : (sortOrder === "asc" ? "menaik" : "menurun")}`} onChange={setPage} showPageSize={false} />}
    </section>
    {createOpen && refs.data && <IndicatorForm references={refs.data} manualProposal={canPropose && !canManage} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); indicators.reload(); }} />}
    {editing && refs.data && <IndicatorForm references={refs.data} initial={editing} manualProposal={editing.origin_type === "opd_manual"} onClose={() => setEditing(null)} onCreated={() => { setEditing(null); indicators.reload(); }} />}
    {selected && <IndicatorDetail indicator={selected} statusText={indicatorStatusLabel(selected)} permissions={user?.permissions ?? []} canSubmit={canSubmitIndicator(selected)} canEdit={(canManage || canManageOwnProposal(selected)) && selected.status === "draft"} canEditTechnical={selected.status === "opd_verification" && canVerifyIndicator(selected)} busy={actionBusyId === selected.version_id} onEdit={() => { setEditing(selected); setSelected(null); }} onEditTechnical={() => { setTechnicalEditing(selected); setSelected(null); }} onAction={(action) => transition(selected, action)} onClose={() => setSelected(null)} />}
    {technicalEditing && refs.data && <IndicatorTechnicalMetadataForm indicator={technicalEditing} units={refs.data.units} onClose={() => setTechnicalEditing(null)} onSaved={() => { setTechnicalEditing(null); indicators.reload(); }} />}
  </>;
}

function IndicatorReadinessCard({ indicator, statusText, actionable, checked, onToggle, onOpen }: { indicator: Indicator; statusText: string; actionable: boolean; checked: boolean; onToggle(checked: boolean): void; onOpen(): void }) {
  const missing = readinessMissing(indicator);
  return <article className="readiness-mobile-card">
    <header><div><strong>{indicator.name}</strong><small>{indicator.code} · {indicator.unit_symbol ?? indicator.unit_name}</small></div><span className={`workflow-status status-${indicator.status}`}><Badge tone={indicator.status === "active" ? "success" : indicator.status === "in_review" ? "warning" : "neutral"}>{statusText}</Badge></span></header>
    <div className="mobile-readiness-group"><span>Fokus & kelompok isu</span><strong>{indicator.policy_focus_name ?? "Belum dipetakan"}</strong><small>{indicator.category_name}</small></div>
    <div className="mobile-readiness-group"><span>OPD penanggung jawab</span><strong>{indicator.owner_organization_name ?? "Belum ditetapkan"}</strong></div>
    <div className="mobile-readiness-facts"><div><span>Metadata</span><strong className={`readiness-state ${indicator.metadata_complete ? "complete" : "incomplete"}`}>{indicator.metadata_complete ? <CheckCircle2 /> : <AlertTriangle />}{indicator.metadata_complete ? "Lengkap" : `${missing.length} kurang`}</strong></div><div><span>Target tahunan</span><strong>{indicator.target_count}/5 tahun</strong></div></div>
    <small className="cell-note">Diperbarui {formatDate(indicator.updated_at)}</small>
    {missing.length > 0 && <p>Perlu dilengkapi: {missing.join(", ")}.</p>}
    <footer><label><input type="checkbox" aria-label={actionable ? `Pilih ${indicator.name}` : `${indicator.name} belum menjadi tugas pada tahap ini`} disabled={!actionable} checked={checked} onChange={(event) => onToggle(event.target.checked)} /><span>{actionable ? "Pilih untuk diproses" : "Belum menjadi tugas Anda"}</span></label><button className="button secondary compact" type="button" onClick={onOpen}>Lihat detail</button></footer>
  </article>;
}

function IndicatorLoadingState() {
  return <div className="indicator-state indicator-loading" role="status" aria-live="polite" aria-label="Memuat indikator">
    <div className="state-heading"><span /><span /></div>
    {Array.from({ length: 5 }, (_, index) => <div className="state-row" key={index}><span /><span /><span /><span /></div>)}
    <span className="sr-only">Memuat indikator…</span>
  </div>;
}

function IndicatorErrorState({ message, onRetry }: { message: string; onRetry(): void }) {
  return <div className="indicator-state indicator-error" role="alert">
    <strong>Indikator belum dapat dimuat</strong>
    <p>{message || "Terjadi gangguan saat mengambil data indikator."}</p>
    <button type="button" className="button secondary" onClick={onRetry}>Coba lagi</button>
  </div>;
}

function IndicatorEmptyState({ filtered, onReset, canCreate, onCreate }: { filtered: boolean; onReset(): void; canCreate: boolean; onCreate(): void }) {
  return <div className="indicator-state indicator-empty" role="status">
    <strong>{filtered ? "Tidak ada indikator yang sesuai" : "Belum ada indikator RPJMD"}</strong>
    <p>{filtered ? "Ubah atau bersihkan filter untuk melihat indikator lainnya." : "Tambahkan indikator pertama untuk memulai finalisasi master RPJMD."}</p>
    <div>{filtered && <button type="button" className="button secondary" onClick={onReset}>Bersihkan filter</button>}{!filtered && canCreate && <button type="button" className="button primary" onClick={onCreate}>Tambah indikator</button>}</div>
  </div>;
}

function readinessMissing(indicator: Indicator): string[] {
  return [
    !indicator.has_definition && "definisi",
    !indicator.has_unit && "satuan",
    !indicator.has_owner && "OPD",
    !indicator.has_source && "sumber data",
    !indicator.has_rpjmd_targets && "target 2025-2029",
  ].filter((item): item is string => Boolean(item));
}

const directionLabel = (value: Indicator["direction"]) => value === "increase" ? "Naik" : value === "decrease" ? "Turun" : value === "maintain" ? "Dipertahankan" : "-";
const frequencyLabel = (value: string) => ({ annual: "Tahunan", semester: "Semesteran", quarter: "Triwulanan", monthly: "Bulanan", weekly: "Mingguan", event: "Insidental", custom: "Khusus" }[value] ?? value.replaceAll("_", " "));
const responsibilityLabel = (value: string) => ({ owner: "Penanggung jawab", contributor: "Kontributor", validator: "Pemeriksa" }[value] ?? value.replaceAll("_", " "));

function formatTarget(target: Indicator["targets"][number], indicator: Indicator) {
  if (target.text_value) return target.text_value;
  const value = Number(target.numeric_value);
  if (indicator.data_type === "currency") return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 2 }).format(value);
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(value)}${indicator.unit_symbol ?? ""}`;
}

function IndicatorDetail({ indicator, statusText, permissions, canSubmit, canEdit, canEditTechnical, busy, onEdit, onEditTechnical, onAction, onClose }: { indicator: Indicator; statusText: string; permissions: string[]; canSubmit: boolean; canEdit: boolean; canEditTechnical: boolean; busy: boolean; onEdit(): void; onEditTechnical(): void; onAction(action: "submit" | "approve" | "verify" | "activate" | "retire"): void; onClose(): void }) {
  const [confirming, setConfirming] = useState(false);
  const action = indicator.status === "draft" && canSubmit ? ["submit", "Ajukan ke BAPPERIDA"] as const
    : indicator.status === "in_review" && permissions.includes("indicator.approve") ? ["approve", indicator.origin_type === "opd_manual" ? "Setujui usulan OPD" : "Kirim ke OPD untuk verifikasi"] as const
    : indicator.status === "opd_verification" && canEditTechnical ? ["verify", "Konfirmasi metadata teknis"] as const
    : indicator.status === "approved" && permissions.includes("indicator.activate") ? ["activate", "Aktifkan indikator"] as const
    : indicator.status === "active" && permissions.includes("indicator.activate") ? ["retire", "Arsipkan indikator"] as const : null;
  const confirmationText = action?.[0] === "approve" ? indicator.origin_type === "opd_manual" ? "Usulan manual OPD akan disetujui dan masuk ke tahap siap diaktifkan oleh BAPPERIDA." : "Indikator akan dikirim kepada OPD penanggung jawab untuk verifikasi metadata teknis."
    : action?.[0] === "verify" ? "Metadata teknis akan dikonfirmasi atas nama OPD dan dikembalikan kepada BAPPERIDA untuk aktivasi."
    : action?.[0] === "activate" ? "Indikator akan menjadi aktif dan dapat digunakan dalam alur pelaporan RPJMD."
    : action?.[0] === "retire" ? "Indikator akan diarsipkan dan tidak lagi tersedia untuk pelaporan baru."
    : "Indikator akan diajukan kepada BAPPERIDA untuk pemeriksaan.";
  return <Modal title={indicator.name} onClose={onClose} wide><div className="indicator-detail"><Notice tone="warning">{indicator.origin_type === "opd_manual" ? `Usulan manual OPD dari ${indicator.planning_document_type === "renstra" ? "Renstra" : indicator.planning_document_type === "renja" ? "Renja" : "dokumen perencanaan lainnya"}. Tidak dibuat melalui impor atau sinkronisasi otomatis.` : `Versi ${indicator.version_number} berstatus ${statusText}. BAPPERIDA menetapkan konteks kebijakan dan target; OPD memeriksa metadata teknis sebelum konfirmasi.`}</Notice><div className="detail-grid"><div><span>Kode internal</span><strong>{indicator.code}</strong></div><div><span>Kodref IP</span><strong>{indicator.kodref_ip ?? "Belum dipetakan"}</strong></div><div><span>Kelompok isu</span><strong>{indicator.category_name}</strong></div><div><span>OPD utama</span><strong>{indicator.owner_organization_name ?? "-"}</strong></div><div><span>Frekuensi</span><strong>{frequencyLabel(indicator.frequency)}</strong></div><div><span>Satuan</span><strong>{indicator.unit_name}</strong></div><div><span>Arah capaian</span><strong>{directionLabel(indicator.direction)}</strong></div>{indicator.origin_type === "opd_manual" && <div><span>Dokumen asal</span><strong>{indicator.planning_document_reference}</strong></div>}</div><section><h3>Definisi</h3><p>{indicator.definition}</p></section><section><h3>Sumber rujukan</h3><p>{indicator.source_reference ?? "Belum ditetapkan"}</p></section><section><h3>Target tahunan</h3><div className="target-grid">{indicator.targets.map((target) => <div key={target.id}><small>{target.period_code}</small><strong>{formatTarget(target, indicator)}</strong></div>)}</div></section><section><h3>Perangkat daerah terkait</h3><div className="chip-list">{indicator.organizations.map((organization) => <span key={`${organization.organization_id}-${organization.responsibility}`}>{organization.organization_name} - {responsibilityLabel(organization.responsibility)}</span>)}</div></section>{confirming && action && <section className="indicator-action-confirm" role="alertdialog" aria-labelledby="indicator-action-confirm-title"><strong id="indicator-action-confirm-title">Konfirmasi perubahan tahap</strong><p>{confirmationText}</p><div><button type="button" className="button secondary" disabled={busy} onClick={() => setConfirming(false)}>Batal</button><button type="button" className="button primary" disabled={busy} onClick={() => onAction(action[0])}>{busy ? "Memproses…" : action[1]}</button></div></section>}{(canEdit || canEditTechnical || action) && <footer className="detail-actions">{canEdit && <button className="button secondary" disabled={busy} onClick={onEdit}>Ubah metadata draf</button>}{canEditTechnical && <button className="button secondary" disabled={busy} onClick={onEditTechnical}>Perbaiki metadata teknis</button>}{action && !confirming && <button className="button primary" disabled={busy} onClick={() => setConfirming(true)}>{action[1]}</button>}</footer>}</div></Modal>;
}

function IndicatorTechnicalMetadataForm({ indicator, units, onClose, onSaved }: { indicator: Indicator; units: Unit[]; onClose(): void; onSaved(): void }) {
  const [form, setForm] = useState({
    definition: indicator.definition,
    formula: indicator.formula ?? "",
    unit_id: indicator.unit_id,
    frequency: indicator.frequency,
    data_type: indicator.data_type,
    direction: indicator.direction ?? "increase",
    source_reference: indicator.source_reference ?? "",
    change_notes: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api(`/indicator-versions/${indicator.version_id}/technical-metadata`, {
        method: "PATCH", mutation: true,
        body: jsonBody({ ...form, formula: form.formula.trim() || null, change_notes: form.change_notes.trim() || null }),
      });
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Metadata teknis gagal disimpan."); }
    finally { setBusy(false); }
  };
  return <Modal title={`Perbaiki metadata teknis - ${indicator.name}`} onClose={onClose} wide>
    {error && <Notice tone="error">{error}</Notice>}
    <form className="form-stack technical-metadata-form" onSubmit={submit}>
      <Notice tone="warning">OPD dapat memperbaiki definisi, rumus, satuan, frekuensi, tipe data, arah capaian, dan sumber rujukan. Kode, kelompok isu, OPD penanggung jawab, serta target tetap dikelola BAPPERIDA.</Notice>
      <div className="form-grid">
        <label className="field"><span>Satuan</span><select data-field="unit_id" value={form.unit_id} onChange={(event) => update("unit_id", event.target.value)} required>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}{unit.symbol ? ` (${unit.symbol})` : ""}</option>)}</select></label>
        <label className="field"><span>Frekuensi pembaruan</span><select data-field="frequency" value={form.frequency} onChange={(event) => update("frequency", event.target.value)} required><option value="annual">Tahunan</option><option value="semester">Semesteran</option><option value="quarter">Triwulanan</option><option value="monthly">Bulanan</option><option value="weekly">Mingguan</option><option value="event">Insidental</option><option value="custom">Khusus</option></select></label>
        <label className="field"><span>Tipe data</span><select data-field="data_type" value={form.data_type} onChange={(event) => update("data_type", event.target.value)} required><option value="number">Angka</option><option value="integer">Bilangan bulat</option><option value="percentage">Persentase</option><option value="currency">Mata uang</option><option value="text">Teks</option><option value="boolean">Ya/tidak</option></select></label>
        <label className="field"><span>Arah capaian</span><select data-field="direction" value={form.direction} onChange={(event) => update("direction", event.target.value)}><option value="increase">Naik lebih baik</option><option value="decrease">Turun lebih baik</option><option value="maintain">Dipertahankan</option></select></label>
      </div>
      <label className="field"><span>Definisi operasional</span><textarea rows={4} data-field="definition" value={form.definition} onChange={(event) => update("definition", event.target.value)} required minLength={5} /></label>
      <label className="field"><span>Rumus perhitungan <small>(opsional)</small></span><textarea rows={3} data-field="formula" value={form.formula} onChange={(event) => update("formula", event.target.value)} /></label>
      <label className="field"><span>Sumber rujukan/data</span><textarea rows={3} data-field="source_reference" value={form.source_reference} onChange={(event) => update("source_reference", event.target.value)} required minLength={3} placeholder="Nama dokumen, sistem, dataset, atau unit penghasil data." /></label>
      <label className="field"><span>Catatan perubahan <small>(opsional)</small></span><textarea rows={2} data-field="change_notes" value={form.change_notes} onChange={(event) => update("change_notes", event.target.value)} placeholder="Jelaskan koreksi yang dilakukan agar mudah diperiksa BAPPERIDA." /></label>
      <footer className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Batal</button><button className="button primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan metadata teknis"}</button></footer>
    </form>
  </Modal>;
}

interface IndicatorRefs { categories: Category[]; units: Unit[]; periods: Period[]; organizations: Organization[] }

function IndicatorForm({ references, initial, manualProposal = false, onClose, onCreated }: { references: IndicatorRefs; initial?: Indicator; manualProposal?: boolean; onClose(): void; onCreated(): void }) {
  const { user: formUser } = useAuth();
  const canSearchReference = formUser?.permissions.includes("reference.search") ?? false;
  const annualPeriods = useMemo(() => references.periods.filter((period) => {
    if (period.period_type !== "annual") return false;
    const year = Number(period.code.match(/\d{4}/u)?.[0]);
    return year >= 2025 && year <= 2029;
  }).sort((a, b) => a.code.localeCompare(b.code)), [references.periods]);
  const [form, setForm] = useState({ code: initial?.code ?? "", kodref_ip: initial?.kodref_ip ?? "", name: initial?.name ?? "", category_id: initial?.category_id ?? references.categories[0]?.id ?? "", owner_organization_id: initial?.owner_organization_id ?? references.organizations[0]?.id ?? "", definition: initial?.definition ?? "", formula: initial?.formula ?? "", unit_id: initial?.unit_id ?? references.units[0]?.id ?? "", frequency: initial?.frequency ?? "annual", data_type: initial?.data_type ?? "number", direction: initial?.direction ?? "increase", source_reference: initial?.source_reference ?? "", effective_from: initial?.effective_from ?? "2025-01-01", planning_document_type: initial?.planning_document_type ?? "renstra", planning_document_reference: initial?.planning_document_reference ?? "" });
  const [targets, setTargets] = useState<Record<string, string>>(() => Object.fromEntries((initial?.targets ?? []).map((target) => [target.period_id, target.numeric_value ?? target.text_value ?? ""])));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    const formElement = event.currentTarget as HTMLFormElement;
    try {
      const organizations = initial?.organizations.length
        ? initial.organizations.map(({ organization_id, responsibility, is_primary }) => ({ organization_id, responsibility, is_primary }))
        : form.owner_organization_id ? [{ organization_id: form.owner_organization_id, responsibility: "primary_producer", is_primary: true }] : [];
      const primary = organizations.find((organization) => organization.is_primary);
      if (primary && primary.organization_id !== form.owner_organization_id) primary.organization_id = form.owner_organization_id;
      const endpoint = manualProposal
        ? initial ? `/opd-indicator-proposals/${initial.id}` : "/opd-indicator-proposals"
        : initial ? `/indicators/${initial.id}` : "/indicators";
      await api(endpoint, { method: initial ? "PATCH" : "POST", mutation: true, body: jsonBody({ ...form, code: form.code.toUpperCase(), kodref_ip: form.kodref_ip.trim() || null, formula: form.formula || null, source_reference: form.source_reference || null, access_level: "internal", change_notes: initial ? "Metadata draft diperbarui melalui formulir." : manualProposal ? "Diusulkan manual oleh OPD melalui formulir." : "Dibuat melalui formulir master indikator.", organizations, targets: annualPeriods.filter((period) => targets[period.id]?.trim()).map((period) => ({ period_id: period.id, numeric_value: Number(targets[period.id]), notes: "Target draft; menunggu validasi." })) }) });
      onCreated();
    } catch (cause) { markInvalidFields(formElement, cause); setError(cause instanceof Error ? cause.message : "Indikator gagal disimpan."); }
    finally { setBusy(false); }
  };
  return <Modal title={initial ? "Ubah indikator draft" : manualProposal ? "Usulkan indikator OPD" : "Tambah indikator"} onClose={onClose} wide>{error && <Notice tone="error">{error}</Notice>}<form className="form-stack" onSubmit={submit}><Notice tone="warning">{manualProposal ? "Isi satu indikator secara manual. Tidak ada impor dokumen, ekstraksi otomatis, atau aktivasi otomatis; usulan akan diperiksa BAPPERIDA." : initial ? "Perubahan hanya diterapkan pada versi draft dan dicatat dalam audit." : "Indikator baru disimpan sebagai draft dan tidak langsung dipublikasikan."}</Notice>{manualProposal && <div className="form-grid"><label className="field"><span>Dokumen asal</span><select data-field="planning_document_type" value={form.planning_document_type} onChange={(e) => update("planning_document_type", e.target.value)} required><option value="renstra">Renstra Perangkat Daerah</option><option value="renja">Renja Perangkat Daerah</option><option value="other">Dokumen lainnya</option></select></label><label className="field"><span>Referensi dokumen</span><input data-field="planning_document_reference" value={form.planning_document_reference} onChange={(e) => update("planning_document_reference", e.target.value)} required minLength={3} placeholder="Contoh: Renstra Dinas Kesehatan 2025-2029, Bab IV" /></label></div>}<div className="form-grid"><label className="field"><span>Kode internal</span><input data-field="code" value={form.code} onChange={(e) => update("code", e.target.value.replace(/\s+/gu, "_"))} required /><small>Dipakai SABABUKA untuk identitas indikator.</small></label><label className="field"><span>Kodref IP <small>(opsional)</small></span><input data-field="kodref_ip" value={form.kodref_ip} onChange={(e) => update("kodref_ip", e.target.value)} maxLength={128} placeholder="Kode Referensi Indikator Pembangunan" /><small>Untuk pencocokan dengan Satu Data Indonesia dan SIPD.</small></label><label className="field"><span>Nama indikator</span><input data-field="name" value={form.name} onChange={(e) => update("name", e.target.value)} required /></label><label className="field"><span>Kelompok isu</span><select data-field="category_id" value={form.category_id} onChange={(e) => update("category_id", e.target.value)} required>{references.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>OPD utama</span><select data-field="owner_organization_id" value={form.owner_organization_id} onChange={(e) => update("owner_organization_id", e.target.value)} required disabled={manualProposal && references.organizations.length === 1}>{references.organizations.map((item) => <option key={item.id} value={item.id}>{item.short_name ?? item.name}</option>)}</select></label><label className="field"><span>Satuan</span><select data-field="unit_id" value={form.unit_id} onChange={(e) => update("unit_id", e.target.value)} required>{references.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>Frekuensi pelaporan</span><select data-field="frequency" value={form.frequency} onChange={(e) => update("frequency", e.target.value)} required><option value="annual">Tahunan</option><option value="semester">Semesteran</option><option value="quarter">Triwulanan</option><option value="monthly">Bulanan</option><option value="weekly">Mingguan</option><option value="event">Insidental</option><option value="custom">Khusus</option></select></label><label className="field"><span>Tipe data</span><select data-field="data_type" value={form.data_type} onChange={(e) => update("data_type", e.target.value)}><option value="number">Angka</option><option value="integer">Bilangan bulat</option><option value="percentage">Persentase</option><option value="currency">Mata uang</option></select></label><label className="field"><span>Arah capaian</span><select data-field="direction" value={form.direction} onChange={(e) => update("direction", e.target.value)}><option value="increase">Naik</option><option value="decrease">Turun</option><option value="maintain">Dipertahankan</option></select></label><label className="field"><span>Berlaku mulai</span><input type="date" data-field="effective_from" value={form.effective_from} onChange={(e) => update("effective_from", e.target.value)} required /></label></div><label className="field"><span>Definisi operasional</span><textarea rows={3} data-field="definition" value={form.definition} onChange={(e) => update("definition", e.target.value)} required /></label><label className="field"><span>Rumus perhitungan</span><textarea rows={2} data-field="formula" value={form.formula} onChange={(e) => update("formula", e.target.value)} /></label>{canSearchReference && <ReferenceDataPanel onUse={(reference) => update("source_reference", reference)} />}<label className="field"><span>Sumber data</span><input data-field="source_reference" value={form.source_reference} onChange={(e) => update("source_reference", e.target.value)} required={manualProposal} placeholder="Nama sistem, rekap, survei, atau unit penghasil data" /></label><fieldset className="target-fields"><legend>Target tahunan draft</legend><div>{annualPeriods.map((period) => <label className="field" key={period.id}><span>{period.code}</span><input type="number" step="any" value={targets[period.id] ?? ""} onChange={(e) => setTargets((current) => ({ ...current, [period.id]: e.target.value }))} /></label>)}</div></fieldset><footer className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Batal</button><button className="button primary" disabled={busy}>{busy ? "Menyimpan…" : initial ? "Simpan perubahan" : "Simpan sebagai draft"}</button></footer></form></Modal>;
}
