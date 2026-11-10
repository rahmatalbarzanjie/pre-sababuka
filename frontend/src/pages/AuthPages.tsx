import { ArrowRight, Check, Copy, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, UserRoundPlus } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, ApiClientError, jsonBody } from "../api";
import { useAuth } from "../auth";
import { SababukaLockup } from "../branding/SababukaBrand";
import { Notice, Spinner } from "../components";
import { navigate } from "../router";

function AuthBrand() {
  return <aside className="auth-brand">
    <div className="auth-brand-top"><SababukaLockup className="auth-lockup" /></div>
    <div className="auth-brand-stage">
      <KapuasDataIllustration />
      <div className="auth-copy">
        <h2>Data bergerak, keputusan terjaga.</h2>
        <p>Satu ruang bersama untuk memahami kondisi daerah dan membantu setiap keputusan pembangunan Kapuas menjadi lebih tepat.</p>
      </div>
    </div>
    <small className="auth-foot">Pemerintah Kabupaten Kapuas<br /><strong>Tim Peneliti Kajian SABABUKA BERSINAR 2026</strong></small>
  </aside>;
}

function KapuasDataIllustration() {
  return <figure className="kapuas-data-illustration" aria-hidden="true">
    <svg viewBox="0 0 420 400" focusable="false">
      <g className="kapuas-data-rings" fill="none">
        <ellipse cx="210" cy="259" rx="187" ry="68" />
        <ellipse cx="210" cy="259" rx="145" ry="48" />
      </g>
      <g className="kapuas-data-stream" fill="none">
        <path d="M22 272c72-52 127-43 181-4s111 45 195-9" />
        <path d="M36 310c69-31 126-24 173 3s98 27 175-8" />
      </g>
      <g className="kapuas-monument">
        <g className="kapuas-wings left">
          <path className="kapuas-wing-panel outer" d="M194 322H84l12-53 69 38Z" />
          <path className="kapuas-wing-panel" d="M195 322h-89l10-101 65 77Z" />
          <path className="kapuas-wing-panel" d="M197 322h-67l9-148 49 105Z" />
          <path className="kapuas-wing-panel inner" d="M199 322h-45l15-178 25 114Z" />
          <path className="kapuas-motif red" d="M98 294c19-19 35-18 52 4m-29-55c14 19 32 25 52 17m-20-81c5 21 14 37 29 49" />
          <path className="kapuas-motif green" d="M111 307c10-30 29-44 56-43m-36-58c7 18 23 29 47 31m-10-66c-8 13-7 29 4 48" />
          <path className="kapuas-motif gold" d="M93 282c25 8 46 2 62-17m-37-25c23 2 42-8 57-31m-23-23c13 5 24 2 34-9" />
        </g>
        <g transform="translate(420 0) scale(-1 1)">
          <g className="kapuas-wings right">
            <path className="kapuas-wing-panel outer" d="M194 322H84l12-53 69 38Z" />
            <path className="kapuas-wing-panel" d="M195 322h-89l10-101 65 77Z" />
            <path className="kapuas-wing-panel" d="M197 322h-67l9-148 49 105Z" />
            <path className="kapuas-wing-panel inner" d="M199 322h-45l15-178 25 114Z" />
            <path className="kapuas-motif red" d="M98 294c19-19 35-18 52 4m-29-55c14 19 32 25 52 17m-20-81c5 21 14 37 29 49" />
            <path className="kapuas-motif green" d="M111 307c10-30 29-44 56-43m-36-58c7 18 23 29 47 31m-10-66c-8 13-7 29 4 48" />
            <path className="kapuas-motif gold" d="M93 282c25 8 46 2 62-17m-37-25c23 2 42-8 57-31m-23-23c13 5 24 2 34-9" />
          </g>
        </g>
        <g className="kapuas-railings">
          <path d="M180 214h22m-29 22h29m-37 23h37m-46 23h46M240 214h-22m29 22h-29m37 23h-37m46 23h-46" />
        </g>
        <path className="kapuas-column" d="M198 322 203 72h14l5 250Z" />
        <path className="kapuas-column-light" d="M210 306V84" />
        <g className="kapuas-crown">
          <path d="M210 73V49m0 5c-8-1-14-7-15-16 7 6 12 6 15-4m0 20c8-1 14-7 15-16-7 6-12 6-15-4m0 10c-5-7-5-15 0-24 5 9 5 17 0 24Z" />
          <path d="M197 46c-9 1-15-2-20-9 8 2 13 0 16-7m30 16c9 1 15-2 20-9-8 2-13 0-16-7" />
        </g>
        <g className="kapuas-base">
          <path d="M152 316h116l11 14H141Z" />
          <path d="M127 330h166l14 16H113Z" />
          <path d="M96 346h228l18 22H78Z" />
        </g>
      </g>
      <g className="kapuas-data-nodes">
        <circle cx="45" cy="268" r="6" /><circle cx="119" cy="223" r="5" />
        <circle cx="210" cy="264" r="7" /><circle cx="304" cy="291" r="5" />
        <circle cx="378" cy="264" r="6" />
      </g>
    </svg>
    <figcaption><span>Kapuas terhubung</span><strong>Dari sumber data menuju kebijakan.</strong></figcaption>
  </figure>;
}

function AuthBackdrop() {
  return <div className="login-illustration" aria-hidden="true">
    <span className="login-orbit login-orbit-one" />
    <span className="login-orbit login-orbit-two" />
    <span className="login-dot login-dot-one" />
    <span className="login-dot login-dot-two" />
    <span className="login-dot login-dot-three" />
  </div>;
}

export function LoginPage() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState(() => window.localStorage.getItem("sababuka.demo.identifier") ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { window.localStorage.removeItem("sababuka.demo.identifier"); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login({ identifier, password });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login tidak berhasil.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="login-page auth-layout">
    <AuthBackdrop />
    <AuthBrand />
    <section className="login-panel auth-panel">
      <form className="auth-card login-card" onSubmit={submit}>
        <div className="login-identity"><SababukaLockup className="login-lockup" /></div>
        <div className="auth-card-heading"><h1>Masuk ke SABABUKA</h1></div>
        {error && <Notice tone="error">{error}</Notice>}
          <label className="field"><span>Email atau username</span><input autoFocus autoComplete="username" data-field="identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="nama@kapuaskab.go.id" required /></label>
          <label className="field"><span>Kata sandi</span><div className="password-field"><input type={showPassword ? "text" : "password"} autoComplete="current-password" data-field="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan kata sandi" required minLength={8} /><button type="button" aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
        <button className="button primary full" disabled={busy}>{busy ? <Spinner label="Memeriksa" /> : <>Masuk<ArrowRight size={17} /></>}</button>
        <button className="button secondary full" type="button" onClick={() => navigate("/register")}><UserRoundPlus size={17} />Daftar akun baru</button>
        <small className="login-credit">Tim Peneliti Kajian SABABUKA BERSINAR 2026</small>
      </form>
    </section>
  </main>;
}

export function PasswordSetupPage() {
  const { user, refresh } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) { setError("Konfirmasi kata sandi belum sama."); return; }
    setBusy(true); setError(null);
    try {
      await api("/me/password", { method: "POST", mutation: true, body: jsonBody({ current_password: currentPassword, new_password: newPassword }) });
      await refresh();
      navigate("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kata sandi belum dapat diubah.");
    } finally { setBusy(false); }
  }

  return <main className="auth-layout"><AuthBrand /><section className="auth-panel"><form className="auth-card" onSubmit={submit}>
    <div className="auth-card-heading"><span className="context-label">Langkah pertama</span><h2>Ganti kata sandi</h2><p>Akun demo ini memakai kata sandi awal. Buat kata sandi pribadi sebelum melanjutkan.</p></div>
    {error && <Notice tone="error">{error}</Notice>}
    <label className="field"><span>Kata sandi awal</span><input type="password" autoFocus autoComplete="current-password" data-field="current_password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required minLength={8} /></label>
    <label className="field"><span>Kata sandi baru</span><input type="password" autoComplete="new-password" data-field="new_password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={12} /><small>Minimal 12 karakter.</small></label>
    <label className="field"><span>Ulangi kata sandi baru</span><input type="password" autoComplete="new-password" data-field="confirm_password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={12} /></label>
    <button className="button primary full" disabled={busy}>{busy ? <Spinner label="Menyimpan" /> : "Simpan kata sandi"}</button>
    <div className="security-note"><ShieldCheck size={17} /><span>{user?.email}</span></div>
  </form></section></main>;
}

interface RegistrationOrganization {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  organization_type: string;
}

export function RegistrationPage() {
  const [organizations, setOrganizations] = useState<RegistrationOrganization[]>([]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    api<{ data: RegistrationOrganization[] }>("/auth/registration-organizations")
      .then((result) => setOrganizations(result.data))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Daftar instansi gagal dimuat."))
      .finally(() => setBusy(false));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) { setError("Konfirmasi kata sandi tidak sama."); return; }
    setBusy(true); setError(null);
    try {
      await api("/auth/register", { method: "POST", body: jsonBody({
        email, full_name: fullName,
        organization_id: organizationId, contact_phone: contactPhone,
        job_title: jobTitle, password,
      }) });
      setComplete(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pendaftaran tidak berhasil.");
    } finally { setBusy(false); }
  }

  return <main className="login-page registration-page">
    <AuthBackdrop />
    <section className="login-panel registration-panel">
      <div className="auth-card login-card registration-card">
        {complete ? <>
          <div className="login-identity"><SababukaLockup className="login-lockup" /></div>
          <div className="success-symbol"><Check /></div>
          <div className="auth-card-heading centered"><span className="context-label">Pendaftaran terkirim</span><h2>Menunggu persetujuan</h2><p>Pengelola Sistem akan memeriksa identitas PIC, instansi, dan paket peran yang sesuai.</p></div>
          <button className="button primary full" onClick={() => navigate("/login")}>Kembali ke halaman masuk</button>
        </> : <form className="registration-form" onSubmit={submit}>
          <div className="login-identity"><SababukaLockup className="login-lockup" /></div>
          <div className="auth-card-heading"><span className="context-label">Pendaftaran akun</span><h2>Daftar sebagai PIC instansi</h2><p>Untuk OPD dan instansi vertikal yang telah terdaftar. Hak akses diberikan setelah identitas dan kedudukan instansi diperiksa.</p></div>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="registration-form-grid">
            <label className="field"><span>Nama lengkap PIC</span><input autoFocus data-field="full_name" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" placeholder="Nama lengkap" required /></label>
            <label className="field"><span>Jabatan</span><input data-field="job_title" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder="Jabatan dalam instansi" required /></label>
            <label className="field"><span>Email aktif/dinas</span><input type="email" data-field="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="nama@kapuaskab.go.id" required /></label>
            <label className="field"><span>Nomor WhatsApp aktif</span><input data-field="contact_phone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} autoComplete="tel" inputMode="tel" pattern="[0-9+(). -]+" minLength={8} placeholder="08xx xxxx xxxx" required /></label>
            <label className="field registration-span"><span>Instansi yang diwakili</span><select data-field="organization_id" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} required><option value="">Pilih instansi</option>{organizations.map((item) => <option key={item.id} value={item.id}>{item.short_name ?? item.name}{item.organization_type === "vertical_agency" ? " - Instansi vertikal" : ""}</option>)}</select></label>
            <label className="field"><span>Kata sandi</span><div className="password-field"><input type={showPassword ? "text" : "password"} data-field="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={12} placeholder="Minimal 12 karakter" required /><button type="button" aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
            <label className="field"><span>Ulangi kata sandi</span><input type={showPassword ? "text" : "password"} data-field="confirm_password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={12} placeholder="Ulangi kata sandi" required /></label>
          </div>
          <div className="security-note"><ShieldCheck size={17} /><span>Satu instansi hanya memiliki satu akun PIC aktif. Peran khusus seperti Pembina Data Statistik ditetapkan otomatis setelah instansi diverifikasi.</span></div>
          <button className="button primary full" disabled={busy || !organizationId}>{busy ? <Spinner label="Mendaftarkan" /> : <>Kirim pendaftaran <ArrowRight size={17} /></>}</button>
          <button className="text-button auth-back-link" type="button" onClick={() => navigate("/login")}>Sudah punya akun? Masuk</button>
        </form>}
      </div>
    </section>
  </main>;
}

interface InvitationInfo {
  email: string;
  full_name: string;
  expires_at: string;
}

export function InvitationPage() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [activationStatus, setActivationStatus] = useState<"active" | "pending_approval" | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError("Token undangan tidak tersedia."); setBusy(false); return; }
    api<InvitationInfo>(`/auth/invitations/${encodeURIComponent(token)}`).then(setInfo).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Undangan tidak valid.")).finally(() => setBusy(false));
  }, [token]);

  async function activate(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) { setError("Konfirmasi kata sandi belum sama."); return; }
    setBusy(true); setError(null);
    try {
      const response = await api<{ status: "active" | "pending_approval" }>(`/auth/invitations/${encodeURIComponent(token)}/accept`, { method: "POST", body: jsonBody({ password }) });
      setActivationStatus(response.status);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Aktivasi akun gagal."); }
    finally { setBusy(false); }
  }

  return <main className="auth-layout">
    <AuthBrand />
    <section className="auth-panel">
      <div className="auth-card activation-card">
        {busy && !info ? <Spinner label="Memeriksa undangan" /> : error && !info ? <><Notice tone="error">{error}</Notice><button className="button secondary full" onClick={() => navigate("/login")}>Kembali ke login</button></> : activationStatus ? <>
          <div className="success-symbol"><Check /></div><div className="auth-card-heading"><span className="context-label">{activationStatus === "pending_approval" ? "Menunggu verifikasi" : "Akun aktif"}</span><h2>{activationStatus === "pending_approval" ? "Kata sandi tersimpan" : "Akun Anda sudah aktif"}</h2><p>{activationStatus === "pending_approval" ? "Developer akan memeriksa identitas dan OPD sebelum akun dapat digunakan." : "Masuk menggunakan email dan kata sandi yang baru Anda buat."}</p></div>
          <button className="button primary full" onClick={() => navigate("/login")}>Lanjut ke login <ArrowRight size={17} /></button>
        </> : info ? <form onSubmit={activate}>
          <div className="auth-card-heading"><span className="context-label">Undangan pengguna</span><h2>Selamat datang, {info.full_name}</h2><p>{info.email}</p></div>
          {error && <Notice tone="error">{error}</Notice>}
          <label className="field"><span>Kata sandi baru</span><div className="password-field"><input type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} data-field="password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button></div><small>Minimal 12 karakter.</small></label>
          <label className="field"><span>Ulangi kata sandi</span><input type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} data-field="confirm_password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
          <button className="button primary full" disabled={busy}>{busy ? <Spinner label="Mengaktifkan" /> : <>Aktifkan akun <ArrowRight size={17} /></>}</button>
        </form> : null}
      </div>
    </section>
  </main>;
}
