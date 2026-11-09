import { Check, Copy, Eye, Flag, Image as ImageIcon, KeyRound, Megaphone, Plus, Save, Settings2, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, jsonBody } from "../api";
import { useAuth } from "../auth";
import { Badge, ErrorState, formatDate, Modal, Notice, Spinner, useAsync } from "../components";
import type { FeatureFlag, LoginAnnouncement, SystemSetting } from "../types";

interface Configuration {
  settings: SystemSetting[];
  feature_flags: FeatureFlag[];
}

interface BpsSecretStatus {
  source_code: string;
  configured: boolean;
  storage: string;
  masked: string | null;
  master_key_configured: boolean;
  last_tested_at: string | null;
  last_test_status: string;
  last_test_error: string | null;
  domain_code: string;
}

function featureImpact(flag: FeatureFlag): string {
  const impacts: Record<string, string> = {
    executive_dashboard: "Menampilkan ruang analisis dan ringkasan untuk pimpinan.",
    assistant: "Menampilkan Asisten Data bagi peran yang memiliki izin.",
    connector: "Mengaktifkan integrasi, mapping, preview, dan sinkronisasi Walidata.",
    publication: "Mengaktifkan proses kurasi dan penayangan data ke pimpinan.",
  };
  return impacts[flag.code] ?? "Perubahan berlaku pada menu atau proses yang terkait dengan fitur ini.";
}

interface BpsCheck { checked_at: string; reachable: boolean; response_ms: number | null; error_text: string | null; }
interface BpsSaveResult { profile: { reachable: boolean; error: string | null } }

export function SystemPage() {
  const { user } = useAuth();
  const result = useAsync(() => api<Configuration>("/system/configuration"), []);
  const isSuperadmin = user?.roles.some((role) => role.code === "superadmin") ?? false;
  const bps = useAsync<BpsSecretStatus | null>(() => isSuperadmin ? api<BpsSecretStatus>("/connectors/bps/secret") : Promise.resolve(null), [isSuperadmin]);
  const bpsChecks = useAsync<{ data: BpsCheck[] } | null>(() => isSuperadmin ? api<{ data: BpsCheck[] }>("/connectors/bps/checks") : Promise.resolve(null), [isSuperadmin]);
  const [settingOpen, setSettingOpen] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [bpsKey, setBpsKey] = useState("");
  const [bpsEditing, setBpsEditing] = useState(false);
  const [bpsBusy, setBpsBusy] = useState(false);
  const [bpsFeedback, setBpsFeedback] = useState<{ tone: "error" | "success" | "warning"; text: string } | null>(null);
  async function toggleFlag(flag: FeatureFlag) {
    setBusyCode(flag.code); setMessage(null);
    try {
      await api(`/system/feature-flags/${flag.code}`, { method: "PUT", mutation: true, body: jsonBody({ is_enabled: !flag.is_enabled, configuration: flag.configuration }) });
      setMessage({ tone: "success", text: `${flag.name} berhasil ${flag.is_enabled ? "dinonaktifkan" : "diaktifkan"}.` });
      result.reload();
    } catch (reason) { setMessage({ tone: "error", text: reason instanceof Error ? reason.message : "Kendali fitur gagal diperbarui." }); }
    finally { setBusyCode(null); }
  }
  async function saveBpsKey() {
    setBpsBusy(true); setMessage(null); setBpsFeedback(null);
    try {
      const saved = await api<BpsSaveResult>("/connectors/bps/secret", { method: "PUT", mutation: true, body: jsonBody({ api_key: bpsKey }) });
      setBpsKey(""); setBpsEditing(false); bps.reload(); bpsChecks.reload();
      setBpsFeedback(saved.profile.reachable
        ? { tone: "success", text: "API key BPS tersimpan terenkripsi dan koneksi berhasil diuji." }
        : { tone: "warning", text: `API key tersimpan terenkripsi, tetapi uji koneksi gagal: ${saved.profile.error ?? "penyebab tidak diketahui"} Anda tidak perlu memasukkan ulang; perbaiki key lalu pilih Ganti key, atau coba Uji koneksi lagi.` });
    } catch (reason) { setBpsFeedback({ tone: "error", text: reason instanceof Error ? reason.message : "API key BPS gagal disimpan." }); }
    finally { setBpsBusy(false); }
  }
  async function testBps() {
    setBpsBusy(true); setMessage(null); setBpsFeedback(null);
    try {
      const tested = await api<BpsSaveResult["profile"]>("/connectors/BPS_KAPUAS/test", { method: "POST", mutation: true });
      bps.reload(); bpsChecks.reload();
      setBpsFeedback(tested.reachable ? { tone: "success", text: "Koneksi BPS berhasil diuji." } : { tone: "error", text: `Koneksi BPS gagal: ${tested.error ?? "penyebab tidak diketahui"}` });
    }
    catch (reason) { setBpsFeedback({ tone: "error", text: reason instanceof Error ? reason.message : "Uji koneksi BPS gagal." }); }
    finally { setBpsBusy(false); }
  }
  async function removeBpsKey() {
    setBpsBusy(true); setMessage(null); setBpsFeedback(null);
    try { await api("/connectors/bps/secret", { method: "DELETE", mutation: true }); bps.reload(); setBpsFeedback({ tone: "success", text: "API key BPS dihapus dari penyimpanan terenkripsi." }); }
    catch (reason) { setBpsFeedback({ tone: "error", text: reason instanceof Error ? reason.message : "API key BPS gagal dihapus." }); }
    finally { setBpsBusy(false); }
  }
  if (result.loading) return <div className="panel-loading"><Spinner /></div>;
  if (result.error || !result.data) return <ErrorState title="Konfigurasi sistem belum dapat dimuat" onRetry={result.reload}>{result.error?.message ?? "Periksa koneksi lalu coba lagi."}</ErrorState>;
  return <div className="settings-layout">{message && <Notice tone={message.tone}>{message.text}</Notice>}{bpsFeedback && <div className="bps-feedback-toast" role="status" aria-live="polite"><Notice tone={bpsFeedback.tone}>{bpsFeedback.text}</Notice></div>}
    <section className="panel feature-settings"><header className="panel-heading"><div><span className="eyebrow">Kendali fitur</span><h2>Aktif/nonaktifkan modul</h2><p>Atur modul yang tersedia bagi pengguna.</p></div><Flag /></header><div className="flag-list">{result.data.feature_flags.map((flag) => <div key={flag.code}><span className={`flag-icon ${flag.is_enabled ? "on" : ""}`}><Flag /></span><span><strong>{flag.name}</strong><small>{flag.description || featureImpact(flag)}</small></span><span className="flag-state"><Badge tone={flag.is_enabled ? "success" : "neutral"}>{flag.is_enabled ? "Aktif" : "Nonaktif"}</Badge><label className="switch"><input aria-label={`Aktifkan ${flag.name}`} type="checkbox" checked={flag.is_enabled} disabled={busyCode === flag.code} onChange={() => toggleFlag(flag)} /><i /></label></span></div>)}</div></section>
    {isSuperadmin && <AnnouncementSettings key={result.data.settings.find((item) => item.key === "dashboard.login_announcement")?.updated_at ?? "new"} setting={result.data.settings.find((item) => item.key === "dashboard.login_announcement")} onSaved={result.reload} />}
    <section className="panel advanced-settings"><header className="panel-heading"><div><span className="eyebrow">Pengaturan lanjutan</span><h2>Parameter nonrahasia</h2><p>Untuk nilai perilaku aplikasi seperti interval penyegaran, batas tampilan, atau mode bawaan. Password, token, dan API key disimpan pada bagian Secret Konektor-bukan di sini.</p></div><button className="button secondary" onClick={() => setSettingOpen(true)}><Plus />Tambah parameter</button></header>{result.data.settings.length ? <div className="setting-list">{result.data.settings.map((setting) => <div key={setting.key}><span className="setting-icon"><Settings2 /></span><span><strong>{setting.description || setting.key}</strong><small>Kode: {setting.key}</small></span><code>{JSON.stringify(setting.value)}</code><small>{formatDate(setting.updated_at)}</small></div>)}</div> : <div className="empty-inline"><strong>Tidak ada parameter khusus.</strong><span>Aplikasi sedang memakai nilai bawaan yang aman; bagian ini boleh dibiarkan kosong.</span></div>}</section>
    {isSuperadmin && <section className="panel"><header className="panel-heading"><div><span className="eyebrow">Secret konektor</span><h2>API BPS Kabupaten Kapuas</h2><p>Hanya Developer yang dapat melihat status atau mengubah API key. Nilai key tidak pernah ditampilkan.</p></div><KeyRound /></header>{bps.loading ? <div className="panel-loading"><Spinner label="Memuat status API BPS" /></div> : bps.data && <div className="secret-panel"><div className="detail-grid"><div><span>Status</span><strong>{bps.data.configured ? "Terkonfigurasi" : "Belum dikonfigurasi"}</strong></div><div><span>Penyimpanan</span><strong>{bps.data.storage === "encrypted_database" ? "Terenkripsi" : bps.data.storage === "environment_compatibility" ? "Environment lama" : "-"}</strong></div><div><span>Wilayah</span><strong>{bps.data.domain_code}</strong></div><div><span>Uji terakhir</span><strong>{bps.data.last_tested_at ? formatDate(bps.data.last_tested_at) : "Belum pernah"}</strong></div></div>{bps.data.masked && <p className="muted-text">Key tersimpan sebagai {bps.data.masked}.</p>}{!bps.data.master_key_configured && <Notice tone="warning">Master key konektor belum diatur. Simpan key baru akan ditolak sampai CONNECTOR_ENCRYPTION_KEY tersedia.</Notice>}{bps.data.last_test_error && <Notice tone="error">Uji terakhir: {bps.data.last_test_error}</Notice>}{Boolean(bpsChecks.data?.data.length) && <div className="table-scroll" aria-label="Riwayat uji koneksi BPS"><table><thead><tr><th>Waktu</th><th>Hasil</th><th>Respons</th><th>Catatan</th></tr></thead><tbody>{bpsChecks.data!.data.map((check) => <tr key={check.checked_at}><td>{formatDate(check.checked_at)}</td><td><Badge tone={check.reachable ? "success" : "danger"}>{check.reachable ? "Terhubung" : "Gagal"}</Badge></td><td>{check.response_ms === null ? "-" : `${check.response_ms} ms`}</td><td>{check.error_text ?? "-"}</td></tr>)}</tbody></table></div>}{bpsEditing ? <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void saveBpsKey(); }}><label className="field"><span>API key BPS</span><input type="password" data-field="api_key" value={bpsKey} onChange={(event) => setBpsKey(event.target.value)} autoComplete="new-password" minLength={8} maxLength={512} required placeholder="Tempel API key BPS" /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => { setBpsEditing(false); setBpsKey(""); }} disabled={bpsBusy}>Batal</button><button className="button primary" disabled={bpsBusy}>{bpsBusy ? "Menguji…" : "Simpan & Uji Koneksi"}</button></div></form> : <div className="modal-actions"><button className="button primary" onClick={() => setBpsEditing(true)} disabled={bpsBusy}>{bps.data.configured ? "Ganti key" : "Masukkan key"}</button><button className="button secondary" onClick={() => void testBps()} disabled={bpsBusy || !bps.data.configured}>Uji koneksi</button>{bps.data.configured && <button className="button danger" onClick={() => void removeBpsKey()} disabled={bpsBusy}>Nonaktifkan / Hapus key</button>}</div>}</div>}</section>}
    {settingOpen && <SettingForm onClose={() => setSettingOpen(false)} onSaved={() => { setSettingOpen(false); result.reload(); }} />}
  </div>;
}

function announcementValue(setting?: SystemSetting): LoginAnnouncement {
  const value = setting?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { enabled: false, title: "", message: "", image_url: "", action_label: "", action_url: "" };
  const raw = value as Record<string, unknown>;
  const field = (key: string) => typeof raw[key] === "string" ? raw[key] as string : "";
  return { enabled: raw.enabled === true, title: field("title"), message: field("message"), image_url: field("image_url"), action_label: field("action_label"), action_url: field("action_url") };
}

function AnnouncementSettings({ setting, onSaved }: { setting?: SystemSetting; onSaved(): void }) {
  const [form, setForm] = useState<LoginAnnouncement>(() => announcementValue(setting));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const update = (key: keyof LoginAnnouncement, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const canPreview = Boolean(form.title?.trim() && form.message?.trim());
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setFeedback(null);
    try {
      await api("/system/settings/dashboard.login_announcement", { method: "PUT", mutation: true, body: jsonBody({ value: { enabled: form.enabled, title: form.title?.trim(), message: form.message?.trim(), image_url: form.image_url?.trim() || null, action_label: form.action_label?.trim() || null, action_url: form.action_url?.trim() || null }, description: "Pemberitahuan yang tampil sekali setelah pengguna login." }) });
      setFeedback({ tone: "success", text: "Pengaturan pemberitahuan berhasil disimpan." });
      onSaved();
    } catch (reason) { setFeedback({ tone: "error", text: reason instanceof Error ? reason.message : "Pemberitahuan gagal disimpan." }); }
    finally { setBusy(false); }
  }
  return <section className="panel announcement-settings"><header className="panel-heading"><div><span className="eyebrow">Pemberitahuan setelah login</span><h2>Popup dashboard pengguna</h2><p>Tampilkan satu kali setelah login baru. Isi dan gambar dapat diperiksa melalui pratinjau sebelum diaktifkan.</p></div><Megaphone /></header>
    <form className="announcement-form" onSubmit={save}>{feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}<label className="announcement-toggle"><span><strong>Aktifkan popup</strong><small>Jika nonaktif, pengguna tidak akan melihat pemberitahuan setelah login.</small></span><span className="flag-state"><Badge tone={form.enabled ? "success" : "neutral"}>{form.enabled ? "Aktif" : "Nonaktif"}</Badge><span className="switch"><input aria-label="Aktifkan popup setelah login" type="checkbox" checked={form.enabled} onChange={(event) => update("enabled", event.target.checked)} /><i /></span></span></label><div className="form-grid two"><label className="field"><span>Judul</span><input data-field="title" value={form.title ?? ""} onChange={(event) => update("title", event.target.value)} maxLength={120} required placeholder="Informasi penting" /></label><label className="field"><span>URL gambar (opsional)</span><span className="input-with-icon"><ImageIcon /><input data-field="image_url" value={form.image_url ?? ""} onChange={(event) => update("image_url", event.target.value)} placeholder="https://... atau /gambar.jpg" /></span></label></div><label className="field"><span>Isi pemberitahuan</span><textarea data-field="message" value={form.message ?? ""} onChange={(event) => update("message", event.target.value)} maxLength={2000} rows={5} required placeholder="Tuliskan informasi singkat dan jelas." /></label><div className="form-grid two"><label className="field"><span>Label tombol (opsional)</span><input data-field="action_label" value={form.action_label ?? ""} onChange={(event) => update("action_label", event.target.value)} maxLength={80} placeholder="Lihat selengkapnya" /></label><label className="field"><span>URL tombol (opsional)</span><input data-field="action_url" value={form.action_url ?? ""} onChange={(event) => update("action_url", event.target.value)} placeholder="https://... atau /halaman" /></label></div><footer className="modal-actions"><button type="button" className="button secondary" disabled={!canPreview} onClick={() => setPreviewOpen(true)}><Eye />Pratinjau</button><button className="button primary" disabled={busy || !canPreview}><Save />{busy ? "Menyimpan..." : "Simpan pengaturan"}</button></footer></form>
    {previewOpen && <Modal title={form.title || "Pratinjau pemberitahuan"} onClose={() => setPreviewOpen(false)}><article className="login-announcement preview"><span className="announcement-icon"><Megaphone /></span>{form.image_url && <img src={form.image_url} alt="Pratinjau gambar pemberitahuan" />}<p>{form.message}</p><footer className="modal-actions">{form.action_url && <span className="button secondary">{form.action_label || "Buka informasi"}</span>}<button type="button" className="button primary" onClick={() => setPreviewOpen(false)}>Tutup pratinjau</button></footer></article></Modal>}
  </section>;
}

function SettingForm({ onClose, onSaved }: { onClose(): void; onSaved(): void }) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      let parsed: unknown;
      try { parsed = JSON.parse(value); } catch { parsed = value; }
      await api(`/system/settings/${key}`, { method: "PUT", mutation: true, body: jsonBody({ value: parsed, description: description || null }) });
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Pengaturan gagal disimpan."); }
    finally { setBusy(false); }
  }
  return <Modal title="Tambah pengaturan" onClose={onClose}>{error && <Notice tone="error">{error}</Notice>}<form className="form-stack" onSubmit={submit}><label className="field"><span>Kunci</span><input data-field="key" value={key} onChange={(event) => setKey(event.target.value.toLowerCase())} pattern="[a-z][a-z0-9._-]*" placeholder="dashboard.refresh_seconds" required /></label><label className="field"><span>Nilai</span><textarea data-field="value" value={value} onChange={(event) => setValue(event.target.value)} placeholder='300 atau {"mode":"internal"}' required /></label><label className="field"><span>Keterangan</span><textarea data-field="description" value={description} onChange={(event) => setDescription(event.target.value)} /></label><Notice tone="warning">Jangan memasukkan password, token, API key, atau rahasia lain.</Notice><footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Batal</button><button className="button primary" disabled={busy}><Save />{busy ? "Menyimpan…" : "Simpan pengaturan"}</button></footer></form></Modal>;
}

export function SecurityPage() {
  const { user, refresh } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; provisioning_uri: string; issuer: string; account: string } | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  async function start() {
    setBusy(true); setError(null);
    try {
      setSetup(await api<{ secret: string; provisioning_uri: string; issuer: string; account: string }>(
        "/me/mfa/totp/setup",
        { method: "POST", mutation: true },
      ));
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Enrollment MFA gagal."); }
    finally { setBusy(false); }
  }
  async function confirm(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const response = await api<{ recovery_codes: string[] }>("/me/mfa/totp/confirm", { method: "POST", mutation: true, body: jsonBody({ mfa_code: code }) });
      setRecovery(response.recovery_codes); setSetup(null); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Kode Authenticator tidak valid."); }
    finally { setBusy(false); }
  }
  async function copy(value: string) { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1600); }
  return <section className="security-grid"><article className="panel security-overview"><span className={`security-shield ${user?.mfa_required ? "active" : ""}`}><ShieldCheck /></span><div><span className="eyebrow">Status keamanan</span><h2>{user?.mfa_required ? "MFA aktif" : "MFA belum diaktifkan"}</h2><p>{user?.mfa_required ? "Login berikutnya membutuhkan kode Authenticator atau recovery code." : "Aktifkan autentikasi dua langkah sebelum sistem digunakan pada lingkungan production."}</p>{user?.mfa_required ? <Badge tone="success"><Check size={14} /> Akun terlindungi</Badge> : <button className="button primary" onClick={start} disabled={busy}><KeyRound />{busy ? "Menyiapkan…" : "Aktifkan Authenticator"}</button>}</div></article>{error && <Notice tone="error">{error}</Notice>}
    {setup && <article className="panel setup-panel"><header><div><span className="eyebrow">Langkah 1</span><h2>Tambahkan ke Authenticator</h2></div></header><p>Masukkan kunci berikut secara manual pada Google Authenticator, Microsoft Authenticator, atau aplikasi TOTP lain.</p><div className="secret-box"><span>Kunci setup</span><code>{setup.secret}</code><button onClick={() => copy(setup.secret)}>{copied ? <Check /> : <Copy />}</button></div><form className="inline-confirm" onSubmit={confirm}><label className="field"><span>Kode enam digit</span><input inputMode="numeric" pattern="[0-9]{6}" data-field="code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="000000" required /></label><button className="button primary" disabled={busy}>Verifikasi dan aktifkan</button></form></article>}
    {recovery && <article className="panel recovery-panel"><header><div><span className="eyebrow">Langkah terakhir</span><h2>Simpan recovery code</h2></div></header><Notice tone="warning">Kode hanya ditampilkan sekali. Setiap kode hanya dapat dipakai satu kali.</Notice><div className="recovery-grid">{recovery.map((item) => <code key={item}>{item}</code>)}</div><button className="button secondary" onClick={() => copy(recovery.join("\n"))}>{copied ? <Check /> : <Copy />}{copied ? "Tersalin" : "Salin semua kode"}</button></article>}
  </section>;
}
