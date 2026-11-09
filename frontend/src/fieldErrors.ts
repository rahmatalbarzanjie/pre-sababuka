import { ApiClientError, invalidFieldNames } from "./api";

/**
 * Menandai kolom form yang ditolak server (aria-invalid) berdasarkan detail validasi API.
 * Kolom dicari lewat atribut data-field yang sama dengan nama properti body. Tanda hilang saat pengguna mengubah kolom.
 */
export function markInvalidFields(root: ParentNode | null, error: unknown): void {
  if (!root || !(error instanceof ApiClientError)) return;
  root.querySelectorAll<HTMLElement>("[aria-invalid=\"true\"]").forEach((element) => element.removeAttribute("aria-invalid"));
  let focused = false;
  for (const path of invalidFieldNames(error.details)) {
    const element = root.querySelector<HTMLElement>(`[data-field="${CSS.escape(path.split(".")[0] ?? path)}"]`);
    if (!element) continue;
    element.setAttribute("aria-invalid", "true");
    const clear = () => element.removeAttribute("aria-invalid");
    element.addEventListener("input", clear, { once: true });
    element.addEventListener("change", clear, { once: true });
    if (!focused) { element.focus({ preventScroll: false }); focused = true; }
  }
}
