export type StatusViewpoint = "neutral" | "opd" | "bapperida" | "walidata" | "pembina_statistik" | "pimpinan";

const STATUS_LABELS: Record<string, string> = {
  active: "Aktif", inactive: "Nonaktif", draft: "Draf", submitted: "Dikirim",
  verified: "Terverifikasi", rejected: "Ditolak", published: "Terbit",
  replaced: "Digantikan", pending: "Menunggu", approved: "Disetujui",
  in_review: "Menunggu keputusan BAPPERIDA", opd_verification: "Menunggu verifikasi OPD",
  archived: "Diarsipkan", open: "Terbuka", closed: "Selesai",
};

const POV_STATUS_LABELS: Partial<Record<StatusViewpoint, Record<string, string>>> = {
  opd: {
    draft: "Perlu Anda lengkapi",
    in_review: "Menunggu pemeriksaan BAPPERIDA",
    opd_verification: "Perlu Anda verifikasi",
    approved: "Menunggu aktivasi BAPPERIDA",
    returned: "Perlu Anda perbaiki",
    submitted: "Menunggu pemeriksaan BAPPERIDA",
    under_review: "Sedang diperiksa BAPPERIDA",
  },
  bapperida: {
    in_review: "Perlu Anda periksa",
    opd_verification: "Menunggu verifikasi OPD",
    approved: "Perlu Anda aktifkan",
    submitted: "Perlu Anda periksa",
    under_review: "Sedang Anda periksa",
    returned: "Dikembalikan ke OPD",
  },
  walidata: {
    opd_verification: "Menunggu verifikasi OPD",
    submitted: "Menunggu pemeriksaan BAPPERIDA",
    under_review: "Sedang diperiksa BAPPERIDA",
  },
  pembina_statistik: {
    opd_verification: "Menunggu verifikasi OPD",
    submitted: "Menunggu pemeriksaan BAPPERIDA",
    under_review: "Sedang diperiksa BAPPERIDA",
  },
  pimpinan: {
    approved: "Disetujui, belum diterbitkan",
  },
};

export function statusLabel(value: string | null | undefined, viewpoint: StatusViewpoint = "neutral"): string {
  if (!value) return "-";
  const key = value.toLowerCase();
  return POV_STATUS_LABELS[viewpoint]?.[key] ?? STATUS_LABELS[key] ?? value.replaceAll("_", " ");
}

export function capaianStatusLabel(value: string | null | undefined, viewpoint: StatusViewpoint = "neutral"): string {
  const labels: Record<string, string> = {
    draft: "Draf capaian", submitted: "Capaian dikirim", under_review: "Capaian sedang diperiksa",
    returned: "Capaian perlu perbaikan", approved: "Capaian disetujui",
  };
  if (!value) return "-";
  const key = value.toLowerCase();
  // Laporan capaian tidak punya tahap aktivasi; "approved" berarti sudah disetujui BAPPERIDA.
  if (key === "approved" && (viewpoint === "opd" || viewpoint === "bapperida")) return "Disetujui BAPPERIDA";
  return POV_STATUS_LABELS[viewpoint]?.[key] ?? labels[key] ?? statusLabel(value, viewpoint);
}
