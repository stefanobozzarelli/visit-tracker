/* Promemoria Iniezione — logica dell'app.
   Tutto locale (localStorage). Nessun server, nessun account. */
(function () {
  'use strict';

  var STORE_KEY = 'iniezioni.v1';
  var REMIND_KEY = 'iniezioni.reminder';

  // ---- Utility ----------------------------------------------------------
  function $(id) { return document.getElementById(id); }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function formatDate(iso) {
    // iso = YYYY-MM-DD -> "mar 4 ago 2026"
    var parts = iso.split('-');
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    return d.toLocaleDateString('it-IT', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
  }

  function daysAgo(iso) {
    var parts = iso.split('-');
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    var now = new Date();
    d.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    var diff = Math.round((now - d) / 86400000);
    if (diff === 0) return 'oggi';
    if (diff === 1) return 'ieri';
    if (diff < 0) return 'tra ' + (-diff) + ' giorni';
    return diff + ' giorni fa';
  }

  // ---- Persistenza ------------------------------------------------------
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function save(list) {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  }

  var records = load();

  // ---- Rendering --------------------------------------------------------
  function sorted() {
    // Più recenti in cima (per data, poi per timestamp di inserimento).
    return records.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.ts || 0) - (a.ts || 0);
    });
  }

  function lastRecord() {
    var s = sorted();
    return s.length ? s[0] : null;
  }

  function render() {
    var list = sorted();

    // Statistiche
    var sx = 0, dx = 0;
    records.forEach(function (r) { if (r.side === 'SX') sx++; else if (r.side === 'DX') dx++; });
    $('stat-total').textContent = records.length;
    $('stat-sx').textContent = sx;
    $('stat-dx').textContent = dx;

    // Ultima + suggerimento
    var last = lastRecord();
    var lastInfo = $('last-info');
    var suggestion = $('suggestion');
    if (last) {
      lastInfo.textContent = 'Ultima: ' + last.side + ' — ' + daysAgo(last.date);
      var next = last.side === 'DX' ? 'SX' : 'DX';
      suggestion.innerHTML = 'Prossima consigliata: <b>' + (next === 'SX' ? 'SINISTRA (SX)' : 'DESTRA (DX)') + '</b>';
      suggestion.hidden = false;
      $('btn-sx').classList.toggle('suggested', next === 'SX');
      $('btn-dx').classList.toggle('suggested', next === 'DX');
    } else {
      lastInfo.textContent = '';
      suggestion.hidden = true;
      $('btn-sx').classList.remove('suggested');
      $('btn-dx').classList.remove('suggested');
    }

    // Lista
    var ul = $('list');
    ul.innerHTML = '';
    $('empty').hidden = list.length > 0;
    list.forEach(function (r) {
      var li = document.createElement('li');
      li.className = 'item';

      var badge = document.createElement('div');
      badge.className = 'item__badge item__badge--' + r.side;
      badge.textContent = r.side;

      var body = document.createElement('div');
      body.className = 'item__body';
      var d = document.createElement('span');
      d.className = 'item__date';
      d.textContent = formatDate(r.date);
      var ago = document.createElement('span');
      ago.className = 'item__ago';
      ago.textContent = daysAgo(r.date);
      body.appendChild(d);
      body.appendChild(ago);

      var del = document.createElement('button');
      del.className = 'item__del';
      del.type = 'button';
      del.setAttribute('aria-label', 'Elimina');
      del.textContent = '✕';
      del.addEventListener('click', function () { removeRecord(r.id); });

      li.appendChild(badge);
      li.appendChild(body);
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  // ---- Azioni -----------------------------------------------------------
  var toastTimer;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  function addRecord(side) {
    var date = $('date').value || todayISO();
    records.push({
      id: (Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36)),
      side: side,
      date: date,
      ts: Date.now()
    });
    save(records);
    render();
    toast('Registrata: ' + side + ' • ' + formatDate(date));
  }

  function removeRecord(id) {
    records = records.filter(function (r) { return r.id !== id; });
    save(records);
    render();
  }

  // ---- Export / Import --------------------------------------------------
  function exportData() {
    var blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'iniezioni-backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var arr = JSON.parse(reader.result);
        if (!Array.isArray(arr)) throw new Error('formato');
        // Unione per id, evitando duplicati.
        var byId = {};
        records.concat(arr).forEach(function (r) {
          if (r && r.side && r.date) {
            if (!r.id) r.id = Date.now().toString(36) + Math.random().toString(36).slice(2);
            byId[r.id] = { id: r.id, side: r.side, date: r.date, ts: r.ts || 0 };
          }
        });
        records = Object.keys(byId).map(function (k) { return byId[k]; });
        save(records);
        render();
        toast('Backup importato');
      } catch (e) {
        toast('File non valido');
      }
    };
    reader.readAsText(file);
  }

  // ---- Promemoria: calendario (.ics) ------------------------------------
  function nextTuesday8am() {
    var d = new Date();
    d.setHours(8, 0, 0, 0);
    var day = d.getDay();            // 0=dom ... 2=mar
    var delta = (2 - day + 7) % 7;   // giorni al prossimo martedì
    if (delta === 0 && Date.now() > d.getTime()) delta = 7; // oggi è martedì ma le 8 sono passate
    d.setDate(d.getDate() + delta);
    return d;
  }

  function icsStamp(d) {
    // Ora "fluttuante" (locale) -> il calendario la interpreta nell'ora del dispositivo.
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
           'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }

  function downloadICS() {
    var start = nextTuesday8am();
    var end = new Date(start.getTime() + 15 * 60000);
    var uid = 'iniezione-martedi-8@local';
    var ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Promemoria Iniezione//IT',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTART:' + icsStamp(start),
      'DTEND:' + icsStamp(end),
      'RRULE:FREQ=WEEKLY;BYDAY=TU',
      'SUMMARY:💉 Iniezione',
      'DESCRIPTION:Promemoria settimanale per l\'iniezione. Ricordati di alternare il lato (DX/SX).',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:È ora dell\'iniezione',
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    var blob = new Blob([ics], { type: 'text/calendar' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'promemoria-iniezione.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Apri il file per aggiungerlo al calendario');
  }

  // ---- Promemoria: notifiche web (best-effort) --------------------------
  function updateNotifStatus() {
    var el = $('notif-status');
    if (!('Notification' in window)) {
      el.textContent = 'Notifiche non supportate su questo browser — usa il calendario.';
      return;
    }
    if (Notification.permission === 'granted') {
      el.textContent = 'Notifiche attive. Promemoria: ogni martedì alle 8:00.';
    } else if (Notification.permission === 'denied') {
      el.textContent = 'Notifiche bloccate nelle impostazioni — usa il calendario.';
    } else {
      el.textContent = 'Suggerito: aggiungi al calendario (più affidabile ad app chiusa).';
    }
  }

  function scheduleTriggerNotification() {
    // API sperimentale (Chromium): pianifica una notifica futura anche ad app chiusa.
    if (!('serviceWorker' in navigator) || !('showTrigger' in Notification.prototype) ||
        typeof window.TimestampTrigger === 'undefined') {
      return;
    }
    navigator.serviceWorker.ready.then(function (reg) {
      var when = nextTuesday8am().getTime();
      reg.getNotifications({ tag: 'iniezione-settimanale', includeTriggered: true })
        .then(function (existing) {
          if (existing && existing.length) return; // già pianificata
          reg.showNotification('💉 Iniezione', {
            tag: 'iniezione-settimanale',
            body: 'È martedì: ricordati l\'iniezione (alterna il lato DX/SX).',
            icon: 'icons/icon-192.png',
            badge: 'icons/icon-192.png',
            showTrigger: new window.TimestampTrigger(when)
          }).catch(function () {});
        }).catch(function () {});
    });
  }

  function checkDueOnOpen() {
    // Se apri l'app di martedì dopo le 8 e non hai già ricevuto il promemoria
    // questa settimana, mostra subito la notifica (rete di sicurezza).
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    var now = new Date();
    if (now.getDay() !== 2 || now.getHours() < 8) return;
    var wk = now.getFullYear() + '-' + weekNumber(now);
    var last = localStorage.getItem(REMIND_KEY);
    if (last === wk) return;
    localStorage.setItem(REMIND_KEY, wk);
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(function (reg) {
          reg.showNotification('💉 Iniezione', {
            body: 'È martedì: ricordati l\'iniezione (alterna il lato DX/SX).',
            icon: 'icons/icon-192.png',
            tag: 'iniezione-oggi'
          });
        });
      } else {
        new Notification('💉 Iniezione', { body: 'È martedì: ricordati l\'iniezione.' });
      }
    } catch (e) { /* ignora */ }
  }

  function weekNumber(d) {
    var date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dayNum = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - dayNum + 3);
    var firstThursday = new Date(date.getFullYear(), 0, 4);
    var diff = date - firstThursday;
    return 1 + Math.round(diff / (7 * 86400000));
  }

  function requestNotifications() {
    if (!('Notification' in window)) { updateNotifStatus(); return; }
    Notification.requestPermission().then(function (perm) {
      updateNotifStatus();
      if (perm === 'granted') {
        scheduleTriggerNotification();
        checkDueOnOpen();
        toast('Notifiche attive');
      }
    });
  }

  // ---- Avvio ------------------------------------------------------------
  function init() {
    $('date').value = todayISO();

    $('btn-sx').addEventListener('click', function () { addRecord('SX'); });
    $('btn-dx').addEventListener('click', function () { addRecord('DX'); });
    $('btn-ics').addEventListener('click', downloadICS);
    $('btn-notif').addEventListener('click', requestNotifications);
    $('btn-export').addEventListener('click', exportData);
    $('btn-import').addEventListener('click', function () { $('import-file').click(); });
    $('import-file').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) importData(e.target.files[0]);
      e.target.value = '';
    });

    render();
    updateNotifStatus();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(function () {
        if (Notification && Notification.permission === 'granted') {
          scheduleTriggerNotification();
          checkDueOnOpen();
        }
      }).catch(function () {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
