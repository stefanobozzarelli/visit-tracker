# Visit Tracker - Sistema di Gestione Visite e Report

Applicazione web completa per registrare visite ai clienti e generare report dettagliati.

## Architettura

- **Backend**: Node.js + Express + TypeORM + PostgreSQL
- **Frontend**: React 18 + TypeScript + Vite
- **Database**: PostgreSQL
- **File Storage**: AWS S3 (con presigned URLs)

## Struttura del Progetto

```
visit-tracker/
├── backend/                 # API REST Node.js
│   ├── src/
│   │   ├── config/         # Configurazione DB e AWS
│   │   ├── entities/       # Entità TypeORM
│   │   ├── routes/         # Endpoint API
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # JWT auth, validazione
│   │   ├── types/          # Type definitions
│   │   └── index.ts        # Entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── frontend/                # App React
│   ├── src/
│   │   ├── components/     # Componenti riutilizzabili
│   │   ├── pages/          # Pagine principali
│   │   ├── services/       # API client
│   │   ├── context/        # State management
│   │   ├── types/          # Type definitions
│   │   ├── styles/         # CSS
│   │   └── main.tsx        # Entry point
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── .env.example
│
└── docker-compose.yml      # PostgreSQL local dev
```

## Installazione

### Prerequisiti
- Node.js 18+
- Docker & Docker Compose (per il database)
- AWS S3 bucket (opzionale, per il file upload)

### 1. Clona il repository e installa dipendenze

```bash
cd visit-tracker

# Backend
cd backend
npm install
cp .env.example .env
cd ..

# Frontend
cd frontend
npm install
cp .env.example .env
cd ..
```

### 2. Avvia PostgreSQL con Docker

```bash
docker-compose up -d
```

Verifica che il container sia attivo:
```bash
docker-compose ps
```

### 3. Configura il backend

Modifica `backend/.env`:
```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_DATABASE=visit_tracker

JWT_SECRET=your_super_secret_key_change_this
JWT_EXPIRY=24h

AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_S3_BUCKET=your-bucket

PORT=5000
NODE_ENV=development
```

### 4. Avvia il backend

```bash
cd backend
npm run dev
```

Il server sarà disponibile su `http://localhost:5000`

### 5. Avvia il frontend

In un altro terminale:
```bash
cd frontend
npm run dev
```

L'app sarà disponibile su `http://localhost:3000`

## API Endpoints

### Autenticazione
- `POST /api/auth/register` - Registrazione
- `POST /api/auth/login` - Login

### Clienti
- `GET /api/clients` - Lista clienti
- `POST /api/clients` - Crea cliente
- `GET /api/clients/:id` - Dettagli cliente
- `PUT /api/clients/:id` - Modifica cliente
- `DELETE /api/clients/:id` - Cancella cliente
- `POST /api/clients/:id/contacts` - Aggiungi contatto
- `GET /api/clients/:id/contacts` - Lista contatti

### Aziende
- `GET /api/companies` - Lista aziende
- `POST /api/companies` - Crea azienda
- `GET /api/companies/:id` - Dettagli azienda
- `PUT /api/companies/:id` - Modifica azienda
- `DELETE /api/companies/:id` - Cancella azienda

### Visite
- `POST /api/visits` - Registra visita
- `GET /api/visits` - Lista visite (con filtri)
- `GET /api/visits/:id` - Dettagli visita
- `POST /api/visits/:id/reports` - Aggiungi report section
- `PUT /api/visits/:id/reports/:reportId` - Modifica report
- `DELETE /api/visits/:id/reports/:reportId` - Cancella report

### File Upload
- `POST /api/visits/:id/reports/:reportId/upload` - Genera presigned URL
- `DELETE /api/visits/:id/reports/:reportId/attachments/:attachmentId` - Cancella file

## Build per la Produzione

### Backend
```bash
cd backend
npm run build
npm start
```

### Frontend
```bash
cd frontend
npm run build
```

I file compilati saranno in `frontend/dist`

## Configurazione AWS S3 (opzionale)

1. Crea un bucket S3
2. Genera access key ID e secret access key
3. Aggiungi le credenziali in `backend/.env`

CORS Configuration:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["http://localhost:3000"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## Features Implementate

✅ Autenticazione JWT
✅ CRUD Clienti + Contatti
✅ CRUD Aziende
✅ Registrazione visite
✅ Report strutturato per azienda
✅ Upload file con AWS S3 (presigned URLs)
✅ Dashboard con visite recenti
✅ Routing protetto
✅ API RESTful completa

## Features in Sviluppo

🔄 Pagine CRUD completi (Clienti, Aziende, Visite)
🔄 Export report (PDF, Excel)
🔄 Filtri e ricerca avanzata
🔄 Notifiche in tempo reale
🔄 Dashboard statistiche
🔄 Multi-user collaboration

## Troubleshooting

### Il backend non si connette al database
```bash
# Verifica che PostgreSQL sia in esecuzione
docker-compose ps

# Controlla i log
docker-compose logs postgres
```

### Token scaduto
Accedi di nuovo per ottenere un nuovo token. La sessione dura 24 ore per default.

### Errori CORS nel frontend
Verifica che il backend sia in esecuzione su `http://localhost:5000` e che il vite proxy sia configurato correttamente in `vite.config.ts`.

## Deploy

### Heroku (Backend)
```bash
cd backend
heroku login
heroku create your-app-name
git push heroku main
heroku config:set JWT_SECRET=your_secret
```

### Vercel (Frontend)
```bash
cd frontend
npm install -g vercel
vercel
```

## Licenza

MIT

## Supporto

Per domande o bug, apri un issue.
