/* =========================================================
   agora: онлайн-голосование
   Голоса хранятся в Firebase Firestore:
     settings/main  - статус голосования и опубликованные итоги (меняется в admin.html)
     votes/{uid}    - один документ на браузер: { candidate, at }
   Ключи проекта в firebase-config.js, защита базы в firestore.rules.
   ========================================================= */

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const LS_KEY = "agora-vote";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const CANDIDATES = window.CANDIDATES || [];
const findCandidate = (id) => CANDIDATES.find((c) => String(c.id) === String(id));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const root = document.getElementById("vote");

/* ---------- Связь с Firebase ---------- */
async function createFirebaseApi(cfg) {
  const [appMod, authMod, fs] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-firestore.js"),
  ]);
  const app = appMod.initializeApp(cfg);
  const auth = authMod.getAuth(app);
  const db = fs.getFirestore(app);
  const settingsRef = fs.doc(db, "settings", "main");

  // анонимный вход создаётся только в момент голосования, а не у каждого посетителя
  const ready = new Promise((resolve) => {
    const off = authMod.onAuthStateChanged(auth, () => { off(); resolve(); });
  });

  function codeError(code, extra) {
    const e = new Error(code);
    e.code = code;
    return Object.assign(e, extra || {});
  }

  return {
    onSettings(cb, onError) {
      return fs.onSnapshot(settingsRef, (s) => cb(s.exists() ? s.data() : null), onError);
    },

    async myVote() {
      await ready;
      const user = auth.currentUser;
      if (!user) return null;
      const s = await fs.getDoc(fs.doc(db, "votes", user.uid));
      return s.exists() ? { candidate: s.data().candidate, id: user.uid } : null;
    },

    async vote(candidate) {
      await ready;
      const user = auth.currentUser || (await authMod.signInAnonymously(auth)).user;
      const ref = fs.doc(db, "votes", user.uid);
      try {
        // без ответа сервера promise висит вечно, поэтому ставим таймаут
        await Promise.race([
          fs.setDoc(ref, { candidate, at: fs.serverTimestamp() }),
          wait(20000).then(() => { throw codeError("network"); }),
        ]);
      } catch (e) {
        if (e && e.code === "permission-denied") {
          // запрет бывает в двух случаях: голос уже есть или голосование закрыто
          const s = await fs.getDoc(ref).catch(() => null);
          if (s && s.exists()) throw codeError("already", { candidate: s.data().candidate, id: user.uid });
          throw codeError("closed");
        }
        if (e && e.code === "network") throw e;
        throw codeError("network");
      }
      return { candidate, id: user.uid };
    },
  };
}

/* ---------- Сохранённый в браузере голос (чтобы талон показался сразу) ---------- */
function loadLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    return v && v.candidate != null ? v : null;
  } catch (e) { return null; }
}
function saveLocal(v) {
  try {
    if (v) localStorage.setItem(LS_KEY, JSON.stringify(v));
    else localStorage.removeItem(LS_KEY);
  } catch (e) {}
}

/* ---------- Мелкие помощники для DOM ---------- */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function photoOf(c, cls) {
  const box = el("span", cls);
  if (c.c1) box.style.setProperty("--c1", c.c1);
  if (c.photo) {
    const img = el("img");
    img.src = c.photo;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    box.appendChild(img);
  } else {
    box.textContent = c.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
  }
  return box;
}

const CHECK_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 17.5l6.5 6.5L27 7"/></svg>';

// Номер бюллетеня из id браузера: короткий и всегда одинаковый на этом устройстве
function ballotNumber(id) {
  const s = String(id || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  return s ? s.slice(-6) : "------";
}

let stampSeq = 0;
function makeStamp(word) {
  stampSeq++;
  const f = "voteInk" + stampSeq, r = "voteRing" + stampSeq;
  const s = el("span", "vstamp");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML =
    '<svg viewBox="0 0 200 200"><defs>' +
      '<filter id="' + f + '" x="-8%" y="-8%" width="116%" height="116%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="' + (stampSeq * 5 + 2) + '" result="warp"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="warp" scale="3.2" result="shape"/>' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="1" seed="' + (stampSeq * 3 + 4) + '" result="grain"/>' +
        '<feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.15 1.38" result="ink"/>' +
        '<feComposite in="shape" in2="ink" operator="in"/>' +
      '</filter>' +
      '<path id="' + r + '" d="M28 100a72 72 0 1 1 144 0a72 72 0 1 1-144 0"/>' +
    '</defs><g filter="url(#' + f + ')">' +
      '<g fill="none" stroke="currentColor">' +
        '<circle cx="100" cy="100" r="94" stroke-width="5"/>' +
        '<circle cx="100" cy="100" r="85" stroke-width="1.6"/>' +
        '<path d="M36 82h128M36 118h128" stroke-width="2"/>' +
      '</g>' +
      '<g fill="currentColor" font-family="Golos Text, system-ui, sans-serif">' +
        '<text font-size="14" font-weight="800"><textPath href="#' + r + '" textLength="438" lengthAdjust="spacing">ВЫБОРЫ ПРЕЗИДЕНТА ШКОЛЫ ★ 2026 ★</textPath></text>' +
        '<text x="100" y="107" text-anchor="middle" font-size="24" font-weight="900" textLength="118" lengthAdjust="spacingAndGlyphs">' + word + '</text>' +
      '</g>' +
    '</g></svg>';
  return s;
}

/* ---------- Урна ---------- */
function buildUrn(box) {
  box.innerHTML =
    '<p class="urn-note" id="urnNote">урна тут</p>' +
    '<svg class="urn-svg" viewBox="0 0 240 230" aria-hidden="true">' +
      '<ellipse class="urn-shadow" cx="122" cy="214" rx="104" ry="10"/>' +
      '<path class="urn-face urn-side" d="M176 96 L216 72 L216 186 L176 210 Z"/>' +
      '<path class="urn-face urn-top" d="M24 96 L64 72 L216 72 L176 96 Z"/>' +
      '<rect class="urn-face urn-front" x="24" y="96" width="152" height="114"/>' +
      '<line class="urn-slot" x1="74" y1="84" x2="166" y2="84"/>' +
      '<text class="urn-logo" x="100" y="160" text-anchor="middle">α</text>' +
      '<text class="urn-label" x="100" y="190" text-anchor="middle">ВЫБОРЫ · 2026</text>' +
    '</svg>';
}

/* =========================================================
   Основная логика
   ========================================================= */
async function start() {
  const statusEl = document.getElementById("voteStatus");
  const stage = document.getElementById("voteStage");
  const urnBox = document.getElementById("voteUrn");
  buildUrn(urnBox);
  const urnNote = document.getElementById("urnNote");

  const state = {
    conn: "loading",     // loading | ready | slow | off | error
    settings: null,      // { status, showResults, results, total, publishedAt }
    mine: loadLocal(),   // { candidate, id } если с этого браузера уже голосовали
    selected: null,
    busy: false,
    message: "",
    view: "",
  };
  let api = null;

  /* ---- статус под заголовком ---- */
  function renderStatus() {
    const st = (state.settings && state.settings.status) || "soon";
    let key, text;
    if (state.conn === "off") { key = "soon"; text = "Онлайн-голосование скоро откроется"; }
    else if (state.conn === "error") { key = "error"; text = "Нет связи с сервером голосования"; }
    else if (state.conn === "loading") { key = "loading"; text = "Подключаемся…"; }
    else if (state.conn === "slow") { key = "loading"; text = "Связь медленная, ждём сервер…"; }
    else if (st === "open") { key = "open"; text = "Голосование открыто"; }
    else if (st === "closed") { key = "closed"; text = "Голосование завершено"; }
    else { key = "soon"; text = "Голосование ещё не началось"; }
    statusEl.dataset.state = key;
    statusEl.lastElementChild.textContent = text;
  }

  function currentView() {
    const s = state.settings;
    // итоги видны, когда их опубликовал админ; пока голосование открыто, бюллетень важнее
    if (state.conn === "ready" && s && s.showResults && s.results && (s.status !== "open" || state.mine)) return "results";
    if (state.mine) return "receipt";
    return "ballot";
  }

  /* ---- бюллетень ---- */
  let ballot = null;
  function buildBallot() {
    const sheet = el("div", "vsheet vballot");
    const head = el("div", "vsheet-head");
    head.appendChild(el("p", "vsheet-kind", "Бюллетень"));
    head.appendChild(el("h3", null, "для голосования"));
    head.appendChild(el("p", "vsheet-sub", "Выборы президента школы, 2026"));
    sheet.appendChild(head);
    sheet.appendChild(el("p", "vballot-hint", "Поставьте отметку в квадрате справа от имени одного кандидата."));

    const listEl = el("div", "vballot-list");
    listEl.setAttribute("role", "radiogroup");
    listEl.setAttribute("aria-label", "Кандидаты");
    const inputs = [];
    CANDIDATES.forEach((c) => {
      const row = el("label", "vrow");
      const input = el("input", "vrow-input");
      input.type = "radio";
      input.name = "agora-candidate";
      input.value = String(c.id);
      input.addEventListener("change", () => {
        state.selected = c.id;
        state.message = "";
        renderBallot();
      });
      inputs.push(input);
      const text = el("span", "vrow-text");
      text.appendChild(el("span", "vrow-name", c.name));
      text.appendChild(el("span", "vrow-grade", c.grade));
      const boxEl = el("span", "vrow-box");
      boxEl.innerHTML = CHECK_SVG;
      row.appendChild(input);
      row.appendChild(photoOf(c, "vrow-photo"));
      row.appendChild(text);
      row.appendChild(boxEl);
      listEl.appendChild(row);
    });
    sheet.appendChild(listEl);

    const lock = el("p", "vballot-lock");
    lock.setAttribute("aria-hidden", "true");
    sheet.appendChild(lock);

    const foot = el("div", "vballot-foot");
    const btn = el("button", "btn btn--red vballot-submit");
    btn.type = "button";
    btn.addEventListener("click", submit);
    const note = el("p", "vballot-note");
    note.setAttribute("aria-live", "polite");
    foot.appendChild(btn);
    foot.appendChild(note);
    sheet.appendChild(foot);

    ballot = { sheet, inputs, btn, note, lock };
    return sheet;
  }

  function renderBallot() {
    if (!ballot) return;
    const st = (state.settings && state.settings.status) || "soon";
    const open = state.conn === "ready" && st === "open";
    const chosen = state.selected != null ? findCandidate(state.selected) : null;

    ballot.inputs.forEach((i) => { i.disabled = !open || state.busy; });
    let lockText = "";
    if (state.conn === "off" || (state.conn === "ready" && st === "soon")) lockText = "скоро откроется";
    else if (state.conn === "ready" && st === "closed") lockText = "голосование закрыто";
    ballot.lock.textContent = lockText;
    ballot.sheet.classList.toggle("is-locked", !!lockText);

    let label;
    if (state.busy) label = "Опускаем в урну…";
    else if (state.conn === "loading" || state.conn === "slow") label = "Подключаемся…";
    else if (state.conn === "error") label = "Нет связи";
    else if (state.conn === "off" || st === "soon") label = "Голосование ещё не началось";
    else if (st === "closed") label = "Голосование завершено";
    else if (!chosen) label = "Выберите кандидата";
    else label = "Опустить в урну";
    ballot.btn.textContent = label;
    ballot.btn.disabled = !open || !chosen || state.busy;

    ballot.note.classList.toggle("is-error", !!state.message);
    ballot.note.textContent = state.message ||
      (chosen && open ? "Вы выбрали: " + chosen.name + ". Изменить голос потом нельзя."
                      : "Голос анонимный. С одного устройства можно проголосовать один раз.");

    urnNote.textContent = chosen && open ? "опусти сюда" : "урна тут";
    urnBox.classList.toggle("is-ready", !!(chosen && open));
  }

  /* ---- талон после голосования ---- */
  function buildReceipt(isNew) {
    const c = findCandidate(state.mine.candidate);
    const sheet = el("div", "vsheet vreceipt" + (isNew ? " is-new" : ""));
    const head = el("div", "vsheet-head");
    head.appendChild(el("p", "vsheet-kind", "Талон"));
    head.appendChild(el("h3", null, "Голос учтён"));
    head.appendChild(el("p", "vsheet-sub", "Спасибо, что проголосовали!"));
    sheet.appendChild(head);

    const choice = el("div", "vreceipt-choice");
    if (c) choice.appendChild(photoOf(c, "vreceipt-photo"));
    const txt = el("div", "vreceipt-text");
    txt.appendChild(el("span", "vreceipt-label", "Ваш выбор"));
    txt.appendChild(el("strong", "vreceipt-name", c ? c.name : "Кандидат"));
    if (c) txt.appendChild(el("span", "vreceipt-grade", c.grade));
    choice.appendChild(txt);
    choice.appendChild(makeStamp("ПРИНЯТО"));
    sheet.appendChild(choice);

    const meta = el("dl", "vreceipt-meta");
    [["Бюллетень", "№ " + ballotNumber(state.mine.id)], ["Голосов с устройства", "1 из 1"]].forEach(([k, v]) => {
      const row = el("div");
      row.appendChild(el("dt", null, k));
      row.appendChild(el("dd", null, v));
      meta.appendChild(row);
    });
    sheet.appendChild(meta);
    sheet.appendChild(el("p", "vreceipt-note", "Итоги появятся здесь после завершения голосования."));
    urnNote.textContent = "твой голос внутри";
    urnBox.classList.remove("is-ready");
    return sheet;
  }

  /* ---- итоги ---- */
  function buildResults() {
    const s = state.settings;
    const counts = s.results || {};
    const rows = CANDIDATES.map((c) => ({ c, n: Number(counts[c.id] || counts[String(c.id)] || 0) }))
      .sort((a, b) => b.n - a.n);
    const total = rows.reduce((sum, r) => sum + r.n, 0);
    const top = rows.length ? rows[0].n : 0;

    const sheet = el("div", "vsheet vresults");
    const head = el("div", "vsheet-head");
    head.appendChild(el("p", "vsheet-kind", "Протокол"));
    head.appendChild(el("h3", null, "Итоги голосования"));
    head.appendChild(el("p", "vsheet-sub", "Всего голосов: " + total));
    sheet.appendChild(head);

    const ol = el("ol", "vres-list");
    rows.forEach((r, i) => {
      const pct = total ? Math.round((r.n / total) * 1000) / 10 : 0;
      const li = el("li", "vres-row" + (r.n === top && top > 0 ? " is-lead" : ""));
      li.appendChild(el("span", "vres-place", String(i + 1)));
      const name = el("span", "vres-name", r.c.name);
      if (state.mine && String(state.mine.candidate) === String(r.c.id)) name.appendChild(el("em", "vres-mine", "твой голос"));
      li.appendChild(name);
      const num = el("span", "vres-num", String(r.n));
      num.appendChild(el("small", null, String(pct).replace(".", ",") + "%"));
      li.appendChild(num);
      const bar = el("span", "vres-bar");
      const fill = el("i");
      fill.style.setProperty("--w", (top ? (r.n / top) * 100 : 0) + "%");
      bar.appendChild(fill);
      li.appendChild(bar);
      ol.appendChild(li);
    });
    sheet.appendChild(ol);
    if (state.mine) sheet.appendChild(el("p", "vreceipt-note", "Ваш голос учтён, бюллетень № " + ballotNumber(state.mine.id) + "."));
    // полосы растут после появления листа
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add("is-shown")));
    urnNote.textContent = "голоса посчитаны";
    urnBox.classList.remove("is-ready");
    return sheet;
  }

  /* ---- выбор нужного листа ---- */
  function render(opts) {
    renderStatus();
    const v = currentView();
    const settingsKey = v === "results" ? JSON.stringify(state.settings.results) + (state.mine ? state.mine.candidate : "") : "";
    if (v !== state.view || (v === "results" && settingsKey !== state.resultsKey)) {
      state.view = v;
      state.resultsKey = settingsKey;
      stage.textContent = "";
      ballot = null;
      if (v === "ballot") stage.appendChild(buildBallot());
      else if (v === "receipt") stage.appendChild(buildReceipt(opts && opts.fresh));
      else stage.appendChild(buildResults());
    }
    renderBallot();
  }

  /* ---- бюллетень падает в урну ---- */
  async function dropIntoUrn(sheet) {
    const slot = urnBox.querySelector(".urn-slot");
    if (reduceMotion.matches || !sheet.animate || !slot) return;
    let s = slot.getBoundingClientRect();
    if (s.top < 70 || s.bottom > window.innerHeight - 30) {
      urnBox.scrollIntoView({ behavior: "smooth", block: "end" });
      await wait(550);
      s = slot.getBoundingClientRect();
    }
    const r = sheet.getBoundingClientRect();
    const dx = s.left + s.width / 2 - (r.left + r.width / 2);
    const dy = s.top + s.height / 2 - (r.top + r.height / 2);
    const from = getComputedStyle(sheet).transform;
    sheet.classList.add("is-flying");
    const anim = sheet.animate([
      { transform: from === "none" ? "none" : from, opacity: 1 },
      { transform: "translateY(-14px) scale(.94, .42) rotate(-2deg)", opacity: 1, offset: 0.32 },
      { transform: "translate(" + dx + "px," + (dy - 26) + "px) scale(.26, .1) rotate(-5deg)", opacity: 1, offset: 0.82 },
      { transform: "translate(" + dx + "px," + (dy + 18) + "px) scale(.2, .05) rotate(0deg)", opacity: 0 },
    ], { duration: 1150, easing: "cubic-bezier(.55, 0, .3, 1)", fill: "forwards" });
    await anim.finished;
    urnBox.classList.remove("is-hit");
    void urnBox.offsetWidth;
    urnBox.classList.add("is-hit");
    await wait(260);
  }

  /* ---- отправка голоса ---- */
  async function submit() {
    if (!api || state.busy || state.selected == null) return;
    state.busy = true;
    state.message = "";
    renderBallot();
    try {
      const res = await api.vote(state.selected);
      if (ballot) await dropIntoUrn(ballot.sheet);
      state.mine = { candidate: res.candidate, id: res.id };
      saveLocal(state.mine);
      state.busy = false;
      render({ fresh: true });
      if (!reduceMotion.matches) stage.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      state.busy = false;
      if (e && e.code === "already") {
        state.mine = { candidate: e.candidate, id: e.id };
        saveLocal(state.mine);
        render({ fresh: true });
        return;
      }
      state.message = e && e.code === "closed"
        ? "Голосование сейчас закрыто, голос не принят."
        : "Не получилось отправить голос. Проверьте интернет и попробуйте ещё раз.";
      renderBallot();
    }
  }

  /* ---- запуск ---- */
  render();

  const cfg = window.AGORA_FIREBASE || {};
  const mock = window.AGORA_VOTE_MOCK;
  if (!mock && !(cfg.apiKey && cfg.projectId)) {
    state.conn = "off";
    render();
    return;
  }

  const slowTimer = setTimeout(() => {
    if (state.conn === "loading") { state.conn = "slow"; render(); }
  }, 8000);

  try {
    api = mock || (await createFirebaseApi(cfg));
  } catch (e) {
    clearTimeout(slowTimer);
    state.conn = "error";
    render();
    return;
  }

  api.onSettings((s) => {
    clearTimeout(slowTimer);
    state.settings = s;
    state.conn = "ready";
    render();
  }, () => {
    clearTimeout(slowTimer);
    state.conn = "error";
    render();
  });

  // сверяем талон с базой: если голосов нет (например, после тестового сброса), бюллетень вернётся
  try {
    const v = await api.myVote();
    state.mine = v;
    saveLocal(v);
    render();
  } catch (e) { /* нет связи: оставляем то, что сохранено в браузере */ }
}

if (root) start();
