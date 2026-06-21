# Evolve Tracker — Guide d'installation

## Le point critique : héberger les fichiers

Une PWA doit être servie via HTTP(S), pas ouverte en double-clic depuis le téléphone (`file://`). Sans ça, le service worker ne s'enregistre pas et IndexedDB peut être restreint sur certains navigateurs Android.

Trois options, de la plus simple à la plus robuste :

### Option 1 — GitHub Pages (gratuit, recommandé)
1. Crée un repo GitHub, dézippe `evolve-tracker.zip` dedans, push.
2. Dans les Settings du repo > Pages > active GitHub Pages sur la branche main.
3. L'URL fournie (`https://tonpseudo.github.io/evolve-tracker/`) est ton lien d'installation.

### Option 2 — Netlify Drop
1. Va sur https://app.netlify.com/drop
2. Glisse le dossier dézippé (pas le zip).
3. Tu récupères une URL immédiatement.

### Option 3 — Hébergement perso / NAS
Si tu as déjà un NAS exposé en HTTPS (tu en as un, l'Ugreen DXP), dépose le contenu du dossier dans un répertoire web et expose-le. Vérifie juste que le certificat HTTPS est valide, sinon le service worker refuse de s'enregistrer sur certains Android.

## Installation sur Android

1. Ouvre l'URL dans **Chrome** (pas dans une app tierce).
2. Une bannière "Installer l'application" apparaît automatiquement, ou via le menu (trois points) > "Installer l'application" / "Ajouter à l'écran d'accueil".
3. Valide. L'icône apparaît sur l'écran d'accueil, ouverture en plein écran sans barre d'adresse.

Comme l'app est servie depuis ta propre origine (pas forms.microsoft.com), il n'y a aucune couche d'authentification SSO entre le raccourci et le contenu. Tap = app ouverte directement sur le dashboard.

## Persistance des données

Les données vivent dans IndexedDB, isolé du cache navigateur classique. Un nettoyage de cache standard ("vider le cache" dans les paramètres Chrome) ne les supprime pas. Seules deux actions les effacent : désinstaller l'app / vider les données du site explicitement dans les paramètres Chrome, ou un reset complet du téléphone.

Pour une sécurité supplémentaire, exporte régulièrement en CSV (page Paramètres) et garde une copie ailleurs (Drive, mail).

## Première utilisation

Les roues, types de ride, types d'intervention et parties du skate sont déjà pré-remplis avec des valeurs par défaut cohérentes (tes 3 profils de roues, cruise/vitesse, etc.). Tu peux tout modifier depuis Paramètres.
