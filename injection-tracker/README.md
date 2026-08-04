# 💉 Promemoria Iniezione

Mini web app (PWA) per segnarti **da che lato hai fatto l'iniezione (DX/SX)** con la
**data**, e ricevere un **promemoria ogni martedì alle 8:00 ora locale**.

- 📱 Si installa sul telefono come un'app (Aggiungi a schermata Home).
- 🔒 **Tutto in locale**: i dati restano solo sul tuo telefono (`localStorage`). Nessun
  account, nessun server, funziona anche offline.
- 🔁 Ti suggerisce il **lato da alternare** in base all'ultima iniezione.
- 💾 Esporta/importa un backup in JSON.

## Come usarla

1. Apri `index.html` da un indirizzo **https** (o `localhost`) — serve per PWA e notifiche.
2. Tocca **SX** (sinistra) o **DX** (destra); la data è già impostata a oggi (modificabile).
3. Sotto vedi il riepilogo e lo storico. La croce evidenziata è il lato consigliato.

## Il promemoria del martedì

Ci sono due strade, puoi usarle insieme:

1. **📅 Aggiungi al calendario** (consigliato, il più affidabile): scarica un file
   `.ics` con un evento **ricorrente ogni martedì alle 8:00** e sveglia inclusa. Aprilo
   e confermalo: il calendario del telefono ti avviserà **anche ad app chiusa**, sempre
   nell'ora locale del dispositivo.
2. **Attiva notifiche**: notifiche web del browser. Dove supportate (Chrome/Android)
   l'app prova a pianificare la notifica del martedì; in più, se apri l'app di martedì
   dopo le 8, ti mostra subito il promemoria. Su iOS le notifiche in background non sono
   affidabili senza server: lì usa il calendario.

## Installazione sul telefono

- **Android (Chrome):** apri il sito → menu ⋮ → *Aggiungi a schermata Home / Installa app*.
- **iPhone (Safari):** apri il sito → tasto Condividi → *Aggiungi a Home*.

## Come pubblicarla (per averla sul telefono)

Va servita via HTTPS. Alcune opzioni gratuite servendo la cartella `injection-tracker/`:

- **GitHub Pages** — imposta Pages sulla cartella e apri l'URL dal telefono.
- **Netlify / Vercel / Cloudflare Pages** — trascina la cartella o collega il repo.

### Prova in locale

```bash
cd injection-tracker
python3 -m http.server 8080
# poi apri http://localhost:8080 sul computer
```

## File

| File | Descrizione |
|------|-------------|
| `index.html` | struttura dell'app |
| `styles.css` | stile mobile-first |
| `app.js` | logica: registrazione, storico, reminder, backup |
| `sw.js` | service worker (offline + notifiche) |
| `manifest.webmanifest` | manifest PWA (installazione) |
| `icons/` | icone dell'app |
| `make_icons.py` | script che rigenera le icone PNG |

I dati sono legati al browser/telefono su cui li inserisci: usa **Esporta** per farne
un backup.
