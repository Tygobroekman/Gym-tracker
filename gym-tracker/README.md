# Gym Tracker

Een installeerbare PWA om je sportschool-progressie bij te houden. Geen account, geen server — alle data staat lokaal op je apparaat (`localStorage`).

## Functies
- **Sessie** — start een workout, voeg oefeningen toe, log sets (gewicht × reps). De app toont "vorige keer" en kopieert je laatste set automatisch voor.
- **Oefeningen** — je eigen bibliotheek, gegroepeerd per spiergroep, met notities en je beste set (PR).
- **Lichaam** — log gewicht, vet%, en omtrekken (borst/taille/arm/been) met een verloop-grafiek en verschil t.o.v. de vorige meting.
- **Historie** — alle afgeronde sessies met totaal volume en set-aantallen.

## Lokaal draaien
Vanuit deze map een statische server starten:

```sh
python3 -m http.server 8765
```

Open daarna http://localhost:8765 in je browser.

## Op je iPhone installeren
1. Zet de map op een server die je telefoon kan bereiken (zelfde wifi: `python3 -m http.server 8765`, dan `http://<mac-ip>:8765`), of host de map ergens met https.
2. Open de URL in **Safari**.
3. Tik op het deel-icoon → **Zet op beginscherm**.

De app draait dan fullscreen en offline (via de service worker). Let op: voor de service worker en installatie is `http://localhost` of `https://` nodig — over een gewoon LAN-IP zonder https werkt de offline-cache niet, de app zelf wel.

## Bestanden
- `index.html` / `styles.css` / `app.js` — de app
- `manifest.webmanifest` — PWA-manifest
- `sw.js` — service worker (offline cache)
- `icons/` — app-iconen (+ `generate_icons.py` om ze te regenereren)

## Data
Alles staat onder de `localStorage`-sleutel `gym-tracker-db-v1`. Wissen = opnieuw beginnen met standaard oefeningen.
