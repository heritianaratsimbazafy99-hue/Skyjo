# Skyjo Score Arena

Plateforme visuelle pour noter les scores de Skyjo, suivre le classement en direct et saisir les manches depuis mobile via QR code.

## Lancer en local

```bash
npm run dev
```

Puis ouvrir `http://127.0.0.1:8000/`.

## QR mobile

Clique sur `Activer le QR`, puis scanne le QR depuis un téléphone. Le téléphone ouvre un contrôleur de saisie et les scores mettent à jour l'écran principal en temps réel.

## Déploiement Vercel

Le projet expose un serveur HTTP Node via `server.js` et peut être poussé sur GitHub pour un déploiement Vercel.

Note: les sessions sont stockées en mémoire dans le serveur. C'est pratique pour tester et jouer rapidement, mais un redémarrage ou une nouvelle instance peut perdre les parties en cours. Pour une version robuste en ligne, il faudra brancher un stockage partagé comme Redis, Supabase ou une autre base temps réel.
