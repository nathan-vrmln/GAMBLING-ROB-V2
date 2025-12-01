# Configuration Firebase

## Étapes pour configurer Firebase

### 1. Créer un projet Firebase
1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Cliquez sur "Ajouter un projet"
3. Donnez un nom à votre projet (ex: "slot-machine-game")
4. Suivez les étapes de création

### 2. Activer Authentication
1. Dans le menu latéral, cliquez sur "Authentication"
2. Cliquez sur "Commencer"
3. Dans l'onglet "Sign-in method", activez "Email/Password"

### 3. Créer une base de données Firestore
1. Dans le menu latéral, cliquez sur "Firestore Database"
2. Cliquez sur "Créer une base de données"
3. Choisissez "Commencer en mode test" (pour le développement)
4. Sélectionnez une région proche de vous

### 4. Récupérer les credentials
1. Allez dans "Paramètres du projet" (icône engrenage en haut à gauche)
2. Faites défiler jusqu'à "Vos applications"
3. Cliquez sur l'icône Web (`</>`)
4. Enregistrez votre application (donnez-lui un nom)
5. Copiez l'objet `firebaseConfig` qui s'affiche

### 5. Mettre à jour index.html
Remplacez la section suivante dans `index.html` avec vos vraies valeurs :

```javascript
const firebaseConfig = {
    apiKey: "VOTRE_API_KEY",
    authDomain: "VOTRE_AUTH_DOMAIN",
    projectId: "VOTRE_PROJECT_ID",
    storageBucket: "VOTRE_STORAGE_BUCKET",
    messagingSenderId: "VOTRE_MESSAGING_SENDER_ID",
    appId: "VOTRE_APP_ID"
};
```

### 6. Configurer les règles Firestore
Dans Firestore Database > Règles, utilisez ces règles de base :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /pseudos/{pseudo} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

Ces règles permettent à chaque utilisateur de lire/écrire uniquement ses propres données, et à tous les utilisateurs authentifiés de vérifier si un pseudo est disponible.

## Structure de données Firestore

### Collection: `users`
Document par utilisateur (ID = UID Firebase Auth) :
```json
{
  "pseudo": "joueur123",
  "robions": 100,
  "unlockedCards": ["abel beau 1.jpg", "mael goat 4.jpg"],
  "createdAt": "2025-12-01T10:30:00.000Z",
  "lastUpdated": "2025-12-01T10:35:00.000Z"
}
```

### Collection: `pseudos`
Document par pseudo (ID = pseudo en minuscules) :
```json
{
  "uid": "firebase_user_uid_here"
}
```

Cette collection permet de mapper un pseudo vers un UID utilisateur pour la connexion.

## Fonctionnalités implémentées

✅ Inscription avec pseudo (3-20 caractères)
✅ Connexion avec pseudo + mot de passe
✅ Vérification d'unicité du pseudo
✅ Sauvegarde automatique des robions et cartes débloquées
✅ Chargement des données au démarrage
✅ Interface de connexion stylisée
✅ Gestion des erreurs d'authentification
✅ Validation du mot de passe (min 6 caractères)

## Notes importantes

- Les pseudos sont convertis en minuscules pour éviter les doublons (ex: "Player" et "player" sont identiques)
- Le système utilise Firebase Auth en arrière-plan avec des emails générés (`pseudo@slotmachine.local`)
- Les données sont sauvegardées automatiquement après chaque spin
- Si Firebase n'est pas configuré, le jeu utilise localStorage comme fallback
- Pour déployer en production, renforcez les règles Firestore
- Les pseudos doivent contenir entre 3 et 20 caractères
- Les mots de passe doivent contenir au moins 6 caractères
