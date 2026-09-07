# 🌟 LUMA — Plateforme de Messagerie Temps Réel Lumesys

**LUMA** est la messagerie instantanée officielle de l'écosystème **Lumesys**.  
Conçue avec une architecture modulaire en JavaScript pur (ES6+), sans framework lourd, elle s'intègre directement avec votre infrastructure **Google Firebase existante** et est hébergée gratuitement sur **GitHub Pages**.

---

## 📁 Structure du Projet

Conforme aux directives d'architecture de l'écosystème Lumesys :

```text
LUMA/
│
├── index.html                  # Portail d'accueil, statut et routage
├── login.html                  # Interface de connexion & inscription
├── chat.html                   # Espace principal de messagerie temps réel
├── profile.html                # Gestion du profil et présence utilisateur
│
├── css/
│   ├── style.css               # Système de design, variables & reset global
│   ├── login.css               # Styles dédiés aux formulaires d'authentification
│   └── chat.css                # Styles de la messagerie, bulles et timeline
│
├── js/
│   ├── firebase-config.js      # Initialisation Firebase SDK & diagnostic
│   ├── database.js             # Couche d'accès aux données (DAL multi-base)
│   ├── auth.js                 # Service d'authentification & sessions
│   ├── chat.js                 # Contrôleur temps réel de chat.html
│   ├── users.js                # Recherche, annuaire & avatars
│   ├── conversations.js        # Gestion des fils de discussion
│   ├── messages.js             # Envoi, accusés de lecture & dates
│   ├── notifications.js        # Sons Web Audio & notifications système
│   ├── storage.js              # Gestion des pièces jointes & avatars
│   └── app.js                  # Contrôleur général & cycle de vie
│
├── firebase/
│   ├── firestore.rules         # Règles de sécurité zéro-trust Firestore
│   ├── storage.rules           # Règles de sécurité Firebase Storage
│   └── firestore.indexes.json  # Index composites Firestore
│
├── manifest.json               # Manifeste PWA pour installation mobile/bureau
├── service-worker.js           # Cache hors-ligne pour PWA
└── README.md                   # Documentation complète d'installation et test
```

---

## 🚀 Étape par Étape : Déploiement Gratuit sur GitHub Pages

LUMA est optimisée pour fonctionner **sans aucun serveur applicatif**, avec des chemins **strictement relatifs** compatibles avec le sous-dossier de votre dépôt GitHub (`https://MON-COMPTE.github.io/MON-REPOSITORY/`).

### 1. Créer le dépôt sur GitHub
1. Rendez-vous sur [github.com/new](https://github.com/new).
2. Nommez votre dépôt (par exemple `luma` ou `luma-messaging`).
3. Choisissez la visibilité **Public** (ou Privé si vous avez un compte GitHub Pro/Team).

### 2. Initialiser et pousser le code
Dans le terminal de votre projet :

```bash
git init
git add .
git commit -m "feat: Déploiement initial de LUMA pour Lumesys"
git branch -M main
git remote add origin https://github.com/MON-COMPTE/MON-REPOSITORY.git
git push -u origin main
```

### 3. Activer GitHub Pages
1. Sur votre dépôt GitHub, ouvrez l'onglet **Settings** (Paramètres).
2. Dans le menu de gauche, cliquez sur **Pages**.
3. Sous **Build and deployment** :
   - Source : **Deploy from a branch**
   - Branch : **main** / Dossier : **/ (root)**
4. Cliquez sur **Save**.
5. Votre application sera instantanément accessible à l'URL :
   ```text
   https://MON-COMPTE.github.io/MON-REPOSITORY/
   ```

---

## 🔐 Intégration Firebase avec l'Existant Lumesys

LUMA utilise la collection préexistante `utilisateurs` sans écraser vos données historiques.

### 1. Configuration Firebase Automatique
LUMA est configuré directement avec le projet Lumesys existant (`lumina-analytics`). Aucune saisie manuelle de clés n'est demandée à l'utilisateur final.

### 2. Déploiement des Règles de Sécurité (`firestore.rules`)
Avec le CLI Firebase :
```bash
firebase deploy --only firestore:rules
```
Ou manuellement :
1. Rendez-vous dans la **Console Firebase > Firestore Database > Règles**.
2. Copiez l'intégralité du fichier `firebase/firestore.rules`.
3. Cliquez sur **Publier**.

---

## 🧪 Protocole de Test Réel (Utilisateur A & Utilisateur B)

Pour certifier le bon fonctionnement en conditions réelles :

1. **Session Utilisateur A** :
   - Ouvrez un navigateur normal (ex. Chrome).
   - Rendez-vous sur votre application LUMA (`login.html`).
   - Créez un compte ou connectez-vous avec `utilisateurA@lumesys.com`.
2. **Session Utilisateur B** :
   - Ouvrez une fenêtre de **navigation privée** (ou un second navigateur comme Firefox/Safari).
   - Rendez-vous sur `login.html`.
   - Créez un compte ou connectez-vous avec `utilisateurB@lumesys.com`.
3. **Échange de messages** :
   - Depuis l'Utilisateur A, cliquez sur **"+" (Nouvelle discussion)** et sélectionnez l'Utilisateur B.
   - Envoyez le message *"Bonjour de la part de l'Utilisateur A !"*.
   - Observez l'apparition **instantanée** de la discussion et du message sur l'écran de l'Utilisateur B sans rechargement de page.
   - Vérifiez l'émission du son de notification discret (Web Audio) et la mise à jour des accusés de lecture (`✓` puis `✓✓`).

---

## 🏗️ Architecture DAL (Data Access Layer) & Évolutivité

Toutes les requêtes de données sont strictement encapsulées dans `js/database.js`. L'interface graphique (`app.js`, `chat.js`) n'appelle jamais directement les méthodes SDK de Firestore.

Un **Routeur de Base de Données** (`DatabaseRouter`) est déjà en place dans `js/database.js` pour permettre de brancher ultérieurement une base secondaire (PostgreSQL, Cloud SQL, SQLite) ou de migrer vers une API REST/WebSocket dédiée sans toucher à la moindre ligne de code de l'interface utilisateur.
