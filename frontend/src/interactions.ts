/*
 * Lapisan interaksi SABABUKA (13 Nov 2026, permintaan pemilik: tampilan lebih interaktif).
 * Murni peningkatan tampilan lewat DOM: tidak mengubah data atau logika halaman, dan semua efek gerak
 * dilewati bila perangkat memakai prefers-reduced-motion. Aman bila gagal: halaman tetap berfungsi penuh.
 */
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

const COUNT_SELECTOR = ".metric-card strong, .task-card strong, .readiness-metrics strong, .executive-signal strong";
const REVEAL_SELECTOR = ".page-shell .panel, .executive-cards > article, .readiness-mobile-card, .submission-mobile-list > button";
const RIPPLE_SELECTOR = ".button, .task-card, button.metric-card";
const SPOTLIGHT_SELECTOR = ".metric-card, .task-card, .executive-cards > article";

/* ---------- Hitung naik pada angka ringkasan ---------- */
const counted = new WeakSet<Element>();
let countObserver: IntersectionObserver | null = null;

function animateCount(el: HTMLElement) {
  const node = el.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE || el.childNodes.length !== 1) return;
  const raw = (node.nodeValue ?? "").trim();
  if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(raw)) return;
  const target = Number(raw.replace(/\./g, ""));
  if (!Number.isFinite(target) || target < 5) return;
  const format = new Intl.NumberFormat("id-ID");
  const duration = 700;
  const started = performance.now();
  let last = "";
  const step = (now: number) => {
    // Bila React sudah mengganti isi teks selama animasi, hentikan tanpa menimpa nilai baru.
    if (last && node.nodeValue !== last) return;
    const t = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    last = t < 1 ? format.format(Math.round(target * eased)) : raw;
    node.nodeValue = last;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function registerCount(el: Element) {
  if (counted.has(el) || reduced()) return;
  counted.add(el);
  countObserver ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      countObserver?.unobserve(entry.target);
      animateCount(entry.target as HTMLElement);
    }
  }, { threshold: 0.4 });
  countObserver.observe(el);
}

/* ---------- Muncul saat digulir ---------- */
const revealed = new WeakSet<Element>();
let revealObserver: IntersectionObserver | null = null;

function registerReveal(el: Element) {
  if (revealed.has(el) || reduced()) return;
  revealed.add(el);
  const rect = el.getBoundingClientRect();
  if (rect.top < window.innerHeight * 0.92) return; // sudah terlihat: biarkan animasi masuk halaman bekerja
  el.classList.add("vt-reveal");
  revealObserver ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      revealObserver?.unobserve(entry.target);
      entry.target.classList.add("vt-in");
    }
  }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
  revealObserver.observe(el);
}

function scan(root: ParentNode) {
  root.querySelectorAll(COUNT_SELECTOR).forEach(registerCount);
  root.querySelectorAll(REVEAL_SELECTOR).forEach(registerReveal);
}

/* ---------- Riak sentuh pada tombol dan kartu ---------- */
function onPointerDown(event: PointerEvent) {
  if (reduced() || event.button !== 0) return;
  const target = (event.target as Element | null)?.closest<HTMLElement>(RIPPLE_SELECTOR);
  if (!target || (target as HTMLButtonElement).disabled) return;
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.6;
  const ripple = document.createElement("span");
  ripple.className = "vt-ripple";
  ripple.setAttribute("aria-hidden", "true");
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
  target.classList.add("vt-ripple-host");
  target.appendChild(ripple);
  window.setTimeout(() => ripple.remove(), 650);
}

/* ---------- Sorotan mengikuti kursor ---------- */
let spotlightFrame = 0;
function onPointerMove(event: PointerEvent) {
  if (event.pointerType !== "mouse" || spotlightFrame) return;
  const { clientX, clientY } = event;
  const origin = event.target as Element | null;
  spotlightFrame = requestAnimationFrame(() => {
    spotlightFrame = 0;
    const card = origin?.closest<HTMLElement>(SPOTLIGHT_SELECTOR);
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${clientX - rect.left}px`);
    card.style.setProperty("--my", `${clientY - rect.top}px`);
  });
}

/* ---------- Bilah progres saat pindah halaman ---------- */
function installRouteProgress() {
  const bar = document.createElement("div");
  bar.className = "vt-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);
  let timer = 0;
  const run = () => {
    if (reduced()) return;
    window.clearTimeout(timer);
    bar.style.transition = "none";
    bar.style.opacity = "1";
    bar.style.transform = "scaleX(0.08)";
    void bar.offsetWidth;
    bar.style.transition = "transform 500ms cubic-bezier(.22,.8,.3,1), opacity 300ms ease 450ms";
    bar.style.transform = "scaleX(1)";
    timer = window.setTimeout(() => { bar.style.opacity = "0"; }, 520);
  };
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    history[method] = function patched(this: History, ...args: Parameters<History["pushState"]>) {
      const before = location.pathname;
      const result = original.apply(this, args);
      if (location.pathname !== before) run();
      return result;
    };
  }
  window.addEventListener("popstate", run);
}

/* ---------- Tombol kembali ke atas ---------- */
function installBackToTop() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "vt-top";
  button.setAttribute("aria-label", "Kembali ke atas halaman");
  button.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>';
  button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" }));
  document.body.appendChild(button);
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; button.classList.toggle("show", window.scrollY > 700); });
  }, { passive: true });
}

/* ---------- Pintasan papan ketik: "/" memfokuskan kolom cari ---------- */
function onKeyDown(event: KeyboardEvent) {
  if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
  const active = document.activeElement as HTMLElement | null;
  if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active?.isContentEditable) return;
  const search = document.querySelector<HTMLInputElement>("main input[type=search], main .search-box input, main .search-field input");
  if (!search) return;
  event.preventDefault();
  search.focus();
  search.select();
}

export function initInteractions() {
  try {
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    if (finePointer()) document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    installRouteProgress();
    installBackToTop();
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; scan(document); });
    }).observe(document.body, { childList: true, subtree: true });
    scan(document);
  } catch {
    // Efek tambahan tidak boleh mengganggu aplikasi.
  }
}
