# soundcloudToText

Exportiert Informationen eines SoundCloud-Profils als `.txt`-Datei.

## Vercel-Deployment

Das Projekt ist so aufgebaut, dass es direkt aus dem Repository-Root auf Vercel deploybar ist:

- `public/` enthält die statische Weboberfläche.
- `api/export.js` ist eine Vercel Serverless Function für `POST /api/export`.
- `package.json` liegt im Repository-Root, damit Vercel die Node.js-Abhängigkeiten automatisch installiert.
- `vercel.json` setzt eine längere Laufzeit für den Export-Endpunkt.

### Deploy-Schritte

1. Repository in Vercel importieren.
2. Framework Preset auf **Other** lassen.
3. Build Command leer lassen.
4. Output Directory leer lassen.
5. Deploy starten.

Nach dem Deployment ist die Oberfläche unter der Vercel-Domain erreichbar. Der Button ruft automatisch `/api/export` auf und lädt die erzeugte Textdatei herunter.

## Lokale Prüfung

```bash
npm test
```

Für lokales Ausführen der Vercel-Funktion kannst du optional die Vercel CLI nutzen:

```bash
npx vercel dev
```
