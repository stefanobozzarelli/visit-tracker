# 🏡 Casa Manutenzione

PWA per registrare e programmare la manutenzione di casa (addolcitore, caldaia, lavatrice, stampante…), con spese, storico e condivisione con la famiglia.

- **Abitazioni multiple** (casa, appartamento, villa, casa al mare…)
- **Catalogo di ~50 apparecchiature** con manutenzioni suggerite (es. addolcitore → sale ogni 2 mesi, pulizia salamoia, resine) — tutto modificabile, più dispositivi personalizzati
- **Tre tipi di intervento**: consumabile, programmata, straordinaria
- **Piani ricorrenti** (ogni N giorni/settimane/mesi/anni) o "a consumo" (toner…); con ✓ registri l'intervento e la scadenza successiva si ricalcola da sola
- **Importi e ditta** per ogni intervento, grafici di spesa, storico filtrabile, export CSV / backup JSON
- **Promemoria**: export `.ics` per il calendario (ricorrente, con avviso il giorno prima) e notifiche all'apertura
- Tema chiaro/scuro, 6 colori, installabile su telefono, funziona offline

## Provarla subito (solo su questo dispositivo)

Apri `index.html` servito da un server statico (serve HTTPS o localhost):

```bash
cd casa-manutenzione && python3 -m http.server 8000   # poi http://localhost:8000
```

Senza configurazione i dati restano nel browser. Il pulsante "Prova con dati di esempio" carica una casa dimostrativa.

## Famiglia online (condivisione in tempo reale)

Usa Firebase (piano gratuito Spark, nessuna carta richiesta).

1. [console.firebase.google.com](https://console.firebase.google.com) → **Aggiungi progetto**.
2. **Build → Authentication → Get started**, abilita **Google** ed **Email/Password**.
3. **Build → Firestore Database → Create database** (modalità produzione).
4. Scheda **Rules** di Firestore: incolla il contenuto di `firestore.rules` e pubblica.
5. **Impostazioni progetto → Le tue app → Web (`</>`)**: copia l'oggetto `firebaseConfig` in `firebase-config.js`.
6. Dopo la pubblicazione, in **Authentication → Settings → Authorized domains** aggiungi il dominio del sito.

Al primo accesso crei la "famiglia": nelle impostazioni (**Altro → Famiglia**) trovi un **codice invito** da dare agli altri, che dopo il login lo inseriscono per unirsi. Tutti vedono e modificano gli stessi dati in tempo reale (anche offline, si sincronizza al ritorno della rete).

> La `apiKey` Firebase non è un segreto: la sicurezza è nelle regole Firestore. Solo chi conosce il codice famiglia (10 caratteri casuali) può unirsi.

## Allegati, to-do ed email di scadenza

- **Allegati**: in ogni intervento puoi aggiungere fino a 10 file (foto di fattura e distinta lavori, PDF). Le foto vengono ridotte automaticamente; i PDF possono pesare fino a 3 MB. I file sono salvati in Firestore (nessun costo extra). Dopo l'aggiornamento **ripubblica `firestore.rules`** (nuova sezione `files`).
- **To-do**: quando una manutenzione scade compare da sola nella lista To-do della Home; puoi aggiungere anche to-do tuoi. Completando la manutenzione con ✓ la scadenza avanza.
- **Email**: ogni mattina (06:00 UTC, circa le 7-8 in Italia) Vercel Cron esegue `api/reminders.js`, che manda un'email riassuntiva agli indirizzi della famiglia (impostabili in *Altro → Email di promemoria*). Ogni scadenza viene segnalata una volta sola. Variabili da impostare su Vercel (*Settings → Environment Variables*):

| Variabile | Contenuto |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | tutto il file JSON della chiave dell'account di servizio (Firebase → Impostazioni progetto → Account di servizio → Genera nuova chiave privata) |
| `SMTP_USER` | indirizzo Gmail da cui partono le email |
| `SMTP_PASS` | *password per le app* di quell'account Gmail (richiede la verifica in due passaggi) |
| `CRON_SECRET` | una stringa casuale lunga: Vercel la usa per autorizzare il cron |
| `APP_URL` (facoltativa) | indirizzo dell'app, usato nel link dell'email |

Il pulsante **Invia email di prova** in *Altro → Email di promemoria* verifica che tutto sia configurato. Non incollare mai queste chiavi in chat o nel codice.

## Pubblicazione online

Sono file statici: basta qualsiasi hosting della cartella `casa-manutenzione/`.

- **Firebase Hosting** (consigliato, stesso progetto): `npm i -g firebase-tools && firebase login && firebase init hosting` (public directory: `casa-manutenzione`, single-page: no) e `firebase deploy`.
- **Vercel** (gratis): [vercel.com/new](https://vercel.com/new) → importa il repo `visit-tracker` → **Root Directory: `casa-manutenzione`** → Framework Preset: *Other*, nessun build command → Deploy. Selezionare il branch `claude/upbeat-euler-qg1528` in *Production Branch* (Settings → Git) finché non è nel ramo principale.
- **Netlify / Cloudflare Pages**: collega il repo e indica `casa-manutenzione` come cartella da pubblicare (nessun build).
- **GitHub Pages**: il repo ha già un workflow Pages per `injection-tracker`; Pages è uno solo per repository, quindi per usarlo con questa app serve un workflow che pubblichi entrambe le cartelle.

Sul telefono: apri il sito → *Aggiungi a schermata Home* e si comporta come un'app.

## File

| File | Contenuto |
|---|---|
| `app.js` | interfaccia e logica |
| `store.js` | dati: `LocalStore` (browser) e `CloudStore` (Firebase) |
| `catalog.js` | catalogo apparecchiature e manutenzioni suggerite — aggiungine di tue |
| `firebase-config.js` | configurazione Firebase (vuota = modalità locale) |
| `firestore.rules` | regole di sicurezza |
| `api/reminders.js`, `lib/reminders.js` | funzione Vercel con l'invio delle email di scadenza |
