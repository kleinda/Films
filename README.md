# 🎬 DAVID FILMS – יומן צפייה אישי

אפליקציית web אישית למעקב אחר סרטים וסדרות שנצפו.  
בנויה על Firebase + TMDB API, מאוחסנת ב-GitHub Pages.

**🌐 האתר החי:** [kleinda.github.io/Films](https://kleinda.github.io/Films/)

---

## תכונות

### הוספת צפייה
- חיפוש חכם ב-TMDB (סרטים + סדרות) – עברית ואנגלית בו-זמנית
- תצוגה מקדימה: פוסטר, ז'אנרים, שחקנים, תקציר, קישור לנטפליקס
- שמירת תאריך צפייה והערות אישיות
- סימון "לצפייה עתידית" – עדיין לא נצפה
- מניעת כפילויות לפי TMDB ID

### רשימת הסרטים
- כרטיסים לפי תאריך צפייה (חדש ראשון), עם אנימציית כניסה
- פוסטר · שנת יציאה · ז'אנרים · שפה · דירוג TMDB · זמן ריצה
- עריכת תאריך + הערות ישירות מהכרטיס (inline)
- מחיקה עם אישור
- סרגל סטטיסטיקות בהדר: כמה נצפו / כמה ממתינים

### חיפוש וסינון
| סינון | פרטים |
|-------|--------|
| שם חופשי | חיפוש בעברית ובאנגלית בו-זמנית |
| ז'אנר | dropdown דינמי לפי הנתונים הקיימים |
| שפה | רב-בחירה עם מצב OR / AND |
| תאריך צפייה | טווח מ-עד |
| לצפייה בלבד | checkbox לסינון הרשימה העתידית |

### פילמוגרפיית שחקנים (Drawer ימין)
- לחיצה על שם שחקן → drawer עם כל הפילמוגרפיה מ-TMDB
- מיון מחדש ישן, עם דירוג ופופולריות
- לחיצה על פריט → פרטי סרט/סדרה

### פרטי סרט/סדרה (Drawer שמאל)
- נפתח מתוך פילמוגרפיית שחקן
- פוסטר · דירוג · ז'אנרים · תקציר · שחקנים
- כפתור לצפייה בטריילר ב-YouTube

### ביקורות חיצוניות (TMDB Reviews)
- טעינה לפי דרישה (לא נטענות בהתחלה)
- מיון עדיפות: ביקורות עברית → אנגלית → שאר
- כפתור "סמן קטע" לבחירת טקסט להעתקה

### Netflix
- כפתור "נטפליקס" על כל כרטיס (חיפוש לפי שם מקורי)
- כפתור "Netflix Top 10 ישראל" צף בצד המסך (מסכים גדולים בלבד)

### מקשי קיצור
| מקש | פעולה |
|-----|--------|
| `F1` | פתח פאנל חיפוש |
| `F2` | הסתר / הצג פאנל חיפוש |
| `F3` | קפוץ לשדה הוספת סרט |

---

## מבנה הפרויקט

```
Films/
├── index.html              ← קובץ ראשי (HTML בלבד, מפנה ל-CSS וJS)
├── films.css               ← כל העיצוב (משתני CSS + Tailwind-based)
├── films.js                ← כל הלוגיקה (Firebase + TMDB + UI)
├── .gitignore
├── README.md
│
│   ── קבצי פיתוח / גיבוי ──
├── Films.html              ← גרסה מקורית מונוליתית (CSS+JS מוטמעים) – גיבוי
├── module.js               ← גרסת JS ישנה – גיבוי
├── autocompleteFilm.html   ← פרוטוטייפ ראשוני של חיפוש הסרטים
├── autocompleteFilm.txt    ← גרסת טקסט של הפרוטוטייפ
├── הסבר אוטנטיקציה בסרטים.txt  ← תיעוד Firebase Auth
│
│   ── מודול עתידי ──
└── Plays.html              ← יומן הצגות (לא פעיל עדיין)
```

### אבולוציית הפרויקט
| שלב | קובץ | מה חדש |
|-----|------|---------|
| 1 | `autocompleteFilm.html` | פרוטוטייפ: חיפוש TMDB בסיסי, ללא Firebase |
| 2 | `Films.html` | מערכת מלאה – Firebase, פילטרים, drawers (הכל מוטמע) |
| 3 | `index.html` + `films.css` + `films.js` | הפרדת קוד, תיקוני באגים, פריסה לגיטהב |

---

## טכנולוגיות

| רכיב | גרסה / פרטים |
|------|--------------|
| **Firebase Firestore** | 10.13.2 – מסד נתונים real-time |
| **Firebase Auth** | 10.13.2 – כניסה אנונימית |
| **TMDB API** | v3 – סרטים, סדרות, שחקנים, ביקורות |
| **Tailwind CSS** | CDN – utility-first styling |
| **ES Modules** | ייבוא Firebase ישירות מ-CDN (ללא build step) |
| **GitHub Pages** | אחסון ופריסה – ללא שרת |

---

## Firebase – מבנה הנתונים

**Collection:** `views` · **Project:** `films-5c7ff`

```js
{
  // זיהוי
  movieId: "496243",             // TMDB ID (string)
  mediaType: "movie" | "tv",
  source: "tmdb" | "manual",

  // כותרות
  title: "Parasite",
  originalTitle: "기생충",
  titleLower: "parasite",        // לחיפוש case-insensitive
  originalLower: "기생충",

  // מידע על הסרט
  overview: "...",
  posterUrl: "https://image.tmdb.org/...",
  genres: ["דרמה", "מתח"],
  cast: ["Song Kang-ho", "Lee Sun-kyun"],
  languages: ["ko"],             // קודי שפה ISO 639-1
  originalLangCode: "ko",
  releaseDate: "2019-05-30",
  releaseYear: 2019,
  runtime: 132,                  // דקות (סרט)
  episodeRuntime: 45,            // דקות לפרק (סדרה בלבד)
  tmdbRating: 8.5,
  tmdbVotes: 17842,

  // צפייה
  watchDate: Timestamp,
  notes: "מדהים. עם אבא",
  toWatch: false,                // true = לצפייה עתידית
  createdAt: Timestamp
}
```

### נרמול שפות
קודי שפה מה-API מתורגמים לעברית לפי שתי מפות:
- **לפי קוד** (en → אנגלית, ko → קוריאנית, ru → רוסית...)
- **לפי שם מקומי** (English → אנגלית, 한국어 → קוריאנית...)

---

## Firebase Auth

האפליקציה משתמשת ב-**Anonymous Auth** – כל מבקר מקבל UID ייחודי אוטומטית.

```
✅ AUTH: UserImpl    ← משתמש מחובר (תקין)
✅ מחובר: yH2eCA...  ← ה-UID של הסשן
```

> המצב מופיע פעמיים בקונסולה – זו התנהגות תקינה של `onAuthStateChanged`.  
> פרטים נוספים: `הסבר אוטנטיקציה בסרטים.txt`

**⚠️ הגבלה:** ניקוי cookies → UID חדש (לא מאבד נתונים, כי הנתונים משותפים).

---

## אבטחה

**Firebase API Key** – ציבורי לחלוטין ובכוונה. הסיכון האמיתי הוא ב-Firestore Rules.

**Firestore Rules מומלצות** (Console → Firestore → Rules):
```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /views/{docId} {
      allow read, write: if request.auth != null
        && request.auth.uid == "yH2eCAVVBTeFgeQbG76nDb5bOC2";
    }
  }
}
```

**TMDB API Key** – חשוף בקוד הלקוח. לפרויקט אישי הסיכון זניח (שירות חינמי, rate limit נדיב).

---

## עדכון האתר

```powershell
git add .
git commit -m "תיאור השינוי"
git push
```
GitHub Pages מתעדכן אוטומטית תוך ~דקה.

---

## כלי תחזוקה

**Backfill שנה לכותרות** – מוסיף `(שנה)` לכותרות ישנות.  
הרץ בקונסולת הדפדפן:
```js
backfillTitlesWithYear()
```

---

## מודול עתידי: PLAYS

`Plays.html` – יומן הצגות תיאטרון בעיצוב זהה (accent כתום במקום סגול).  
כולל: שם הצגה, תאריך נוכחות, הערות, תצוגה מקדימה.  
**לא מחובר ל-Firebase עדיין ולא פרוס.**
