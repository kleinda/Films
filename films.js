// === Firebase config ===
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
  where,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

// === Init Firebase ===
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);
const VIEWS = collection(db, "views");

// === TMDB ===
const TMDB_API_KEY = "4b474d1fb4cba200d8a4d1fcee2a5ba4";
const TMDB_IMAGE = (path) =>
  path ? `https://image.tmdb.org/t/p/w342${path}` : "";

// === Language maps ===
const LANG_NAME_FIX = {
  "한국어/조선말": "קוריאנית",
  "Русский": "רוסית",
  "English": "אנגלית",
  "日本語": "יפנית",
  "普通话": "סינית",
  "中文": "סינית",
  "Español": "ספרדית",
  "Français": "צרפתית",
  "Deutsch": "גרמנית",
};

const LANG_CODE_FIX = {
  ru: "רוסית",
  en: "אנגלית",
  he: "עברית",
  no: "נורווגית",
  da: "דנית",
  sv: "שוודית",
  ko: "קוריאנית",
  ja: "יפנית",
  fr: "צרפתית",
  de: "גרמנית",
  es: "ספרדית",
  zh: "סינית",
  hy: "ארמנית",
};

function normalizeLangName(l) {
  if (!l) return "";
  const s = String(l).trim();
  if (s.length === 2 && LANG_CODE_FIX[s]) return LANG_CODE_FIX[s];
  return LANG_NAME_FIX[s] || s;
}

// Used in language filter (options are already Hebrew names)
function normalizeLangs(arr) {
  return arr.map((s) => s.toLowerCase());
}

function movieLangsLower(v) {
  return (v.languages || []).map((l) => normalizeLangName(l).toLowerCase());
}

// === Auto-grow textarea ===
function autoGrow(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

document.addEventListener("input", (e) => {
  if (e.target.classList.contains("editNotes")) autoGrow(e.target);
});

// === TMDB helpers ===
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
        title: r.title || r.name || r.original_title || r.original_name || "",
        originalTitle: r.original_title || r.original_name || r.title || r.name || "",
        overview: r.overview || "",
        poster_path: r.poster_path || "",
        releaseDate: r.release_date || r.first_air_date || "",
        releaseYear: (r.release_date || r.first_air_date || "").slice(0, 4)
          ? parseInt((r.release_date || r.first_air_date).slice(0, 4), 10)
          : null,
      }));
  };
  let results = [];
  try { results = await run("he-IL"); } catch {}
  if (results.length === 0) results = await run("en-US");
  return results.slice(0, 12);
}

async function getTvDetailsMerged(id) {
  const fetchJson = async (url) => {
    const r = await fetch(url);
    if (!r.ok) {
      const t = await r.text().catch(() => "<no body>");
      throw new Error(`TMDB details failed (${r.status}) ${t}`);
    }
    return r.json();
  };
  const base = `https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_API_KEY}`;
  let he = null, en = null;
  try { he = await fetchJson(base + "&language=he-IL"); } catch {}
  try { en = await fetchJson(base + "&language=en-US"); } catch {}
  if (!he && !en) return {};
  return {
    ...(en || {}),
    ...(he || {}),
    name: he?.name || en?.name,
    overview: he?.overview || en?.overview,
    genres: Array.isArray(he?.genres) && he.genres.length ? he.genres : en?.genres || [],
    episode_run_time: Array.isArray(en?.episode_run_time) ? en.episode_run_time : [],
  };
}

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
    details = kind === "movie"
      ? await fetchJson(detailsHeUrl)
      : await getTvDetailsMerged(id);
  } catch {}

  let credits = { cast: [] };
  try { credits = await fetchJson(creditsHeUrl); } catch {}

  const cast = Array.isArray(credits.cast)
    ? credits.cast.slice(0, 8).map((p) => p.name)
    : [];

  const genres = Array.isArray(details.genres)
    ? details.genres.map((g) => g.name)
    : [];

  const title = kind === "tv"
    ? details.name || details.original_name
    : details.title || details.original_title;

  const originalTitle = kind === "tv"
    ? details.original_name || details.name
    : details.original_title || details.title;

  const releaseDate = (kind === "tv" ? details.first_air_date : details.release_date) || "";
  const releaseYear = releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : null;

  const spoken = (details.spoken_languages || []).map((l) => l.iso_639_1);

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
    languages: spoken,
    originalLangCode: details?.original_language || "",
    runtime: kind === "movie" ? details.runtime ?? null : null,
    episodeRuntime:
      kind === "tv" && Array.isArray(details.episode_run_time)
        ? details.episode_run_time[0]
        : null,
  };
}

async function searchActorByName(name) {
  const url = `https://api.themoviedb.org/3/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("actor search failed");
  const j = await r.json();
  return j.results?.[0] || null;
}

async function fetchActorCredits(personId) {
  const url =
    `https://api.themoviedb.org/3/person/${personId}/combined_credits` +
    `?api_key=${TMDB_API_KEY}&language=he-IL`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("combined credits failed");
  const j = await r.json();
  return (j.cast || [])
    .filter((c) => c.media_type === "movie" || c.media_type === "tv")
    .sort((a, b) => {
      const yA = parseInt((a.release_date || a.first_air_date || "0000").slice(0, 4));
      const yB = parseInt((b.release_date || b.first_air_date || "0000").slice(0, 4));
      return yB - yA;
    })
    .slice(0, 30);
}

async function fetchTmdbReviews(kind, id) {
  const url = `https://api.themoviedb.org/3/${kind}/${id}/reviews?api_key=${TMDB_API_KEY}&page=1`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("TMDB reviews " + r.status);
  const j = await r.json();
  const arr = Array.isArray(j.results) ? j.results : [];
  const he = arr.filter((x) => hasHebrew(x.content));
  const en = arr.filter((x) => !hasHebrew(x.content) && (x?.iso_639_1 === "en" || /[A-Za-z]/.test(x.content)));
  const rest = arr.filter((x) => !he.includes(x) && !en.includes(x));
  return [...he, ...en, ...rest];
}

// === Utils ===
function fmtDate(d) {
  try {
    return d.toLocaleDateString("he-IL", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch { return ""; }
}
function toDateOnly(d) { return d.toISOString().slice(0, 10); }
function abbr(n) {
  if (n == null) return "";
  const x = Number(n);
  if (x >= 1_000_000) return (x / 1_000_000).toFixed(1).replace(/\.0$/, "") + "m";
  if (x >= 1_000) return (x / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(x);
}
function formatRuntime(mins) {
  if (!mins) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}ש ${m}ד` : `${m}ד`;
}
function hasHebrew(t) { return /[֐-׿]/.test(t || ""); }
function cut(s, max = 1000) {
  s = String(s || "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
function netflixUrl(vOrDet) {
  let name = (vOrDet.originalTitle && vOrDet.originalTitle.trim()) ||
    (vOrDet.title && vOrDet.title.trim()) || "";
  name = name.replace(/\s*\(\s*\d{4}\s*\)\s*$/, "").trim();
  name = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return "https://www.netflix.com/search?q=" + encodeURIComponent(name);
}

// === DOM refs ===
const $ = (s) => document.querySelector(s);
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

document.getElementById("langFilter")?.addEventListener("change", renderViews);
document.getElementById("langRequireAll")?.addEventListener("change", renderViews);

const preview = {
  host: $("#pickedPreview"),
  poster: $("#previewPoster"),
  title: $("#previewTitle"),
  genres: $("#previewGenres"),
  cast: $("#previewCast"),
  overview: $("#previewOverview"),
};

const todayStr = new Date().toISOString().slice(0, 10);
if (!watchDateEl.value) watchDateEl.value = todayStr;

// === TMDB autocomplete ===
let debounceTimer;
movieInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  const q = movieInput.value.trim();
  if (!q) { searchResults.classList.add("hidden"); return; }
  debounceTimer = setTimeout(async () => {
    try {
      const arr = await searchTMDB(q);
      renderSearchResults(arr);
    } catch (err) {
      console.error(err);
      searchResults.innerHTML = '<div class="p-3 text-sm text-red-600">שגיאה בחיפוש TMDB</div>';
      searchResults.classList.remove("hidden");
    }
  }, 300);
});

function renderSearchResults(items) {
  searchResults.innerHTML = "";
  if (!items || !items.length) {
    searchResults.innerHTML = '<div class="p-3 text-sm text-gray-600">אין תוצאות</div>';
  } else {
    items.forEach((it) => {
      const node = resultItemTpl.content.firstElementChild.cloneNode(true);
      node.querySelector("img").src = TMDB_IMAGE(it.poster_path) || "";
      node.querySelector(".name").textContent =
        (it.title || "") + (it.releaseYear ? ` (${it.releaseYear})` : "");
      node.querySelector(".altname").textContent =
        it.originalTitle && it.originalTitle !== it.title ? it.originalTitle : "";
      node.querySelector(".overview").textContent = it.overview || "";
      node.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          const det = await getMovieDetails(it.id, it.mediaType);
          pickedMovieJson.value = JSON.stringify(det);
          movieInput.value = det.title || det.originalTitle || "";
          showPickedPreview(det);
          searchResults.classList.add("hidden");
        } catch (err) { console.error(err); }
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
    (det.originalTitle && det.originalTitle !== det.title ? ` · ${det.originalTitle}` : "");

  preview.genres.innerHTML = "";

  if (det.languages?.length) {
    const s = document.createElement("span");
    s.className = "chip px-2 py-1 rounded-full text-xs";
    s.textContent = "שפה: " + det.languages.map(normalizeLangName).join(", ");
    preview.genres.appendChild(s);
  }

  (det.genres || []).forEach((g) => {
    const s = document.createElement("span");
    s.className = "chip px-2 py-1 rounded-full text-xs";
    s.textContent = g;
    preview.genres.appendChild(s);
  });

  preview.cast.textContent =
    det.cast && det.cast.length ? `שחקנים ראשיים: ${det.cast.slice(0, 5).join(", ")}` : "";
  preview.overview.textContent = det.overview || "";

  let nx = preview.host.querySelector("#previewNetflix");
  if (!nx) {
    nx = document.createElement("a");
    nx.id = "previewNetflix";
    nx.className = "inline-block mt-2 pill px-3 py-1 rounded-xl text-sm nx-btn nx-pill";
    preview.host.appendChild(nx);
  }
  nx.href = netflixUrl(det);
  nx.target = "_blank";
  nx.rel = "noopener";
  nx.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#E50914" d="M6 2h3l6 20h-3L6 2zm9 0h3v20h-3V2zM6 22H3V2h3v20z"/>
    </svg>
    פתח חיפוש ב־Netflix
  `;
}

// === Clear form ===
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

$("#unpickBtn")?.addEventListener("click", () => {
  pickedMovieJson.value = "";
  movieInput.value = "";
  preview.host.classList.add("hidden");
  movieInput.focus();
});

// === Save ===
$("#addForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const picked = pickedMovieJson.value ? JSON.parse(pickedMovieJson.value) : null;
  const title = movieInput.value.trim();
  if (!title) { saveStatus.textContent = "נא להזין שם סרט"; return; }

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
    languages: [],
    originalLangCode: "",
    tmdbRating: null,
    tmdbVotes: null,
  };

  if (base.movieId && base.mediaType) {
    const qExist = query(
      VIEWS,
      where("movieId", "==", base.movieId.toString()),
      where("mediaType", "==", base.mediaType)
    );
    const snap = await getDocs(qExist);
    if (!snap.empty) {
      saveStatus.textContent = "⚠️ הסרט / הסדרה כבר קיימים ביומן";
      return;
    }
  }

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
    languages: base.languages || [],
    originalLangCode: base.originalLangCode || "",
    languageLower: (base.languages || []).map((s) => s.toLowerCase()),
    tmdbRating: base.tmdbRating ?? null,
    tmdbVotes: base.tmdbVotes ?? null,
    runtime: base.mediaType === "movie" ? base.runtime ?? null : null,
  };

  if (base.mediaType === "tv" && Number.isFinite(base.episodeRuntime)) {
    docData.episodeRuntime = base.episodeRuntime;
  }

  try {
    await addDoc(VIEWS, docData);
    saveStatus.textContent = "נשמר ✔";
    setTimeout(() => { saveStatus.textContent = ""; }, 2000);
    movieInput.value = "";
    notesEl.value = "";
    pickedMovieJson.value = "";
    if (toWatchEl) toWatchEl.checked = false;
    preview.host.classList.add("hidden");
    setAddExpanded(false);
  } catch (err) {
    console.error(err);
    saveStatus.textContent = "שגיאה בשמירה";
  }
});

// === Auth UI handlers ===
const isChromeIOS = /CriOS/i.test(navigator.userAgent);

// Chrome ב-iOS חוסם popups – מציגים הנחיה לפתוח בסאפרי
if (isChromeIOS) {
  const btn = document.getElementById("signInBtn");
  if (btn) {
    btn.innerHTML = `<span>פתח ב-Safari להתחברות</span>`;
    btn.addEventListener("click", () => {
      window.location.href = "x-web-search://?url=" + encodeURIComponent(location.href);
      setTimeout(() => alert("העתק את הקישור ופתח אותו ב-Safari:\n" + location.href), 500);
    });
  }
} else {
  document.getElementById("signInBtn")?.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Sign in failed:", err);
      alert("כניסה נכשלה – נסה שוב");
    }
  });
}

document.getElementById("signOutBtn")?.addEventListener("click", async () => {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  await signOut(auth);
});

// === Live data ===
const qRecent = query(VIEWS, orderBy("watchDate", "desc"), limit(200));
let allViews = [];
let unsubscribe = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    document.getElementById("loginScreen")?.classList.remove("hidden");
    document.getElementById("appContent")?.classList.add("hidden");
    viewsList.innerHTML = "";
    return;
  }

  // מחובר – הסתר מסך כניסה, הצג אפליקציה
  document.getElementById("loginScreen")?.classList.add("hidden");
  document.getElementById("appContent")?.classList.remove("hidden");

  // הצג תמונה ושם משתמש בהדר
  const photoEl = document.getElementById("userPhoto");
  const nameEl  = document.getElementById("userName");
  const infoEl  = document.getElementById("userInfo");
  if (infoEl) infoEl.classList.remove("hidden");
  if (photoEl && user.photoURL) { photoEl.src = user.photoURL; photoEl.classList.remove("hidden"); }
  if (nameEl) nameEl.textContent = user.displayName || user.email || "";

  console.log("✅ מחובר:", user.email, user.uid);

  if (unsubscribe) unsubscribe();
  unsubscribe = onSnapshot(qRecent, (snap) => {
    allViews = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderViews();
    rebuildGenreFilter();
    rebuildLanguageFilter();
    updateStats();
  });
});

// === Stats bar ===
function updateStats() {
  const bar = document.getElementById("statsBar");
  if (!bar) return;
  const watched = allViews.filter((v) => !v.toWatch).length;
  const toWatch = allViews.filter((v) => v.toWatch).length;
  bar.innerHTML =
    `<strong>${watched}</strong> נצפו` +
    (toWatch ? ` · <strong>${toWatch}</strong> לצפייה` : "");
  bar.classList.remove("hidden");
}

// === Render views list ===
function getSelectedLanguages() {
  const sel = document.getElementById("langFilter");
  return sel ? Array.from(sel.selectedOptions).map((o) => o.value) : [];
}

function passLangFilter(v) {
  const selected = getSelectedLanguages();
  if (!selected.length) return true;
  const requireAll = document.getElementById("langRequireAll")?.checked;
  const selLower = normalizeLangs(selected);
  const langsLower = movieLangsLower(v);
  if (!langsLower.length) return false;
  return requireAll
    ? selLower.every((x) => langsLower.includes(x))
    : selLower.some((x) => langsLower.includes(x));
}

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
    const okText = !term || v.titleLower?.includes(term) || v.originalLower?.includes(term);
    const okGenre = !g || (Array.isArray(v.genres) && v.genres.includes(g));
    const okDate = withinDate(v.watchDate);
    const okToWatch = !onlyToWatch || v.toWatch === true;
    return okText && okGenre && okDate && okToWatch && passLangFilter(v);
  });

  viewsList.innerHTML = "";

  if (!filtered.length) {
    viewsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎬</div>
        <div class="text-lg font-semibold text-gray-400">אין תוצאות</div>
        <div class="text-sm mt-1">נסה לשנות את פרמטרי החיפוש</div>
      </div>`;
    return;
  }

  filtered.forEach((v) => {
    const node = viewCardTpl.content.firstElementChild.cloneNode(true);
    const img = node.querySelector("img");
    img.src = v.posterUrl || "";
    img.onerror = () => { img.style.visibility = "hidden"; };

    const nameEl = node.querySelector(".name");
    nameEl.textContent =
      v.title +
      (v.releaseYear ? ` (${v.releaseYear})` : "") +
      (v.originalTitle && v.originalTitle !== v.title ? ` · ${v.originalTitle}` : "");

    let metaEl = node.querySelector(".meta");
    if (!metaEl) {
      metaEl = document.createElement("div");
      metaEl.className = "meta text-xs text-gray-500 mt-1";
      nameEl.after(metaEl);
    }
    if (v.mediaType === "movie" && v.runtime) {
      metaEl.textContent = formatRuntime(v.runtime);
    } else if (v.mediaType === "tv" && v.episodeRuntime) {
      metaEl.textContent = `פרק: ~${v.episodeRuntime} דק'`;
    }

    node.querySelector(".date").textContent = fmtDate(v.watchDate?.toDate());

    const chips = node.querySelector(".chips");

    if (Array.isArray(v.languages) && v.languages.length) {
      const s = document.createElement("span");
      s.className = "chip px-2 py-1 rounded-full text-xs";
      s.textContent = "שפה: " + v.languages.map(normalizeLangName).join(", ");
      chips.appendChild(s);
    }

    if (v.tmdbRating != null) {
      const r = document.createElement("span");
      r.className = "chip px-2 py-1 rounded-full text-xs";
      r.textContent = "★ " + v.tmdbRating + (v.tmdbVotes ? " (" + abbr(v.tmdbVotes) + ")" : "");
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
      node.classList.add("card-watch");
    }

    (v.genres || []).forEach((genre) => {
      const s = document.createElement("span");
      s.className = "chip px-2 py-1 rounded-full text-xs";
      s.textContent = genre;
      chips.appendChild(s);
    });

    node.querySelector(".overview").textContent = v.overview || "";

    const castEl = node.querySelector(".cast");
    castEl.innerHTML = "";
    if (v.cast && v.cast.length) {
      castEl.append("שחקנים ראשיים: ");
      v.cast.slice(0, 5).forEach((name, i) => {
        const a = document.createElement("a");
        a.href = "#";
        a.textContent = name;
        a.className = "actor-link text-blue-600 underline cursor-pointer";
        a.dataset.actor = name;
        castEl.appendChild(a);
        if (i < Math.min(v.cast.length, 5) - 1) castEl.append(" · ");
      });
    }

    node.querySelector(".notes").textContent = v.notes ? `הערות: ${v.notes}` : "";

    // === Action buttons ===
    const actionsHost = node.querySelector(".actions") || node.querySelector(".hdr") || node;

    const del = node.querySelector(".delBtn");
    del?.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm("למחוק את הצפייה הזו?")) return;
      try { await deleteDoc(doc(db, "views", v.id)); }
      catch { alert("שגיאה במחיקה"); }
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

    // Toggle "to watch"
    const twBtn = document.createElement("button");
    twBtn.type = "button";
    twBtn.className = "cmd tw-btn" + (v.toWatch ? " on" : "");
    twBtn.textContent = v.toWatch ? 'הסר "לצפייה"' : 'סמן "לצפייה"';
    actionsHost.prepend(twBtn);

    twBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const next = !v.toWatch;
        twBtn.disabled = true;
        await updateDoc(doc(db, "views", v.id), { toWatch: next });
        twBtn.disabled = false;
        v.toWatch = next;
        twBtn.classList.toggle("on", next);
        twBtn.textContent = next ? 'הסר "לצפייה"' : 'סמן "לצפייה"';
      } catch (err) {
        twBtn.disabled = false;
        console.error(err);
        alert("שגיאה בעדכון");
      }
    });

    // Netflix link
    const nx = document.createElement("a");
    nx.href = netflixUrl(v);
    nx.target = "_blank";
    nx.rel = "noopener";
    nx.className = "pill px-2 py-1 rounded text-sm ms-2 nx-btn nx-pill";
    nx.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#E50914" d="M6 2h3l6 20h-3L6 2zm9 0h3v20h-3V2zM6 22H3V2h3v20z"/>
      </svg>
      נטפליקס
    `;
    actionsHost.appendChild(nx);

    // External reviews button
    const extBtn = document.createElement("button");
    extBtn.type = "button";
    extBtn.className = "pill px-2 py-1 rounded text-sm ms-2 rv-pill";
    extBtn.textContent = "ביקורות חיצוניות";
    actionsHost.appendChild(extBtn);

    const extPanel = document.createElement("div");
    extPanel.className = "extReviewsPanel hidden mt-2 space-y-2";
    const anchorAfter = node.querySelector(".editRow");
    if (anchorAfter?.parentNode) {
      anchorAfter.parentNode.insertBefore(extPanel, anchorAfter.nextSibling);
    } else {
      node.appendChild(extPanel);
    }

    let extLoaded = false;
    extBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      extPanel.classList.toggle("hidden");
      if (!extPanel.classList.contains("hidden") && !extLoaded) {
        try {
          extPanel.innerHTML = '<div class="text-sm text-gray-500">טוען ביקורות…</div>';
          const kind = v.mediaType === "tv" ? "tv" : "movie";
          const items = await fetchTmdbReviews(kind, v.movieId);
          renderReviewsList(extPanel, items);
          extLoaded = true;
        } catch (err) {
          console.error(err);
          extPanel.innerHTML = '<div class="text-sm text-red-600">שגיאה בטעינת ביקורות</div>';
        }
      }
    });

    editBtn?.addEventListener("click", () => {
      editRow.classList.remove("hidden");
      autoGrow(editNotes);
      editNotes.focus();
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
        await updateDoc(doc(db, "views", v.id), { watchDate: newTs, notes: newNotes });
        editRow?.classList.add("hidden");
      } catch { alert("שגיאה בעדכון"); }
    });

    viewsList.appendChild(node);
  });
}

function renderReviewsList(panel, items) {
  panel.innerHTML = "";
  if (!items.length) {
    panel.innerHTML = '<div class="text-sm text-gray-500">אין ביקורות להצגה</div>';
    return;
  }
  items.slice(0, 8).forEach((it) => {
    const div = document.createElement("div");
    div.className = "ext-rev-item";
    const author = it.author || it.author_details?.username || "מאת משתמש";
    const rating = it.author_details?.rating != null ? ` · דירוג ${it.author_details.rating}/10` : "";
    const when = it.created_at ? new Date(it.created_at).toLocaleDateString("he-IL") : "";
    const safeText = cut(it.content, 1000).replace(/</g, "&lt;");

    div.innerHTML = `
      <div class="ext-rev-meta">${when ? when + " · " : ""}${author}${rating}</div>
      <div class="review-text text-sm text-gray-800">${safeText}</div>
      <button class="selectBtn pill px-2 py-1 rounded text-xs mt-1">סמן קטע</button>
      <div class="mt-1">
        <a href="${it.url}" target="_blank" rel="noopener">קרא עוד ב-TMDB</a>
      </div>
    `;

    const btn = div.querySelector(".selectBtn");
    const textDiv = div.querySelector(".review-text");
    btn.addEventListener("click", () => {
      try {
        const selection = window.getSelection();
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(textDiv);
        selection.addRange(range);
        btn.textContent = "מסומן ✓";
        setTimeout(() => { btn.textContent = "סמן קטע"; }, 1500);
      } catch (e) {
        console.error(e);
        btn.textContent = "שגיאה";
      }
    });

    panel.appendChild(div);
  });
}

// === Filters rebuild ===
function rebuildGenreFilter() {
  const sel = $("#genreFilter");
  if (!sel) return;
  const current = sel.value;
  const set = new Set();
  allViews.forEach((v) => (v.genres || []).forEach((g) => set.add(g)));
  sel.innerHTML =
    '<option value="">הכול</option>' +
    Array.from(set).sort().map((g) => `<option>${g}</option>`).join("");
  if ([...sel.options].some((o) => o.value === current)) sel.value = current;
}

function rebuildLanguageFilter() {
  const sel = document.getElementById("langFilter");
  if (!sel) return;
  const set = new Set();
  (allViews || []).forEach((v) => {
    (v.languages || []).forEach((lang) => {
      const fixed = normalizeLangName(lang);
      if (fixed) set.add(fixed);
    });
  });
  const prev = Array.from(sel.selectedOptions).map((o) => o.value);
  sel.innerHTML = Array.from(set)
    .sort((a, b) => a.localeCompare(b, "he"))
    .map((n) => `<option value="${n}">${n}</option>`)
    .join("");
  Array.from(sel.options).forEach((o) => {
    if (prev.includes(o.value)) o.selected = true;
  });
}

// === Search panel toggle + keyboard shortcuts ===
const toggleBtn = document.querySelector("#toggleSearch");
const searchPanel = document.querySelector("#searchPanel");
const caretEl = document.querySelector("#caret");

function setExpanded(expanded) {
  if (!searchPanel) return;
  searchPanel.classList.toggle("hidden", !expanded);
  toggleBtn?.setAttribute("aria-expanded", String(expanded));
  if (caretEl) caretEl.textContent = expanded ? "▲" : "▼";
}

toggleBtn?.addEventListener("click", () => {
  const willOpen = searchPanel?.classList.contains("hidden");
  setExpanded(willOpen);
  if (willOpen) document.querySelector("#searchBox")?.focus();
});

window.addEventListener("keydown", (e) => {
  if (e.code === "F1") {
    e.preventDefault();
    setExpanded(true);
    document.querySelector("#searchBox")?.focus();
  } else if (e.code === "F2") {
    e.preventDefault();
    const willOpen = searchPanel?.classList.contains("hidden");
    setExpanded(willOpen);
    if (willOpen) document.querySelector("#searchBox")?.focus();
  } else if (e.code === "F3") {
    e.preventDefault();
    setAddExpanded(true);
    document.querySelector("#movieInput")?.focus();
  }
});

// Filter events
document.getElementById("filterToWatch")?.addEventListener("change", renderViews);
$("#searchBox")?.addEventListener("input", renderViews);
$("#genreFilter")?.addEventListener("change", renderViews);
$("#fromDate")?.addEventListener("change", renderViews);
$("#toDate")?.addEventListener("change", renderViews);

// Clear filters
document.querySelector("#clearFilters")?.addEventListener("click", () => {
  const sb = document.querySelector("#searchBox");
  const gf = document.querySelector("#genreFilter");
  const fd = document.querySelector("#fromDate");
  const td = document.querySelector("#toDate");
  const ftw = document.getElementById("filterToWatch");
  const lf = document.getElementById("langFilter");
  const la = document.getElementById("langRequireAll");

  if (sb) sb.value = "";
  if (gf) gf.value = "";
  if (fd) { fd.value = ""; fd.disabled = false; }
  if (td) { td.value = ""; td.disabled = false; }
  if (ftw) ftw.checked = false;
  if (lf) Array.from(lf.options).forEach((o) => (o.selected = false));
  if (la) la.checked = false;

  renderViews();
  sb?.focus();
});

setExpanded(false);

// === Add panel toggle ===
const toggleAddBtn  = document.getElementById("toggleAdd");
const addPanel      = document.getElementById("addPanel");
const addCaretEl    = document.getElementById("addCaret");

function setAddExpanded(expanded) {
  if (!addPanel) return;
  addPanel.classList.toggle("hidden", !expanded);
  toggleAddBtn?.setAttribute("aria-expanded", String(expanded));
  if (addCaretEl) addCaretEl.textContent = expanded ? "▲" : "▼";
  if (expanded) document.getElementById("movieInput")?.focus();
}

toggleAddBtn?.addEventListener("click", () => {
  setAddExpanded(addPanel.classList.contains("hidden"));
});

// F3 פותח גם את הטופס
// (override the existing F3 handler to also open the panel)


// === Actor drawer ===
const actorDrawer = document.getElementById("actorDrawer");
const actorTitleEl = document.getElementById("actorTitle");
const actorMoviesEl = document.getElementById("actorMovies");
const actorPhotoEl = document.getElementById("actorPhoto");

document.getElementById("closeActorDrawer")?.addEventListener("click", () => {
  actorDrawer.classList.remove("drawer-open");
});

document.addEventListener("click", async (e) => {
  const link = e.target.closest(".actor-link");
  if (!link) return;
  e.preventDefault();
  e.stopPropagation();

  const actorName = link.dataset.actor;
  if (!actorName) return;

  actorTitleEl.textContent = actorName;
  actorMoviesEl.innerHTML = "טוען פילמוגרפיה…";
  actorPhotoEl.classList.add("hidden");
  actorDrawer.classList.add("drawer-open");

  try {
    const person = await searchActorByName(actorName);
    if (!person) { actorMoviesEl.textContent = "שחקן לא נמצא"; return; }

    if (person.profile_path) {
      actorPhotoEl.src = `https://image.tmdb.org/t/p/w185${person.profile_path}`;
      actorPhotoEl.classList.remove("hidden");
    }

    const credits = await fetchActorCredits(person.id);
    actorMoviesEl.innerHTML = "";

    if (!credits.length) { actorMoviesEl.textContent = "לא נמצאו סרטים / סדרות"; return; }

    credits.forEach((item) => {
      const row = document.createElement("div");
      row.className = "flex gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded";
      row.dataset.movieId = item.id;
      row.dataset.mediaType = item.media_type;

      if (item.poster_path) {
        const img = document.createElement("img");
        img.src = `https://image.tmdb.org/t/p/w92${item.poster_path}`;
        img.className = "w-12 rounded";
        row.appendChild(img);
      }

      const title =
        item.title && hasHebrew(item.title) ? item.title :
        item.original_title ? item.original_title :
        item.original_name ? item.original_name :
        item.name || "ללא שם";

      const year = (item.release_date || item.first_air_date || "").slice(0, 4);

      const info = document.createElement("div");
      info.innerHTML = `
        <div class="font-semibold">
          ${title} ${year ? `(${year})` : ""}
          <span class="text-xs">${item.media_type === "tv" ? "📺" : "🎬"}</span>
        </div>
        <div class="text-xs text-gray-600">
          ⭐ ${item.vote_average?.toFixed(1) || "—"} · פופולריות ${Math.round(item.popularity || 0)}
        </div>
      `;
      row.appendChild(info);
      actorMoviesEl.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    actorMoviesEl.textContent = "שגיאה בטעינת פילמוגרפיה";
  }
});

// === Movie drawer ===
document.addEventListener("click", async (e) => {
  const row = e.target.closest("[data-movie-id]");
  if (!row) return;

  const id = row.dataset.movieId;
  const type = row.dataset.mediaType;
  if (!id || !type) return;

  const drawer = document.getElementById("movieDrawer");
  const titleEl = document.getElementById("movieTitle");
  const metaEl = document.getElementById("movieMeta");
  const contentEl = document.getElementById("movieContent");
  const posterEl = document.getElementById("moviePoster");

  drawer.classList.add("movie-open");
  contentEl.textContent = "טוען מידע…";
  posterEl.classList.add("hidden");

  try {
    const r = await fetch(
      `https://api.themoviedb.org/3/${type}/${id}` +
      `?api_key=${TMDB_API_KEY}&language=he-IL&append_to_response=credits,videos`
    );
    const d = await r.json();

    const title =
      d.title?.trim() || d.name?.trim() || d.original_title || d.original_name || "ללא שם";
    const year = (d.release_date || d.first_air_date || "").slice(0, 4);
    titleEl.textContent = `${title}${year ? " (" + year + ")" : ""}`;

    if (d.poster_path) {
      posterEl.src = `https://image.tmdb.org/t/p/w342${d.poster_path}`;
      posterEl.classList.remove("hidden");
    }

    const genres = (d.genres || []).map((g) => g.name).join(", ");
    metaEl.textContent = `⭐ ${d.vote_average?.toFixed(1) || "—"} · ${genres}`;

    const cast = (d.credits?.cast || []).slice(0, 6).map((c) => c.name);
    contentEl.innerHTML = `
      <div>${d.overview || "אין תקציר זמין."}</div>
      <div class="text-xs text-gray-600 mt-2"><strong>שחקנים:</strong> ${cast.join(", ")}</div>
    `;

    const trailer = d.videos?.results?.find((v) => v.site === "YouTube" && v.type === "Trailer");
    if (trailer) {
      const btn = document.createElement("a");
      btn.href = `https://www.youtube.com/watch?v=${trailer.key}`;
      btn.target = "_blank";
      btn.rel = "noopener noreferrer";
      btn.className =
        "inline-flex items-center gap-2 mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition";
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
          <path d="M10 15l5.19-3L10 9v6z"/>
          <path d="M21.56 7.17a2.78 2.78 0 00-1.95-1.96C17.9 4.8 12 4.8 12 4.8s-5.9 0-7.61.41A2.78 2.78 0 002.44 7.17 29.94 29.94 0 002 12a29.94 29.94 0 00.44 4.83 2.78 2.78 0 001.95 1.96c1.71.41 7.61.41 7.61.41s5.9 0 7.61-.41a2.78 2.78 0 001.95-1.96A29.94 29.94 0 0022 12a29.94 29.94 0 00-.44-4.83z"/>
        </svg>
        צפה בטריילר ביוטיוב
      `;
      contentEl.appendChild(btn);
    }
  } catch (err) {
    console.error(err);
    contentEl.textContent = "שגיאה בטעינת פרטים";
  }
});

document.getElementById("closeMovieDrawer")?.addEventListener("click", () => {
  document.getElementById("movieDrawer").classList.remove("movie-open");
});

// === Netflix Top 10 ===
document.getElementById("openNetflixTop")?.addEventListener("click", () => {
  window.open("https://www.netflix.com/tudum/top10/israel", "_blank", "noopener,noreferrer");
});

// === Backfill utility (console: backfillTitlesWithYear()) ===
window.backfillTitlesWithYear = async function () {
  try {
    const snap = await getDocs(collection(db, "views"));
    let updated = 0, skipped = 0, failed = 0;
    const hasYearSuffix = (t) => /\(\d{4}\)\s*$/.test(t || "");
    for (const d of snap.docs) {
      const v = d.data();
      let title = v.title || "";
      let year = v.releaseYear ?? null;
      if (hasYearSuffix(title)) { skipped++; continue; }
      if (year == null && v.source === "tmdb" && v.movieId) {
        try {
          const det = await getMovieDetails(v.movieId, v.mediaType || "movie");
          year = det?.releaseYear ?? null;
        } catch {}
        await new Promise((r) => setTimeout(r, 150));
      }
      if (year == null || !Number.isInteger(year)) { skipped++; continue; }
      const newTitle = `${title} (${year})`;
      try {
        await updateDoc(doc(db, "views", d.id), { title: newTitle, titleLower: newTitle.toLowerCase() });
        updated++;
      } catch (e) { console.error("update failed", d.id, e); failed++; }
    }
    alert(`סיום: עודכנו ${updated}, דולגו ${skipped}, כשלים ${failed}`);
  } catch (e) {
    console.error("backfillTitlesWithYear fatal", e);
    alert("שגיאה בהרצת backfill — ראה קונסולה");
  }
};
