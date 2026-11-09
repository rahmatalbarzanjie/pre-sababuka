import { Menu, RotateCcw, Save, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, jsonBody } from "../api";
import { useAuth } from "../auth";
import { Badge, EmptyState, ErrorState, Modal, Notice, Spinner, useAsync } from "../components";
import type { AdminMenuItem, Permission, Role } from "../types";

function riskTone(risk: Permission["risk_level"]): "neutral" | "warning" | "danger" {
  if (risk === "critical") return "danger";
  if (risk === "elevated") return "warning";
  return "neutral";
}

export function RolesPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes("role.manage") ?? false;
  const result = useAsync(() => Promise.all([
    api<{ data: Role[] }>("/roles"),
    api<{ data: Permission[] }>("/permissions"),
  ]).then(([roles, permissions]) => ({ roles: roles.data, permissions: permissions.data })), []);
  const [roleId, setRoleId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const currentRole = result.data?.roles.find((role) => role.id === roleId) ?? result.data?.roles[0];
  useEffect(() => {
    if (result.data && !roleId) setRoleId(result.data.roles[0]?.id ?? "");
  }, [result.data, roleId]);
  useEffect(() => {
    if (!currentRole || !result.data) return;
    const ids = result.data.permissions.filter((permission) => currentRole.permissions.includes(permission.code)).map((permission) => permission.id);
    setSelected(new Set(ids));
    setMessage(null);
  }, [currentRole?.id, result.data]);
  const groups = useMemo(() => {
    const grouped = new Map<string, Permission[]>();
    for (const permission of (result.data?.permissions ?? []).filter((item) => !search || `${item.name} ${item.code}`.toLowerCase().includes(search.toLowerCase()))) {
      const key = permission.code.split(".", 1)[0] ?? "other";
      grouped.set(key, [...(grouped.get(key) ?? []), permission]);
    }
    return [...grouped.entries()];
  }, [result.data, search]);
  const original = new Set(result.data?.permissions.filter((permission) => currentRole?.permissions.includes(permission.code)).map((permission) => permission.id) ?? []);
  const added = [...selected].filter((id) => !original.has(id));
  const removed = [...original].filter((id) => !selected.has(id));
  const changed = added.length + removed.length;
  async function save() {
    if (!currentRole || !reason.trim()) return;
    setBusy(true); setMessage(null);
    try {
      await api(`/roles/${currentRole.id}/permissions`, { method: "PUT", mutation: true, body: jsonBody({ permission_ids: [...selected], reason: reason.trim() }) });
      setMessage({ tone: "success", text: "Hak akses peran berhasil diperbarui." });
      setConfirmOpen(false); setReason("");
      result.reload();
    } catch (reason) { setMessage({ tone: "error", text: reason instanceof Error ? reason.message : "Hak akses gagal disimpan." }); }
    finally { setBusy(false); }
  }
  if (result.loading) return <div className="panel-loading"><Spinner /></div>;
  if (result.error || !result.data) return <ErrorState title="Peran belum dapat dimuat" onRetry={result.reload}>{result.error?.message ?? "Periksa koneksi lalu coba lagi."}</ErrorState>;
  return <div className="access-layout access-layout-unified">
    <section className="panel permission-panel role-access-config"><header className="panel-heading menu-config-heading"><div><span className="eyebrow">Kewenangan pengguna</span><h2>Hak akses per peran</h2><p>Pilih peran, tentukan tindakan yang diizinkan, lalu simpan perubahan.</p></div><div className="menu-role-actions"><label className="field"><span>Peran yang diatur</span><select aria-label="Pilih peran untuk mengatur hak akses" data-field="role_id" value={roleId} onChange={(event) => setRoleId(event.target.value)}>{result.data.roles.map((role) => <option key={role.id} value={role.id}>{role.code === "superadmin" ? "Pengelola Sistem" : role.name}</option>)}</select></label>{canManage && <button className="button primary" disabled={busy || !changed} onClick={() => setConfirmOpen(true)}><Save />{changed ? `Simpan ${changed} perubahan` : "Tidak ada perubahan"}</button>}</div></header>{message && <Notice tone={message.tone}>{message.text}</Notice>}{!canManage && <Notice tone="warning">Hak akses hanya dapat diubah oleh Pengelola Sistem.</Notice>}<div className="selected-role-summary"><span><small>Peran aktif</small><strong>{currentRole?.code === "superadmin" ? "Pengelola Sistem" : currentRole?.name}</strong></span><span><small>Hak akses diberikan</small><strong>{selected.size}</strong></span>{currentRole?.is_system && <Badge tone="info">Peran bawaan sistem</Badge>}</div><div className="permission-toolbar"><label className="search-field"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari hak akses" aria-label="Cari hak akses" /></label><label className="inline-check"><input type="checkbox" checked={advanced} onChange={(event) => setAdvanced(event.target.checked)} />Tampilkan informasi teknis</label>{changed > 0 && <button className="button secondary" onClick={() => setSelected(new Set(original))}><RotateCcw />Batalkan perubahan</button>}</div>{changed > 0 && <Notice tone="warning">{added.length} ditambahkan dan {removed.length} dicabut. Simpan untuk menerapkan perubahan.</Notice>}<div className="permission-groups">{groups.map(([group, permissions]) => <section key={group}><header><strong>{permissionGroupLabel(group)}</strong><span>{permissions.filter((permission) => selected.has(permission.id)).length}/{permissions.length} aktif</span></header><div>{permissions.map((permission) => <label className="permission-row" key={permission.id}><input type="checkbox" disabled={!canManage || currentRole?.code === "superadmin"} checked={selected.has(permission.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(permission.id)) next.delete(permission.id); else next.add(permission.id); return next; })} /><span><strong>{permission.name}</strong>{advanced && <code>{permission.code}</code>}</span>{advanced && <Badge tone={riskTone(permission.risk_level)}>{riskLabel(permission.risk_level)}</Badge>}</label>)}</div></section>)}</div></section>
    {confirmOpen && <Modal title="Konfirmasi perubahan hak akses" onClose={() => setConfirmOpen(false)}><p className="modal-lead">Anda akan mengubah <strong>{changed} hak akses</strong> untuk peran <strong>{currentRole?.code === "superadmin" ? "Pengelola Sistem" : currentRole?.name}</strong>.</p><div className="change-summary"><span><strong>{added.length}</strong> ditambahkan</span><span><strong>{removed.length}</strong> dicabut</span></div><label className="field"><span>Alasan perubahan</span><textarea rows={3} data-field="reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Contoh: penyesuaian kewenangan Walidata sesuai keputusan rapat" required /></label><Notice tone="warning">Perubahan dapat memengaruhi menu dan tindakan yang dapat dilakukan seluruh pengguna dengan peran ini.</Notice><footer className="modal-actions"><button className="button secondary" onClick={() => setConfirmOpen(false)}>Batal</button><button className="button primary" disabled={busy || !reason.trim()} onClick={() => void save()}><Save />{busy ? "Menyimpan…" : "Terapkan perubahan"}</button></footer></Modal>}
  </div>;
}

function permissionGroupLabel(group: string) {
  const labels: Record<string, string> = { system: "Konfigurasi sistem", organization: "Organisasi", user: "Pengguna", role: "Peran", menu: "Navigasi", policy_focus: "Fokus pembangunan", category: "Kelompok isu", indicator: "Indikator", dataset: "Data dan metadata", metadata_profile: "Profil metadata", submission: "Pelaporan capaian", publication: "Publikasi", executive_dashboard: "Dashboard pimpinan", assistant: "Asisten Data", audit: "Audit", connector: "Integrasi dan Walidata" };
  return labels[group] ?? group.replaceAll("_", " ");
}
function riskLabel(risk: Permission["risk_level"]) { return risk === "critical" ? "Kritis" : risk === "elevated" ? "Tinggi" : "Normal"; }

export function MenusPage() {
  const result = useAsync(() => Promise.all([
    api<{ data: Role[] }>("/roles"),
    api<{ data: AdminMenuItem[] }>("/menus"),
  ]).then(([roles, menus]) => ({ roles: roles.data, menus: menus.data })), []);
  const [roleId, setRoleId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  useEffect(() => { if (result.data && !roleId) setRoleId(result.data.roles[0]?.id ?? ""); }, [result.data, roleId]);
  useEffect(() => {
    if (!roleId) return;
    let active = true;
    setSelectionLoading(true);
    api<{ menu_ids: string[] }>(`/roles/${roleId}/menus`).then((response) => {
      if (active) setSelected(new Set(response.menu_ids));
    }).catch((reason: unknown) => {
      if (active) setMessage({ tone: "error", text: reason instanceof Error ? reason.message : "Konfigurasi menu tidak dapat dimuat." });
    }).finally(() => { if (active) setSelectionLoading(false); });
    return () => { active = false; };
  }, [roleId]);
  const roots = useMemo(() => result.data?.menus.filter((item) => !item.parent_id) ?? [], [result.data]);
  async function save() {
    if (!roleId) return;
    setBusy(true); setMessage(null);
    try {
      await api(`/roles/${roleId}/menus`, { method: "PUT", mutation: true, body: jsonBody({ menu_ids: [...selected] }) });
      setMessage({ tone: "success", text: "Susunan menu peran berhasil disimpan." });
    } catch (reason) { setMessage({ tone: "error", text: reason instanceof Error ? reason.message : "Menu gagal disimpan." }); }
    finally { setBusy(false); }
  }
  if (result.loading) return <div className="panel-loading"><Spinner /></div>;
  if (result.error || !result.data) return <ErrorState title="Pengaturan menu belum dapat dimuat" onRetry={result.reload}>{result.error?.message ?? "Periksa koneksi lalu coba lagi."}</ErrorState>;
  return <section className="panel menu-config"><header className="panel-heading menu-config-heading"><div><span className="eyebrow">Visibilitas navigasi</span><h2>Menu per peran</h2><p>Pilih peran dan tentukan menu yang boleh digunakan.</p></div><div className="menu-role-actions"><label className="field"><span>Peran yang diatur</span><select aria-label="Pilih peran" data-field="role_id" value={roleId} onChange={(event) => { setRoleId(event.target.value); setSelected(new Set()); setMessage(null); }}>{result.data.roles.map((role) => <option value={role.id} key={role.id}>{role.code === "superadmin" ? "Pengelola Sistem" : role.name}</option>)}</select></label><button className="button primary" onClick={save} disabled={busy || selectionLoading}><Save />{busy ? "Menyimpan…" : selectionLoading ? "Memuat…" : "Simpan perubahan menu"}</button></div></header>{message && <Notice tone={message.tone}>{message.text}</Notice>}<Notice tone="warning">Menu inti Pengelola Sistem selalu aktif untuk menjaga akses administrasi.</Notice><div className="menu-tree">{selectionLoading ? <div className="panel-loading"><Spinner label="Memuat menu peran" /></div> : roots.length ? roots.map((root) => { const children = result.data!.menus.filter((item) => item.parent_id === root.id); return <section key={root.id}><label className="menu-root"><span className="menu-node-icon"><Menu /></span><span><strong>{root.label}</strong><small>{root.route_name ?? "Kelompok menu"}</small></span><input type="checkbox" checked={selected.has(root.id)} onChange={() => setSelected((current) => toggle(current, root.id))} /></label>{children.map((child) => <label className="menu-child" key={child.id}><span className="tree-line" /><span><strong>{child.label}</strong>{child.required_permission && <small>{child.required_permission}</small>}</span><input type="checkbox" checked={selected.has(child.id)} onChange={() => setSelected((current) => toggle(current, child.id))} /></label>)}</section>; }) : <EmptyState title="Menu belum tersedia">Konfigurasi menu belum tersedia.</EmptyState>}</div></section>;
}

function toggle(values: Set<string>, id: string): Set<string> {
  const next = new Set(values);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}
