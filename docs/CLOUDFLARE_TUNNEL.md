# Cloudflare Tunnel – Smart Gallery

Résumé des configurations possibles pour exposer l’app via un tunnel Cloudflare.

## Port selon le mode

| Mode | Port local à exposer | Tunnel → |
|------|----------------------|-----------|
| **Dev (Vite)** | 9999 | `http://localhost:9999` (Vite proxy /api vers 8888) |
| **Prod PM2** (backend + static-server) | 9998 (frontend) | Ne suffit pas seul : le front 9998 ne proxy pas /api. Voir ci‑dessous. |
| **Prod un seul serveur** (SERVE_APP=1) | 8888 | `http://localhost:8888` |
| **Prod Docker** | 9998 (mapping hôte) | `http://localhost:9998` |

## Recommandation : un seul port pour le tunnel

Pour que le tunnel pointe vers **une seule URL** (sans reverse proxy) :

1. **Avec Docker**  
   - L’app écoute sur le port **8888** dans le conteneur, mappé en **9998** sur l’hôte.  
   - Tunnel → `http://localhost:9998`  
   - Ou mappage `8888:8888` → tunnel → `http://localhost:8888`

2. **Avec PM2 (sans Docker)**  
   - Faire tourner **un seul** processus Node qui sert tout (front + API) :  
     - Soit lancer uniquement le backend avec `SERVE_APP=1` (il sert aussi le build front).  
     - Soit garder backend 8888 + static 9998 et mettre un reverse proxy (nginx) qui écoute sur un port (ex. 9999) et envoie `/` → 9998, `/api`, `/uploads`, `/socket.io` → 8888, puis tunnel → ce port.  
   - Le plus simple : **un seul serveur** sur 8888 avec `SERVE_APP=1`, tunnel → `http://localhost:8888`.

## Configuration du hostname (Zero Trust)

Dans **Networks → Tunnels → [ton tunnel] → Public Hostnames** :

- **Subdomain / Domain** : ex. `smart-gallery` / `xavdp.pro`
- **Type** : HTTP  
- **URL** : selon le tableau ci‑dessus, par ex. `localhost:9998` (Docker) ou `localhost:8888` (un seul serveur)
- **No TLS Verify** : coché (connexion vers localhost)

## APP_URL (emails, liens)

Quand l’app est accessible via le tunnel (ex. `https://smart-gallery.xavdp.pro`), définir :

- **PM2** : dans `.env` ou `ecosystem.config.cjs`  
  `APP_URL=https://smart-gallery.xavdp.pro`
- **Docker** : dans `.env` ou `docker-compose.yml`  
  `APP_URL=https://smart-gallery.xavdp.pro`

Cela permet d’avoir les bons liens dans les mails (réinitialisation mot de passe, etc.).

## Vérifications

```bash
# L’app répond bien sur le port utilisé par le tunnel
curl -I http://localhost:9998   # ou 8888 / 9999 selon config

# Service cloudflared
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -n 20
```

Une fois le hostname et le tunnel configurés, l’app est accessible en **https** sur ton domaine (ex. `https://smart-gallery.xavdp.pro`).
