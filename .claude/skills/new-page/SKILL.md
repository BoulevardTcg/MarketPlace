---
description: Scaffold a new React page in the client app with routing
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Nouvelle page React

Crée une nouvelle page dans le client Vite + React.

## Argument

`$ARGUMENTS` = nom de la page (ex: `MarketplaceBrowse`, `CollectionView`, `UserProfile`). Si non fourni, demander à l'utilisateur.

## Étapes

1. **Lire les fichiers existants** pour comprendre les patterns :
   - `client/src/App.tsx` — routing actuel
   - `client/src/api.ts` — helper API
   - Un fichier page existant (ex: `client/src/pages/TradesInbox.tsx`) — pattern de référence

2. **Créer `client/src/pages/$ARGUMENTS.tsx`** avec ce squelette :

```tsx
import { useEffect, useState } from "react";
import { fetchWithAuth } from "../api";

export function $ARGUMENTS() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section>
      <h1 className="page-title">TODO: Titre</h1>
      <p className="page-subtitle">TODO: Description</p>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p style={{ color: "var(--color-text-muted)" }}>Chargement...</p>}
    </section>
  );
}
```

3. **Ajouter la route dans `client/src/App.tsx`** :
   - Import : `import { $ARGUMENTS } from "./pages/$ARGUMENTS";`
   - Route : `<Route path="/chemin" element={<$ARGUMENTS />} />`

4. **Ajouter le proxy Vite si nécessaire** dans `client/vite.config.ts` :
   - Si la page consomme un nouveau préfixe API non encore proxifié, l'ajouter dans la config proxy

5. **Résumer** la page créée et les prochaines étapes d'implémentation.

## Patterns du projet

- **API calls** : toujours `fetchWithAuth(path, options)` — jamais `fetch()` direct
- **State** : `useState` pour loading, error, data séparés
- **Pagination** : cursor-based avec bouton "Charger plus"
- **JWT** : géré par `api.ts`, stocké dans `localStorage` sous `"boulevardtcg-market-jwt"`
- **CSS** : classes utilitaires du projet (`page-title`, `page-subtitle`, `card`, `btn`, `alert`, `badge`, etc.)
- **Navigation** : `<Link to="...">` de react-router-dom, `useNavigate()` pour la navigation programmatique
- **Params** : `useParams()` pour les paramètres de route
