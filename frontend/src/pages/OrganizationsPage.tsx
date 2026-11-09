import { Building2, Plus, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, jsonBody } from "../api";
import { useAuth } from "../auth";
import { Badge, EmptyState, ErrorState, formatDate, Modal, Notice, PageSizeControl, Pagination, SortableHeader, Spinner, useAsync, type SortDirection } from "../components";
import type { Organization, PageResponse } from "../types";

const organizationTypeLabels: Record<string, string> = {
  opd: "OPD",
  vertical_agency: "Instansi vertikal",
  regional_secretariat: "Sekretariat Daerah",
  planning_agency: "Badan Perencanaan",
  data_custodian: "Walidata",
  regency_government: "Pemerintah kabupaten",
  district: "Kecamatan",
  other: "Lainnya",
};

export function OrganizationsPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes("organization.manage") ?? false;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortOrder, setSortOrder] = useState<SortDirection>("desc");
  const [createOpen, setCreateOpen] = useState(false);
  const result = useAsync(() => api<PageResponse<Organization>>(`/organizations?page=${page}&page_size=${pageSize}&sort_by=${sortBy}&sort_order=${sortOrder}${query ? `&q=${encodeURIComponent(query)}` : ""}${activeFilter ? `&active=${activeFilter}` : ""}`), [page, pageSize, query, activeFilter, sortBy, sortOrder]);
  const changeSort = (column: string, direction: SortDirection) => { setSortBy(column); setSortOrder(direction); setPage(1); };

  return <>
    <div className="toolbar"><div className="table-filters"><form className="search-box" role="search" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(search); }}><Search aria-hidden /><input aria-label="Cari organisasi" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kode atau nama organisasi" /><button className="button secondary">Cari</button></form><select aria-label="Filter status organisasi" value={activeFilter} onChange={(event) => { setActiveFilter(event.target.value); setPage(1); }}><option value="">Semua status</option><option value="true">Aktif</option><option value="false">Nonaktif</option></select><PageSizeControl value={pageSize} onChange={(size) => { setPageSize(size); setPage(1); }} /></div>{canManage && <button className="button primary" onClick={() => setCreateOpen(true)}><Plus />Tambah organisasi</button>}</div>
    <section className="panel table-panel">{result.loading ? <div className="panel-loading"><Spinner /></div> : result.error ? <ErrorState title="Daftar organisasi belum dapat dimuat" onRetry={result.reload}>{result.error}</ErrorState> : !result.data?.data.length ? <EmptyState title="Belum ada organisasi">{canManage ? "Tambahkan OPD, instansi vertikal, atau mitra untuk mulai mengatur pengguna dan lingkup data." : "Belum ada organisasi dalam lingkup yang dapat Anda lihat."}</EmptyState> : <div className="table-scroll"><table><thead><tr><SortableHeader label="Organisasi" column="name" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Kode" column="code" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><th>Relasi RPJMD</th><SortableHeader label="Jenis" column="type" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><th>Kedudukan</th><SortableHeader label="Status" column="status" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Diperbarui" column="updated_at" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /></tr></thead><tbody>{result.data.data.map((organization) => { const shortName = organization.short_name?.trim(); const showShortName = shortName && shortName.toLocaleLowerCase("id") !== organization.code.toLocaleLowerCase("id") && shortName.toLocaleLowerCase("id") !== organization.name.toLocaleLowerCase("id"); return <tr key={organization.id}><td><div className="identity-cell"><span className="table-icon"><Building2 /></span><span><strong>{organization.name}</strong>{showShortName && <small>{shortName}</small>}</span></div></td><td><code>{organization.code}</code></td><td><span className="relation-count"><strong>{organization.indicator_count ?? 0} indikator</strong><small>{organization.category_count ?? 0} kelompok isu</small></span></td><td>{organizationTypeLabels[organization.organization_type] ?? organization.organization_type.replaceAll("_", " ")}</td><td>{organization.parent_id ? "Unit turunan" : organization.organization_type === "vertical_agency" ? "Instansi pusat di daerah" : "Organisasi utama"}</td><td><Badge tone={organization.is_active ? "success" : "neutral"}>{organization.is_active ? "Aktif" : "Nonaktif"}</Badge></td><td>{formatDate(organization.updated_at)}</td></tr>; })}</tbody></table></div>}
      {result.data && <Pagination page={result.data.meta.page} pageSize={result.data.meta.page_size} totalItems={result.data.meta.total_items} totalPages={result.data.meta.total_pages} sortLabel={`${({ name: "Nama", code: "Kode", type: "Jenis", status: "Status", updated_at: "Terakhir diperbarui" } as Record<string,string>)[sortBy] ?? "Terakhir diperbarui"} ${sortBy === "updated_at" ? (sortOrder === "desc" ? "terbaru" : "terlama") : (sortOrder === "asc" ? "menaik" : "menurun")}`} onChange={setPage} showPageSize={false} />}</section>
    {createOpen && <OrganizationForm onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); result.reload(); }} />}
  </>;
}

function OrganizationForm({ onClose, onCreated }: { onClose(): void; onCreated(): void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [type, setType] = useState("opd");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await api("/organizations", { method: "POST", mutation: true, body: jsonBody({ code: code.toUpperCase(), name, short_name: shortName || null, organization_type: type }) });
      onCreated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Organisasi gagal dibuat."); }
    finally { setBusy(false); }
  }
  return <Modal title="Tambah organisasi" onClose={onClose}><form className="form-stack" onSubmit={submit}>{error && <Notice tone="error">{error}</Notice>}<div className="form-grid"><label className="field"><span>Kode organisasi</span><input data-field="code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="DINKES" pattern="[A-Z0-9][A-Z0-9._-]*" required /></label><label className="field"><span>Nama singkat</span><input data-field="short_name" value={shortName} onChange={(event) => setShortName(event.target.value)} placeholder="Dinas Kesehatan" /></label></div><label className="field"><span>Nama lengkap</span><input data-field="name" value={name} onChange={(event) => setName(event.target.value)} required /></label><label className="field"><span>Jenis organisasi</span><select data-field="type" value={type} onChange={(event) => setType(event.target.value)}><option value="opd">OPD</option><option value="vertical_agency">Instansi vertikal</option><option value="regional_secretariat">Sekretariat Daerah</option><option value="planning_agency">Badan Perencanaan</option><option value="data_custodian">Walidata</option><option value="other">Organisasi/mitra lainnya</option></select><small>Instansi vertikal adalah unit kementerian/lembaga pusat di daerah, seperti BPS Kabupaten Kapuas.</small></label>{type === "vertical_agency" && <Notice tone="info"><strong>Instansi vertikal bukan OPD.</strong> Hak input, pembinaan, dan verifikasi ditentukan terpisah melalui peran akun.</Notice>}<footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Batal</button><button className="button primary" disabled={busy}>{busy ? <Spinner label="Menyimpan" /> : "Simpan organisasi"}</button></footer></form></Modal>;
}
