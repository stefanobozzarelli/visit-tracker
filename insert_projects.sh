#!/bin/bash
# Script per inserire i progetti Antonio Lupi 2025
# Uso: ./insert_projects.sh <TOKEN>
# Per ottenere il token: apri l'app nel browser, F12 > Console > localStorage.getItem('token')

API="https://visit-tracker-backend-production.up.railway.app/api"

if [ -z "$1" ]; then
  echo "Uso: ./insert_projects.sh <TOKEN>"
  echo ""
  echo "Per ottenere il token:"
  echo "1. Apri https://visit-tracker-pi.vercel.app e fai login"
  echo "2. Premi F12 (DevTools) > Console"
  echo "3. Digita: localStorage.getItem('token')"
  echo "4. Copia il valore (senza virgolette)"
  exit 1
fi

TOKEN="$1"

echo "=== Verifica autenticazione ==="
AUTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/companies")
if [ "$AUTH_CHECK" != "200" ]; then
  echo "ERRORE: Token non valido (HTTP $AUTH_CHECK). Ottieni un nuovo token."
  exit 1
fi
echo "OK - Token valido"

# Cerca Antonio Lupi tra le companies (supplier)
echo ""
echo "=== Ricerca Antonio Lupi tra le aziende ==="
COMPANIES=$(curl -s -H "Authorization: Bearer $TOKEN" "$API/companies")
SUPPLIER_ID=$(echo "$COMPANIES" | python3 -c "
import json, sys
data = json.load(sys.stdin)
companies = data.get('data', [])
for c in companies:
    name = (c.get('name') or '').lower()
    if 'antonio' in name and 'lupi' in name:
        print(c['id'])
        sys.exit(0)
    if 'antoniolupi' in name:
        print(c['id'])
        sys.exit(0)
print('')
" 2>/dev/null)

if [ -n "$SUPPLIER_ID" ]; then
  echo "Trovato Antonio Lupi: $SUPPLIER_ID"
else
  echo "Antonio Lupi NON trovato tra le companies. I progetti verranno creati senza supplier."
  echo "Aziende disponibili:"
  echo "$COMPANIES" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for c in data.get('data', []):
    print(f\"  - {c.get('name')} ({c['id'][:8]}...)\")
" 2>/dev/null
fi

echo ""
echo "=== Inserimento 8 progetti ==="

create_project() {
  local NAME="$1"
  local DEVELOPER="$2"
  local DEALER="$3"
  local VISIT_DATE="$4"
  local NOTE="$5"

  local BODY="{
    \"project_name\": \"$NAME\",
    \"developer\": \"$DEVELOPER\",
    \"country\": \"CHINA\",
    \"status\": \"ATTIVO\",
    \"project_development\": \"INFO DAL CLIENTE\",
    \"project_registration\": \"INFO DAL CLIENTE\",
    \"note\": \"$NOTE\""

  if [ -n "$SUPPLIER_ID" ]; then
    BODY="$BODY, \"supplier_id\": \"$SUPPLIER_ID\""
  fi
  if [ -n "$VISIT_DATE" ]; then
    BODY="$BODY, \"estimated_order_date\": \"$VISIT_DATE\""
  fi

  BODY="$BODY }"

  RESPONSE=$(curl -s -X POST "$API/projects" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$BODY")

  SUCCESS=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
  PROJ_NUM=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('project_number','?'))" 2>/dev/null)

  if [ "$SUCCESS" = "True" ] || [ "$SUCCESS" = "true" ]; then
    echo "  ✅ #$PROJ_NUM - $NAME"
  else
    echo "  ❌ ERRORE per '$NAME':"
    echo "     $RESPONSE" | head -1
  fi
}

# 1. Shui On Land - Lakeview 6
create_project \
  "Lakeview 6" \
  "Shui On Land" \
  "Fernando" \
  "2025-10-30" \
  "Dealer: Fernando | Visit planned: 30/10/2025"

# 2. Kerry Properties - Jinling project
create_project \
  "Jinling project" \
  "Kerry Properties" \
  "G-Casa" \
  "2025-10-30" \
  "Dealer: G-Casa | Visit planned: 30/10/2025"

# 3. Hi-Time - Hi-Time Tower 2 and 1
create_project \
  "Hi-Time Tower 2 and 1" \
  "Hi-Time" \
  "" \
  "2025-10-31" \
  "Dealer: G-Casa (solo commissioni) | Visit planned: 31/10/2025"

# 4. Zhongchong - TBD
create_project \
  "Zhongchong Project" \
  "Zhongchong" \
  "" \
  "2025-11-03" \
  "Dealer: Fernando o G-Casa | Visit planned: 03/11/2025 | Project details TBD"

# 5. CDL-Lianfa - TBD
create_project \
  "CDL-Lianfa Project" \
  "CDL-Lianfa" \
  "" \
  "2025-11-04" \
  "Dealer: Xiamen Dealer (Mrs. Wang) o Fernando | Visit planned: 04/11/2025 | Project details TBD"

# 6. Hangzhou Amber Center
create_project \
  "Amber Centre" \
  "Hangzhou Amber Center developer" \
  "Hangzhou Landing" \
  "2025-11-04" \
  "Dealer: Hangzhou Landing | Visit planned: 04/11/2025 | Developer da confermare"

# 7. Developer Pudong - TBD
create_project \
  "Pudong Project" \
  "Developer Pudong" \
  "G-Casa" \
  "2025-11-06" \
  "Dealer: G-Casa | Visit planned: 06/11/2025 | Developer e project details TBD"

# 8. China Overseas - Strategic agreement
create_project \
  "Strategic agreement" \
  "China Overseas" \
  "" \
  "2025-11-06" \
  "Dealer: Shenyang dealer | Visit planned: 06/11/2025"

echo ""
echo "=== Completato! ==="
echo "Vai su https://visit-tracker-pi.vercel.app/projects per verificare."
