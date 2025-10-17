// =============================================================
// Data & State Management
// =============================================================
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT9_zU6E9FM_tBZ_APPRU11yCU9zEoCMjbyppEL0Z10I4JFr2RoKg5-6GB53WHOD7FZbXrKjdUdcs9z/pub?gid=0&single=true&output=csv";

// Global State
let members = [];
let source = "seed";
let error = null;
let syncedAt = null;
let state = {
    searchQ: "",
    sortKey: "recent", // 'recent' | 'name'
    monthKey: "All",
    promoKey: "All" 
};

// Data Seed (Fallback jika fetch gagal)
const SEED_MEMBERS = [
    { id: "MTS-001", name: "Aulia Rahman", city: "Yogyakarta", promo: "Promo Pribadi", reward: "Termos Mumtas", qualifiedAt: "2025-09-10", rank: "Manager", photo: "https://placehold.co/80x80/a3b18a/2f4f3a?text=AR" },
    { id: "MTS-002", name: "Dewi Kartika", city: "Sleman", promo: "Promo Pribadi", reward: "IDR 1,5 Juta", qualifiedAt: "2025-10-11", rank: "Manager", photo: null },
    { id: "MTS-003", name: "Rizky Maulana", city: "Bantul", promo: "Promo Pribadi", reward: "IDR 2,5 Juta", qualifiedAt: "2025-10-05", rank: "Manager", photo: null },
    { id: "MTS-004", name: "Nadia Syifa", city: "Magelang", promo: "Promo Peringkat", reward: "LM 2 Juta", qualifiedAt: "2025-10-09", rank: "Gold Manager", photo: null },
    { id: "MTS-005", name: "Fajar Hidayat", city: "Kulon Progo", promo: "Promo Peringkat", reward: "HP 4 Juta", qualifiedAt: "2025-10-11", rank: "Gold Manager", photo: null },
    { id: "MTS-006", name: "Siti Nurhaliza", city: "Gunungkidul", promo: "Promo Peringkat", reward: "iPad 7,5 Juta", qualifiedAt: "2025-09-12", rank: "Diamond Manager", photo: null },
    { id: "MTS-010", name: "Farah Azzahra", city: "Bantul", promo: "Loyal Manager", reward: "LM 10 Juta", qualifiedAt: "2025-09-04", rank: "Crown Manager", photo: null },
];

// =============================================================
// Helper Functions
// =============================================================
const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const fmtMonthKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const toMonthLabelID = (key) => {
  if (key === "All") return "Semua Bulan";
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_ID[(m - 1)]} ${y}`;
};

const formatDateID = (dateStr) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDate();
  const month = MONTHS_ID[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

const classNames = (...s) => s.filter(Boolean).join(" ");

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function rankIcon(rank) {
    const r = (rank || "").toLowerCase();
    let iconName = 'Star';
    if (r.includes("crown")) iconName = 'Crown';
    else if (r.includes("diamond")) iconName = 'Gem';
    else if (r.includes("gold")) iconName = 'Trophy';
    return `<i data-lucide="${iconName}" class="h-4 w-4"></i>`;
}

function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];
        if (ch === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === "," && !inQuotes) {
            row.push(cell);
            cell = "";
        } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
            if (cell !== "" || row.length) {
                row.push(cell);
                cell = "";
            }
            if (row.length) {
                rows.push(row);
                row = [];
            }
            if (ch === "\r" && next === "\n") i++;
        } else {
            cell += ch;
        }
    }
    if (cell !== "" || row.length) row.push(cell);
    if (row.length) rows.push(row);
    return rows.map((r) => r.map((c) => c.replace(/^\uFEFF/, "").trim()));
}

// =============================================================
// Data Fetching and Core Logic
// =============================================================
async function fetchData() {
    try {
        error = null;
        const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const text = await res.text();
        const rows = parseCSV(text).filter((r) => r.length && r.some(Boolean));
        if (rows.length <= 1) throw new Error("CSV kosong atau hanya header");
        const header = rows[0].map((h) => h.toLowerCase().trim());

        const hIndex = (...aliases) =>
            header.findIndex((x) => aliases.map((a) => a.toLowerCase()).includes(x));

        const idx = {
            id: hIndex("id", "kode", "agent id", "agen id"),
            name: hIndex("name", "nama", "nama member", "namaagen"),
            city: hIndex("city", "kota", "kota domisili", "domisili"),
            promo: hIndex("promo", "program", "promo name", "nama promo", "program promo"),
            reward: hIndex("reward", "hadiah", "reward name", "reward / hadiah", "hadiah/reward"),
            qualifiedAt: hIndex(
                "qualifiedat", "qualified_at", "tanggal", "tgl", "date",
                "tanggal qualified", "tgl qualified", "tanggal memenuhi syarat"
            ),
            rank: hIndex("rank", "level", "peringkat"),
            photo: hIndex("photo", "foto", "gambar", "image", "avatar", "url"),
        }

        const missing = Object.entries(idx)
            .filter(([k, v]) =>
                ["id", "name", "city", "promo", "reward", "qualifiedAt"].includes(k) &&
                v === -1
            )
            .map(([k]) => k);

        if (missing.length) throw new Error(`Kolom wajib hilang: ${missing.join(", ")}`);

        const data = rows
            .slice(1)
            .map((cols) => ({
                id: idx.id !== -1 ? cols[idx.id] : "",
                name: idx.name !== -1 ? cols[idx.name] : "",
                city: idx.city !== -1 ? cols[idx.city] : "",
                promo: idx.promo !== -1 ? cols[idx.promo] : "",
                reward: idx.reward !== -1 ? cols[idx.reward] : "",
                qualifiedAt: idx.qualifiedAt !== -1 ? cols[idx.qualifiedAt] : "",
                rank: ((idx.rank !== -1 ? cols[idx.rank] : "Manager") || "Manager"),
                photo: idx.photo !== -1 ? cols[idx.photo] || undefined : undefined,
            }))
            .filter((m) => m.id && m.name);

        data.sort((a, b) => +new Date(b.qualifiedAt) - +new Date(a.qualifiedAt));

        members = data;
        source = "sheet";
        syncedAt = new Date().toLocaleString();
    } catch (e) {
        console.error("CSV Import Error:", e);
        error = e?.message || "Gagal memuat CSV";
        source = "seed";
        members = SEED_MEMBERS;
    }
    renderUI();
}

// =============================================================
// Filtering & Sorting Logic
// =============================================================
function getUniqueControls() {
    const promoSet = new Set();
    const monthSet = new Set();
    members.forEach((m) => {
        promoSet.add(m.promo);
        monthSet.add(fmtMonthKey(new Date(m.qualifiedAt)));
    });

    const promoList = ["All", ...Array.from(promoSet)];
    const monthList = ["All", ...Array.from(monthSet).sort().reverse()];
    
    const totalPerPromo = new Map();
    members.forEach((x) => totalPerPromo.set(x.promo, (totalPerPromo.get(x.promo) || 0) + 1));

    return { promoList, monthList, totalPerPromo };
}

function getFilteredMembers() {
    let list = [...members];
    
    const needle = state.searchQ.toLowerCase();
    if (needle) {
        list = list.filter((m) =>
            [m.name, m.city, m.rank, m.reward, m.promo, m.id]
                .some((x) => String(x).toLowerCase().includes(needle))
        );
    }
    
    if (state.promoKey !== "All") {
        list = list.filter((m) => m.promo === state.promoKey);
    }
    
    if (state.monthKey !== "All") {
        list = list.filter((m) => fmtMonthKey(new Date(m.qualifiedAt)) === state.monthKey);
    }

    if (state.sortKey === "recent") {
        list.sort((a, b) => +new Date(b.qualifiedAt) - +new Date(a.qualifiedAt));
    } else if (state.sortKey === "name") {
        list.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    return list;
}

// =============================================================
// Rendering Functions
// =============================================================
function renderMemberCard(m) {
    const avatar = m.photo 
        ? `<img src="${m.photo}" alt="${m.name}" class="h-20 w-20 shrink-0 rounded-xl object-cover" onerror="this.onerror=null; this.src='https://placehold.co/80x80/a3b18a/2f4f3a?text=${initials(m.name)}';" />`
        : `<div class="h-20 w-20 shrink-0 rounded-xl bg-gradient-to-br from-[#a3b18a] via-[#588157] to-[#3a5a40] text-white grid place-items-center text-lg font-extrabold">
            ${initials(m.name)}
        </div>`;
    
    const rankBadge = m.rank ? `
        <div class="mt-1 inline-flex items-center gap-1 rounded-full border border-[#a3b18a] bg-[#dde6d6] px-2 py-0.5 text-[11px] font-bold tracking-wide text-[#2f4f3a]">
            ${rankIcon(m.rank)} <span class="uppercase">${m.rank}</span>
        </div>` : '';

    return `
        <div class="member-card relative overflow-hidden rounded-2xl bg-white border border-[#dce6d8] p-5 shadow-sm hover:shadow-md transition-all opacity-0 translate-y-4">
            <div class="absolute right-[-40px] top-[15px] rotate-45">
                <div class="bg-gradient-to-r from-[#a3b18a] to-[#588157] text-white text-[10px] font-extrabold px-10 py-1 shadow">
                    QUALIFIED
                </div>
            </div>
            <div class="flex items-center gap-4">
                ${avatar}
                <div class="min-w-0">
                    <div class="text-xs font-medium text-[#6b8f79]">${m.id}</div>
                    <div class="text-base font-semibold text-[#1b2b22] truncate max-w-[14rem] sm:max-w-[18rem] md:max-w-[22rem]">
                        ${m.name}
                    </div>
                    ${rankBadge}
                    <div class="mt-1 text-xs text-[#4c6b57]">
                        ${m.city} • <span class="font-medium text-[#2f4f3a]">${m.promo}</span>
                    </div>
                    <div class="mt-1 text-xs text-[#4c6b57]">
                        <span>Dinyatakan memenuhi syarat pada </span>
                        <span class="font-medium text-[#2f4f3a]">${formatDateID(m.qualifiedAt)}</span>
                    </div>
                </div>
            </div>
            <div class="mt-4 rounded-xl border border-[#dce6d8] bg-[#f9faf9] p-4">
                <div class="flex flex-wrap items-center gap-2 text-sm text-[#1b2b22]">
                    <i data-lucide="Trophy" class="h-4 w-4"></i>
                    <span>Hadiah:</span>
                    <span class="font-semibold">${m.reward}</span>
                </div>
            </div>
        </div>
    `;
}

function renderMemberGrid() {
    const grid = document.getElementById('member-grid');
    const noResults = document.getElementById('no-results');
    const totalQualified = document.getElementById('total-qualified');
    const filteredMembers = getFilteredMembers();

    totalQualified.textContent = filteredMembers.length;

    if (filteredMembers.length === 0) {
        grid.innerHTML = '';
        noResults.classList.remove('hidden');
    } else {
        noResults.classList.add('hidden');
        grid.innerHTML = filteredMembers.map(renderMemberCard).join('');
        lucide.createIcons();

        document.querySelectorAll('.member-card').forEach((card, i) => {
            card.offsetHeight; 
            setTimeout(() => {
                card.style.transition = 'opacity 0.35s, transform 0.35s';
                card.classList.remove('opacity-0', 'translate-y-4');
                card.classList.add('opacity-100', 'translate-y-0');
            }, 50 + i * 20);
        });
    }
}

function renderInfoBar() {
    const infoBar = document.getElementById('info-bar');
    infoBar.innerHTML = `
        <div class="rounded-xl border border-[#dce6d8] bg-white/70 px-4 py-2 text-xs text-[#2f4f3a]">
            Sumber data: <b>${source === "sheet" ? "Google Sheet (live)" : "Seed lokal"}</b>
            ${syncedAt ? ` • Sinkron: ${syncedAt}` : ""}
            ${error ? `<span class="ml-2 text-[#a63a3a] font-semibold">(Error: ${error})</span>` : ''}
        </div>
        <div class="text-xs text-[#4c6b57] mt-1">
            *Pastikan header kolom di Google Sheet Anda sesuai (misalnya: 'name', 'city', 'reward', 'qualifiedAt').
        </div>
    `;
}

function renderControls() {
    const controlsContainer = document.getElementById('controls-container');
    const promoTabsContainer = document.getElementById('promo-tabs');
    const { promoList, monthList, totalPerPromo } = getUniqueControls();
    
    controlsContainer.innerHTML = `
        <div class="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label class="relative sm:col-span-2">
                <i data-lucide="Search" class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b8f79]"></i>
                <input id="search-input" value="${state.searchQ}" oninput="handleSearch(this.value)"
                    placeholder="Cari nama, kota, hadiah..."
                    class="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white border border-[#dce6d8] focus:outline-none focus:ring-2 focus:ring-[#a3b18a]/50"
                />
            </label>
            <label class="relative">
                <i data-lucide="Calendar" class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b8f79]"></i>
                <select id="month-select" onchange="handleMonthChange(this.value)"
                    class="w-full appearance-none pl-10 pr-8 py-2.5 rounded-xl bg-white border border-[#dce6d8] focus:outline-none focus:ring-2 focus:ring-[#a3b18a]/50"
                >
                    ${monthList.map(m => `<option value="${m}" ${state.monthKey === m ? 'selected' : ''}>${toMonthLabelID(m)}</option>`).join('')}
                </select>
            </label>
            <label class="relative">
                <i data-lucide="SortAsc" class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b8f79]"></i>
                <select id="sort-select" onchange="handleSortChange(this.value)"
                    class="w-full appearance-none pl-10 pr-8 py-2.5 rounded-xl bg-white border border-[#dce6d8] focus:outline-none focus:ring-2 focus:ring-[#a3b18a]/50"
                >
                    <option value="recent" ${state.sortKey === 'recent' ? 'selected' : ''}>Terbaru</option>
                    <option value="name" ${state.sortKey === 'name' ? 'selected' : ''}>Nama (A–Z)</option>
                </select>
            </label>
        </div>
    `;
    
    promoTabsContainer.innerHTML = promoList.map(p => {
        const isSelected = state.promoKey === p;
        const count = totalPerPromo.get(p) || 0;
        const classes = classNames(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors",
            isSelected 
                ? "border-[#3a5a40] bg-[#dde6d6] text-[#1b2b22]"
                : "border-[#dce6d8] bg-white text-[#2f4f3a] hover:bg-[#f0f4ef]"
        );
        const countBadge = p !== "All" ? `<span class="ml-1 rounded-full bg-white/70 border border-[#dce6d8] px-2 text-xs">${count}</span>` : '';

        return `
            <button onclick="handlePromoChange('${p}')" class="${classes}">
                <i data-lucide="Tags" class="h-4 w-4"></i>
                <span>${p}</span>
                ${countBadge}
            </button>
        `;
    }).join('');

    lucide.createIcons();
}

function renderUI() {
    renderInfoBar();
    renderControls();
    renderMemberGrid();
}

// =============================================================
// Event Handlers
// =============================================================
window.handleSearch = function(value) {
    state.searchQ = value;
    renderMemberGrid();
    renderControls(); 
}

window.handleMonthChange = function(value) {
    state.monthKey = value;
    renderMemberGrid();
    renderControls();
}

window.handleSortChange = function(value) {
    state.sortKey = value;
    renderMemberGrid();
    renderControls();
}

window.handlePromoChange = function(promo) {
    state.promoKey = promo;
    renderControls();
    renderMemberGrid();
}

// =============================================================
// Animasi Hero
// =============================================================
function runHeroAnimation() {
    const h1 = document.getElementById('hero-h1');
    const span = document.getElementById('hero-span');
    const p = document.getElementById('hero-p');

    if (!h1 || !span || !p) return;

    h1.style.transition = 'opacity 1s ease-out, transform 1s ease-out';
    span.style.transition = 'opacity 0.8s, transform 0.8s';
    p.style.transition = 'opacity 0.7s, transform 0.7s';
    
    setTimeout(() => {
        h1.style.opacity = 1;
        h1.style.transform = 'translateY(0) scale(1)';
    }, 50);

    setTimeout(() => {
        span.style.opacity = 1;
        span.style.transform = 'translateY(0)';
    }, 250);

    setTimeout(() => {
        p.style.opacity = 1;
        p.style.transform = 'translateY(0)';
    }, 550);
}

// =============================================================
// Inisialisasi Aplikasi
// =============================================================
document.addEventListener('DOMContentLoaded', function() {
    runHeroAnimation();
    fetchData();
});