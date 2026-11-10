import { ArrowRight, Database, FolderKanban, Link2, Search, ServerCog } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, ContextHelp, EmptyState, ErrorState, formatTanggal, Pagination, Spinner, useAsync } from "../components";
import { navigate } from "../router";
import type { PageResponse } from "../types";

interface DatasetItem {
  id: string;
  code: string;
  title: string;
  owner_organization_id: string;
  owner_organization_name: string;
  source_id: string;
  source_name: string;
  source_type: string;
  is_active: boolean;
  updated_at: string;
  version_id: string | null;
  version_number: number | null;
  version_name: string | null;
  version_status: "draft" | "in_review" | "approved" | "active" | "retired" | null;
  visibility: "public" | "internal" | "restricted" | null;
  metadata: Record<string, unknown> | null;
  effective_from: string | null;
  effective_until: string | null;
  resource_count: number;
  indicator_count: number;
}

const statusLabel = (status: DatasetItem["version_status"]) => ({
  draft: "Draf",
  in_review: "Sedang ditelaah",
  approved: "Disetujui",
  active: "Aktif",
  retired: "Tidak berlaku",
}[status ?? "draft"]);

const statusTone = (status: DatasetItem["version_status"]): "success" | "warning" | "neutral" => status === "active" || status === "approved" ? "success" : status === "in_review" ? "warning" : "neutral";

const metadataTopic = (metadata: Record<string, unknown> | null) => {
  const value = metadata?.topic ?? metadata?.topik ?? metadata?.theme;
  return typeof value === "string" && value.trim() ? value : null;
};

export function DatasetPage() {
  const { user } = useAuth();
  const canOpenSync = user?.permissions.includes("connector.view") ?? false;
  const canManageSources = (user?.permissions.includes("connector.manage") ?? false) && (user?.roles.some((role) => role.code === "superadmin" && role.scope_type === "global") ?? false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const datasets = useAsync(() => api<PageResponse<DatasetItem>>(`/datasets?page=${page}&page_size=${pageSize}${query ? `&q=${encodeURIComponent(query)}` : ""}`), [page, pageSize, query]);
  const rows = datasets.data?.data ?? [];
  const summary = useMemo(() => ({
    total: datasets.data?.meta.total_items ?? 0,
    active: datasets.data?.meta.active_count ?? 0,
    sources: new Set(rows.map((item) => item.source_id)).size,
    linked: rows.filter((item) => item.indicator_count > 0).length,
  }), [datasets.data?.meta, rows]);
  const submitSearch = (event: FormEvent) => { event.preventDefault(); setPage(1); setQuery(queryInput.trim()); };

  return <div className="dataset-page">
    <section className="dataset-intro">
      <div><h2>Temukan data tanpa masuk ke ruang teknis</h2><p>Dataset adalah kumpulan data yang sudah diberi identitas, pemilik, sumber, dan versi. Pengambilan data mentah serta pemetaannya tetap dikelola di Pusat Sinkronisasi.</p></div>
      {canOpenSync && <button className="button primary" onClick={() => navigate("/connectors")}><ServerCog />{canManageSources ? "Kelola sumber data" : "Pantau sinkronisasi"}<ArrowRight /></button>}
    </section>

    <section className="dataset-summary" aria-label="Ringkasan katalog dataset">
      <article><span><Database /></span><small>Total dataset</small><strong>{datasets.loading || datasets.error ? "-" : summary.total}</strong></article>
      <article><span><FolderKanban /></span><small>Versi disetujui atau aktif</small><strong>{datasets.loading || datasets.error ? "-" : summary.active}</strong></article>
      <article><span><ServerCog /></span><small>Sumber pada halaman ini</small><strong>{datasets.loading || datasets.error ? "-" : summary.sources}</strong></article>
      <article><span><Link2 /></span><small>Dataset terkait indikator di halaman ini</small><strong>{datasets.loading || datasets.error ? "-" : summary.linked}</strong></article>
    </section>

    <section className="panel dataset-catalog">
      <header className="panel-heading">
        <div><h2>Daftar dataset <ContextHelp label="Dataset">Katalog data yang sudah memiliki pemilik, sumber, metadata, dan versi. Dataset berbeda dari baris data mentah yang masih berada di staging.</ContextHelp></h2><p>Cari berdasarkan judul, kode, sumber, atau OPD pemilik.</p></div>
        <form className="dataset-search" onSubmit={submitSearch}><label><Search /><span className="sr-only">Cari dataset</span><input data-field="query_input" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Cari dataset, sumber, atau OPD" /></label><button className="button secondary" type="submit">Cari</button></form>
      </header>

      {datasets.loading ? <div className="panel-loading"><Spinner label="Memuat katalog" /></div>
        : datasets.error ? <ErrorState title="Katalog dataset belum dapat dimuat" onRetry={datasets.reload}>{datasets.error}</ErrorState>
        : !rows.length ? <EmptyState title={query ? "Dataset tidak ditemukan" : "Belum ada dataset"} action={canManageSources ? <button className="button primary" onClick={() => navigate("/connectors")}>Daftarkan sumber data</button> : undefined}>{query ? "Coba kata pencarian yang lebih umum." : (canManageSources ? "Dataset akan tampil setelah sumber terdaftar dan proses sinkronisasi membentuk versi dataset." : "Dataset dibentuk Walidata dari sumber resmi (Satu Data, BPS Kapuas, website OPD). Data yang Anda isi sendiri dikirim lewat Pelaporan Realisasi dan tidak perlu didaftarkan di sini.")}</EmptyState>
        : <>
          <div className="table-scroll dataset-table"><table><thead><tr><th>Dataset</th><th>Sumber dan pemilik</th><th>Versi</th><th>Keterhubungan</th><th>Status</th><th>Diperbarui</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}>
            <td><strong>{item.title}</strong><small>{item.code}{metadataTopic(item.metadata) ? ` - ${metadataTopic(item.metadata)}` : ""}</small></td>
            <td><strong>{item.source_name}</strong><small>{item.owner_organization_name} - {item.source_type.toUpperCase()}</small></td>
            <td><strong>{item.version_number ? `Versi ${item.version_number}` : "Belum berversi"}</strong><small>{item.effective_from ? `Berlaku ${formatTanggal(item.effective_from)}${item.effective_until ? ` - ${formatTanggal(item.effective_until)}` : ""}` : "Periode belum ditetapkan"}</small></td>
            <td><strong>{item.resource_count} sumber daya</strong><small>{item.indicator_count} indikator terkait</small></td>
            <td><Badge tone={statusTone(item.version_status)}>{statusLabel(item.version_status)}</Badge><small>{item.visibility === "public" ? "Publik" : item.visibility === "restricted" ? "Terbatas" : "Internal"}</small></td>
            <td>{formatTanggal(item.updated_at, "tanggal-waktu")}</td>
          </tr>)}</tbody></table></div>
          <div className="dataset-mobile-list">{rows.map((item) => <article key={item.id}><header><div><strong>{item.title}</strong><small>{item.code}</small></div><Badge tone={statusTone(item.version_status)}>{statusLabel(item.version_status)}</Badge></header><dl><div><dt>Sumber</dt><dd>{item.source_name}</dd></div><div><dt>Pemilik</dt><dd>{item.owner_organization_name}</dd></div><div><dt>Versi</dt><dd>{item.version_number ?? "-"}</dd></div><div><dt>Indikator</dt><dd>{item.indicator_count}</dd></div></dl><small>Diperbarui {formatTanggal(item.updated_at, "tanggal-waktu")}</small></article>)}</div>
          <Pagination page={page} totalPages={datasets.data?.meta.total_pages ?? 0} totalItems={datasets.data?.meta.total_items} pageSize={pageSize} onChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />
        </>}
    </section>
  </div>;
}
