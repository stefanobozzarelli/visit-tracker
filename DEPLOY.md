# 🚀 Deploy su Railway.app

## Prerequisiti:
- Account GitHub (il codice deve essere su GitHub)
- Account Railway.app (gratuito)

## Step 1: Creare Account Railway
1. Vai su https://railway.app
2. Clicca "Start Free" e registrati con GitHub

## Step 2: Creare i Servizi su Railway

### 2.1 - Crea il servizio PostgreSQL
1. Nel dashboard Railway, clicca "+ New"
2. Seleziona "Database" → "PostgreSQL"
3. Railway creerà automaticamente il database
4. Copia le credenziali (Environment variables)

### 2.2 - Crea il servizio Backend (Node.js)
1. Clicca "+ New" → "GitHub Repo"
2. Seleziona il tuo repo visit-tracker
3. Seleziona la cartella: `backend`
4. Aggiungi le variabili d'ambiente:
   ```
   NODE_ENV=production
   PORT=5001
   JWT_SECRET=genera-una-stringa-casuale-lunga
   ANTHROPIC_API_KEY=your-key-here
   ```
5. Railway detecterà automaticamente che è un progetto Node.js
6. Clicca "Deploy"

### 2.3 - Crea il servizio Frontend (React/Vite)
1. Clicca "+ New" → "GitHub Repo"
2. Seleziona il tuo repo visit-tracker
3. Seleziona la cartella: `frontend`
4. Aggiungi le variabili d'ambiente:
   ```
   VITE_API_BASE_URL=https://visit-tracker-backend.railway.app/api
   ```
   (Sostituisci con l'URL reale del backend di Railway)
5. Build Command: `npm run build`
6. Start Command: Railway dovrebbe usare la cartella `dist`
7. Clicca "Deploy"

## Step 3: Connettere Backend al Database

Nel servizio Backend su Railway:
1. Vai alla sezione "Connect"
2. Il database PostgreSQL dovrebbe apparire
3. Le variabili d'ambiente si popoleranno automaticamente:
   ```
   DB_HOST
   DB_PORT
   DB_NAME
   DB_USERNAME
   DB_PASSWORD
   ```

## Step 4: Eseguire le Migrazioni

Una volta deployato il backend:
1. Apri la console di Railway
2. Esegui:
   ```bash
   npm run db:migrate
   ```

## ✅ URLs Finali

Una volta deployato:
- **Frontend**: https://visit-tracker-frontend.railway.app
- **Backend API**: https://visit-tracker-backend.railway.app/api
- **Database**: Gestito da Railway (non direttamente accessibile)

## 🔗 Integrazione Todoist (sincronizzazione task)

1. Vai su https://developer.todoist.com/appconsole.html e crea una nuova app.
2. **OAuth redirect URL**: `https://visit-tracker-backend-production.up.railway.app/api/integrations/todoist/callback`
3. **Webhooks**: attiva i webhook con callback URL
   `https://visit-tracker-backend-production.up.railway.app/api/integrations/todoist/webhook`
   e gli eventi `item:added`, `item:updated`, `item:completed`, `item:uncompleted`, `item:deleted`.
4. Nel servizio Backend su Railway aggiungi le variabili:
   - `TODOIST_CLIENT_ID` = Client ID dell'app
   - `TODOIST_CLIENT_SECRET` = Client secret dell'app (serve anche per verificare la firma dei webhook)
   - `FRONTEND_URL` (se non già impostata) = URL del frontend
5. Ogni utente va in **Settings → Todoist → Collega Todoist**.

Note: un task finisce nel Todoist del suo **assegnatario**, nei progetti "Visit Tracker – …" (uno per categoria).
Le colonne nuove (`users.todoist_*`, `todo_items.todoist_*`) vengono create in automatico (`synchronize: true`).
Se un task viene cancellato su Todoist, in Visit Tracker resta con l'avviso "Cancellato da Todoist" e due pulsanti: "Ripristina" (lo ricrea su Todoist) o "Elimina definitivamente".

## 🏖️ Ferie Primula (calendario ferie dell'ufficio)

Sezione **Ferie** nel menu (gruppo "Ufficio"). Nessuna variabile d'ambiente nuova: le tabelle
`leave_entries`, `company_closures`, `custom_holidays` e le colonne `users.leave_*` si creano da sole (`synchronize: true`).

- **Primo avvio**: il master admin apre Ferie → *Impostazioni*, attiva chi deve comparire nel calendario e accende
  "Responsabile" per Patrizia (i responsabili segnano e modificano le ferie di tutti).
- **Collaboratori senza account TradeFlow**: si creano da Ferie → *Impostazioni → Nuovo collaboratore*; vedono solo la sezione Ferie
  (il backend blocca tutte le altre API per questi account).
- **Festività**: Italia + San Giorgio (patrono di Sassuolo, 23/4) e Cina, Corea del Sud, Taiwan, Singapore, Hong Kong, Giappone,
  Filippine, Vietnam, Cambogia, Thailandia, Malesia (libreria `date-holidays`). La Cambogia è inserita a mano nel codice
  (`HolidayService.ts`): le feste lunari sono presenti per 2025-2026, per gli anni successivi si aggiungono da Ferie → *Festività*.
- **Google Calendar**: ogni utente ha un link iCal personale (`/api/leave/calendar/<token>.ics`) da Ferie → *Google Calendar*.
  Google aggiorna i calendari esterni ogni qualche ora.

## 🔧 Troubleshooting

**Errore: Database connection refused**
- Verifica che le variabili d'ambiente siano corrette
- Controlla che il database PostgreSQL sia avviato
- Esegui `npm run db:migrate` nel backend

**Errore: API call fails (CORS)**
- Verifica che `VITE_API_BASE_URL` nel frontend sia corretto
- Aggiungi il dominio del frontend alle impostazioni CORS del backend

**Il frontend non carica**
- Assicurati che il build sia completato (`npm run build`)
- Verifica che la cartella `dist` esista

## 📝 Note

- Railway offre crediti gratuiti (~$5/mese)
- Dopo i crediti gratuiti, il servizio è paused finché non aggiorni il piano
- Per produzione seria, considera di passare a un piano pagato

