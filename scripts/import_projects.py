#!/usr/bin/env python3
"""Import projects from Excel file into Visit Tracker via API."""

import pandas as pd
import requests
import json
import sys
import re
from datetime import datetime

API_BASE = "https://visit-tracker-backend-production.up.railway.app/api"

# First, login to get token
def login():
    email = input("Enter your email (stefanobozzarelli@gmail.com): ").strip() or "stefanobozzarelli@gmail.com"
    password = input("Enter your password: ").strip()
    r = requests.post(f"{API_BASE}/auth/login", json={"email": email, "password": password})
    if r.status_code == 200 and r.json().get("success"):
        return r.json()["data"]["token"]
    else:
        print(f"Login failed: {r.text}")
        sys.exit(1)

def get_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def parse_date(val):
    """Try to parse various date formats."""
    if pd.isna(val) or val is None:
        return None
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")
    s = str(val).strip()
    if s in ['?', '-', '', 'nan', 'NaT']:
        return None
    # Try dd/mm/yy or dd/mm/yyyy
    for fmt in ["%d/%m/%y", "%d/%m/%Y", "%Y-%m-%d", "%Y-%m-%d %H:%M:%S"]:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except:
            pass
    return None

def parse_number(val):
    if pd.isna(val) or val is None:
        return None
    try:
        return float(val)
    except:
        return None

def main():
    token = login()
    headers = get_headers(token)

    # Fetch companies and clients from API
    print("\nFetching companies...")
    r = requests.get(f"{API_BASE}/companies", headers=headers)
    companies = r.json().get("data", [])
    company_map = {}
    for c in companies:
        company_map[c["name"].upper().strip()] = c["id"]
    print(f"  Found {len(companies)} companies: {list(company_map.keys())}")

    print("Fetching clients...")
    r = requests.get(f"{API_BASE}/clients", headers=headers)
    clients = r.json().get("data", [])
    client_map = {}
    for c in clients:
        client_map[c["name"].upper().strip()] = c["id"]
    print(f"  Found {len(clients)} clients: {list(client_map.keys())}")

    # Read Excel
    file_path = '/Users/stefanobozzarelli/Library/CloudStorage/Dropbox/stefanobozzarelli@gmail.com/lavoro/Primula/Primula Amministrazione/GESTIONALE/2025-01 ProjectsMACRO.xlsm'
    df = pd.read_excel(file_path, sheet_name='Foglio1')
    print(f"\nRead {len(df)} projects from Excel")

    # Filter out rows with no project name
    df = df.dropna(subset=["PROJECT'S NAME"])
    print(f"After filtering empty names: {len(df)} projects")

    # Track unmatched
    unmatched_suppliers = set()
    unmatched_clients = set()
    success_count = 0
    error_count = 0

    for i, row in df.iterrows():
        supplier_name = str(row.get("SUPPLIER", "")).strip().upper() if pd.notna(row.get("SUPPLIER")) else ""
        client_name = str(row.get("CLIENT", "")).strip().upper() if pd.notna(row.get("CLIENT")) else ""

        supplier_id = company_map.get(supplier_name)
        client_id = client_map.get(client_name)

        if supplier_name and not supplier_id:
            unmatched_suppliers.add(supplier_name)
        if client_name and not client_id:
            unmatched_clients.add(client_name)

        project_data = {
            "project_number": int(row["PROJECT NUMBER"]) if pd.notna(row.get("PROJECT NUMBER")) else None,
            "supplier_id": supplier_id,
            "client_id": client_id,
            "country": str(row.get("COUNTRY", "")).strip() if pd.notna(row.get("COUNTRY")) else None,
            "registration_date": parse_date(row.get("REGISTRATION DATE")),
            "project_name": str(row.get("PROJECT'S NAME", "")).strip() if pd.notna(row.get("PROJECT'S NAME")) else None,
            "status": str(row.get("STATUS OF THE PROJECT", "ATTIVO")).strip().upper() if pd.notna(row.get("STATUS OF THE PROJECT")) else "ATTIVO",
            "project_development": str(row.get("PROJECT DEVELOPMENT", "")).strip() if pd.notna(row.get("PROJECT DEVELOPMENT")) else None,
            "project_registration": str(row.get("PROJECT REGISTRATION", "")).strip() if pd.notna(row.get("PROJECT REGISTRATION")) else None,
            "project_address": str(row.get("PROJECT'S ADRESS", "")).strip() if pd.notna(row.get("PROJECT'S ADRESS")) else None,
            "project_type": str(row.get("PROJECT'S TYPE", "")).strip().upper() if pd.notna(row.get("PROJECT'S TYPE")) else None,
            "detail_of_project_type": str(row.get("DETAIL OF PROJECT'S TYPE", "")).strip() if pd.notna(row.get("DETAIL OF PROJECT'S TYPE")) else None,
            "designated_area": str(row.get("DESIGNATED AREA OF THE PROJECT", "")).strip() if pd.notna(row.get("DESIGNATED AREA OF THE PROJECT")) else None,
            "architect_designer": str(row.get("ARCHITECT/DESIGNER", "")).strip() if pd.notna(row.get("ARCHITECT/DESIGNER")) else None,
            "developer": str(row.get("DEVELOPER", "")).strip() if pd.notna(row.get("DEVELOPER")) else None,
            "contractor": str(row.get("CONTRACTOR", "")).strip() if pd.notna(row.get("CONTRACTOR")) else None,
            "item": str(row.get("ITEM", "")).strip() if pd.notna(row.get("ITEM")) else None,
            "quantity": str(row.get("QUANTITY", "")).strip() if pd.notna(row.get("QUANTITY")) else None,
            "note": str(row.get("NOTE", "")).strip() if pd.notna(row.get("NOTE")) else None,
            "estimated_order_date": parse_date(row.get("ESTIMATED ORDER DATE")),
            "estimated_delivery_date": parse_date(row.get("ESTIMATED DELIVERY DATE (FROM ITALY) ")),
            "estimated_arrival_date": parse_date(row.get("ESTIMATED ARRIVAL DATE (IN DESTINATION COUNTRY)")),
            "project_value": parse_number(row.get("PROJECT VALUE")),
            "total_value_shipped": parse_number(row.get("TOTAL VALUE SHIPPED")),
        }

        # Clean up: remove None values to let backend use defaults
        project_data = {k: v for k, v in project_data.items() if v is not None}

        # Validate status
        valid_statuses = ['ATTIVO', 'COMPLETATO', 'SOSPESO', 'CANCELLATO']
        if project_data.get("status") not in valid_statuses:
            project_data["status"] = "ATTIVO"

        try:
            r = requests.post(f"{API_BASE}/projects", json=project_data, headers=headers)
            if r.status_code in [200, 201] and r.json().get("success"):
                success_count += 1
                pname = project_data.get("project_name", "?")
                pnum = project_data.get("project_number", "?")
                print(f"  [{success_count}] #{pnum} {pname}")
            else:
                error_count += 1
                print(f"  ERROR row {i}: {r.text[:200]}")
        except Exception as e:
            error_count += 1
            print(f"  EXCEPTION row {i}: {e}")

    print(f"\n{'='*60}")
    print(f"IMPORT COMPLETE")
    print(f"  Success: {success_count}")
    print(f"  Errors:  {error_count}")

    if unmatched_suppliers:
        print(f"\n  UNMATCHED SUPPLIERS (not in DB):")
        for s in sorted(unmatched_suppliers):
            print(f"    - {s}")

    if unmatched_clients:
        print(f"\n  UNMATCHED CLIENTS (not in DB):")
        for c in sorted(unmatched_clients):
            print(f"    - {c}")

if __name__ == "__main__":
    main()
