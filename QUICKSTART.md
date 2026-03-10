# Quick Start - Visit Tracker

## 🚀 Avvio Rapido (5 minuti)

### 1. Avvia il Database

```bash
cd /Users/stefanobozzarelli/Desktop/visit-tracker
docker-compose up -d
```

Verifica che sia in esecuzione:
```bash
docker-compose ps
```

### 2. Configura il Backend

```bash
cd backend
cp .env.example .env
npm install
```

Modifica `.env` se necessario (di default va bene così).

### 3. Avvia il Backend (in un terminale)

```bash
cd backend
npm run dev
```

Dovresti vedere: `Server running on port 5000`

### 4. Configura il Frontend

In un altro terminale:
```bash
cd frontend
cp .env.example .env
npm install
```

### 5. Avvia il Frontend

```bash
cd frontend
npm run dev
```

Dovresti vedere un link tipo: `http://localhost:3000`

## 📱 Accedi all'App

1. Apri il browser su `http://localhost:3000`
2. Clicca su "Registrati"
3. Crea un account (es: mario@example.com)
4. Accedi

## 🎯 Cosa Puoi Fare

### Dashboard
- Visualizza le tue visite recenti
- Pulsante rapido per registrare una nuova visita

### Clienti
- ➕ Aggiungi nuovo cliente
- ✏️ Modifica cliente
- 👥 Gestisci contatti (responsabili del cliente)
- 🗑️ Elimina cliente

### Aziende
- ➕ Crea azienda che rappresenti
- ✏️ Modifica azienda
- 🗑️ Elimina azienda

### Visite
- ➕ Registra nuova visita
  - Seleziona cliente
  - Scegli data
  - Aggiungi report per una o più aziende
- 📄 Visualizza dettagli visita
- ✏️ Modifica report
- 📎 Gestisci allegati (ready for S3)

## 🔗 URL Utili

- App: http://localhost:3000
- API: http://localhost:5000
- API Health: http://localhost:5000/health

## 🛑 Ferma i Servizi

```bash
# Ferma il database
docker-compose down

# Ferma i server (Ctrl+C nei terminali)
```

## 🐛 Troubleshooting

### Errore "Connection refused" al database
```bash
docker-compose logs postgres
docker-compose restart postgres
```

### Errore "Port already in use"
Qualcosa sta già usando la porta. Cambia in `vite.config.ts` e `backend/src/index.ts`

### Token expired
Rifai il login

## 📚 Prossimi Step

1. **AWS S3 Setup** (per file upload)
   - Crea bucket S3
   - Aggiungi credenziali in `backend/.env`

2. **Export Report**
   - Aggiungi libreria `pdfkit` al backend
   - Crea endpoint per generare PDF

3. **Notifiche**
   - Aggiungi Socket.io per real-time updates

4. **Deploy**
   - Backend: Heroku / Railway
   - Frontend: Vercel / Netlify

## 📧 Supporto

Per domande sulla struttura o come estendere l'app, consulta il README.md completo.

---

**Enjoy! 🎉**
