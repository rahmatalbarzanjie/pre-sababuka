import { Activity, AlertTriangle, ArrowRight, CircleCheck, Database, UserRoundCheck } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "../api";
import { Badge, EmptyState, ErrorState, formatDate, PageLoading, useAsync } from "../components";
import { navigate } from "../router";

interface SystemDashboardData {
  generated_at: string;
  health: { status: "healthy" | "attention"; database: "healthy"; database_response_ms: number; failed_integrations: number; failed_runs_30d: number };
  metrics: { active_organizations: number; active_users: number; pending_users: number; active_integrations: number };
  organizations_without_pic: { total: number; data: Array<{ id: string; code: string; name: string; active_pic_count: number }> };
  problematic_indicators: { total: number; data: Array<{ id: string; code: string; name: string; status: string | null; reasons: string[] }> };
  empty_categories: { total: number; data: Array<{ id: string; code: string; name: string }> };
}

export function DashboardPage() {
  const result = useAsync(() => api<SystemDashboardData>("/system/dashboard"), []);
  if (result.loading) return <PageLoading label="Memeriksa kesehatan sistem" />;
  if (result.error || !result.data) return <ErrorState title="Dashboard sistem belum dapat dimuat" onRetry={result.reload}>{result.error?.message ?? "Periksa koneksi lalu coba lagi."}</ErrorState>;

  const data = result.data;
  const attentionCount = data.organizations_without_pic.total + data.problematic_indicators.total + data.empty_categories.total + data.health.failed_integrations + data.health.failed_runs_30d;
  const cards = [
    { label: "Organisasi aktif", value: data.metrics.active_organizations, detail: "Direktori pemerintah daerah", path: "/admin/organizations" },
    { label: "Pengguna aktif", value: data.metrics.active_users, detail: `${data.metrics.pending_users} undangan menunggu`, path: "/admin/users" },
    { label: "Integrasi aktif", value: data.metrics.active_integrations, detail: `${data.health.failed_integrations} konektor bermasalah`, path: "/connectors" },
    { label: "Perlu perhatian", value: attentionCount, detail: "Tindak lanjut lintas modul", path: data.problematic_indicators.total ? "/governance/indicators" : "/admin/opd-monitoring" },
  ] as const;

  return <>
    <section className={`system-health-banner ${data.health.status}`}>
      <span>{data.health.status === "healthy" ? <CircleCheck aria-hidden /> : <Activity aria-hidden />}</span>
      <div><h2>{data.health.status === "healthy" ? "Sistem beroperasi normal" : "Sistem memerlukan perhatian"}</h2><p>{data.health.status === "healthy" ? `Database merespons dalam ${data.health.database_response_ms} ms.` : `${data.health.failed_integrations ? `${data.health.failed_integrations} sumber data eksternal berstatus gagal` : ""}${data.health.failed_integrations && data.health.failed_runs_30d ? " dan " : ""}${data.health.failed_runs_30d ? `${data.health.failed_runs_30d} proses sinkronisasi gagal dalam 30 hari terakhir` : ""}. Buka Pusat Sinkronisasi Data untuk memeriksa. Database tetap normal (${data.health.database_response_ms} ms).`} Pemeriksaan terakhir {formatDate(data.generated_at)}.</p></div>
      <Badge tone={data.health.status === "healthy" ? "success" : "warning"}>{data.health.status === "healthy" ? "Sehat" : "Perlu ditinjau"}</Badge>
    </section>

    <section className="metric-grid system-metric-grid">{cards.map(({ label, value, detail, path }) => <button className="metric-card" key={label} onClick={() => navigate(path)}><span><small>{label}</small><strong>{value}</strong><p>{detail}</p></span><ArrowRight /></button>)}</section>

    <section className="system-dashboard-grid">
      <SystemAttentionPanel title="OPD belum bergabung" total={data.organizations_without_pic.total} icon={<UserRoundCheck aria-hidden />} emptyTitle="Semua OPD sudah memiliki PIC aktif" emptyText="Tidak ada tindak lanjut akun OPD saat ini." actionLabel="Buka kesiapan OPD" onAction={() => navigate("/admin/opd-monitoring")}>
        {data.organizations_without_pic.data.map((item) => <button key={item.id} onClick={() => navigate("/admin/opd-monitoring")}><span><strong>{item.name}</strong><small>{item.code} · belum ada PIC aktif</small></span><ArrowRight /></button>)}
      </SystemAttentionPanel>

      <SystemAttentionPanel title="Indikator bermasalah" total={data.problematic_indicators.total} icon={<AlertTriangle aria-hidden />} emptyTitle="Tidak ada indikator bermasalah" emptyText="Seluruh indikator aktif memiliki pemilik, versi aktif, dan target." actionLabel="Buka matriks indikator" onAction={() => navigate("/governance/indicators")}>
        {data.problematic_indicators.data.map((item) => <button key={item.id} onClick={() => navigate("/governance/indicators")}><span><strong>{item.name}</strong><small>{item.code} · {item.reasons.join("; ")}</small></span><ArrowRight /></button>)}
      </SystemAttentionPanel>

      <SystemAttentionPanel title="Kelompok isu kosong" total={data.empty_categories.total} icon={<Database aria-hidden />} emptyTitle="Tidak ada kelompok isu kosong" emptyText="Setiap kelompok isu aktif sudah memiliki indikator." actionLabel="Buka kelompok isu" onAction={() => navigate("/governance/categories")}>
        {data.empty_categories.data.map((item) => <button key={item.id} onClick={() => navigate("/governance/categories")}><span><strong>{item.name}</strong><small>{item.code} · belum memiliki indikator aktif</small></span><ArrowRight /></button>)}
      </SystemAttentionPanel>
    </section>
  </>;
}

function SystemAttentionPanel({ title, total, icon, emptyTitle, emptyText, actionLabel, onAction, children }: { title: string; total: number; icon: ReactNode; emptyTitle: string; emptyText: string; actionLabel: string; onAction(): void; children: ReactNode }) {
  return <article className="panel system-attention-panel"><header><span>{icon}</span><div><h2>{title}</h2><p>{total ? `${total} item membutuhkan tindak lanjut.` : "Tidak ada pekerjaan terbuka."}</p></div><strong>{total}</strong></header>{total ? <div className="system-attention-list">{children}</div> : <EmptyState title={emptyTitle}>{emptyText}</EmptyState>}<footer><button className="button secondary" onClick={onAction}>{actionLabel}<ArrowRight /></button></footer></article>;
}
