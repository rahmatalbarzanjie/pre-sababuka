import { Activity, ArrowRight, BadgeCheck, Clock3, FileWarning, Gauge, ListChecks, RotateCcw, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, capaianStatusLabel, EmptyState, ErrorState, formatDate, Notice, PageLoading, SortableHeader, useAsync, type SortDirection } from "../components";
import { navigate } from "../router";

interface OperationsData {
  generated_at: string;
  metrics: { active_indicators: number; draft: number; submitted: number; under_review: number; pending_review: number; returned: number; approved: number };
  tasks: { categories_in_review: number; indicators_in_review: number; indicators_opd_verification: number; draft_publications: number; publications_to_reconcile: number };
  organizations: Array<{ organization_id: string; code: string; organization_name: string; total_forms: number; pending_review: number; returned: number; approved: number; updated_at: string | null }>;
  recent: Array<{ id: string; organization_code: string; organization_name: string; period_label: string; status: string; row_count: number; updated_at: string }>;
}

export function OperationsPage() {
  const { user } = useAuth();
  const result = useAsync(() => api<OperationsData>("/operations/dashboard"), []);
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortOrder, setSortOrder] = useState<SortDirection>("desc");
  const organizations = useMemo(() => [...(result.data?.organizations ?? [])].filter((item) => item.total_forms).sort((a, b) => {
    const left = a[sortBy as keyof typeof a]; const right = b[sortBy as keyof typeof b];
    const compared = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "id");
    return sortOrder === "asc" ? compared : -compared;
  }), [result.data?.organizations, sortBy, sortOrder]);
  if (result.loading) return <PageLoading label="Memuat dashboard operasional" />;
  if (result.error || !result.data) return <ErrorState title="Beranda tugas belum dapat dimuat" onRetry={result.reload}>{result.error ?? "Periksa koneksi lalu coba lagi."}</ErrorState>;
  const sharedCards = [
    ["Indikator aktif", result.data.metrics.active_indicators, Gauge, "blue"], ["Draf form capaian", result.data.metrics.draft, Clock3, "violet"],
    ["Capaian menunggu pemeriksaan", result.data.metrics.pending_review, Send, "amber"], ["Capaian perlu perbaikan", result.data.metrics.returned, RotateCcw, "amber"],
    ["Capaian disetujui", result.data.metrics.approved, BadgeCheck, "teal"],
  ] as const;
  const isBapperida = user?.roles.some((role) => role.code === "bapperida" || role.code === "superadmin") ?? false;
  const cards = isBapperida ? sharedCards : [
    ["Indikator tanggung jawab OPD", result.data.metrics.active_indicators, Gauge, "blue"],
    ["Draf belum dikirim", result.data.metrics.draft, Clock3, "violet"],
    ["Menunggu pemeriksaan", result.data.metrics.pending_review, Send, "amber"],
    ["Perlu diperbaiki", result.data.metrics.returned, RotateCcw, "amber"],
    ["Pelaporan selesai", result.data.metrics.approved, BadgeCheck, "teal"],
  ] as const;
  const changeSort = (column: string, direction: SortDirection) => { setSortBy(column); setSortOrder(direction); };
  const tasks = isBapperida ? [
    { label: "Capaian baru masuk", help: "Mulai pemeriksaan data yang baru dikirim OPD.", value: result.data.metrics.submitted, icon: Send, path: "/reviews?status=submitted", tone: "blue" },
    { label: "Pemeriksaan berjalan", help: "Selesaikan keputusan yang sudah dimulai.", value: result.data.metrics.under_review, icon: ListChecks, path: "/reviews?status=under_review", tone: "amber" },
    { label: "Master menunggu keputusan", help: "Kategori dan indikator yang diajukan untuk disahkan.", value: result.data.tasks.categories_in_review + result.data.tasks.indicators_in_review, icon: Gauge, path: "/governance/indicators?status=in_review", tone: "violet" },
    { label: "Publikasi perlu perhatian", help: result.data.tasks.publications_to_reconcile ? "Ada publikasi aktif yang tidak lagi memenuhi syarat." : "Draf publikasi yang belum ditayangkan.", value: result.data.tasks.publications_to_reconcile || result.data.tasks.draft_publications, icon: FileWarning, path: "/publications", tone: result.data.tasks.publications_to_reconcile ? "amber" : "teal" },
  ] : [
    { label: "Indikator perlu diverifikasi", help: "Periksa definisi indikator yang menjadi tanggung jawab OPD.", value: result.data.tasks.indicators_opd_verification, icon: Gauge, path: "/governance/indicators?status=opd_verification", tone: "blue" },
    { label: "Capaian perlu diperbaiki", help: "Buka catatan BAPPERIDA dan lengkapi koreksi.", value: result.data.metrics.returned, icon: RotateCcw, path: "/submissions?status=returned", tone: "amber" },
    { label: "Draf belum dikirim", help: "Lanjutkan pengisian realisasi yang belum selesai.", value: result.data.metrics.draft, icon: Clock3, path: "/submissions?status=draft", tone: "violet" },
    { label: "Menunggu BAPPERIDA", help: "Capaian sudah dikirim dan tidak perlu diubah sementara.", value: result.data.metrics.pending_review, icon: Send, path: "/submissions?status=submitted", tone: "teal" },
  ];
  return <><section className="task-home"><header><div><span className="eyebrow">Tugas saya</span><h2>{isBapperida ? "Pekerjaan yang perlu diputuskan" : "Pekerjaan yang perlu diselesaikan"}</h2><p>{tasks.every((task) => !task.value) ? "Tidak ada pekerjaan mendesak saat ini." : "Pilih kartu untuk langsung membuka daftar yang sudah difilter. Angka nol berarti tidak ada pekerjaan pada tahap tersebut."}</p></div>{tasks.every((task) => !task.value) && <div className="task-next"><span>Langkah berikutnya</span>{isBapperida ? <><button className="button secondary" onClick={() => navigate("/publications")}>Susun publikasi</button><button className="button secondary" onClick={() => navigate("/reviews")}>Lihat semua pelaporan OPD</button></> : <><button className="button primary" onClick={() => navigate("/submissions")}>Mulai atau lanjutkan pelaporan</button><button className="button secondary" onClick={() => navigate("/governance/indicators")}>Usulkan indikator</button></>}</div>}</header><div>{tasks.map((task) => { const Icon = task.icon; return <button key={task.label} className="task-card" onClick={() => navigate(task.path)}><span className={`metric-icon ${task.tone}`}><Icon /></span><span><small>{task.label}</small><strong>{task.value}</strong><p>{task.help}</p></span><ArrowRight /></button>; })}</div></section><Notice tone="info">Ringkasan di bawah menghitung form pelaporan OPD per periode. “Disetujui” berarti realisasi telah disetujui BAPPERIDA, bukan status master indikator.</Notice><section className={`metric-grid operations-metrics ${cards.length === 5 ? "five" : ""}`}>{cards.map(([label, value, Icon, tone]) => <article className="metric-card" key={label}><span className={`metric-icon ${tone}`}><Icon /></span><span><small>{label}</small><strong>{value}</strong></span></article>)}</section>
    <section className="dashboard-grid operations-grid"><article className="panel"><header><div><span className="eyebrow">Perangkat daerah</span><h2>Status pelaporan OPD</h2></div><Activity /></header>{!result.data.organizations.some((item) => item.total_forms) ? <EmptyState title="Belum ada pelaporan">Form capaian OPD akan dirangkum di sini.</EmptyState> : <div className="table-scroll"><table><thead><tr><SortableHeader label="OPD" column="organization_name" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Total form" column="total_forms" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Menunggu pemeriksaan" column="pending_review" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Perlu perbaikan" column="returned" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Capaian disetujui" column="approved" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /><SortableHeader label="Diperbarui" column="updated_at" sortBy={sortBy} direction={sortOrder} onSort={changeSort} /></tr></thead><tbody>{organizations.map((item) => <tr key={item.organization_id}><td><strong>{item.organization_name}</strong><small className="table-subtitle">{item.code}</small></td><td>{item.total_forms}</td><td>{item.pending_review}</td><td>{item.returned}</td><td>{item.approved}</td><td>{formatDate(item.updated_at)}</td></tr>)}</tbody></table></div>}</article>
      <article className="panel"><header><div><span className="eyebrow">Aktivitas terbaru</span><h2>Pergerakan form capaian</h2></div></header>{!result.data.recent.length ? <EmptyState title="Belum ada aktivitas">Perubahan form capaian akan tampil di sini.</EmptyState> : <div className="operation-feed">{result.data.recent.map((item) => <div key={item.id}><span><strong>{item.organization_name}</strong><small>{item.period_label} · {item.row_count} indikator</small></span><Badge tone={item.status === "approved" ? "success" : item.status === "returned" ? "warning" : "neutral"}>{capaianStatusLabel(item.status, isBapperida ? "bapperida" : "opd")}</Badge></div>)}</div>}</article></section></>;
}
