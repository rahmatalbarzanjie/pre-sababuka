/**
 * Menandai kolom form yang ditolak server (aria-invalid). api() mengumumkan nama kolom bermasalah lewat event
 * "sababuka:invalid-fields"; kolom dicari lewat atribut data-field yang sama dengan nama properti body API,
 * di dalam dialog yang terbuka atau, bila tidak ada, di seluruh halaman. Tanda hilang saat kolom diubah.
 */
export function installServerFieldMarking(): () => void {
  const onInvalid = (event: Event) => {
    const names = (event as CustomEvent<string[]>).detail ?? [];
    const scope: ParentNode = document.querySelector("[role=\"dialog\"]") ?? document;
    let focused = false;
    for (const path of names) {
      const element = scope.querySelector<HTMLElement>(`[data-field="${CSS.escape(path.split(".")[0] ?? path)}"]`);
      if (!element) continue;
      element.setAttribute("aria-invalid", "true");
      const clear = () => element.removeAttribute("aria-invalid");
      element.addEventListener("input", clear, { once: true });
      element.addEventListener("change", clear, { once: true });
      if (!focused) { element.focus(); focused = true; }
    }
  };
  window.addEventListener("sababuka:invalid-fields", onInvalid);
  return () => window.removeEventListener("sababuka:invalid-fields", onInvalid);
}
