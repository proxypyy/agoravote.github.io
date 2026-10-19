/* =========================================================
   agora: пульт голосования (admin.html)
   Вход по почте и паролю админа. Права проверяет не эта страница,
   а правила базы (firestore.rules): чужой аккаунт ничего не прочитает и не изменит.
   ========================================================= */

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const CANDIDATES = window.CANDIDATES || [];
const $ = (id) => document.getElementById(id);

async function createAdminApi(cfg) {
  const [appMod, a, fs] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-firestore.js"),
  ]);
  const app = appMod.initializeApp(cfg);
  const auth = a.getAuth(app);
  const db = fs.getFirestore(app);
  const settingsRef = fs.doc(db, "settings", "main");
  const votes = fs.collection(db, "votes");

  return {
    onAuth: (cb) => a.onAuthStateChanged(auth, (u) => cb(u && !u.isAnonymous ? { email: u.email, uid: u.uid } : null)),
    signIn: (email, pass) => a.signInWithEmailAndPassword(auth, email, pass),
    signOut: () => a.signOut(auth),
    onSettings: (cb, onErr) => fs.onSnapshot(settingsRef, (s) => cb(s.exists() ? s.data() : null), onErr),

    async counts() {
      const out = {};
      await Promise.all(CANDIDATES.map(async (c) => {
        const snap = await fs.getCountFromServer(fs.query(votes, fs.where("candidate", "==", c.id)));
        out[c.id] = snap.data().count;
      }));
      return out;
    },

    setStatus: (status) => fs.setDoc(settingsRef, { status, updatedAt: fs.serverTimestamp() }, { merge: true }),
    publish: (results) => fs.setDoc(settingsRef, { results, showResults: true, publishedAt: fs.serverTimestamp() }, { merge: true }),
    hide: () => fs.setDoc(settingsRef, { showResults: false }, { merge: true }),

    async resetVotes() {
      let removed = 0;
      for (;;) {
        const snap = await fs.getDocs(fs.query(votes, fs.limit(400)));
        if (snap.empty) break;
        const batch = fs.writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        removed += snap.size;
      }
      return removed;
    },
  };
}

/* ---------- Интерфейс ---------- */
function say(text, isError) {
  const m = $("adminMsg");
  m.textContent = text || "";
  m.classList.toggle("is-error", !!isError);
}

function explain(e) {
  const code = (e && e.code) || "";
  if (code.includes("permission-denied")) return "Нет прав. Проверь, что в firestore.rules стоит UID этого аккаунта, и правила опубликованы.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Неверная почта или пароль.";
  if (code.includes("too-many-requests")) return "Слишком много попыток. Подожди пару минут.";
  if (code.includes("unavailable") || code.includes("network")) return "Нет связи с Firebase. Проверь интернет.";
  return "Ошибка: " + (code || (e && e.message) || "неизвестная");
}

function timeNow() {
  return new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtStamp(ts) {
  const d = ts && typeof ts.toDate === "function" ? ts.toDate() : null;
  return d ? d.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";
}

function renderCounts(counts) {
  const rows = CANDIDATES.map((c) => ({ c, n: Number(counts[c.id] || 0) })).sort((x, y) => y.n - x.n);
  const total = rows.reduce((s, r) => s + r.n, 0);
  const top = rows.length ? rows[0].n : 0;
  $("liveTotal").textContent = "Всего голосов: " + total;
  const ol = $("liveList");
  ol.textContent = "";
  rows.forEach((r, i) => {
    const li = document.createElement("li");
    li.className = "vres-row" + (r.n === top && top > 0 ? " is-lead" : "");
    const place = document.createElement("span");
    place.className = "vres-place";
    place.textContent = i + 1;
    const name = document.createElement("span");
    name.className = "vres-name";
    name.textContent = r.c.name;
    const num = document.createElement("span");
    num.className = "vres-num";
    num.textContent = r.n;
    const pct = document.createElement("small");
    pct.textContent = (total ? Math.round((r.n / total) * 1000) / 10 : 0).toString().replace(".", ",") + "%";
    num.appendChild(pct);
    const bar = document.createElement("span");
    bar.className = "vres-bar";
    const fill = document.createElement("i");
    fill.style.setProperty("--w", (top ? (r.n / top) * 100 : 0) + "%");
    bar.appendChild(fill);
    li.append(place, name, num, bar);
    ol.appendChild(li);
  });
  $("liveUpdated").textContent = "Обновлено в " + timeNow();
  return total;
}

async function main() {
  const cfg = window.AGORA_FIREBASE || {};
  const mock = window.AGORA_ADMIN_MOCK;
  if (!mock && !(cfg.apiKey && cfg.projectId)) {
    say("Firebase ещё не подключён: заполни firebase-config.js.", true);
    return;
  }

  let api;
  try {
    api = mock || (await createAdminApi(cfg));
  } catch (e) {
    say("Не загрузилась библиотека Firebase. Проверь интернет.", true);
    return;
  }

  let settings = null;
  let lastCounts = null;
  let pollTimer = null;
  let offSettings = null;
  let resetArmed = false;

  const segButtons = Array.from(document.querySelectorAll(".admin-seg button"));

  function renderSettings() {
    const status = (settings && settings.status) || "soon";
    segButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.status === status)));
    const shown = !!(settings && settings.showResults && settings.results);
    $("pubState").textContent = shown
      ? "Итоги видны на сайте. Снимок от " + (fmtStamp(settings.publishedAt) || "только что") + "."
      : "Итоги на сайте скрыты.";
    $("hideBtn").disabled = !shown;
    $("resetBtn").disabled = status === "open";
  }

  async function refresh() {
    try {
      lastCounts = await api.counts();
      renderCounts(lastCounts);
    } catch (e) {
      say(explain(e), true);
    }
  }

  function startPolling() {
    clearInterval(pollTimer);
    refresh();
    // раз в 10 секунд, и только пока вкладка открыта на экране
    pollTimer = setInterval(() => { if (!document.hidden) refresh(); }, 10000);
  }

  segButtons.forEach((b) => b.addEventListener("click", async () => {
    const status = b.dataset.status;
    if (status === ((settings && settings.status) || "soon")) return;
    segButtons.forEach((x) => { x.disabled = true; });
    try {
      await api.setStatus(status);
      say(status === "open" ? "Голосование открыто." : status === "closed" ? "Голосование завершено." : "Статус: скоро.");
    } catch (e) { say(explain(e), true); }
    segButtons.forEach((x) => { x.disabled = false; });
  }));

  $("publishBtn").addEventListener("click", async () => {
    try {
      const counts = await api.counts();
      lastCounts = counts;
      renderCounts(counts);
      const results = {};
      Object.keys(counts).forEach((k) => { results[String(k)] = counts[k]; });
      await api.publish(results);
      say("Итоги опубликованы на сайте.");
    } catch (e) { say(explain(e), true); }
  });

  $("hideBtn").addEventListener("click", async () => {
    try { await api.hide(); say("Итоги скрыты."); } catch (e) { say(explain(e), true); }
  });

  // сброс в два нажатия, чтобы не удалить голоса случайно
  $("resetBtn").addEventListener("click", async () => {
    const btn = $("resetBtn");
    if (!resetArmed) {
      resetArmed = true;
      btn.textContent = "Точно удалить? Нажми ещё раз";
      btn.classList.add("is-armed");
      setTimeout(() => {
        resetArmed = false;
        btn.textContent = "Удалить все голоса";
        btn.classList.remove("is-armed");
      }, 5000);
      return;
    }
    resetArmed = false;
    btn.disabled = true;
    btn.textContent = "Удаляю…";
    try {
      const n = await api.resetVotes();
      say("Удалено голосов: " + n + ".");
      await refresh();
    } catch (e) { say(explain(e), true); }
    btn.textContent = "Удалить все голоса";
    btn.classList.remove("is-armed");
    renderSettings();
  });

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("loginBtn");
    btn.disabled = true;
    say("");
    try {
      await api.signIn($("loginEmail").value.trim(), $("loginPass").value);
    } catch (err) { say(explain(err), true); }
    btn.disabled = false;
  });

  $("logoutBtn").addEventListener("click", () => api.signOut());

  api.onAuth((user) => {
    clearInterval(pollTimer);
    if (offSettings) { offSettings(); offSettings = null; }
    $("loginForm").hidden = !!user;
    $("panel").hidden = !user;
    if (!user) return;
    say("");
    $("whoami").textContent = "Вошёл как " + (user.email || user.uid) + ".";
    offSettings = api.onSettings((s) => { settings = s; renderSettings(); }, (e) => say(explain(e), true));
    startPolling();
  });
}

main();
