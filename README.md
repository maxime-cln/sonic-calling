# 🔥 Sonic Calling — Guide de déploiement

## Qu'est-ce que c'est ?
Une webapp qui affiche une alerte en temps réel quand un nouveau deal arrive dans HubSpot sans prise de RDV. Tu vois l'alerte, tu cliques "J'appelle", le numéro s'affiche.

## Fichiers du projet

```
sonic-calling/
├── server.js          ← Le serveur (backend)
├── public/
│   └── index.html     ← L'interface (frontend)
├── package.json       ← Les dépendances
├── .env.example       ← Modèle de configuration
└── README.md          ← Ce fichier
```

---

## Déploiement sur Render (gratuit)

### Étape 1 : Créer un compte GitHub
Si tu n'en as pas : va sur https://github.com et crée un compte gratuit.

### Étape 2 : Créer un repository
1. Sur GitHub, clique sur le bouton vert **"New"** (ou va sur https://github.com/new)
2. Nom du repository : `sonic-calling`
3. Laisse en **Public** (ou Private si tu préfères)
4. Clique **"Create repository"**
5. GitHub te montre des instructions. On va y revenir.

### Étape 3 : Uploader les fichiers
La méthode la plus simple (sans terminal) :
1. Sur la page du repository vide, clique sur **"uploading an existing file"**
2. Glisse-dépose TOUS les fichiers du dossier `sonic-calling` :
   - `server.js`
   - `package.json`
   - `.env.example`
   - Le dossier `public/` avec `index.html` dedans
3. Clique **"Commit changes"**

### Étape 4 : Créer un compte Render
1. Va sur https://render.com
2. Clique **"Get Started for Free"**
3. Connecte-toi avec ton compte GitHub (c'est le plus simple)

### Étape 5 : Déployer l'application
1. Dans le dashboard Render, clique **"New +"** → **"Web Service"**
2. Connecte ton repository `sonic-calling`
3. Configure :
   - **Name** : `sonic-calling`
   - **Region** : `Frankfurt (EU Central)` (le plus proche)
   - **Branch** : `main`
   - **Runtime** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `node server.js`
   - **Plan** : **Free**
4. Clique **"Create Web Service"**

### Étape 6 : Configurer les variables d'environnement
Dans Render, va dans **Environment** de ton service et ajoute :

| Clé | Valeur |
|-----|--------|
| `API_TOKEN` | Un mot de passe secret de ton choix (ex: `lm-sonic-2026-xyz`) |
| `N8N_WEBHOOK_ACCEPT_URL` | L'URL du webhook n8n qui recevra les acceptations (à configurer quand le workflow n8n sera prêt) |

### Étape 7 : Tester
1. Render te donne une URL (ex: `https://sonic-calling.onrender.com`)
2. Ouvre cette URL dans ton navigateur → tu vois "Sonic Calling - En attente de deals..."
3. Clique sur le bouton **"🧪 Envoyer un deal test"**
4. L'alerte doit apparaître ! Teste "J'appelle" et "Passer"

---

## Ensuite : Brancher n8n

Une fois la webapp en ligne et testée, il faut créer les workflows n8n :

### Workflow 1 : Nouveau deal → Alerte
- **Trigger** : Webhook depuis HubSpot
- **Vérification** : Heure entre 9h-18h (Europe/Paris), lundi à vendredi
- **Récupération** : Propriétés du deal (`canal`, `source_level_2`, `formation_envisagee`) + téléphone du contact
- **Envoi** : POST vers `https://sonic-calling.onrender.com/api/deal` avec le header `Authorization: Bearer <ton-API_TOKEN>`

Payload à envoyer :
```json
{
  "dealId": "{{$json.dealId}}",
  "canal": "{{$json.canal}}",
  "source": "{{$json.source_level_2}}",
  "formation": "{{$json.formation_envisagee}}",
  "telephone": "{{$json.phone}}",
  "hubspotUrl": "https://app.hubspot.com/contacts/VOTRE_PORTAL_ID/deal/{{$json.dealId}}"
}
```

### Workflow 2 : Deal accepté → Mise à jour HubSpot
- **Trigger** : Webhook (l'URL que tu mets dans `N8N_WEBHOOK_ACCEPT_URL`)
- **Action** : Mettre à jour le deal dans HubSpot avec `alerte_deal` = "oui" et `alerte_deal_date` = timestamp

---

## Et le workflow HubSpot ?

Crée un workflow dans HubSpot :
1. **Trigger** : Création d'un deal avec `creation_type` = "Lead intentionnel"
2. **Délai** : Attendre 5 minutes
3. **Condition** : Si `creation_type` est toujours "Lead intentionnel"
4. **Action** : Envoyer un webhook vers n8n (URL du Workflow 1)

---

## Dépannage

**L'app ne se charge pas ?** → Render met ~30s à réveiller l'app si elle était en veille. Recharge la page.

**Pas d'alerte quand je clique "test" ?** → Ouvre la console du navigateur (F12 → Console) et regarde les erreurs.

**Le son ne marche pas ?** → Clique n'importe où sur la page d'abord (restriction navigateur).
