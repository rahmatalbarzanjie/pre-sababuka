import type { Database, QueryResultRow } from "../database.js";
import { ApiError } from "../errors.js";
import type { AuthContext } from "../types/auth.js";
import { recordAudit, type AuditContext } from "./audit-service.js";

type JsonObject = Record<string, unknown>;
interface PicIdentity { name: string; position: string; email: string; whatsapp: string }
interface BaselineIndicatorIdentity extends QueryResultRow { code: string; name: string; unit: string }
interface ProfileRow extends QueryResultRow { id: string | null; organization_id: string; organization_code: string; organization_name: string; response_json: JsonObject; pic_identity?: PicIdentity | null; technical_status: string; planning_status: string; technical_notes: string | null; planning_notes: string | null; submitted_at: string | null; updated_at: string | null; active_account_count?: number; indicator_count?: number; issue_count?: number; issue_names?: string[]; focus_names?: string[] }

const reviewRoles = new Set(["superadmin", "bapperida", "kominfo"]);
const administrationRoles = new Set(["superadmin"]);
const planningReviewRoles = new Set(["superadmin", "bapperida"]);
const technicalReviewRoles = new Set(["superadmin", "kominfo"]);

function role(auth: AuthContext, allowed: Set<string>): boolean { return auth.user.roles.some((item) => allowed.has(item.code)); }
function hasOrganization(auth: AuthContext, organizationId: string): boolean { return auth.user.organizations.some((item) => item.id === organizationId); }

function validateResponse(value: JsonObject): void {
  const serialized = JSON.stringify(value);
  if (serialized.length > 250_000) throw new ApiError(400, "VALIDATION_ERROR", "Isian profil terlalu besar.");
  const pic = value.pic as JsonObject | undefined;
  if (!pic || typeof pic.name !== "string" || !pic.name.trim() || typeof pic.whatsapp !== "string" || !/^\+?[0-9]{9,15}$/u.test(pic.whatsapp.replace(/[\s-]/gu, ""))) {
    throw new ApiError(400, "VALIDATION_ERROR", "Nama PIC dan nomor WhatsApp aktif wajib diisi.");
  }
  const website = value.website as JsonObject | undefined;
  if (!website || !["yes", "no", "unknown"].includes(String(website.has_website ?? ""))) throw new ApiError(400, "VALIDATION_ERROR", "Status website OPD wajib dipilih.");
  if (website.has_website === "yes") {
    try { const url = new URL(String(website.url ?? "")); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); }
    catch { throw new ApiError(400, "VALIDATION_ERROR", "Alamat website OPD tidak valid."); }
  }
  const integration = value.integration as JsonObject | undefined;
  if (integration?.api_available === "yes") {
    try { const url = new URL(String(integration.api_endpoint ?? "")); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); }
    catch { throw new ApiError(400, "VALIDATION_ERROR", "URL API/endpoint tidak valid."); }
    if (integration.api_documentation_url) {
      try { const url = new URL(String(integration.api_documentation_url)); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); }
      catch { throw new ApiError(400, "VALIDATION_ERROR", "URL dokumentasi API tidak valid."); }
    }
  }
  const baseline = Array.isArray(value.baseline_items) ? value.baseline_items : [];
  if (baseline.length > 500) throw new ApiError(400, "VALIDATION_ERROR", "Maksimal 500 baris baseline per OPD.");
  const baselineKeys = new Set<string>();
  for (const [index, raw] of baseline.entries()) {
    const item = raw as JsonObject;
    if (!item || !["rpjmd", "renstra"].includes(String(item.plan_type)) || typeof item.indicator_code !== "string" || !item.indicator_code.trim() || typeof item.indicator_name !== "string" || !item.indicator_name.trim() || typeof item.period !== "string" || !item.period.trim() || typeof item.realization !== "string" || !item.realization.trim()) {
      throw new ApiError(400, "VALIDATION_ERROR", `Baris baseline ${index + 1} belum lengkap.`);
    }
    const key = `${item.indicator_code}:${item.period}`.toLowerCase();
    if (baselineKeys.has(key)) throw new ApiError(400, "VALIDATION_ERROR", `Baseline ${item.indicator_name} untuk periode ${item.period} tercatat lebih dari satu kali.`);
    baselineKeys.add(key);
  }
}

export class OpdProfileService {
  constructor(private readonly db: Database) {}

  private async getPicIdentity(organizationId: string): Promise<PicIdentity | null> {
    const result = await this.db.query<PicIdentity & QueryResultRow>(
      `SELECT u.full_name AS name, rr.job_title AS position,
              rr.contact_email::text AS email, rr.contact_phone AS whatsapp
       FROM sababuka.user_registration_requests rr
       JOIN sababuka.users u ON u.id=rr.user_id
         AND u.status='active' AND u.archived_at IS NULL
       JOIN sababuka.user_role_assignments ura ON ura.user_id=u.id AND ura.ends_at IS NULL
       JOIN sababuka.roles active_role ON active_role.id=ura.role_id AND active_role.code='opd'
       JOIN sababuka.organization_memberships om ON om.user_id=u.id
         AND om.organization_id=$1 AND om.ends_at IS NULL
       WHERE rr.status='approved' AND rr.approved_organization_id=$1
       ORDER BY om.is_primary DESC, rr.reviewed_at DESC NULLS LAST
       LIMIT 1`, [organizationId],
    );
    return result.rows[0] ?? null;
  }

  private async withAuthoritativePic(organizationId: string, response: JsonObject): Promise<{ response: JsonObject; pic: PicIdentity | null }> {
    const pic = await this.getPicIdentity(organizationId);
    return { response: pic ? { ...response, pic } : { ...response, pic: {} }, pic };
  }

  private async withAuthoritativeBaseline(organizationId: string, response: JsonObject): Promise<JsonObject> {
    const baseline = Array.isArray(response.baseline_items) ? response.baseline_items as JsonObject[] : [];
    if (!baseline.length) return response;
    const codes = [...new Set(baseline.map((item) => String(item.indicator_code ?? "").trim()).filter(Boolean))];
    const result = await this.db.query<BaselineIndicatorIdentity>(
      `SELECT i.code, i.name, COALESCE(u.symbol,u.name) AS unit
       FROM sababuka.indicators i
       JOIN LATERAL (SELECT v.* FROM sababuka.indicator_versions v WHERE v.indicator_id=i.id ORDER BY v.version_number DESC LIMIT 1) iv ON true
       JOIN sababuka.units u ON u.id=iv.unit_id
       LEFT JOIN sababuka.indicator_organizations io ON io.indicator_version_id=iv.id AND io.organization_id=$1
       WHERE i.archived_at IS NULL AND i.code=ANY($2::text[])
         AND (i.owner_organization_id=$1 OR io.organization_id=$1)`,
      [organizationId, codes],
    );
    const identities = new Map(result.rows.map((item) => [item.code, item]));
    const missing = codes.filter((code) => !identities.has(code));
    if (missing.length) throw new ApiError(400, "VALIDATION_ERROR", `Indikator baseline tidak menjadi tugas OPD ini: ${missing.join(", ")}.`);
    return { ...response, baseline_items: baseline.map((item) => {
      const identity = identities.get(String(item.indicator_code).trim());
      return identity ? { ...item, indicator_name: identity.name, unit: identity.unit } : item;
    }) };
  }

  private assertScope(auth: AuthContext, organizationId: string): void {
    if (!hasOrganization(auth, organizationId) && !role(auth, reviewRoles)) throw new ApiError(403, "SCOPE_DENIED", "Anda tidak memiliki akses ke profil OPD ini.");
  }

  private assertWritable(auth: AuthContext, organizationId: string): void {
    if (!hasOrganization(auth, organizationId) && !role(auth, administrationRoles)) {
      throw new ApiError(403, "SCOPE_DENIED", "Isi formulir hanya dapat diubah oleh PIC OPD atau superadmin.");
    }
  }

  async list(auth: AuthContext) {
    const reviewer = role(auth, reviewRoles);
    const organizationIds = auth.user.organizations.map((item) => item.id);
    const result = await this.db.query<ProfileRow>(
      `SELECT p.id::text,o.id::text AS organization_id,o.code AS organization_code,o.name AS organization_name,
              COALESCE(p.response_json,'{}'::jsonb) AS response_json,
              COALESCE(p.technical_status,'draft') AS technical_status,COALESCE(p.planning_status,'draft') AS planning_status,
              p.technical_notes,p.planning_notes,p.submitted_at::text,p.updated_at::text,
              (SELECT count(*)::int FROM sababuka.opd_profile_documents d WHERE d.profile_id=p.id AND d.deleted_at IS NULL) AS document_count,
              (SELECT count(DISTINCT u.id)::int
               FROM sababuka.users u
               WHERE u.archived_at IS NULL AND u.status='active'
                 AND (EXISTS (SELECT 1 FROM sababuka.organization_memberships om
                              WHERE om.user_id=u.id AND om.organization_id=o.id AND om.ends_at IS NULL)
                      -- Peran berlingkup global (mis. Verifikator BAPPERIDA) tidak punya keanggotaan OPD;
                      -- akun tetap dihitung lewat pendaftaran yang disetujui untuk instansi tersebut.
                      OR EXISTS (SELECT 1 FROM sababuka.user_registration_requests rr
                                 WHERE rr.user_id=u.id AND rr.requested_organization_id=o.id AND rr.status='approved'))) AS active_account_count,
              (SELECT count(DISTINCT i.id)::int
               FROM sababuka.indicators i
               JOIN LATERAL (SELECT v.id FROM sababuka.indicator_versions v WHERE v.indicator_id=i.id ORDER BY v.version_number DESC LIMIT 1) iv ON true
               LEFT JOIN sababuka.indicator_organizations io ON io.indicator_version_id=iv.id
               WHERE i.archived_at IS NULL AND (i.owner_organization_id=o.id OR io.organization_id=o.id)) AS indicator_count,
              (SELECT count(DISTINCT c.id)::int
               FROM sababuka.indicators i
               JOIN sababuka.categories c ON c.id=i.category_id AND c.archived_at IS NULL
               JOIN LATERAL (SELECT v.id FROM sababuka.indicator_versions v WHERE v.indicator_id=i.id ORDER BY v.version_number DESC LIMIT 1) iv ON true
               LEFT JOIN sababuka.indicator_organizations io ON io.indicator_version_id=iv.id
               WHERE i.archived_at IS NULL AND (i.owner_organization_id=o.id OR io.organization_id=o.id)) AS issue_count,
              COALESCE((SELECT array_agg(DISTINCT c.name ORDER BY c.name)
               FROM sababuka.indicators i
               JOIN sababuka.categories c ON c.id=i.category_id AND c.archived_at IS NULL
               JOIN LATERAL (SELECT v.id FROM sababuka.indicator_versions v WHERE v.indicator_id=i.id ORDER BY v.version_number DESC LIMIT 1) iv ON true
               LEFT JOIN sababuka.indicator_organizations io ON io.indicator_version_id=iv.id
               WHERE i.archived_at IS NULL AND (i.owner_organization_id=o.id OR io.organization_id=o.id)), '{}') AS issue_names,
              COALESCE((SELECT array_agg(DISTINCT f.name ORDER BY f.name)
               FROM sababuka.indicators i
               JOIN sababuka.categories c ON c.id=i.category_id AND c.archived_at IS NULL
               JOIN sababuka.policy_focuses f ON f.id=c.policy_focus_id AND f.archived_at IS NULL
               JOIN LATERAL (SELECT v.id FROM sababuka.indicator_versions v WHERE v.indicator_id=i.id ORDER BY v.version_number DESC LIMIT 1) iv ON true
               LEFT JOIN sababuka.indicator_organizations io ON io.indicator_version_id=iv.id
               WHERE i.archived_at IS NULL AND (i.owner_organization_id=o.id OR io.organization_id=o.id)), '{}') AS focus_names
       FROM sababuka.organizations o LEFT JOIN sababuka.opd_digital_profiles p ON p.organization_id=o.id
       WHERE o.is_active=true AND o.organization_type='opd' AND ($1::boolean OR o.id=ANY($2::uuid[]))
       ORDER BY p.updated_at DESC NULLS LAST, o.name, o.code`, [reviewer, organizationIds]);
    return { data: result.rows, can_review_technical: role(auth, technicalReviewRoles), can_review_planning: role(auth, planningReviewRoles) };
  }

  async get(auth: AuthContext, organizationId: string) {
    this.assertScope(auth, organizationId);
    const result = await this.db.query<ProfileRow>(
      `SELECT p.id::text,p.organization_id::text,o.code AS organization_code,o.name AS organization_name,p.response_json,
              p.technical_status,p.planning_status,p.technical_notes,p.planning_notes,p.submitted_at::text,p.updated_at::text
       FROM sababuka.opd_digital_profiles p JOIN sababuka.organizations o ON o.id=p.organization_id WHERE p.organization_id=$1`, [organizationId]);
    if (result.rows[0]) {
      const current = result.rows[0];
      const authoritative = await this.withAuthoritativePic(organizationId, current.response_json);
      return { ...current, response_json: authoritative.response, pic_identity: authoritative.pic };
    }
    const org = await this.db.query<{ code: string; name: string }>("SELECT code,name FROM sababuka.organizations WHERE id=$1 AND is_active=true", [organizationId]);
    if (!org.rows[0]) throw new ApiError(404, "NOT_FOUND", "OPD tidak ditemukan.");
    const authoritative = await this.withAuthoritativePic(organizationId, {});
    return { id: null, organization_id: organizationId, organization_code: org.rows[0].code, organization_name: org.rows[0].name, response_json: authoritative.response, pic_identity: authoritative.pic, technical_status: "draft", planning_status: "draft", technical_notes: null, planning_notes: null, submitted_at: null, updated_at: null };
  }

  async save(auth: AuthContext, organizationId: string, response: JsonObject, audit: AuditContext) {
    this.assertWritable(auth, organizationId);
    const authoritative = await this.withAuthoritativePic(organizationId, response);
    if (!authoritative.pic) throw new ApiError(409, "CONFLICT", "PIC OPD belum terhubung. Daftarkan dan setujui akun PIC OPD terlebih dahulu.");
    const normalizedResponse = await this.withAuthoritativeBaseline(organizationId, authoritative.response);
    validateResponse(normalizedResponse);
    const existing = await this.db.query<{ id: string; technical_status: string; planning_status: string }>("SELECT id::text,technical_status,planning_status FROM sababuka.opd_digital_profiles WHERE organization_id=$1", [organizationId]);
    if (existing.rows[0] && !role(auth, administrationRoles) && (!["draft", "returned"].includes(existing.rows[0].technical_status) || !["draft", "returned"].includes(existing.rows[0].planning_status))) {
      throw new ApiError(409, "CONFLICT", "Profil yang sedang diperiksa tidak dapat diubah.");
    }
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO sababuka.opd_digital_profiles (organization_id,response_json,created_by,updated_by)
       VALUES ($1,$2::jsonb,$3,$3)
       ON CONFLICT (organization_id) DO UPDATE SET response_json=EXCLUDED.response_json,updated_by=EXCLUDED.updated_by,
         technical_status=CASE WHEN sababuka.opd_digital_profiles.technical_status='returned' THEN 'draft' ELSE sababuka.opd_digital_profiles.technical_status END,
         planning_status=CASE WHEN sababuka.opd_digital_profiles.planning_status='returned' THEN 'draft' ELSE sababuka.opd_digital_profiles.planning_status END
       RETURNING id::text`, [organizationId, JSON.stringify(normalizedResponse), auth.user.id]);
    await recordAudit(this.db, { ...audit, eventType: "opd_profile.saved", entityType: "opd_digital_profile", entityId: result.rows[0]!.id, organizationId, afterData: { baseline_count: Array.isArray(normalizedResponse.baseline_items) ? normalizedResponse.baseline_items.length : 0, pic_source: "approved_registration" } });
    return this.get(auth, organizationId);
  }

  async submit(auth: AuthContext, organizationId: string, audit: AuditContext) {
    this.assertWritable(auth, organizationId);
    const profile = await this.get(auth, organizationId);
    if (!profile.id) throw new ApiError(409, "CONFLICT", "Simpan formulir sebelum mengirim untuk pemeriksaan.");
    validateResponse(profile.response_json);
    await this.db.query(`UPDATE sababuka.opd_digital_profiles SET technical_status='submitted',planning_status='submitted',submitted_by=$2,submitted_at=now(),technical_notes=NULL,planning_notes=NULL,updated_by=$2 WHERE id=$1`, [profile.id, auth.user.id]);
    await recordAudit(this.db, { ...audit, eventType: "opd_profile.submitted", entityType: "opd_digital_profile", entityId: profile.id, organizationId });
    return this.get(auth, organizationId);
  }

  async review(auth: AuthContext, organizationId: string, track: "technical" | "planning", decision: "verify" | "return", notes: string | null, audit: AuditContext) {
    const allowed = track === "technical" ? technicalReviewRoles : planningReviewRoles;
    if (!role(auth, allowed)) throw new ApiError(403, "PERMISSION_DENIED", "Anda tidak berwenang memeriksa bagian ini.");
    if (decision === "return" && !notes?.trim()) throw new ApiError(400, "VALIDATION_ERROR", "Catatan perbaikan wajib diisi.");
    const profile = await this.get(auth, organizationId);
    const currentStatus = track === "technical" ? profile.technical_status : profile.planning_status;
    if (!profile.id || currentStatus !== "submitted") throw new ApiError(409, "CONFLICT", "Profil belum menunggu pemeriksaan pada bagian ini.");
    const status = decision === "verify" ? "verified" : "returned";
    await this.db.query(`UPDATE sababuka.opd_digital_profiles SET ${track}_status=$2,${track}_notes=$3,${track}_reviewed_by=$4,${track}_reviewed_at=now(),updated_by=$4 WHERE id=$1`, [profile.id, status, notes?.trim() || null, auth.user.id]);
    await recordAudit(this.db, { ...audit, eventType: `opd_profile.${track}_${status}`, entityType: "opd_digital_profile", entityId: profile.id, organizationId, afterData: { notes: notes?.trim() || null } });
    return this.get(auth, organizationId);
  }

  async listDocuments(auth: AuthContext, organizationId: string) {
    const profile = await this.get(auth, organizationId);
    if (!profile.id) return { data: [] };
    const result = await this.db.query(`SELECT id::text,document_type,document_year,original_filename,mime_type,byte_size::text,uploaded_at::text FROM sababuka.opd_profile_documents WHERE profile_id=$1 AND deleted_at IS NULL ORDER BY uploaded_at DESC`, [profile.id]);
    return { data: result.rows };
  }

  async prepareDocument(auth: AuthContext, organizationId: string) {
    this.assertWritable(auth, organizationId);
    const profile = await this.get(auth, organizationId);
    if (!profile.id) throw new ApiError(409, "CONFLICT", "Simpan formulir sebelum mengunggah dokumen.");
    if (!role(auth, administrationRoles) && (!["draft", "returned"].includes(profile.technical_status) || !["draft", "returned"].includes(profile.planning_status))) throw new ApiError(409, "CONFLICT", "Dokumen tidak dapat diubah saat formulir diperiksa.");
    return profile;
  }

  async createDocument(auth: AuthContext, profileId: string, organizationId: string, input: { documentType: string; documentYear: number | null; originalFilename: string; storageKey: string; mimeType: string; byteSize: number; checksum: string }, audit: AuditContext) {
    const result = await this.db.query<{ id: string }>(`INSERT INTO sababuka.opd_profile_documents (profile_id,document_type,document_year,original_filename,storage_key,mime_type,byte_size,checksum_sha256,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id::text`, [profileId,input.documentType,input.documentYear,input.originalFilename,input.storageKey,input.mimeType,input.byteSize,input.checksum,auth.user.id]);
    await recordAudit(this.db, { ...audit, eventType: "opd_profile.document_uploaded", entityType: "opd_profile_document", entityId: result.rows[0]!.id, organizationId, afterData: { document_type: input.documentType, document_year: input.documentYear, filename: input.originalFilename, checksum: input.checksum } });
    return { id: result.rows[0]!.id };
  }

  async getDocument(auth: AuthContext, organizationId: string, documentId: string) {
    this.assertScope(auth, organizationId);
    const result = await this.db.query(`SELECT d.* FROM sababuka.opd_profile_documents d JOIN sababuka.opd_digital_profiles p ON p.id=d.profile_id WHERE d.id=$1 AND p.organization_id=$2 AND d.deleted_at IS NULL`, [documentId, organizationId]);
    if (!result.rows[0]) throw new ApiError(404, "NOT_FOUND", "Dokumen tidak ditemukan.");
    return result.rows[0] as Record<string, unknown>;
  }
}
