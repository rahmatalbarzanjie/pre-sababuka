import {
  Bell,
  CheckCheck,
  Building2,
  ChevronDown,
  Database,
  GitCompare,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
  X,
  FolderTree,
  Gauge,
  Target,
  ClipboardList,
  ListChecks,
  ChartNoAxesCombined,
  Bot,
  BadgeCheck,
  ScrollText,
  Activity,
  Plug,
  HelpCircle,
  MapPinned,
  Moon,
  WalletCards,
  HeartHandshake,
  Eye,
  RotateCcw,
  Megaphone,
  BookCheck,
  Sun,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../auth";
import { navigate } from "../router";
import type { LoginAnnouncement, MenuItem, NotificationItem } from "../types";
import { api } from "../api";
import { installServerFieldMarking } from "../fieldErrors";
import { notificationDestination } from "../notification-routing";
import { formatTanggal, Modal } from "../components";
import { SababukaAssistantMark, SababukaLockup, SababukaMark } from "../branding/SababukaBrand";
import { applyTheme, readTheme, type ThemeMode } from "../theme";

const iconByCode: Record<string, typeof LayoutDashboard> = {
  organizations: Building2,
  users: Users,
  roles: ShieldCheck,
  menus: PanelLeftOpen,
  "system-settings": SlidersHorizontal,
  focuses: Target,
  categories: FolderTree,
  indicators: Gauge,
  submissions: ClipboardList,
  reviews: ListChecks,
  dashboard: LayoutDashboard,
  executive: ChartNoAxesCombined,
  assistant: Bot,
  publications: BadgeCheck,
  operations: Activity,
  "opd-profile": ClipboardList,
  connectors: Plug,
  consolidation: GitCompare,
  analysis: MapPinned,
  finance: WalletCards,
  "public-services": HeartHandshake,
  "statistical-guidance": BookCheck,
  "system-dashboard": LayoutDashboard,
  "opd-monitoring": Building2,
};

const supportedRoutes = new Set(["/admin", "/dashboard", "/executive", "/assistant", "/analysis", "/finance", "/public-services", "/notifications", "/audit", "/operations", "/opd-profile", "/admin/organizations", "/admin/opd-monitoring", "/admin/users", "/admin/roles", "/admin/menus", "/admin/system", "/admin/metadata-profiles", "/governance/focuses", "/governance/categories", "/governance/indicators", "/governance/datasets", "/submissions", "/reviews", "/guidance", "/publications", "/connectors", "/consolidation"]);

const roleLabels: Record<string, string> = {
  superadmin: "Pengelola Sistem",
  pimpinan: "Pimpinan",
  bapperida: "Verifikator BAPPERIDA",
  kominfo: "Walidata Diskominfosantik",
  pembina_statistik: "Pembina Data Statistik (BPS)",
  opd: "Admin/PIC OPD",
};

function sectionChildren(menu: MenuItem[], code: string): MenuItem[] {
  return menu.find((item) => item.code === code)?.children.filter((item) => item.route_name && supportedRoutes.has(item.route_name) && !item.navigation_disabled) ?? [];
}

export function AdminLayout({ pathname, title, subtitle, actions, children }: { pathname: string; title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  const { user, menu, logout, startPreview, stopPreview } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationPreview, setNotificationPreview] = useState<NotificationItem[]>([]);
  const [previewOrganizations, setPreviewOrganizations] = useState<Array<{ id: string; code: string; name: string; short_name: string | null }>>([]);
  const [previewOrganizationId, setPreviewOrganizationId] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<LoginAnnouncement | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(readTheme);
  const profileRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const helpRef = useRef<HTMLElement>(null);
  const helpTriggerRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const governanceEntries = useMemo(() => sectionChildren(menu, "governance"), [menu]);
  const adminEntries = useMemo(() => sectionChildren(menu, "administration"), [menu]);
  const isSuperadmin = user?.roles.some((role) => role.code === "superadmin") ?? false;
  const isRolePreview = Boolean(user?.simulation?.active);
  const isBapperida = user?.roles.some((role) => role.code === "bapperida") ?? false;
  const isOpd = user?.roles.some((role) => role.code === "opd") ?? false;
  const operationalEntries = useMemo(() => menu.filter((item) => ["operations", "opd-profile", "submissions", "reviews", "publications"].includes(item.code) && item.route_name && supportedRoutes.has(item.route_name) && !(!isSuperadmin && isBapperida && !isOpd && item.code === "submissions")), [menu, isSuperadmin, isBapperida, isOpd]);
  const sourceEntries = useMemo(() => menu.filter((item) => item.code === "connectors" && item.route_name && supportedRoutes.has(item.route_name)), [menu]);
  const primaryEntries = useMemo(() => menu.filter((item) => item.code === "dashboard" && item.route_name && supportedRoutes.has(item.route_name)), [menu]);
  const systemEntries = useMemo(() => menu.filter((item) => ["system-dashboard", "opd-monitoring"].includes(item.code) && item.route_name && supportedRoutes.has(item.route_name)), [menu]);
  const analysisEntries = useMemo(() => menu.filter((item) => ["analysis", "finance", "public-services"].includes(item.code) && item.route_name && supportedRoutes.has(item.route_name)), [menu]);
  const consolidationEntries = useMemo(() => menu.filter((item) => item.code === "consolidation" && item.route_name && supportedRoutes.has(item.route_name)), [menu]);
  const guidanceEntries = useMemo(() => menu.filter((item) => item.code === "statistical-guidance" && item.route_name && supportedRoutes.has(item.route_name)), [menu]);
  const auditEntries = useMemo(() => menu.filter((item) => item.code === "audit" && item.route_name && supportedRoutes.has(item.route_name)), [menu]);
  const isPimpinan = user?.roles.some((role) => role.code === "pimpinan") ?? false;
  const navigationSections = useMemo(() => [
    { code: "system", label: "Administrasi sistem", entries: systemEntries },
    { code: "primary", label: "Ruang pimpinan", entries: primaryEntries },
    { code: "analysis", label: "Analisis keputusan", entries: analysisEntries },
    { code: "governance", label: "Tata kelola data", entries: governanceEntries },
    { code: "sources", label: "Walidata", entries: sourceEntries },
    { code: "operations", label: isPimpinan ? "Rilis resmi" : isBapperida && !isSuperadmin ? "Pelaporan dan publikasi" : "Pelaporan capaian", entries: operationalEntries },
    { code: "consolidation", label: "Konsolidasi sumber", entries: consolidationEntries },
    { code: "guidance", label: "Pembinaan statistik", entries: guidanceEntries },
    { code: "audit", label: "Pengawasan", entries: auditEntries },
    { code: "administration", label: "Konfigurasi internal", entries: adminEntries },
  ].filter((section) => section.entries.length > 0).sort((a, b) => Math.min(...a.entries.map((entry) => entry.display_order)) - Math.min(...b.entries.map((entry) => entry.display_order))), [adminEntries, analysisEntries, auditEntries, consolidationEntries, guidanceEntries, governanceEntries, isBapperida, isPimpinan, isSuperadmin, operationalEntries, primaryEntries, sourceEntries, systemEntries]);
  const areaLabel = ["/admin", "/admin/opd-monitoring"].includes(pathname) ? "Administrasi Sistem"
    : pathname.startsWith("/admin") ? "Konfigurasi Internal"
    : ["/dashboard", "/executive", "/assistant"].includes(pathname) ? "Ruang Pimpinan"
    : ["/analysis", "/finance", "/public-services"].includes(pathname) ? "Analisis Keputusan"
    : pathname === "/connectors" ? "Walidata Diskominfosantik"
    : pathname.startsWith("/governance") ? "Tata Kelola Data"
    : ["/operations", "/submissions", "/reviews", "/publications"].includes(pathname) ? "Pelaporan dan Verifikasi"
    : "Ruang Kerja SABABUKA";
  const initials = user?.full_name.split(/\s+/u).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "SA";
  const roleCode = user?.roles[0]?.code ?? "opd";
  const help = roleHelp[roleCode] ?? roleHelp.opd;
  const roleLabel = isBapperida && isOpd ? "Verifikator BAPPERIDA + PIC OPD"
    : (user?.roles.some((role) => role.code === "kominfo") && isOpd) ? "Walidata + PIC OPD"
    : roleLabels[roleCode] ?? "Pengguna";

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  useEffect(() => {
    setProfileOpen(false);
    setHelpOpen(false);
    setNotificationOpen(false);
    window.scrollTo({ top: 0, left: 0 });
    requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }, [pathname]);
  useEffect(() => {
    const prepareScrollableTables = () => {
      mainRef.current?.querySelectorAll<HTMLElement>(".table-scroll").forEach((container) => {
        container.tabIndex = 0;
        container.setAttribute("role", "region");
        if (!container.hasAttribute("aria-label")) container.setAttribute("aria-label", "Tabel data; dapat digeser horizontal");
      });
      // Label kolom per sel agar CSS layar kecil dapat menampilkan setiap baris sebagai kartu.
      mainRef.current?.querySelectorAll<HTMLTableElement>(".table-scroll table").forEach((table) => {
        table.querySelectorAll("thead th:not([scope])").forEach((header) => header.setAttribute("scope", "col"));
        const headers = Array.from(table.querySelectorAll("thead tr:last-child th"));
        if (!headers.length) return;
        table.querySelectorAll("tbody tr").forEach((row) => {
          if (row.children.length !== headers.length) return;
          Array.from(row.children).forEach((cell, index) => {
            const label = headers[index]?.textContent?.trim() ?? "";
            if (cell instanceof HTMLElement && cell.dataset.label !== label) cell.dataset.label = label;
          });
        });
      });
    };
    prepareScrollableTables();
    const observer = new MutationObserver(prepareScrollableTables);
    if (mainRef.current) observer.observe(mainRef.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);
  useEffect(() => installServerFieldMarking(), []);
  useEffect(() => {
    const nameTables = () => document.querySelectorAll("table:not([aria-label]):not([aria-labelledby])").forEach((table) => {
      if (table.querySelector("caption")) return;
      const heading = table.closest("section, article")?.querySelector("h2, h3")?.textContent?.trim() || document.querySelector("h1")?.textContent?.trim() || "Tabel data";
      table.setAttribute("aria-label", heading);
    });
    nameTables();
    const observer = new MutationObserver(nameTables);
    if (mainRef.current) observer.observe(mainRef.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);
  useEffect(() => {
    // Validasi bawaan browser (required, pattern) diteruskan sebagai aria-invalid agar terbaca pembaca layar.
    const root = mainRef.current;
    if (!root) return;
    const markInvalid = (event: Event) => {
      if (event.target instanceof HTMLElement) event.target.setAttribute("aria-invalid", "true");
    };
    const clearWhenValid = (event: Event) => {
      const target = event.target;
      if ((target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) && target.checkValidity()) {
        target.removeAttribute("aria-invalid");
      }
    };
    root.addEventListener("invalid", markInvalid, true);
    root.addEventListener("input", clearWhenValid, true);
    root.addEventListener("change", clearWhenValid, true);
    return () => {
      root.removeEventListener("invalid", markInvalid, true);
      root.removeEventListener("input", clearWhenValid, true);
      root.removeEventListener("change", clearWhenValid, true);
    };
  }, [pathname]);
  useEffect(() => {
    if (!helpOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    helpRef.current?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !helpRef.current) return;
      const focusable = Array.from(helpRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trapFocus);
    return () => { document.removeEventListener("keydown", trapFocus); (previousFocus ?? helpTriggerRef.current)?.focus(); };
  }, [helpOpen]);
  useEffect(() => {
    if (!mobile) return;
    sidebarRef.current?.querySelector<HTMLElement>("button")?.focus();
    const trapSidebarFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMobile(false); return; }
      if (event.key !== "Tab" || !sidebarRef.current) return;
      const focusable = Array.from(sidebarRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trapSidebarFocus);
    return () => { document.removeEventListener("keydown", trapSidebarFocus); mobileTriggerRef.current?.focus(); };
  }, [mobile]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
      if (!notificationRef.current?.contains(event.target as Node)) setNotificationOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setProfileOpen(false); setHelpOpen(false); setNotificationOpen(false); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, []);

  const loadNotifications = useCallback(async () => {
    setNotificationLoading(true);
    try {
      const result = await api<{ data: NotificationItem[]; unread_count: number }>("/notifications?unread_only=false");
      setUnreadNotifications(result.unread_count);
      setNotificationPreview(result.data.slice(0, 5));
    } catch {
      setUnreadNotifications(0);
      setNotificationPreview([]);
    } finally { setNotificationLoading(false); }
  }, []);
  useEffect(() => {
    void loadNotifications();
    const refresh = () => { void loadNotifications(); };
    const timer = window.setInterval(refresh, 20_000);
    window.addEventListener("sababuka:notifications-changed", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("sababuka:notifications-changed", refresh); };
  }, [user?.id, pathname, loadNotifications]);

  useEffect(() => {
    if (!isSuperadmin) return;
    api<{ organizations: Array<{ id: string; code: string; name: string; short_name: string | null }> }>("/me/preview-options")
      .then((result) => { setPreviewOrganizations(result.organizations); setPreviewOrganizationId((current) => current || result.organizations[0]?.id || ""); })
      .catch(() => setPreviewOrganizations([]));
  }, [isSuperadmin]);

  useEffect(() => {
    if (!user || isRolePreview || window.sessionStorage.getItem("sababuka.just_logged_in") !== "true") return;
    window.sessionStorage.removeItem("sababuka.just_logged_in");
    api<LoginAnnouncement>("/me/announcement")
      .then((result) => { if (result.enabled) setAnnouncement(result); })
      .catch(() => undefined);
  }, [user?.id, isRolePreview]);

  const go = (path: string) => { navigate(path); setMobile(false); setProfileOpen(false); };
  const openNotification = async (item: NotificationItem) => {
    if (!item.read_at) await api(`/notifications/${item.id}/read`, { method: "POST", mutation: true });
    setNotificationOpen(false);
    go(notificationDestination(item, user?.permissions ?? [], menu));
  };
  const markAllNotificationsRead = async () => {
    await api("/notifications/read-all", { method: "POST", mutation: true });
    await loadNotifications();
  };
  const enterPreview = async (role: "bapperida" | "kominfo" | "pembina_statistik" | "opd" | "pimpinan", organizationId?: string) => {
    setPreviewBusy(true); setPreviewError(null);
    try {
      await startPreview(role, organizationId);
      setProfileOpen(false);
      navigate(role === "pimpinan" ? "/dashboard" : role === "kominfo" ? "/connectors" : role === "pembina_statistik" ? "/guidance" : "/operations");
    } catch (error) { setPreviewError(error instanceof Error ? error.message : "Mode pratinjau tidak dapat dibuka."); }
    finally { setPreviewBusy(false); }
  };
  const leavePreview = async () => { setPreviewBusy(true); await stopPreview(); setPreviewBusy(false); setProfileOpen(false); navigate("/admin"); };
  const doLogout = async () => { await logout(); navigate("/login"); };
  return <div className={`workspace ${collapsed ? "collapsed" : ""}`}>
    <button className="skip-link" onClick={() => { mainRef.current?.focus({ preventScroll: true }); mainRef.current?.scrollIntoView({ block: "start" }); }}>Lewati navigasi ke konten utama</button>
    <aside ref={sidebarRef} className={`sidebar ${mobile ? "mobile-open" : ""}`} aria-label="Navigasi utama">
      <div className="sidebar-brand"><SababukaLockup className="sidebar-lockup" /><button className="mobile-close" aria-label="Tutup menu" onClick={() => setMobile(false)}><X /></button></div>
      <nav>
        {navigationSections.map((section) => <div className="nav-section" key={section.code}><div className="nav-label">{section.label}</div>{section.entries.map((entry) => {
          const Icon = iconByCode[entry.code] ?? Settings2;
          const label = isPimpinan && entry.code === "publications" ? "Rilis Data" : entry.label;
          return <button key={entry.code} className={`nav-link ${pathname === entry.route_name ? "active" : ""}`} aria-current={pathname === entry.route_name ? "page" : undefined} title={collapsed ? label : entry.navigation_disabled ? `${label} - ${entry.badge ?? "Belum tersedia"}` : undefined} disabled={entry.navigation_disabled} aria-disabled={entry.navigation_disabled} onClick={() => { if (!entry.navigation_disabled) go(entry.route_name!); }}><Icon /><span>{label}</span>{entry.badge && <small className="nav-badge">{entry.badge}</small>}</button>;
        })}</div>)}
      </nav>
      <button className="collapse-button" title={collapsed ? "Perbesar sidebar" : undefined} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}<span>{collapsed ? "Perbesar" : "Perkecil sidebar"}</span></button>
    </aside>
    {mobile && <button className="mobile-overlay" onClick={() => setMobile(false)} aria-label="Tutup menu" />}
    <section className="workspace-main">
      <header className="topbar">
        <button ref={mobileTriggerRef} className="icon-button mobile-trigger" aria-label="Buka menu" aria-haspopup="true" aria-expanded={mobile} onClick={() => setMobile(true)}><Menu /></button>
        <nav className="topbar-context" aria-label="Lokasi halaman" title={subtitle}><span>{areaLabel}</span><i aria-hidden>/</i><strong tabIndex={-1}>{title}</strong></nav>
        <div className="topbar-actions">
          {actions}
          <button className="icon-button theme-toggle" aria-label={theme === "dark" ? "Gunakan tema terang" : "Gunakan tema gelap"} title={theme === "dark" ? "Tema terang" : "Tema gelap"} onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun /> : <Moon />}</button>
          <button ref={helpTriggerRef} className="icon-button" aria-label="Buka bantuan penggunaan" aria-haspopup="dialog" aria-expanded={helpOpen} onClick={() => setHelpOpen(true)}><HelpCircle /></button>
          {!isRolePreview && <div className="notification-wrap" ref={notificationRef}>
            <button className="icon-button notification" aria-label={`Buka notifikasi${unreadNotifications ? `, ${unreadNotifications} belum dibaca` : ""}`} aria-haspopup="dialog" aria-expanded={notificationOpen} onClick={() => { setNotificationOpen((value) => !value); setProfileOpen(false); if (!notificationOpen) void loadNotifications(); }}><Bell />{unreadNotifications > 0 && <span className="notification-count">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}</button>
            {notificationOpen && <section className="notification-popover" aria-label="Notifikasi terbaru">
              <header><div><strong>Notifikasi</strong><small>{unreadNotifications ? `${unreadNotifications} belum dibaca` : "Semua sudah dibaca"}</small></div>{unreadNotifications > 0 && <button type="button" onClick={() => void markAllNotificationsRead()}><CheckCheck />Tandai dibaca</button>}</header>
              <div className="notification-preview-list">
                {notificationLoading && !notificationPreview.length ? <p className="notification-preview-empty">Memuat notifikasi…</p>
                  : !notificationPreview.length ? <p className="notification-preview-empty">Belum ada pemberitahuan untuk Anda.</p>
                  : notificationPreview.map((item) => <button type="button" key={item.id} className={item.read_at ? "" : "unread"} onClick={() => void openNotification(item)}><span className="notification-preview-icon"><Bell /></span><span><strong>{item.title}</strong><p>{item.message}</p><small>{formatTanggal(item.created_at, "tanggal-waktu")}</small></span>{!item.read_at && <i aria-label="Belum dibaca" />}</button>)}
              </div>
              <footer><button type="button" onClick={() => go("/notifications")}>Lihat semua notifikasi</button></footer>
            </section>}
          </div>}
          <div className="profile-wrap" ref={profileRef}>
            <button className="profile-button" aria-haspopup="menu" aria-expanded={profileOpen} onClick={() => setProfileOpen((value) => !value)}><span className="avatar">{initials}</span><span><strong>{user?.full_name}</strong><small>{roleLabel}</small></span><ChevronDown /></button>
            {profileOpen && <div className="profile-popover"><div className="profile-identity"><UserRound /><span><strong>{user?.simulation?.original_email ?? user?.email}</strong><small>{isRolePreview ? `Pratinjau: ${roleLabels[user?.roles[0]?.code ?? ""] ?? "Peran"}` : user?.organizations[0]?.name ?? "Lingkup global"}</small></span></div>
              {isRolePreview ? <div className="profile-preview-return"><small>MODE PRATINJAU HANYA BACA</small><button disabled={previewBusy} onClick={() => void leavePreview()}><RotateCcw />Kembali ke Developer</button></div>
                : isSuperadmin && <div className="profile-preview"><small>PRATINJAU TAMPILAN PERAN</small><p>Lihat menu dan data sesuai kewenangan tanpa login ulang.</p>{previewError && <span className="profile-preview-error">{previewError}</span>}<button disabled={previewBusy} onClick={() => void enterPreview("bapperida")}><Eye />BAPPERIDA</button><button disabled={previewBusy} onClick={() => void enterPreview("kominfo")}><Eye />Walidata Diskominfosantik</button><button disabled={previewBusy} onClick={() => void enterPreview("pembina_statistik")}><Eye />Pembina Statistik BPS</button><button disabled={previewBusy} onClick={() => void enterPreview("pimpinan")}><Eye />Pimpinan</button><label><span>Pratinjau OPD</span><select value={previewOrganizationId} onChange={(event) => setPreviewOrganizationId(event.target.value)}><option value="">Pilih OPD</option>{previewOrganizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.short_name ? `${organization.short_name} - ` : ""}{organization.name}</option>)}</select></label><button disabled={previewBusy || !previewOrganizationId} onClick={() => void enterPreview("opd", previewOrganizationId)}><Eye />Masuk sebagai OPD terpilih</button></div>}
              {!isRolePreview && <button onClick={() => go("/admin/profile")}><ShieldCheck />Keamanan akun</button>}<button className="danger-text" onClick={doLogout}><LogOut />Keluar</button></div>}
          </div>
        </div>
      </header>
      {isRolePreview && <div className="role-preview-banner"><Eye /><span><strong>Mode pratinjau hanya baca</strong><small>Anda sedang melihat SABABUKA sebagai {roleLabels[user?.roles[0]?.code ?? ""] ?? "pengguna"}{user?.simulation?.organization_name ? ` - ${user.simulation.organization_name}` : ""}.</small></span><button disabled={previewBusy} onClick={() => void leavePreview()}><RotateCcw />Kembali ke Developer</button></div>}
      <main id="main-content" ref={mainRef} className="page-shell" tabIndex={-1} aria-label={`${title}. ${subtitle}`}>
        {pathname !== "/governance/indicators" && <header className="page-header"><div><h1>{title}</h1><p>{subtitle}</p></div>{actions && <div className="page-actions">{actions}</div>}</header>}
        {children}
      </main>
      <footer className="workspace-footer">
        <div className="workspace-footer-identity">
          <SababukaMark label="Logo SABABUKA" />
          <span><strong>SABABUKA BERSINAR</strong><small>Sistem Analisis Big Data Kabupaten Kapuas</small></span>
        </div>
        <div className="workspace-footer-governance">
          <span>Informasi mengikuti kewenangan, proses verifikasi, dan jejak audit.</span>
          <small>Dikembangkan oleh Tim Peneliti Kajian SABABUKA BERSINAR 2026</small>
        </div>
      </footer>
    </section>
    {isPimpinan && <button type="button" className="assistant-floating-button" onClick={() => go("/assistant")} aria-label="Buka Asisten AI" title="Buka Asisten AI"><span className="assistant-floating-icon" aria-hidden><SababukaAssistantMark /><i /></span><span className="assistant-floating-label"><strong>Asisten AI</strong></span></button>}
    {helpOpen && <><button className="help-overlay" aria-label="Tutup bantuan" onClick={() => setHelpOpen(false)} /><aside ref={helpRef} tabIndex={-1} className="help-drawer" role="dialog" aria-modal="true" aria-labelledby="help-drawer-title"><header><div><h2 id="help-drawer-title">{help.title}</h2></div><button type="button" className="icon-button" aria-label="Tutup bantuan" onClick={() => setHelpOpen(false)}><X /></button></header><p>{help.intro}</p><ol>{help.steps.map((step) => <li key={step}><span>{help.steps.indexOf(step) + 1}</span><p>{step}</p></li>)}</ol><section><strong>Istilah penting</strong><dl><div><dt>Target</dt><dd>Sasaran RPJMD untuk tahun pelaporan.</dd></div><div><dt>Realisasi</dt><dd>Nilai yang benar-benar dicapai OPD.</dd></div><div><dt>Dipublikasikan</dt><dd>Sudah diperiksa, dikurasi, dan boleh dilihat pimpinan.</dd></div></dl></section><footer><small>Jika tugas atau data tidak sesuai, catat nama indikator, periode, dan OPD lalu hubungi Pengelola Sistem.</small><button type="button" className="button primary" onClick={() => setHelpOpen(false)}>Saya mengerti</button></footer></aside></>}
    {announcement?.enabled && <Modal title={announcement.title ?? "Pemberitahuan"} onClose={() => setAnnouncement(null)}><article className="login-announcement"><span className="announcement-icon"><Megaphone /></span>{announcement.image_url && <img src={announcement.image_url} alt="Ilustrasi pemberitahuan" />}<p>{announcement.message}</p><footer className="modal-actions">{announcement.action_url && <a className="button secondary" href={announcement.action_url} target={announcement.action_url.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{announcement.action_label ?? "Buka informasi"}</a>}<button type="button" className="button primary" onClick={() => setAnnouncement(null)}>Tutup</button></footer></article></Modal>}
  </div>;
}

const roleHelp: Record<string, { title: string; intro: string; steps: string[] }> = {
  superadmin: { title: "Panduan Pengelola Sistem", intro: "Pastikan akun, organisasi, dan hak akses siap sebelum pengguna memulai pekerjaan substansi.", steps: ["Periksa pendaftaran PIC pada menu Pengguna.", "Tetapkan OPD dan peran dengan lingkup akses minimum.", "Pantau konfigurasi dan audit tanpa mengambil alih keputusan substansi BAPPERIDA atau OPD."] },
  bapperida: { title: "Panduan BAPPERIDA", intro: "Mulai dari Beranda Tugas untuk melihat keputusan yang menunggu Anda.", steps: ["Finalisasi kelompok isu dan indikator RPJMD.", "Verifikasi pelaporan yang dikirim OPD dan beri koreksi yang spesifik.", "Kurasi hanya capaian yang layak sebelum diterbitkan kepada pimpinan."] },
  opd: { title: "Panduan Operator OPD", intro: "Kartu Tugas Saya menunjukkan pekerjaan yang perlu Anda selesaikan lebih dahulu.", steps: ["Verifikasi indikator yang menjadi tanggung jawab OPD.", "Mulai pelaporan untuk periode berjalan dan isi realisasi.", "Lampirkan dokumen pendukung, simpan perubahan, lalu kirim ke BAPPERIDA."] },
  kominfo: { title: "Panduan Walidata", intro: "Diskominfosantik menjaga kualitas teknis dan aliran data lintas OPD.", steps: ["Daftarkan profil sumber data OPD.", "Petakan kolom sumber ke indikator yang sudah aktif.", "Periksa preview dan hasil validasi sebelum mengimpor atau menjadwalkan sinkronisasi."] },
  pembina_statistik: { title: "Panduan Pembina Data Statistik", intro: "BPS membina standar dan kualitas statistik tanpa mengambil alih data milik OPD.", steps: ["Telaah standar, metadata, metodologi, dan konsistensi data.", "Berikan rekomendasi yang dapat ditindaklanjuti PIC instansi.", "Masukkan data hanya untuk indikator yang memang ditugaskan kepada BPS Kabupaten Kapuas."] },
  pimpinan: { title: "Panduan Pimpinan", intro: "Informasi di ruang ini hanya berasal dari data yang sudah diterbitkan.", steps: ["Gunakan filter untuk memilih kelompok isu atau OPD.", "Buka Rilis Data untuk melihat paket resmi dan sumbernya.", "Gunakan Asisten Data untuk bertanya berdasarkan data yang tersedia."] },
};

export function ComingSoon({ title }: { title: string }) {
  return <div className="empty-state"><Database size={28} /><h3>{title}</h3><p>Modul ini masuk tahap pembangunan berikutnya setelah fondasi administrasi selesai.</p></div>;
}
