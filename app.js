(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // ---- Склонение слова «балл» ----
  function pluralBalls(n) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return "баллов";
    if (b > 1 && b < 5) return "балла";
    if (b === 1) return "балл";
    return "баллов";
  }

  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2)
      .map(function (w) { return w[0].toUpperCase(); }).join("");
  }

  function hasScore(c) { return typeof c.score === "number" && isFinite(c.score); }

  // status: "win" в candidates.js — кандидат победил
  function isWinner(c) { return String(c.status || "").trim().toLowerCase() === "win"; }

  // ---- Печать «Победитель» ----
  // Круглая печать красными чернилами. Неровные края и «непропечатанные» места
  // делает SVG-фильтр, поэтому каждая печать выглядит чуть по-своему.
  var stampCount = 0;
  function makeStamp(extraClass) {
    stampCount++;
    var f = "stampInk" + stampCount, r = "stampRing" + stampCount;
    var el = document.createElement("span");
    el.className = "stamp" + (extraClass ? " " + extraClass : "");
    el.setAttribute("aria-hidden", "true");
    el.innerHTML =
      '<svg viewBox="0 0 200 200">' +
        '<defs>' +
          '<filter id="' + f + '" x="-8%" y="-8%" width="116%" height="116%">' +
            '<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="' + (stampCount * 7) + '" result="warp"/>' +
            '<feDisplacementMap in="SourceGraphic" in2="warp" scale="3.2" result="shape"/>' +
            '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="1" seed="' + (stampCount * 3 + 1) + '" result="grain"/>' +
            '<feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.15 1.38" result="ink"/>' +
            '<feComposite in="shape" in2="ink" operator="in"/>' +
          '</filter>' +
          '<path id="' + r + '" d="M28 100a72 72 0 1 1 144 0a72 72 0 1 1-144 0"/>' +
        '</defs>' +
        '<g filter="url(#' + f + ')">' +
          '<g fill="none" stroke="currentColor">' +
            '<circle cx="100" cy="100" r="94" stroke-width="5"/>' +
            '<circle cx="100" cy="100" r="85" stroke-width="1.6"/>' +
            '<path d="M36 82h128M36 118h128" stroke-width="2"/>' +
          '</g>' +
          '<g fill="currentColor" font-family="Golos Text, system-ui, sans-serif">' +
            '<text font-size="14" font-weight="800"><textPath href="#' + r + '" textLength="438" lengthAdjust="spacing">ВЫБОРЫ ПРЕЗИДЕНТА ШКОЛЫ ★ 2026 ★</textPath></text>' +
            '<text x="100" y="107" text-anchor="middle" font-size="21" font-weight="900" textLength="124" lengthAdjust="spacingAndGlyphs">ПОБЕДИТЕЛЬ</text>' +
          '</g>' +
        '</g>' +
      '</svg>';
    return el;
  }

  // ---- Фото кандидата (или заглушка с инициалами) ----
  function makePhoto(c, className, lazy) {
    var photo = document.createElement("div");
    photo.className = className;
    if (c.c1) photo.style.setProperty("--c1", c.c1);
    if (c.c2) photo.style.setProperty("--c2", c.c2);

    if (c.photo) {
      var img = document.createElement("img");
      img.src = c.photo;
      img.alt = c.name;
      img.loading = lazy ? "lazy" : "eager";
      img.decoding = "async";
      photo.appendChild(img);
    } else {
      var ini = document.createElement("span");
      ini.className = "initials";
      ini.setAttribute("aria-hidden", "true");
      ini.textContent = initials(c.name);
      photo.appendChild(ini);
    }
    return photo;
  }

  // ---- Окно кандидата ----
  var modal = document.getElementById("modal");
  var panel = modal.querySelector(".modal-panel");
  var lastOpener = null;
  var closeTimer = null;

  // Разделы текста: абзацы разделены пустой строкой
  function addSection(parent, title, text) {
    if (!text) return;
    var h = document.createElement("h3");
    h.textContent = title;
    parent.appendChild(h);
    String(text).split(/\n\s*\n/).forEach(function (para) {
      if (!para.trim()) return;
      var p = document.createElement("p");
      p.textContent = para.trim();
      parent.appendChild(p);
    });
  }

  // Ссылка на видео кампании: красивая кнопка вместо текста
  var SVG_NS = "http://www.w3.org/2000/svg";
  function svgIcon(cls, viewBox, d, fill) {
    var s = document.createElementNS(SVG_NS, "svg");
    s.setAttribute("class", cls);
    s.setAttribute("viewBox", viewBox);
    s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    if (fill) p.setAttribute("fill", "currentColor");
    s.appendChild(p);
    return s;
  }
  function isHttpUrl(u) { return /^https?:\/\//i.test(String(u || "")); }

  function addVideo(parent, url, needTitle) {
    if (!isHttpUrl(url)) return;
    if (needTitle) {
      var h = document.createElement("h3");
      h.textContent = "Предвыборная кампания";
      parent.appendChild(h);
    }
    var a = document.createElement("a");
    a.className = "video-link";
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    // клик по ссылке не закрывает окно кандидата
    a.addEventListener("click", function (e) { e.stopPropagation(); });

    var play = document.createElement("span");
    play.className = "video-play";
    play.appendChild(svgIcon("", "0 0 24 24", "M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z", true));

    var txt = document.createElement("span");
    txt.className = "video-text";
    var strong = document.createElement("strong");
    strong.textContent = "Смотреть видео кампании";
    var small = document.createElement("small");
    small.textContent = "VK Видео, откроется в новой вкладке";
    txt.appendChild(strong);
    txt.appendChild(small);

    a.appendChild(play);
    a.appendChild(txt);
    a.appendChild(svgIcon("video-arrow", "0 0 24 24", "M5 12h13M13 6l6 6-6 6"));
    parent.appendChild(a);
  }

  function openModal(c, opener) {
    clearTimeout(closeTimer);
    modal.classList.remove("is-closing");
    lastOpener = opener;

    var slot = document.getElementById("modalPhotoSlot");
    slot.textContent = "";
    var photo = makePhoto(c, "photo modal-photo", false);
    if (isWinner(c)) photo.appendChild(makeStamp("stamp--modal"));
    slot.appendChild(photo);

    document.getElementById("modalName").textContent = c.name;
    document.getElementById("modalGrade").textContent = c.grade;

    var text = document.getElementById("modalText");
    text.textContent = "";
    addSection(text, "О себе", c.bio);
    addSection(text, "Предвыборная кампания", c.campaign);
    addVideo(text, c.video, !c.campaign);
    if (!c.bio && !c.campaign && !isHttpUrl(c.video)) {
      var empty = document.createElement("p");
      empty.textContent = "Описание скоро появится.";
      text.appendChild(empty);
    }

    modal.hidden = false;
    document.documentElement.classList.add("modal-open");
    panel.scrollTop = 0;
    panel.focus();
  }

  function finishClose() {
    modal.classList.remove("is-closing");
    modal.hidden = true;
    document.documentElement.classList.remove("modal-open");
    if (lastOpener) lastOpener.focus({ preventScroll: true });
  }

  function closeModal() {
    if (modal.hidden || modal.classList.contains("is-closing")) return;
    if (reduceMotion.matches) { finishClose(); return; }
    // сначала лист уезжает, потом окно прячется
    modal.classList.add("is-closing");
    closeTimer = setTimeout(finishClose, 220);
  }

  // Клик в любой области, в том числе по самой панели, закрывает окно
  modal.addEventListener("click", closeModal);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });

  // ---- Карточки кандидатов ----
  function renderCandidates(list) {
    var grid = document.getElementById("grid");
    grid.textContent = "";

    list.forEach(function (c, i) {
      var win = isWinner(c);
      var li = document.createElement("li");
      li.className = "card" + (win ? " card--win" : "");
      li.style.setProperty("--i", i);
      // Все фото одинаковые: пропорции 4 / 5 заданы в style.css, ratio и shift из candidates.js не используются

      // Вся карточка кнопка: работает и пальцем, и мышью, и с клавиатуры
      var a = document.createElement("button");
      a.type = "button";
      a.className = "card-link";
      a.setAttribute("aria-haspopup", "dialog");
      a.setAttribute("aria-label", "Подробнее о кандидате: " + c.name + ", " + c.grade + (win ? ", победитель выборов" : ""));
      a.addEventListener("click", function () { openModal(c, a); });

      var photo = makePhoto(c, "photo", true);
      if (win) photo.appendChild(makeStamp("stamp--card"));
      if (isHttpUrl(c.video)) {
        // значок на карточке: у этого кандидата есть видео
        var badge = document.createElement("span");
        badge.className = "video-badge";
        badge.appendChild(svgIcon("", "0 0 24 24", "M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z", true));
        badge.appendChild(document.createTextNode("видео"));
        photo.appendChild(badge);
      }

      var body = document.createElement("div");
      body.className = "card-body";

      var name = document.createElement("div");
      name.className = "name";
      name.textContent = c.name;

      var grade = document.createElement("div");
      grade.className = "grade";
      grade.textContent = c.grade;

      // Если баллы ещё не посчитаны (score: null), строка остаётся, но вместо числа заглушка
      var scored = hasScore(c);
      var score = document.createElement("div");
      score.className = "score" + (scored ? "" : " is-pending");
      var val = document.createElement("span");
      val.className = "score-value";
      val.textContent = scored ? c.score : "···";
      var lab = document.createElement("span");
      lab.className = "score-label";
      lab.textContent = scored ? pluralBalls(c.score) : "баллы подсчитываются";
      score.appendChild(val);
      score.appendChild(lab);

      // Внизу карточки: баллы слева, ссылка-подсказка справа
      var more = document.createElement("span");
      more.className = "card-more";
      more.textContent = "Читать программу";

      var foot = document.createElement("div");
      foot.className = "card-foot";
      foot.appendChild(score);
      foot.appendChild(more);

      body.appendChild(name);
      body.appendChild(grade);
      body.appendChild(foot);
      a.appendChild(photo);
      a.appendChild(body);
      li.appendChild(a);
      grid.appendChild(li);
    });
  }

  // ---- Победитель: блок вверху страницы ----
  function countUp(el, to) {
    if (reduceMotion.matches || !to) { el.textContent = to; return; }
    var start = null, dur = 1200;
    el.textContent = "0";
    function step(t) {
      if (start === null) start = t;
      var p = Math.min((t - start) / dur, 1);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function renderWinner(list) {
    var winners = list.filter(isWinner);
    if (!winners.length) return;
    var c = winners[0];
    var sec = document.getElementById("winner");
    document.documentElement.classList.add("has-winner");

    var photoWrap = document.createElement("div");
    photoWrap.className = "winner-photo-wrap";
    var photo = makePhoto(c, "photo winner-photo", false);
    photoWrap.appendChild(photo);
    photoWrap.appendChild(makeStamp("stamp--big"));

    var text = document.createElement("div");
    text.className = "winner-text";

    var kicker = document.createElement("p");
    kicker.className = "winner-kicker";
    kicker.textContent = "итоги выборов";

    var title = document.createElement("h2");
    title.id = "winnerTitle";
    title.className = "winner-title";
    title.textContent = winners.length > 1 ? "Президенты школы" : "Новый президент школы";

    var name = document.createElement("p");
    name.className = "winner-name";
    name.textContent = winners.map(function (w) { return w.name; }).join(" и ");

    var meta = document.createElement("p");
    meta.className = "winner-meta";
    meta.appendChild(document.createTextNode(c.grade));
    if (winners.length === 1 && hasScore(c)) {
      var num = document.createElement("span");
      num.className = "winner-score";
      num.textContent = c.score;
      meta.appendChild(document.createTextNode(", "));
      meta.appendChild(num);
      meta.appendChild(document.createTextNode(" " + pluralBalls(c.score)));
      sec.addEventListener("reveal", function () { countUp(num, c.score); }, { once: true });
    }

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--line winner-btn";
    btn.textContent = "Читать программу";
    btn.addEventListener("click", function () { openModal(c, btn); });

    text.appendChild(kicker);
    text.appendChild(title);
    text.appendChild(name);
    text.appendChild(meta);
    text.appendChild(btn);

    sec.appendChild(photoWrap);
    sec.appendChild(text);
    sec.hidden = false;

    // во вступлении: выборы уже прошли
    var when = document.querySelector(".intro-when");
    var mark = when && when.querySelector(".date-mark");
    if (mark) {
      when.textContent = "";
      when.appendChild(document.createTextNode("Выборы прошли "));
      when.appendChild(mark);
      when.appendChild(document.createTextNode(". Спасибо всем, кто проголосовал!"));
    }
  }

  // ---- Появление при прокрутке ----
  // Элементы с data-reveal получают класс is-in, когда доходят до экрана.
  // Сами анимации описаны в style.css.
  function initReveal() {
    var els = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
    function show(el) {
      el.classList.add("is-in");
      el.dispatchEvent(new Event("reveal"));
    }
    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      els.forEach(show);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { show(en.target); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.15 });
    els.forEach(function (el) { io.observe(el); });
  }

  // ---- Меню-бургер на узких экранах ----
  function initMenu() {
    var burger = document.getElementById("burger");
    var menu = document.getElementById("headerMenu");

    function setOpen(open) {
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
      menu.classList.toggle("is-open", open);
    }

    burger.addEventListener("click", function () {
      setOpen(burger.getAttribute("aria-expanded") !== "true");
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });

    // после выбора пункта меню на телефоне закрываем его, страница сама прокрутится к разделу
    menu.addEventListener("click", function (e) {
      if (e.target.closest(".nav-link")) setOpen(false);
    });

    // при переходе на широкий экран сбрасываем состояние
    window.matchMedia("(min-width: 960px)").addEventListener("change", function () {
      setOpen(false);
    });
  }

  // ---- Подсветка пункта меню по тому, какой раздел сейчас на экране ----
  function initSectionNav() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.nav-link[href^="#"]'))
      .filter(function (l) { return l.getAttribute("href").length > 1; });
    var items = links.map(function (l) {
      return { link: l, section: document.querySelector(l.getAttribute("href")) };
    }).filter(function (i) { return i.section; });
    if (!items.length) return;

    var ticking = false;
    function update() {
      ticking = false;
      var header = document.getElementById("siteHeader");
      var line = header.offsetHeight + window.innerHeight * 0.25;
      var current = items[0];
      items.forEach(function (i) {
        if (i.section.getBoundingClientRect().top <= line) current = i;
      });
      // у самого низа страницы активен последний раздел
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = items[items.length - 1];
      }
      items.forEach(function (i) {
        var on = i === current;
        i.link.classList.toggle("is-active", on);
        if (on) i.link.setAttribute("aria-current", "true"); else i.link.removeAttribute("aria-current");
      });
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  // ---- Тема: светлая / тёмная ----
  // Пока человек сам не нажал кнопку, тема следует за настройкой системы.
  // После нажатия выбор сохраняется в браузере.
  function initTheme() {
    var root = document.documentElement;
    var btn = document.getElementById("themeToggle");
    var mq = window.matchMedia("(prefers-color-scheme: dark)");

    function isDark() {
      var t = root.getAttribute("data-theme");
      return t ? t === "dark" : mq.matches;
    }

    function sync() {
      var dark = isDark();
      btn.setAttribute("aria-pressed", String(dark));
      btn.setAttribute("aria-label", dark ? "Включить светлую тему" : "Включить тёмную тему");
      btn.title = dark ? "Светлая тема" : "Тёмная тема";
    }

    btn.addEventListener("click", function () {
      var next = isDark() ? "light" : "dark";
      root.classList.add("theme-anim");
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
      sync();
      setTimeout(function () { root.classList.remove("theme-anim"); }, 400);
    });

    // смена темы в системе подхватывается, если выбор на кнопке не делали
    mq.addEventListener("change", function () {
      if (!root.hasAttribute("data-theme")) sync();
    });

    sync();
  }

  // ---- Бюллетень: отметки на шагах голосования ----
  function initBallot() {
    var rows = Array.prototype.slice.call(document.querySelectorAll(".ballot-row"));
    var foot = document.getElementById("ballotFoot");
    if (!rows.length || !foot) return;
    var defaultText = foot.textContent;

    rows.forEach(function (row) {
      row.addEventListener("click", function () {
        var on = row.getAttribute("aria-pressed") !== "true";
        row.setAttribute("aria-pressed", String(on));
        var done = rows.every(function (r) { return r.getAttribute("aria-pressed") === "true"; });
        foot.textContent = done ? "Готово. Осталось сделать это вживую 19 октября." : defaultText;
        foot.classList.toggle("is-done", done);
      });
    });
  }

  // ---- Ссылка на опрос: берётся из кнопки в шапке, чтобы менять её в одном месте ----
  function initSurveyLinks() {
    var main = document.querySelector(".cta");
    if (!main) return;
    document.querySelectorAll("[data-survey]").forEach(function (a) {
      a.href = main.getAttribute("href");
    });
  }

  var list = window.CANDIDATES || [];
  renderCandidates(list);
  renderWinner(list);
  initMenu();
  initTheme();
  initSectionNav();
  initBallot();
  initSurveyLinks();
  initReveal();
})();
