import type { components } from "./generated/api-schema";

export type EffectiveRole = components["schemas"]["EffectiveRole"];

export interface Organization {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  organization_type: string;
  parent_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  indicator_count?: number;
  category_count?: number;
}

export type CurrentUser = components["schemas"]["CurrentUser"];
export type MenuItem = components["schemas"]["MenuItem"];

export interface PageMeta {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  metadata_complete_count?: number;
  active_count?: number;
}

export interface PageResponse<T> {
  data: T[];
  meta: PageMeta;
}

export interface UserSummary {
  id: string;
  email: string;
  username: string | null;
  full_name: string;
  status: "invited" | "active" | "suspended" | "locked" | "archived";
  has_password: boolean;
  organization_id: string | null;
  organization_code: string | null;
  organization_name: string | null;
  requested_organization_id: string | null;
  requested_organization_code: string | null;
  requested_organization_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  job_title: string | null;
  employee_id: string | null;
  request_note: string | null;
  registration_status: "pending" | "approved" | "rejected" | null;
  registration_created_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  permissions: string[];
}

export interface Permission {
  id: string;
  code: string;
  name: string;
  description: string | null;
  risk_level: "normal" | "elevated" | "critical";
}

export interface AdminMenuItem {
  id: string;
  code: string;
  parent_id: string | null;
  parent_code: string | null;
  label: string;
  icon: string | null;
  route_name: string | null;
  required_permission: string | null;
  display_order: number;
  is_active: boolean;
}

export interface SystemSetting {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

export interface LoginAnnouncement {
  enabled: boolean;
  title?: string;
  message?: string;
  image_url?: string | null;
  action_label?: string | null;
  action_url?: string | null;
  updated_at?: string | null;
}

export interface FeatureFlag {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  configuration: Record<string, unknown>;
  updated_at: string;
}

export interface PolicyFocus {
  id: string;
  code: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

export interface Category {
  id: string;
  code: string;
  name: string;
  description: string | null;
  policy_focus_id: string | null;
  policy_focus_name: string | null;
  parent_id: string | null;
  display_order: number;
  is_active: boolean;
  review_status: "draft" | "in_review" | "approved" | "rejected";
  submitted_by: string | null;
  submitted_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_notes: string | null;
  indicator_count: number;
  updated_at: string;
}

export interface Unit {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  decimal_places: number;
}

export interface Period {
  id: string;
  code: string;
  label: string;
  period_type: string;
  starts_on: string;
  ends_on: string;
}

export interface IndicatorOrganization {
  organization_id: string;
  organization_name: string;
  responsibility: "primary_producer" | "supporter" | "validator" | "curator";
  is_primary: boolean;
}

export interface IndicatorTarget {
  id: string;
  period_id: string;
  period_code: string;
  period_label: string;
  numeric_value: string | null;
  text_value: string | null;
  notes: string | null;
}

export interface Indicator {
  id: string;
  code: string;
  kodref_ip: string | null;
  name: string;
  category_id: string;
  category_code: string;
  category_name: string;
  policy_focus_id: string | null;
  policy_focus_code: string | null;
  policy_focus_name: string | null;
  category_review_status: "draft" | "in_review" | "approved" | "rejected";
  owner_organization_id: string | null;
  owner_organization_name: string | null;
  origin_type: "rpjmd_master" | "opd_manual";
  planning_document_type: "renstra" | "renja" | "other" | null;
  planning_document_reference: string | null;
  proposed_by_organization_id: string | null;
  is_active: boolean;
  updated_at: string;
  version_id: string;
  version_number: number;
  definition: string;
  formula: string | null;
  frequency: string;
  data_type: string;
  direction: "increase" | "decrease" | "maintain" | null;
  source_reference: string | null;
  access_level: string;
  effective_from: string;
  status: "draft" | "in_review" | "opd_verification" | "approved" | "active" | "retired";
  unit_id: string;
  unit_name: string;
  unit_symbol: string | null;
  organizations: IndicatorOrganization[];
  targets: IndicatorTarget[];
  target_count: number;
  has_definition: boolean;
  has_owner: boolean;
  has_unit: boolean;
  has_source: boolean;
  has_rpjmd_targets: boolean;
  metadata_complete: boolean;
}

export interface BulkTransitionResult {
  processed: Array<{ id: string; status: string }>;
  skipped: Array<{ id: string; reason: string }>;
}

export interface SubmissionObservation {
  indicator_version_id: string;
  indicator_code: string;
  indicator_name: string;
  data_type: string;
  unit_name: string;
  unit_symbol: string | null;
  target_numeric_value: string | null;
  target_text_value: string | null;
  observation_id: string | null;
  numeric_value: string | null;
  text_value: string | null;
  notes: string | null;
  quality_status: string | null;
  frequency: string;
}

export interface Submission {
  id: string;
  dataset_version_id: string;
  organization_id: string;
  organization_code: string;
  organization_name: string;
  reporting_period_id: string;
  period_code: string;
  period_label: string;
  period_type: string;
  submission_method: string;
  status: "draft" | "submitted" | "under_review" | "returned" | "approved";
  row_count: number;
  indicator_count: number;
  submitted_at: string | null;
  approved_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
  observations: SubmissionObservation[];
}

export interface SubmissionEvidence {
  id: string;
  batch_id: string;
  indicator_version_id: string | null;
  indicator_code: string | null;
  indicator_name: string | null;
  original_filename: string;
  mime_type: string;
  byte_size: string;
  checksum_sha256: string;
  uploaded_by: string;
  uploaded_by_name: string;
  uploaded_at: string;
}

export interface StatisticalGuidanceNote {
  id: string;
  batch_id: string;
  indicator_version_id: string | null;
  indicator_name: string | null;
  guidance_type: "standard" | "metadata" | "methodology" | "consistency";
  notes: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
}

export interface PublicationItem {
  id: string; observation_id: string; dataset_version_id: string; display_order: number;
  indicator_code: string; indicator_name: string; category_name: string; policy_focus_name: string | null; period_label: string;
  numeric_value: string | null; text_value: string | null; unit_name: string; unit_symbol: string | null; organization_name: string;
  is_currently_eligible: boolean;
}
export interface Publication {
  id: string; publication_key: string; version_number: number; publication_number: string;
  title: string; description: string | null; status: "draft" | "active" | "replaced" | "withdrawn";
  effective_at: string | null; change_notes: string | null; item_count: number; eligible_item_count: number;
  needs_reconciliation: boolean; items: PublicationItem[];
  created_at: string; updated_at: string;
}
export interface PublicationCandidate {
  observation_id: string; dataset_version_id: string; indicator_code: string; indicator_name: string;
  period_id: string; period_label: string; numeric_value: string | null; text_value: string | null;
  unit_name: string; unit_symbol: string | null; organization_name: string; approved_at: string;
  category_name: string; policy_focus_name: string | null;
}

export interface NotificationItem { id: string; notification_type: string; title: string; message: string; entity_type: string | null; entity_id: string | null; read_at: string | null; created_at: string }
export interface AuditEvent { id: string; actor_id: string | null; actor_name: string | null; organization_id: string | null; organization_name: string | null; event_type: string; entity_type: string; entity_id: string | null; metadata: Record<string, unknown>; request_id: string | null; ip_address: string | null; occurred_at: string }

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    request_id?: string;
    details?: Array<Record<string, unknown>>;
  };
}
