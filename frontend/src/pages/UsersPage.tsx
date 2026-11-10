import { Check, Copy, KeyRound, Pencil, Plus, Power, PowerOff, Search, ShieldCheck, ShieldPlus, Trash2, UserRound, Users, XCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, jsonBody } from "../api";
import { useAuth } from "../auth";
import { Badge, RowLink, EmptyState, ErrorState, formatDate, Modal, Notice, PageSizeControl, Pagination, SortableHeader, Spinner, useAsync, type SortDirection } from "../components";
import type { Organization, PageResponse, Role, UserSummary } from "../types";

function statusTone(status: UserSummary["status"]): "success" | "warning" | "danger" | "neutral" {
  if (status === "active") return "success";
  if (status === "invited") return "warning";
  if (status === "suspended" || status === "locked") return "danger";
  return "neutral";
}

function userStatusLabel(user: UserSummary): string {
  if (user.registration_status === "rejected") return "Pendaftaran ditolak";
  if (user.status === "invited") return user.has_password ? "Menunggu verifikasi" : "Undangan terkirim";
  if (user.status === "active") return "Aktif";
  if (user.status === "suspended") return "Ditangguhkan";
  if (user.status === "locked") return "Terkunci";
  return "Diarsipkan";
}

type RoleScope = "global" | "organization" | "self" | "published";
const roleScopeRules: Record<string, readonly RoleScope[]> = {
  superadmin: ["global"],
  bapperida: ["global"],
  kominfo: ["global"],
  pembina_statistik: ["global"],
  opd: ["organization"],
  pimpinan: ["published"],
};

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const canCreate = currentUser?.permissions.includes("user.create") ?? false;
  const canEdit = currentUser?.permissions.includes("user.update") ?? false;
  const canAssign = currentUser?.permissions.includes("user.assign_role") ?? false;
  const canActivate = currentUser?.permissions.includes("user.activate") ?? false;
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [organizationFilter, setOrganizationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortOrder, setSortOrder] = useState<SortDirection>("desc");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserSummary | null>(null);
  const [assignUser, setAssignUser] = useState<UserSummary | null>(null);
  const [confirmation, setConfirmation] = useState<{ target: UserSummary; action: "activate" | "deactivate" | "delete" } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<{ name: string; token: string; expires: string } | null>(null);
  const users = useAsync(() => api<PageResponse<UserSummary>>(`/users?page=${page}&page_size=${pageSize}&sort_by=${sortBy}&sort_order=${sortOrder}${query ? `&q=${encodeURIComponent(query)}` : ""}${organizationFilter ? `&organization_id=${organizationFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`), [page, pageSize, query, organizationFilter, statusFilter, sortBy, sortOrder]);
  const changeSort = (column: string, direction: SortDirection) => { setSortBy(column); setSortOrder(direction); setPage(1); };
  const references = useAsync(() => Promise.all([
    api<PageResponse<Organization>>("/organizations?page_size=100&active=true&sort_by=name&sort_order=asc"),
    api<{ data: Role[] }>("/roles"),
  ]).then(([organizations, roles]) => ({ organizations: organizations.data, roles: roles.data })), []);

  async function setUserActive(target: UserSummary, active: boolean) {
    setActionError(null);
    setActionBusy(target.id);
    try {
      await api(`/users/${target.id}`, { method: "PATCH", mutation: true, body: jsonBody({ status: active ? "active" : "suspended" }) });
      users.reload();
      return true;
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Status akun gagal diubah.");
      return false;
    } finally { setActionBusy(null); }
  }

  async function deleteUser(target: UserSummary) {
    setActionError(null);
    setActionBusy(target.id);
    try {
      await api(`/users/${target.id}`, { method: "DELETE", mutation: true });
      users.reload();
      return true;
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Akun gagal dihapus.");
      return false;
    } finally { setActionBusy(null); }
  }

  return <>
    {actionError && <Notice tone="error">{actionError}</Notice>}
    <section className="user-workflow-banner"><span><ShieldCheck /></span><div><strong>Superadmin menetapkan akses final</strong><p>Pendaftar hanya mengajukan OPD. Periksa identitas PIC, kontak, dan jabatan sebelum menetapkan OPD serta peran.</p></div><button className="button secondary" onClick={() => { setStatusFilter("invited"); setPage(1); }}>Lihat antrean verifikasi</button></section>
    <div className="toolbar data-toolbar"><div className="table-filters"><form className="search-box" role="search" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(search); }}><Search aria-hidden /><input aria-label="Cari pengguna" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, email, atau username" /><button className="button secondary">Cari</button></form><select aria-label="Filter status pengguna" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="">Semua status</option><option value="invited">Menunggu verifikasi/undangan</option><option value="active">Aktif</option><option value="suspended">Ditangguhkan</option><option value="locked">Terkunci</option></select><select aria-label="Filter organisasi pengguna" value={organizationFilter} onChange={(event) => { setOrganizationFilter(event.target.value); setPage(1); }}><option value="">Semua organisasi</option>{references.data?.organizations.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.short_name ?? item.name}</option>)}</select><PageSizeControl value={pageSize} onChange={(size) => { setPageSize(size); setPage(1); }} /></div>{canCreate && <button className="button primary" onClick={() => setCreateOpen(true)}><Plus />Undang pengguna</button>}</div>
    {references.error && <Notice tone="error">Data organisasi dan peran belum dapat dimuat. Beberapa tindakan akun sementara tidak tersedia.</Notice>}
    <section className="panel table-panel">{users.loading ? <div className="panel-loading"><Spinner /></div> : users.error ? <ErrorState title="Daftar pengguna belum dapat dimuat" onRetry={users.reload}>{users.error}</ErrorState> : !users.data?.data.length ? <EmptyState title="Tidak ada akun pada filter ini">Hapus atau ubah filter untuk melihat akun lainnya.</EmptyState> : <><div className="user-mobile-list">{users.data.data.map((target) => { const pendingRegistration = target.status === "invited" && target.has_password && target.registration_status === "pending"; return <article className="user-mobile-card" key={target.id}><header><span className="avatar small">{target.full_name.split(/\s+/u).slice(0, 2).map((part) => part[0]).join("")}</span><span>{(pendingRegistration ? canAssign : canEdit) ? <RowLink label={`${pendingRegistration ? "Periksa pendaftaran" : "Kelola akun"} ${target.full_name}`} onOpen={() => (pendingRegistration ? setAssignUser(target) : setEditUser(target))}>{target.full_name}</RowLink> : <strong>{target.full_name}</strong>}<small>{target.job_title || target.email}</small>{target.job_title && <small>{target.email}</small>}</span><Badge tone={statusTone(target.status)}>{userStatusLabel(target)}</Badge></header><dl><div><dt>Organisasi</dt><dd>{target.organization_name ?? target.requested_organization_name ?? "Belum ditetapkan"}</dd></div><div><dt>Diperbarui</dt><dd>{formatDate(target.updated_at)}</dd></div><div><dt>Login terakhir</dt><dd>{formatDate(target.last_login_at)}</dd></div></dl>{(canAssign || canEdit || canActivate) && <footer>{pendingRegistration && canAssign ? <button className="button compact primary" onClick={() => setAssignUser(target)}><ShieldPlus />Periksa pendaftaran</button> : <button className="button compact secondary" onClick={() => setEditUser(target)}><Pencil />Kelola akun</button>}</footer>}</article>; })}</div><div className="table-scroll users-desktop-table"><table><thead><tr><SortableHeader label="Pengguna" column="name" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Organisasi" column="organization" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Status" column="status" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Didaftarkan" column="created_at" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Diperbarui" column="updated_at" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Login terakhir" column="last_login" sortBy={sortBy} direction={sortOrder} onSort={changeSort} />{(canAssign || canEdit || canActivate) && <th>Tindakan</th>}</tr></thead><tbody>{users.data.data.map((target) => { const pendingRegistration = target.status === "invited" && target.has_password && target.registration_status === "pending"; return <tr key={target.id}><td><div className="identity-cell"><span className="avatar small">{target.full_name.split(/\s+/u).slice(0, 2).map((part) => part[0]).join("")}</span><span><strong>{target.full_name}</strong><small>{target.job_title || target.email}</small>{target.job_title && <small>{target.email}</small>}</span></div></td><td><span className="cell-main">{target.organization_name ?? target.requested_organization_name ?? "-"}</span><small>{pendingRegistration ? "Diajukan-belum ditetapkan" : target.organization_code}</small></td><td><Badge tone={statusTone(target.status)}>{userStatusLabel(target)}</Badge></td><td>{formatDate(target.registration_created_at ?? target.created_at)}</td><td>{formatDate(target.updated_at)}</td><td>{formatDate(target.last_login_at)}</td>{(canAssign || canEdit || canActivate) && <td><div className="table-actions">{pendingRegistration && canAssign ? <button className="button compact primary" onClick={() => setAssignUser(target)}><ShieldPlus />Periksa pendaftaran</button> : <button className="button compact secondary" onClick={() => setEditUser(target)}><Pencil />Kelola akun</button>}</div></td>}</tr>; })}</tbody></table></div></>}
      {users.data && <Pagination page={users.data.meta.page} pageSize={users.data.meta.page_size} totalItems={users.data.meta.total_items} totalPages={users.data.meta.total_pages} sortLabel={`${({ updated_at: "Terakhir diperbarui", created_at: "Pendaftaran", name: "Nama", organization: "Organisasi", status: "Status", last_login: "Login terakhir" } as Record<string,string>)[sortBy] ?? "Terakhir diperbarui"} ${["updated_at", "created_at", "last_login"].includes(sortBy) ? (sortOrder === "desc" ? "terbaru" : "terlama") : (sortOrder === "asc" ? "menaik" : "menurun")}`} onChange={setPage} showPageSize={false} />}</section>
    {createOpen && references.data && <UserInvitationForm organizations={references.data.organizations} onClose={() => setCreateOpen(false)} onCreated={(created) => { setCreateOpen(false); setInvitation(created); users.reload(); }} />}
    {editUser && <EditUserForm user={editUser} canEdit={canEdit} canAssign={canAssign} canActivate={canActivate} isSelf={editUser.id === currentUser?.id} busy={actionBusy === editUser.id} onAssign={() => { setAssignUser(editUser); setEditUser(null); }} onStatus={(active) => { setConfirmation({ target: editUser, action: active ? "activate" : "deactivate" }); setEditUser(null); }} onDelete={() => { setConfirmation({ target: editUser, action: "delete" }); setEditUser(null); }} onClose={() => setEditUser(null)} onSaved={() => { setEditUser(null); users.reload(); }} />}
    {assignUser && references.data && <RoleAssignmentForm user={assignUser} roles={references.data.roles} organizations={references.data.organizations} onClose={() => setAssignUser(null)} onSaved={() => { setAssignUser(null); users.reload(); }} />}
    {invitation && <InvitationResult invitation={invitation} onClose={() => setInvitation(null)} />}
    {confirmation && <Modal title={confirmation.action === "delete" ? "Hapus akses akun?" : confirmation.action === "activate" ? "Aktifkan akun?" : "Nonaktifkan akun?"} onClose={() => setConfirmation(null)}><p className="modal-lead"><strong>{confirmation.target.full_name}</strong>{confirmation.action === "activate" ? " akan dapat kembali masuk dengan peran dan lingkup akses yang tersimpan." : confirmation.action === "deactivate" ? " akan langsung keluar dari semua sesi dan tidak dapat masuk sampai diaktifkan kembali." : " tidak dapat masuk lagi. Riwayat transaksi dan audit tetap disimpan untuk pertanggungjawaban."}</p>{confirmation.action === "delete" && <Notice tone="warning">Tindakan ini tidak dapat dibatalkan dari halaman ini. Gunakan nonaktifkan jika akses hanya perlu dihentikan sementara.</Notice>}<footer className="modal-actions"><button className="button secondary" onClick={() => setConfirmation(null)}>Batal</button><button className={confirmation.action === "delete" ? "button danger" : "button primary"} disabled={actionBusy === confirmation.target.id} onClick={() => { const current = confirmation; const task = current.action === "delete" ? deleteUser(current.target) : setUserActive(current.target, current.action === "activate"); void task.then((changed) => { if (changed) setConfirmation(null); }); }}>{confirmation.action === "delete" ? <Trash2 /> : confirmation.action === "activate" ? <Power /> : <PowerOff />}{confirmation.action === "delete" ? "Ya, hapus akun" : confirmation.action === "activate" ? "Ya, aktifkan" : "Ya, nonaktifkan"}</button></footer></Modal>}
  </>;
}

function EditUserForm({ user, canEdit, canAssign, canActivate, isSelf, busy: actionBusy, onAssign, onStatus, onDelete, onClose, onSaved }: {
  user: UserSummary; canEdit: boolean; canAssign: boolean; canActivate: boolean; isSelf: boolean; busy: boolean;
  onAssign(): void; onStatus(active: boolean): void; onDelete(): void; onClose(): void; onSaved(): void;
}) {
  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [username, setUsername] = useState(user.username ?? "");
  const [jobTitle, setJobTitle] = useState(user.job_title ?? "");
  const [contactPhone, setContactPhone] = useState(user.contact_phone ?? "");
  const [employeeId, setEmployeeId] = useState(user.employee_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasRegistration = user.registration_status !== null;
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await api(`/users/${user.id}`, { method: "PATCH", mutation: true, body: jsonBody({
        full_name: fullName, email, username: username || null,
        ...(hasRegistration ? { job_title: jobTitle || null, contact_phone: contactPhone || null, employee_id: employeeId || null } : {}),
      }) });
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Data pengguna gagal disimpan."); }
    finally { setBusy(false); }
  }
  return <Modal title={`Kelola akun - ${user.full_name}`} onClose={onClose} className="account-modal">
    {error && <Notice tone="error">{error}</Notice>}
    <div className="account-status-summary"><span>Status akun<Badge tone={statusTone(user.status)}>{userStatusLabel(user)}</Badge></span><span>Instansi<strong>{user.organization_name ?? "Belum ditetapkan"}</strong></span></div>
    {canEdit && <form className="account-edit-form" onSubmit={submit}>
      <section className="account-form-section"><div className="section-heading"><div><h3>Identitas akun</h3><p>Informasi yang digunakan pengguna untuk masuk dan dikenali dalam audit.</p></div></div><div className="form-grid"><label className="field"><span>Nama lengkap</span><input data-field="full_name" value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label><label className="field"><span>Email/login</span><input type="email" data-field="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label></div><label className="field"><span>Username <small>(opsional)</small></span><input data-field="username" value={username} onChange={(event) => setUsername(event.target.value)} pattern="[A-Za-z0-9._-]+" minLength={3} /></label></section>
      {hasRegistration && <fieldset className="registration-section"><legend>Identitas PIC instansi</legend><label className="field"><span>Jabatan</span><input data-field="job_title" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} /></label><div className="form-grid"><label className="field"><span>Nomor HP/WhatsApp</span><input data-field="contact_phone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} pattern="[0-9+(). -]*" /></label><label className="field"><span>NIP/NIK pegawai</span><input data-field="employee_id" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} /></label></div></fieldset>}
      <Notice tone="warning">Perubahan identitas pengguna dicatat dalam audit.</Notice>
      <div className="account-form-actions"><button type="button" className="button secondary" onClick={onClose}>Batal</button><button className="button primary" disabled={busy}>{busy ? <Spinner label="Menyimpan" /> : "Simpan perubahan"}</button></div>
    </form>}
    <section className="account-management-actions"><h3>Akses akun</h3><p>Kelola peran dan kemampuan login tanpa menghapus jejak audit.</p><div>{canAssign && <button type="button" className="button secondary" onClick={onAssign}><ShieldPlus />Atur peran dan OPD</button>}{canActivate && !isSelf && <button type="button" className="button secondary" disabled={actionBusy} onClick={() => onStatus(user.status !== "active")}>{user.status === "active" ? <PowerOff /> : <Power />}{user.status === "active" ? "Nonaktifkan akun" : "Aktifkan akun"}</button>}{canActivate && !isSelf && <button type="button" className="button danger" disabled={actionBusy} onClick={onDelete}><Trash2 />Hapus akun</button>}</div>{isSelf && <small>Akun yang sedang digunakan tidak dapat dinonaktifkan atau dihapus dari sini.</small>}</section>
    <footer className="modal-actions account-modal-close"><button type="button" className="button secondary" onClick={onClose}>Tutup</button></footer>
  </Modal>;
}

function UserInvitationForm({ organizations, onClose, onCreated }: { organizations: Organization[]; onClose(): void; onCreated(value: { name: string; token: string; expires: string }): void }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const response = await api<UserSummary & { invitation_token: string; invitation_expires_at: string }>("/users", { method: "POST", mutation: true, body: jsonBody({ email, username: username || null, full_name: name, organization_id: organizationId }) });
      onCreated({ name: response.full_name, token: response.invitation_token, expires: response.invitation_expires_at });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Undangan gagal dibuat."); }
    finally { setBusy(false); }
  }
  return <Modal title="Undang pengguna" onClose={onClose}>{error && <Notice tone="error">{error}</Notice>}<form className="form-stack" onSubmit={submit}><label className="field"><span>Nama lengkap</span><input data-field="name" value={name} onChange={(event) => setName(event.target.value)} required /></label><label className="field"><span>Email dinas</span><input type="email" data-field="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@kapuaskab.go.id" required /></label><label className="field"><span>Username opsional</span><input data-field="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label><label className="field"><span>Organisasi utama</span><select data-field="organization_id" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} required>{organizations.map((item) => <option value={item.id} key={item.id}>{item.code} - {item.name}</option>)}</select></label><Notice tone="warning">Pengguna belum dapat masuk sebelum menerima undangan, membuat password, dan memverifikasi Authenticator.</Notice><footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Batal</button><button className="button primary" disabled={busy || !organizationId}>{busy ? <Spinner label="Membuat" /> : "Buat undangan"}</button></footer></form></Modal>;
}

function InvitationResult({ invitation, onClose }: { invitation: { name: string; token: string; expires: string }; onClose(): void }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/activate?token=${encodeURIComponent(invitation.token)}`;
  async function copy() { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); }
  return <Modal title="Undangan berhasil dibuat" onClose={onClose}><div className="success-symbol"><Check /></div><p className="modal-lead">Sampaikan tautan berikut hanya kepada <strong>{invitation.name}</strong> melalui kanal internal yang aman.</p><div className="invite-link"><code>{link}</code><button onClick={copy}>{copied ? <Check /> : <Copy />}</button></div><Notice tone="warning">Tautan berlaku sampai {formatDate(invitation.expires)} dan hanya dapat digunakan satu kali.</Notice><footer className="modal-actions"><button className="button primary" onClick={copy}>{copied ? <Check /> : <Copy />}{copied ? "Tautan tersalin" : "Salin tautan"}</button><button className="button secondary" onClick={onClose}>Selesai</button></footer></Modal>;
}

function RoleAssignmentForm({ user, roles, organizations, onClose, onSaved }: { user: UserSummary; roles: Role[]; organizations: Organization[]; onClose(): void; onSaved(): void }) {
  const approvalMode = user.status === "invited" && user.has_password;
  const opdRole = roles.find((role) => role.code === "opd");
  const [roleId, setRoleId] = useState((approvalMode ? opdRole : roles.find((role) => role.code !== "superadmin"))?.id ?? roles[0]?.id ?? "");
  const selectedRole = roles.find((role) => role.id === roleId);
  const allowedScopes = approvalMode ? (["organization"] as const) : selectedRole ? roleScopeRules[selectedRole.code] ?? [] : [];
  const [scope, setScope] = useState<RoleScope>(allowedScopes[0] ?? "organization");
  const [organizationId, setOrganizationId] = useState(user.requested_organization_id ?? user.organization_id ?? organizations[0]?.id ?? "");
  const selectedOrganization = organizations.find((organization) => organization.id === organizationId);
  const automaticRoles = selectedOrganization?.code === "BAPPERIDA"
    ? ["Admin/PIC OPD BAPPERIDA", "Verifikator BAPPERIDA"]
    : selectedOrganization?.code === "DISKOMINFOSANTIK"
      ? ["Admin/PIC OPD Diskominfosantik", "Walidata Diskominfosantik"]
      : selectedOrganization?.code === "BPS_KAPUAS"
        ? ["PIC data BPS Kabupaten Kapuas", "Pembina Data Statistik (BPS)"]
      : ["Admin/PIC OPD"];
  const [approvalNotes, setApprovalNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      if (approvalMode) {
        if (!opdRole || !organizationId) throw new Error("Instansi final dan paket peran PIC belum tersedia.");
        await api(`/users/${user.id}/approve-registration`, { method: "POST", mutation: true, body: jsonBody({ role_id: opdRole.id, scope_type: "organization", organization_id: organizationId, approval_notes: approvalNotes || null }) });
      } else {
        if (!selectedRole || !allowedScopes.includes(scope)) throw new Error("Role tersebut belum memiliki aturan scope yang sah.");
        await api(`/users/${user.id}/role-assignments`, { method: "POST", mutation: true, body: jsonBody({ role_id: roleId, scope_type: scope, organization_id: scope === "organization" ? organizationId : null }) });
      }
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Peran gagal ditetapkan."); }
    finally { setBusy(false); }
  }
  async function reject() {
    if (!approvalMode || approvalNotes.trim().length < 5) { setError("Tulis alasan penolakan minimal 5 karakter agar keputusan dapat ditindaklanjuti."); return; }
    setBusy(true); setError(null);
    try {
      await api(`/users/${user.id}/reject-registration`, { method: "POST", mutation: true, body: jsonBody({ notes: approvalNotes.trim() }) });
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Pendaftaran gagal ditolak."); }
    finally { setBusy(false); }
  }
  return <Modal title={`${approvalMode ? "Periksa pendaftaran" : "Tetapkan peran"} - ${user.full_name}`} onClose={onClose}>
    {error && <Notice tone="error">{error}</Notice>}
    <form className="form-stack" onSubmit={submit}>
      {approvalMode && <section className="registration-review"><h3>Identitas yang diajukan</h3><div><span>Jabatan<strong>{user.job_title ?? "Belum dilengkapi"}</strong></span><span>Kontak<strong>{user.contact_phone ?? "-"}</strong></span><span>NIP/NIK pegawai<strong>{user.employee_id ?? "Tidak dicantumkan"}</strong></span><span>Instansi yang diklaim<strong>{user.requested_organization_name ?? user.organization_name ?? "-"}</strong></span></div>{user.request_note && <p><strong>Keterangan:</strong> {user.request_note}</p>}</section>}
      {approvalMode ? <>
        <label className="field"><span>Instansi final</span><select data-field="organization_id" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{organizations.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select><small>Boleh berbeda dari instansi yang diklaim jika hasil verifikasi menunjukkan penugasan lain.</small></label>
        <section className="registration-review"><h3>Akses yang diberikan otomatis</h3><div>{automaticRoles.map((label) => <span key={label}>Peran<strong>{label}</strong></span>)}</div><p>Satu akun PIC dapat menjalankan tugas instansi dan tugas khususnya tanpa login terpisah.</p></section>
      </> : <>
        <label className="field"><span>Peran final</span><select data-field="role_id" value={roleId} onChange={(event) => { const nextRoleId = event.target.value; const nextRole = roles.find((role) => role.id === nextRoleId); setRoleId(nextRoleId); setScope(roleScopeRules[nextRole?.code ?? ""]?.[0] ?? "organization"); }}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
        <label className="field"><span>Lingkup akses</span><select data-field="scope" value={scope} onChange={(event) => setScope(event.target.value as RoleScope)}>{allowedScopes.map((item) => <option value={item} key={item}>{item === "organization" ? "Satu OPD" : item === "published" ? "Data terpublikasi" : item === "global" ? "Seluruh Kabupaten Kapuas" : "Data sendiri"}</option>)}</select></label>
        {scope === "organization" && <label className="field"><span>OPD</span><select data-field="organization_id" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{organizations.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></label>}
      </>}
      {approvalMode && <label className="field"><span>Catatan keputusan <small>(wajib jika ditolak)</small></span><textarea rows={3} data-field="approval_notes" value={approvalNotes} onChange={(event) => setApprovalNotes(event.target.value)} placeholder="Contoh: surat tugas belum dapat diverifikasi; silakan daftar ulang setelah diperbaiki." /></label>}
      {!approvalMode && !allowedScopes.length && <Notice tone="error">Peran ini belum memiliki kebijakan lingkup yang sah.</Notice>}
      <Notice tone="warning">{approvalMode ? "Sistem menerapkan satu PIC per instansi dan memberikan paket peran sesuai OPD secara otomatis. Keputusan tersimpan dalam audit." : "Penetapan peran mengubah kewenangan pengguna dan dicatat dalam audit."}</Notice>
      <footer className="modal-actions">{approvalMode && <button type="button" className="button danger" disabled={busy} onClick={() => void reject()}><XCircle />Tolak pendaftaran</button>}<button type="button" className="button secondary" onClick={onClose}>Batal</button><button className="button primary" disabled={busy || (approvalMode ? !organizationId || !opdRole : !allowedScopes.length || (scope === "organization" && !organizationId))}><KeyRound />{busy ? "Menyimpan…" : approvalMode ? "Setujui dan aktifkan akun" : "Tetapkan peran"}</button></footer>
    </form>
  </Modal>;
}
