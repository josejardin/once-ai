# ONCE AI - Production & Public Deployment Guide
> **Oversight Network for Clean Elections (Dual-Face Attendance & Spatial Radar)**  
> *Sovereign 100% Local AI in RAM • Cancelable Biometrics • Republic Act 10173 & RA 9369 Compliant*

---

## ⚠️ Important Note Before Deployment
* **Do NOT push this repository to GitHub or public repositories yet.** Keep all credentials, test salts, and local environment files strictly on your local infrastructure.

---

## 1. System Architecture Overview

The system consists of two tightly coupled components:
1. **FastAPI Biometric Engine (`biometric-service/`)**:
   - Runs **100% locally in RAM** (Zero temporary image files written to disk).
   - Executes Facenet512 512-dimensional vector extraction and orthogonal matrix salting ($Q \in \mathbb{R}^{512 \times 512}$).
   - Handles **Face IN** (Check-In & Ballot Issuance) and **Face OUT** (Check-Out & Ballot Feeding).
   - Runs the **Mocked Self-Learned AI Voting Pacing Engine** to detect rapid rush (<45s) or protracted delay (>8m) anomalies.
   - Synchronizes cross-precinct anti-flying voter duplicate checks via in-memory cloud or MongoDB Atlas TTL.
2. **Vite React Frontend (`src/`)**:
   - Client-side MediaPipe 60 FPS face tracking & liveness.
   - DBSCAN geospatial clustering radar & Leaflet mapping.
   - Forensic handwriting similarity analyzer.
   - **Lalamove-Style Live Public Transparency Stream** (`#/public-map`).
   - Interactive AI Chatbot with Voter Dossier Summarizer (ID vs Live verification photos).

---

## 2. Server Requirements & Pre-requisites

### Minimum Production Specifications
* **OS:** Ubuntu 22.04 LTS / Debian 12 (or Windows Server 2022)
* **CPU:** 4 vCPUs (Intel Xeon / AMD EPYC recommended for Facenet inference)
* **RAM:** 8 GB RAM (RAM-only biometric buffer + OS)
* **Storage:** 20 GB SSD
* **Network:** Static IP or domain with SSL/TLS (HTTPS)

> 🔒 **MANDATORY HTTPS REQUIREMENT:** Modern browsers (Chrome, Edge, Safari, Firefox) **block camera access (`getUserMedia`)** unless the site is served over **HTTPS** (or `localhost`). For public or production deployment, an SSL certificate is required.

---

## 3. Production Deployment Steps (Ubuntu/Linux)

### Step 3.1: Install Dependencies
```bash
sudo apt update && sudo apt install -y python3-pip python3-venv nodejs npm nginx certbot python3-certbot-nginx libgl1 libglib2.0-0
```

### Step 3.2: Configure Python Virtual Environment & Biometric Service
```bash
cd /opt/once-ai/biometric-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Step 3.3: Configure Production Environment Variables
Create `/opt/once-ai/biometric-service/.env`:
```env
PYTHONIOENCODING=utf-8
ELECTION_SECRET_SALT=COMELEC_SECRET_SALT_SOVEREIGN_2026_PRODUCTION_KEY
DEFAULT_TTL_MODE=45_SECONDS
# Optional: MongoDB Atlas URI (leave empty for high-performance in-memory mode)
# CLOUD_DB_URI=mongodb+srv://user:pass@cluster.mongodb.net/
```

### Step 3.4: Create Systemd Service for the Biometric Engine
Create `/etc/systemd/system/once-biometrics.service`:
```ini
[Unit]
Description=ONCE AI Biometric & Attendance Engine (FastAPI)
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/once-ai/biometric-service
ExecStart=/opt/once-ai/biometric-service/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always
RestartSec=5
EnvironmentFile=/opt/once-ai/biometric-service/.env

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable once-biometrics
sudo systemctl start once-biometrics
sudo systemctl status once-biometrics
```

---

### Step 3.5: Build the Production Frontend
On your build machine or server:
```bash
cd /opt/once-ai
npm install
npm run build
```
This generates the optimized production assets in `/opt/once-ai/dist`.

---

### Step 3.6: Configure Nginx Reverse Proxy with SSL/TLS
Create `/etc/nginx/sites-available/once-ai`:
```nginx
server {
    listen 80;
    server_name your-election-domain.gov.ph; # Replace with your domain or IP

    # Redirect HTTP to HTTPS (Mandatory for WebCam access)
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-election-domain.gov.ph;

    # SSL Certificate Paths (obtain via Certbot)
    ssl_certificate /etc/letsencrypt/live/your-election-domain.gov.ph/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-election-domain.gov.ph/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Frontend Static Distribution
    root /opt/once-ai/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 25M;
    }
}
```

Enable site and test Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/once-ai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Obtain Free SSL via Let's Encrypt (if using public domain):
```bash
sudo certbot --nginx -d your-election-domain.gov.ph
```

---

## 4. Public Live Tracking / Transparency Stream Link

Under **Geographic Analysis**, click **"Share Live Public Stream (Lalamove Style)"**.
* **Public URL:** `https://your-election-domain.gov.ph/#/public-map?share=comelec-live-2026-audit`
* **Embeddable Iframe:**
  ```html
  <iframe 
    src="https://your-election-domain.gov.ph/#/public-map?share=comelec-live-2026-audit" 
    width="100%" 
    height="650" 
    frameborder="0" 
    style="border:1px solid #cbd5e1; border-radius: 12px;">
  </iframe>
  ```
* **Privacy Assurance:** The public stream renders aggregate spatial clusters, density glows, and barangay statistics. In compliance with **RA 10173 (Data Privacy Act of 2012)**, all voter PII (names, exact street numbers, photos) is completely omitted from the public layer.

---

## 5. Offline / Air-Gapped Polling Station Deployment (Windows)

For field laptops inside local polling precincts with **zero internet connection**:
1. Copy the project folder to the field laptop.
2. Double-click `start_all.bat`.
3. The system automatically launches:
   - FastAPI Backend at `http://127.0.0.1:8000`
   - Local Browser UI at `http://localhost:5174/`
4. The gazetteer, 1:1 facial recognition, MediaPipe face tracking, and duration pacing engine run **100% offline without needing any cloud connection**.

---

## 6. Post-Election Zero-Knowledge Crypto-Shredding

Immediately after polls close and the canvassing audit is finalized:
1. Navigate to **System & Settings** in the dashboard, or trigger the endpoint directly:
   ```bash
   curl -X POST https://your-election-domain.gov.ph/api/biometrics/crypto-shred
   ```
2. **What this does:**
   - Rotates `ELECTION_SECRET_SALT`, instantly rendering all stored cancelable biometric vectors mathematically irreversible and useless.
   - Purges all cloud records.
   - Logs cryptographic audit entry `POST_ELECTION_CRYPTO_SHRED`.
