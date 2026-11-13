import { Bell, CheckCheck, Wrench } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, EmptyState, ErrorState, formatDate, Notice, PageSizeControl, Pagination, SortableHeader, Spinner, useAsync, type SortDirection } from "../components";
import type { AuditEvent, NotificationItem, PageResponse } from "../types";
import { navigate } from "../router";
import { notificationDestination } from "../notification-routing";

export function NotificationsPage() {
  const { user, menu } = useAuth();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const result = useAsync(() => api<{ data: NotificationItem[]; unread_count: number }>(`/notifications?unread_only=${unreadOnly}`), [unreadOnly]);
  const [actionError, setActionError] = useState<string | null>(null);
  const read = async (item: NotificationItem) => {
    setActionError(null);
    try { if (!item.read_at) await api(`/notifications/${item.id}/read`, { method: "POST", mutation: true }); result.reload(); navigate(notificationDestination(item, user?.permissions ?? [], menu)); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "Notifikasi tidak dapat dibuka."); }
  };
  const readAll = async () => { await api("/notifications/read-all", { method: "POST", mutation: true }); result.reload(); };
  return <>
    <div className="toolbar"><label className="inline-check"><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />Belum dibaca saja</label>{Boolean(result.data?.unread_count) && <button className="button secondary" onClick={readAll}><CheckCheck />Tandai semua dibaca</button>}</div>
    {actionError && <Notice tone="error">{actionError}</Notice>}<section className="panel notification-page">
      {result.loading ? <div className="panel-loading"><Spinner /></div>
        : result.error ? <ErrorState title="Notifikasi belum dapat dimuat" onRetry={result.reload}>{result.error}</ErrorState>
        : !result.data?.data.length ? <EmptyState title={unreadOnly ? "Tidak ada notifikasi yang belum dibaca" : "Belum ada tugas atau pemberitahuan baru"}>{unreadOnly ? "Semua pemberitahuan sudah dibaca. Nonaktifkan filter untuk melihat riwayat." : "Saat ada tugas, pengembalian, persetujuan, atau perubahan data, pemberitahuannya akan tampil di sini."}</EmptyState>
        : <div className="notification-list">{result.data.data.map((item) => <button key={item.id} className={item.read_at ? "" : "unread"} onClick={() => void read(item)} aria-label={`Buka notifikasi ${item.title}`}><span className="table-icon"><Bell /></span><span><strong>{item.title}</strong><p>{item.message}</p><small>{formatDate(item.created_at)} · Klik untuk membuka terkait</small></span>{!item.read_at && <i />}</button>)}</div>}
    </section>
  </>;
}

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [eventType, setEventType] = useState("");
  const [entityType, setEntityType] = useState("");
  const [sortBy, setSortBy] = useState("occurred_at");
  const [sortOrder, setSortOrder] = useState<SortDirection>("desc");
  const [technical, setTechnical] = useState(false);
  const url = `/audit/events?page=${page}&page_size=${pageSize}&sort_by=${sortBy}&sort_order=${sortOrder}${eventType ? `&event_type=${encodeURIComponent(eventType)}` : ""}${entityType ? `&entity_type=${encodeURIComponent(entityType)}` : ""}`;
  const result = useAsync(() => api<PageResponse<AuditEvent>>(url), [url]);
  const changeSort = (column: string, direction: SortDirection) => { setSortBy(column); setSortOrder(direction); setPage(1); };
  return <>
    <div className="toolbar data-toolbar audit-filter">
      <input aria-label="Cari jenis aktivitas" value={eventType} onChange={(e) => { setEventType(e.target.value); setPage(1); }} placeholder="Cari aktivitas, misalnya persetujuan" />
      <input aria-label="Cari objek data" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} placeholder="Cari objek, misalnya capaian" />
      <label className="inline-check"><input type="checkbox" checked={technical} onChange={(event) => setTechnical(event.target.checked)} /><Wrench />Tampilkan detail teknis</label>
      <PageSizeControl value={pageSize} onChange={(size) => { setPageSize(size); setPage(1); }} />
    </div>
    <Notice tone="warning">Riwayat aktivitas tidak dapat diubah atau dihapus. Anda hanya melihat aktivitas sesuai lingkup kewenangan.</Notice>
    <section className="panel table-panel governance-table">
      {result.loading ? <div className="panel-loading"><Spinner /></div>
        : result.error ? <ErrorState title="Audit aktivitas belum dapat dimuat" onRetry={result.reload}>{result.error}</ErrorState>
        : !result.data?.data.length ? <EmptyState title="Belum ada audit">Aktivitas yang berada dalam lingkup Anda akan tampil di sini.</EmptyState>
        : <div className="table-scroll"><table><thead><tr><SortableHeader label="Waktu" column="occurred_at" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Aktivitas" column="event_type" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Objek data" column="entity_type" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Dilakukan oleh" column="actor" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Instansi" column="organization" sortBy={sortBy} direction={sortOrder} onSort={changeSort} />{technical && <th>Detail teknis</th>}</tr></thead><tbody>{result.data.data.map((item) => <tr key={item.id}><td>{formatDate(item.occurred_at)}</td><td><div className="identity-cell"><span><strong>{auditEventLabel(item.event_type)}</strong>{technical && <small>{item.event_type}</small>}</span></div></td><td><Badge tone="neutral">{auditEntityLabel(item.entity_type)}</Badge></td><td>{item.actor_name ?? "Proses otomatis sistem"}</td><td>{item.organization_name ?? "Lintas instansi"}</td>{technical && <td><code title={item.request_id ?? undefined}>{item.request_id?.slice(0, 8) ?? "-"}</code><small>{item.id.slice(0, 8)}</small></td>}</tr>)}</tbody></table></div>}
      {result.data && <Pagination page={result.data.meta.page} pageSize={result.data.meta.page_size} totalItems={result.data.meta.total_items} totalPages={result.data.meta.total_pages} sortLabel={`${({ occurred_at: "Waktu", event_type: "Aktivitas", entity_type: "Entitas", actor: "Aktor", organization: "Organisasi" } as Record<string, string>)[sortBy] ?? "Waktu"} ${sortBy === "occurred_at" ? (sortOrder === "desc" ? "terbaru" : "terlama") : (sortOrder === "desc" ? "menurun" : "menaik")}`} onChange={setPage} showPageSize={false} />}
    </section>
  </>;
}

const auditEventWords: Record<string, string> = {
  create: "Membuat", update: "Memperbarui", submit: "Mengirim", approve: "Menyetujui", reject: "Menolak",
  return: "Mengembalikan untuk diperbaiki", activate: "Mengaktifkan", deactivate: "Menonaktifkan", delete: "Menghapus",
  import: "Mengimpor", publish: "Menerbitkan", withdraw: "Menarik publikasi", login: "Masuk", logout: "Keluar", review: "Memeriksa", verify: "Memverifikasi", resolve: "Menetapkan", retire: "Mengarsipkan",
};
function auditEventLabel(value: string) {
  const parts = value.toLowerCase().replace(/start[._-]review/u, "review").split(/[._-]+/u);
  const action = [...parts].reverse().find((part) => auditEventWords[part]);
  const subject = parts.filter((part) => part !== action).map(auditEntityLabel).join(" ");
  return `${action ? auditEventWords[action] : "Aktivitas"}${subject ? ` ${subject}` : ""}`;
}
function auditEntityLabel(value: string) {
  const labels: Record<string, string> = { submission: "capaian", data: "data", batch: "pelaporan", data_batch: "pelaporan capaian", category: "kelompok isu", indicator: "indikator", indicator_version: "versi indikator", publication: "publikasi", user: "akun pengguna", organization: "instansi", connector: "sumber data", mapping: "pemetaan sumber" };
  return labels[value] ?? value.replaceAll("_", " ");
}
