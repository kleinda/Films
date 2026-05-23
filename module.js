
// === Firebase config (keep as-is or replace with your current config) ===
const firebaseConfig = {
  apiKey: "AIzaSyDNWMliT0qTW0STk7iwImwat_-lCTj3kP8",
  authDomain: "films-5c7ff.firebaseapp.com",
  projectId: "films-5c7ff",
  storageBucket: "films-5c7ff.firebasestorage.app",
  messagingSenderId: "995595387661",
  appId: "1:995595387661:web:dbdab1f991e6aa65412644",
};

// === Imports ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

// === Init Firebase ===
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
signInAnonymously(auth).catch((err) =>
  console.warn("Anonymous sign-in failed", err)
);
const db = getFirestore(app);
const VIEWS = collection(db, "views");

// === TMDB ===
const TMDB_API_KEY = "4b474d1fb4cba200d8a4d1fcee2a5ba4";
const TMDB_IMAGE = (path) =>
  path ? `https://image.tmdb.org/t/p/w342${path}` : "";

// Search (movies + tv)
async function searchTMDB(queryText) {
  const run = async (lang) => {
    const url =
      `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}` +
      `&query=${encodeURIComponent(queryText)}&language=${lang}` +
      `&include_adult=false&region=IL`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "<no body>");
      throw new Error(`TMDB multi search failed (${res.status}) ${body}`);
    }
    const data = await res.json();
    return (data.results || [])
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .map((r) => ({
        mediaType: r.media_type,
        id: r.id,
        title:
          r.title || r.name || r.original_title || r.original_name || "",
        originalTitle:
          r.original_title || r.original_name || r.title || r.name || "",
        overview: r.overview || "",
        poster_path: r.poster_path || "",
        releaseDate: r.release_date || r.first_air_date || "",
        releaseYear: (r.release_date || r.first_air_date || "").slice(0, 4)
          ? parseInt((r.release_date || r.first_air_date).slice(0, 4), 10)
          : null,
      }));
  };
  let results = [];
  try {
    results = await run("he-IL");
  } catch {}
  if (results.length === 0) {
    results = await run("en-US");
  }
  return results.slice(0, 12);
}

// Details (movie/tv)
async function getMovieDetails(id, mediaType) {
  const fetchJson = async (url) => {
    const r = await fetch(url);
    if (!r.ok) {
      const t = await r.text().catch(() => "<no body>");
      throw new Error(`TMDB details failed (${r.status}) ${t}`);
    }
    return r.json();
  };
  const kind = mediaType === "tv" ? "tv" : "movie";

  const detailsHeUrl = `https://api.themoviedb.org/3/${kind}/${id}?api_key=${TMDB_API_KEY}&language=he-IL`;
  const creditsHeUrl = `https://api.themoviedb.org/3/${kind}/${id}/credits?api_key=${TMDB_API_KEY}&language=he-IL`;

  let details = {};
  try {
    details = await fetchJson(detailsHeUrl);
  } catch {}
  if (!details || (!details.title && !details.name)) {
    try {
      details = await fetchJson(
        `https://api.themoviedb.org/3/${kind}/${id}?api_key=${TMDB_API_KEY}&language=en-US`
      );
    } catch {}
  }

  let credits = { cast: [] };
  try {
    credits = await fetchJson(creditsHeUrl);
  } catch {}

  const cast = Array.isArray(credits.cast)
    ? credits.cast.slice(0, 8).map((p) => p.name)
    : [];
  const genres = Array.isArray(details.genres)
    ? details.genres.map((g) => g.name)
    : [];

  const title =
    kind === "tv"
      ? details.name || details.original_name
      : details.title || details.original_title;
  const originalTitle =
    kind === "tv"
      ? details.original_name || details.name
      : details.original_title || details.title;

  const releaseDate =
    (kind === "tv" ? details.first_air_date : details.release_date) || "";
  const releaseYear = releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : null;

  return {
    mediaType: kind,
    movieId: String(details?.id ?? id ?? ""),
    title: title || "",
    originalTitle: originalTitle || "",
    overview: details?.overview || "",
    posterUrl: TMDB_IMAGE(details?.poster_path),
    genres,
    cast,
    releaseDate,
    releaseYear,
  };
}

// === DOM refs ===
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const movieInput = $("#movieInput");
const searchResults = $("#searchResults");
const pickedMovieJson = $("#pickedMovieJson");
const watchDateEl = $("#watchDate");
const notesEl = $("#notes");
const toWatchEl = document.querySelector("#toWatch");
const saveStatus = $("#saveStatus");
const viewsList = $("#viewsList");
const resultItemTpl = document.getElementById("resultItemTpl");
const viewCardTpl = document.getElementById("viewCardTpl");

const preview = {
  host: $("#pickedPreview"),
  poster: $("#previewPoster"),
  title: $("#previewTitle"),
  genres: $("#previewGenres"),
  cast: $("#previewCast"),
  overview: $("#previewOverview"),
};

// Date default
const todayStr = new Date().toISOString().slice(0, 10);
if (!watchDateEl.value) watchDateEl.value = todayStr;

// === TMDB search (debounce) ===
let debounceTimer;
movieInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  const q = movieInput.value.trim();
  if (!q) {
    searchResults.classList.add("hidden");
    return;
  }
  debounceTimer = setTimeout(async () => {
    try {
      const arr = await searchTMDB(q);
      renderSearchResults(arr);
    } catch (err) {
      console.error(err);
      searchResults.innerHTML =
        '<div class="p-3 text-sm text-red-600">שגיאה בחיפוש TMDB</div>';
      searchResults.classList.remove("hidden");
    }
  }, 300);
});

function renderSearchResults(items) {
  searchResults.innerHTML = "";
  if (!items || !items.length) {
    searchResults.innerHTML =
      '<div class="p-3 text-sm text-gray-600">אין תוצאות</div>';
  } else {
    items.forEach((it) => {
      const node = resultItemTpl.content.firstElementChild.cloneNode(true);
      node.querySelector("img").src = TMDB_IMAGE(it.poster_path) || "";
      node.querySelector(".name").textContent =
        (it.title || "") + (it.releaseYear ? ` (${it.releaseYear})` : "");
      node.querySelector(".altname").textContent =
        it.originalTitle && it.originalTitle !== it.title
          ? it.originalTitle
          : "";
      node.querySelector(".overview").textContent = it.overview || "";
      node.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          const det = await getMovieDetails(it.id, it.mediaType);
          pickedMovieJson.value = JSON.stringify(det);
          movieInput.value = det.title || det.originalTitle || "";
          showPickedPreview(det);
          searchResults.classList.add("hidden");
        } catch (err) {
          console.error(err);
        }
      });
      searchResults.appendChild(node);
    });
  }
  searchResults.classList.remove("hidden");
}

function showPickedPreview(det) {
  preview.host.classList.remove("hidden");
  preview.poster.src = det.posterUrl || "";
  preview.title.textContent =
    det.title +
    (det.originalTitle && det.originalTitle !== det.title
      ? ` · ${det.originalTitle}`
      : "");
  preview.genres.innerHTML = "";
  (det.genres || []).forEach((g) => {
    const s = document.createElement("span");
    s.className = "chip px-2 py-1 rounded-full text-xs";
    s.textContent = g;
    preview.genres.appendChild(s);
  });
  preview.cast.textContent =
    det.cast && det.cast.length
      ? `שחקנים ראשיים: ${det.cast.slice(0, 5).join(", ")}`
      : "";
  preview.overview.textContent = det.overview || "";
}

// === Clear add form ===
$("#clearBtn").addEventListener("click", () => {
  movieInput.value = "";
  notesEl.value = "";
  pickedMovieJson.value = "";
  if (toWatchEl) toWatchEl.checked = false;
  preview.host.classList.add("hidden");
  searchResults.classList.add("hidden");
  saveStatus.textContent = "";
  watchDateEl.value = todayStr;
  movieInput.focus();
});

// === Save ===
$("#addForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const picked = pickedMovieJson.value ? JSON.parse(pickedMovieJson.value) : null;
  const title = movieInput.value.trim();
  if (!title) {
    saveStatus.textContent = "נא להזין שם סרט";
    return;
  }
  const base = picked || {
    movieId: `manual_${Date.now()}`,
    title,
    originalTitle: title,
    overview: "",
    posterUrl: "",
    genres: [],
    cast: [],
    source: "manual",
    mediaType: "movie",
    // אופציונלי: אם יש לך שדות נוספים בקבצים קודמים
    languages: [],
    originalLangCode: "",
    tmdbRating: null,
    tmdbVotes: null,
  };
  const watchDateStr = watchDateEl.value || todayStr;
  const watchDate = Timestamp.fromDate(new Date(watchDateStr + "T12:00:00"));

  const docData = {
    mediaType: base.mediaType || "movie",
    movieId: base.movieId?.toString(),
    title: base.title || title,
    originalTitle: base.originalTitle || title,
    titleLower: (base.title || title).toLowerCase(),
    originalLower: (base.originalTitle || title).toLowerCase(),
    overview: base.overview || "",
    posterUrl: base.posterUrl || "",
    genres: base.genres || [],
    cast: base.cast || [],
    releaseDate: base.releaseDate || null,
    releaseYear: base.releaseYear ?? null,
    watchDate,
    notes: notesEl.value.trim(),
    toWatch: !!toWatchEl?.checked,
    source: picked ? "tmdb" : "manual",
    createdAt: serverTimestamp(),

    // שמירת שדות אופציונליים אם קיימים באובייקט
    languages: base.languages || [],
    originalLangCode: base.originalLangCode || "",
    languageLower: (base.languages || []).map((s) => s.toLowerCase()),
    tmdbRating: base.tmdbRating ?? null,
    tmdbVotes: base.tmdbVotes ?? null,
  };

  try {
    await addDoc(VIEWS, docData);
    saveStatus.textContent = "נשמר ✔";
    movieInput.value = "";
    notesEl.value = "";
    pickedMovieJson.value = "";
    if (toWatchEl) toWatchEl.checked = false;
    preview.host.classList.add("hidden");
  } catch (err) {
    console.error(err);
    saveStatus.textContent = "שגיאה בשמירה";
  }
});

// === Live data ===
const qRecent = query(VIEWS, orderBy("watchDate", "desc"), limit(200));
let allViews = [];

onSnapshot(qRecent, (snap) => {
  allViews = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderViews();
  rebuildGenreFilter();
});

function renderViews() {
  const term = $("#searchBox")?.value.trim().toLowerCase() || "";
  const g = $("#genreFilter")?.value || "";
  const from = $("#fromDate")?.value || "";
  const to = $("#toDate")?.value || "";
  const onlyToWatch = document.getElementById("filterToWatch")?.checked;

  const withinDate = (ts) => {
    if (!from && !to) return true;
    const d = toDateOnly(ts.toDate());
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const filtered = allViews.filter((v) => {
    const okText =
      !term ||
      v.titleLower?.includes(term) ||
      v.originalLower?.includes(term);
    const okGenre = !g || (Array.isArray(v.genres) && v.genres.includes(g));
    const okDate = withinDate(v.watchDate);
    const okToWatch = !onlyToWatch || v.toWatch === true;
    return okText && okGenre && okDate && okToWatch;
  });

  viewsList.innerHTML = "";
  filtered.forEach((v) => {
    const node = viewCardTpl.content.firstElementChild.cloneNode(true);
    node.querySelector("img").src = v.posterUrl || "";

    const nameEl = node.querySelector(".name");
    nameEl.textContent =
      v.title +
      (v.releaseYear ? ` (${v.releaseYear})` : "") +
      (v.originalTitle && v.originalTitle !== v.title
        ? ` · ${v.originalTitle}`
        : "");

    node.querySelector(".date").textContent = fmtDate(v.watchDate?.toDate());

    const chips = node.querySelector(".chips");

    if (Array.isArray(v.languages) && v.languages.length) {
      const s = document.createElement("span");
      s.className = "chip px-2 py-1 rounded-full text-xs";
      s.textContent = "שפה: " + v.languages.join(", ");
      chips.appendChild(s);
    }

    if (v.tmdbRating != null) {
      const r = document.createElement("span");
      r.className = "chip px-2 py-1 rounded-full text-xs";
      r.textContent =
        "★ " +
        v.tmdbRating +
        (v.tmdbVotes ? " (" + abbr(v.tmdbVotes) + ")" : "");
      chips.appendChild(r);
    }

    if (v.mediaType === "tv") {
      const b = document.createElement("span");
      b.className = "chip px-2 py-1 rounded-full text-xs";
      b.textContent = "סדרה";
      chips.appendChild(b);
    }

    if (v.toWatch === true) {
      const tw = document.createElement("span");
      tw.className = "chip chip-watch px-2 py-1 rounded-full text-xs";
      tw.textContent = "לצפייה";
      chips.appendChild(tw);
      node.classList.add("card-watch"); // optional highlight
    }

    (v.genres || []).forEach((g) => {
      const s = document.createElement("span");
      s.className = "chip px-2 py-1 rounded-full text-xs";
      s.textContent = g;
      chips.appendChild(s);
    });

    node.querySelector(".overview").textContent = v.overview || "";
    node.querySelector(".cast").textContent =
      v.cast && v.cast.length
        ? `שחקנים ראשיים: ${v.cast.slice(0, 5).join(", ")}`
        : "";
    node.querySelector(".notes").textContent = v.notes
      ? `הערות: ${v.notes}`
      : "";

    // Actions
    const del = node.querySelector(".delBtn");
    del?.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm("למחוק את הצפייה הזו?")) return;
      try {
        await deleteDoc(doc(db, "views", v.id));
      } catch {
        alert("שגיאה במחיקה");
      }
    });

    const editRow = node.querySelector(".editRow");
    const editBtn = node.querySelector(".editBtn");
    const cancelBtn = node.querySelector(".cancelEdit");
    const saveBtn = node.querySelector(".saveEdit");
    const editDate = node.querySelector(".editDate");
    const editNotes = node.querySelector(".editNotes");

    if (editDate) editDate.value = v.watchDate ? toDateOnly(v.watchDate.toDate()) : "";
    if (editNotes) editNotes.value = v.notes || "";

    editBtn?.classList.add("cmd");
    del?.classList.add("cmd");

    // Toggle ToWatch button
    const actionsHost =
      node.querySelector(".actions") || node.querySelector(".hdr") || node;
    const twBtn = document.createElement("button");
    twBtn.type = "button";
    twBtn.className = "cmd text-amber-700";
    twBtn.textContent = v.toWatch ? 'הסר "לצפייה"' : 'סמן "לצפייה"';
    actionsHost.prepend(twBtn);

    twBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await updateDoc(doc(db, "views", v.id), { toWatch: !v.toWatch });
      } catch (err) {
        console.error(err);
        alert("שגיאה בעדכון");
      }
    });

    editBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      editRow?.classList.toggle("hidden");
    });
    cancelBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      editRow?.classList.add("hidden");
    });
    saveBtn?.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        const newDateStr = editDate?.value || toDateOnly(new Date());
        const newTs = Timestamp.fromDate(new Date(newDateStr + "T12:00:00"));
        const newNotes = (editNotes?.value || "").trim();
        await updateDoc(doc(db, "views", v.id), {
          watchDate: newTs,
          notes: newNotes,
        });
        editRow?.classList.add("hidden");
      } catch {
        alert("שגיאה בעדכון");
      }
    });

    viewsList.appendChild(node);
  });
}

function rebuildGenreFilter() {
  const sel = $("#genreFilter");
  if (!sel) return;
  const current = sel.value;
  const set = new Set();
  allViews.forEach((v) => (v.genres || []).forEach((g) => set.add(g)));
  sel.innerHTML =
    '<option value="">הכול</option>' +
    Array.from(set)
      .sort()
      .map((g) => `<option>${g}</option>`)
      .join("");
  if ([...sel.options].some((o) => o.value === current)) sel.value = current;
}

// === Utils ===
function fmtDate(d) {
  try {
    return d.toLocaleDateString("he-IL", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return "";
  }
}
function toDateOnly(d) {
  return d.toISOString().slice(0, 10);
}
function abbr(n) {
  if (n == null) return "";
  const x = Number(n);
  if (x >= 1_000_000) return (x / 1_000_000).toFixed(1).replace(/\.0$/, "") + "m";
  if (x >= 1_000) return (x / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(x);
}

// === Search panel toggle + shortcuts ===
const toggleBtn = document.querySelector("#toggleSearch");
const searchPanel = document.querySelector("#searchPanel");
const caretEl = document.querySelector("#caret");

function setExpanded(expanded) {
  if (!searchPanel) return;
  const hide = !expanded;
  searchPanel.classList.toggle("hidden", hide);
  toggleBtn?.setAttribute("aria-expanded", String(!hide));
  if (caretEl) caretEl.textContent = hide ? "▼" : "▲";
}

toggleBtn?.addEventListener("click", () => {
  const hidden = searchPanel?.classList.contains("hidden");
  setExpanded(hidden);
  if (!hidden) document.querySelector("#searchBox")?.focus();
});

window.addEventListener("keydown", (e) => {
  const code = e.code; // 'F1' / 'F2' / 'F3'
  if (code === "F1") {
    e.preventDefault();
    setExpanded(true);
    document.querySelector("#searchBox")?.focus();
    return;
  }
  if (code === "F2") {
    e.preventDefault();
    const willOpen = searchPanel?.classList.contains("hidden");
    setExpanded(willOpen);
    if (willOpen) document.querySelector("#searchBox")?.focus();
    return;
  }
  if (code === "F3") {
    e.preventDefault();
    document.querySelector("#movieInput")?.focus();
    return;
  }
});

// Filters: re-render on change
document.getElementById("filterToWatch")?.addEventListener("change", renderViews);
$("#searchBox")?.addEventListener("input", renderViews);
$("#genreFilter")?.addEventListener("change", renderViews);
$("#fromDate")?.addEventListener("change", renderViews);
$("#toDate")?.addEventListener("change", renderViews);

// Clear filters button
const clearBtn = document.querySelector("#clearFilters");
clearBtn?.addEventListener("click", () => {
  const sb = document.querySelector("#searchBox");
  const gf = document.querySelector("#genreFilter");
  const fd = document.querySelector("#fromDate");
  const td = document.querySelector("#toDate");
  const ftw = document.getElementById("filterToWatch");

  if (sb) sb.value = "";
  if (gf) gf.value = "";
  if (fd) {
    fd.value = "";
    fd.disabled = false;
  }
  if (td) {
    td.value = "";
    td.disabled = false;
  }
  if (ftw) ftw.checked = false;

  renderViews();
  sb?.focus();
});

// Start with search panel closed
setExpanded(false);

// === Backfill: add year to titles (run in console: backfillTitlesWithYear()) ===
window.backfillTitlesWithYear = async function () {
  try {
    const snap = await getDocs(collection(db, "views"));
    let updated = 0,
      skipped = 0,
      failed = 0;
    const hasYearSuffix = (title) => /\(\d{4}\)\s*$/.test(title || "");

    for (const d of snap.docs) {
      const v = d.data();
      let title = v.title || "";
      let year = v.releaseYear ?? null;

      if (hasYearSuffix(title)) {
        skipped++;
        continue;
      }

      if (year == null && v.source === "tmdb" && v.movieId) {
        try {
          const det = await getMovieDetails(v.movieId, v.mediaType || "movie");
          year = det?.releaseYear ?? null;
        } catch {}
        await new Promise((r) => setTimeout(r, 150));
      }

      if (year == null || !Number.isInteger(year)) {
        skipped++;
        continue;
      }

      const newTitle = `${title} (${year})`;
      try {
        await updateDoc(doc(db, "views", d.id), {
          title: newTitle,
          titleLower: newTitle.toLowerCase(),
        });
        updated++;
      } catch (e) {
        console.error("update failed", d.id, e);
        failed++;
      }
    }
    console.log(
      `Titles backfill → updated=${updated}, skipped=${skipped}, failed=${failed}`
    );
    alert(
      `סיום: עודכנו ${updated}, דולגו ${skipped}, כשלים ${failed} (פרטים בקונסולה)`
    );
  } catch (e) {
    console.error("backfillTitlesWithYear fatal", e);
    alert("שגיאה בהרצת backfill — ראה קונסולה");
  }
};
