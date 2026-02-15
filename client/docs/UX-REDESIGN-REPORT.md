# BoulevardTCG Market — UX Redesign Report

## Files Changed / Created

### Created
- **`docs/UX-REDESIGN-PLAN.md`** — Plan de redesign (IA, parcours, navigation, templates, composants, accessibilité).
- **`docs/UX-REDESIGN-REPORT.md`** — Ce rapport final.
- **`src/components/ui/PageHeader.tsx`** — Composant header de page réutilisable (titre + sous-titre + action principale + actions secondaires).

### Modified
- **`src/App.tsx`** — Page d’accueil avec `PageHeader` et CTA principal « Parcourir le marketplace »; `PlaceholderPage` utilise `PageHeader`; lazy-loading des routes (Suspense + React.lazy); fallback skeleton pendant le chargement.
- **`src/components/index.ts`** — Export de `PageHeader` et `PageHeaderProps`.
- **`src/index.css`** — Styles `.page-header` (titre, sous-titre, actions); variables `--color-danger` et `--color-danger-bg`; suppression des styles orphelins (`.browse-header`, `.portfolio-dashboard-header`, `.my-listings-header`, `.inventory-header`, `.browse-cta`, `.portfolio-dashboard-actions`, `.inventory-actions`).
- **`src/pages/MarketplaceBrowse.tsx`** — Remplacement de `browse-header` par `PageHeader` avec CTA « Vendre / Créer une annonce ».
- **`src/pages/MyListings.tsx`** — Remplacement de `my-listings-header` par `PageHeader`; état non connecté avec `PageHeader` + CTA « Se connecter ».
- **`src/pages/InventoryPage.tsx`** — Remplacement de `inventory-header` par `PageHeader` (action « Ajouter une carte », secondaire « Voir mon portfolio »); état non connecté avec `PageHeader`.
- **`src/pages/PortfolioDashboard.tsx`** — Remplacement de `portfolio-dashboard-header` par `PageHeader`; suppression de tous les `console.log` / `console.warn` de debug.
- **`src/pages/CreateListing.tsx`** — En-tête avec `PageHeader` (titre + sous-titre); état non connecté avec `PageHeader`.
- **`src/pages/EditListing.tsx`** — En-tête avec `PageHeader`; état non connecté avec `PageHeader`.
- **`src/pages/TradesInbox.tsx`** — Remplacement titre/sous-titre par `PageHeader`; CTA « Nouvelle offre » affiché si connecté.
- **`src/pages/LoginPage.tsx`** — Remplacement titre/sous-titre par `PageHeader`.
- **`src/pages/ListingDetail.tsx`** — Lien retour « Marketplace » pointe vers `/produits` (canonical).

---

## New Components Introduced

| Composant | Rôle |
|-----------|------|
| **PageHeader** | En-tête de page standard : `title`, `subtitle`, `action` (CTA principal), `secondaryActions`. Utilisé sur toutes les pages listées ci-dessus pour une hiérarchie et un placement d’actions cohérents. |

Les composants existants (Button, Card, Badge, EmptyState, ErrorState, Skeleton, FilterBar, ListingCard, etc.) sont conservés; les pages s’appuient désormais sur `PageHeader` pour la zone titre/actions, en cohérence avec le plan.

---

## Before / After Summary of UX Improvements

| Aspect | Avant | Après |
|--------|--------|--------|
| **En-têtes de page** | Titre et sous-titre et CTA dispersés (classes `browse-header`, `my-listings-header`, `portfolio-dashboard-header`, etc.). | Un seul composant `PageHeader` sur toutes les pages : titre + sous-titre + 1 CTA principal (+ secondaires si besoin). |
| **Hiérarchie d’actions** | Boutons parfois mélangés (plusieurs primaires visuellement). | Une action principale par page (ex. « Vendre / Créer une annonce », « Nouvelle annonce », « Ajouter une carte »); secondaires en `secondaryActions` ou en liens secondaires. |
| **Cohérence de placement** | CTA à droite sur certaines pages, en bas ou dans le texte sur d’autres. | CTA principal toujours dans la zone d’actions du `PageHeader` (droite desktop, repli sous le titre sur mobile via flex-wrap). |
| **Accueil** | Plusieurs liens au même niveau (« Voir mes échanges », « Nouvelle offre », « Créer une annonce »). | Un CTA principal « Parcourir le marketplace »; les autres actions dans un bloc « Commencer » en secondaire. |
| **État non connecté** | Titre + paragraphe + lien « Se connecter ». | Même pattern avec `PageHeader` + `action` = « Se connecter » pour cohérence avec le reste de l’app. |
| **Debug** | `console.log` / `console.warn` dans PortfolioDashboard (history, chart data, tooltip). | Tous retirés. |
| **Performance** | Toutes les pages chargées au premier hit. | Routes lazy-loadées (MarketplaceBrowse, ListingDetail, CreateListing, MyListings, EditListing, InventoryPage, PortfolioDashboard, TradesInbox, TradesNew, TradeThread, LoginPage) avec `Suspense` et fallback skeleton. |
| **Canonical URL** | Lien retour détail annonce vers `/marketplace`. | Lien retour vers `/produits` (URL canonical du browse). |
| **Design tokens** | `--color-danger` utilisé (Portfolio, Badge) mais non défini. | `--color-danger` et `--color-danger-bg` ajoutés dans `index.css`. |

---

## Remaining Improvements / Next Iterations

1. **Mobile**  
   - Vérifier le touch-target des boutons (min 44px) sur toutes les pages.  
   - Tester le menu mobile (bottom sheet) avec le nouveau `PageHeader` (overflow, scroll).

2. **Accessibilité**  
   - Audit clavier (tab order, focus visible) sur formulaires (Créer/Modifier annonce, Login).  
   - Vérifier `aria-label` / `aria-describedby` sur les champs de formulaire et messages d’erreur.

3. **Filtres / Liste**  
   - Sur mobile, envisager un drawer pour les filtres (FilterBar) au lieu d’une barre toujours visible, pour libérer de l’espace.

4. **EmptyState**  
   - Utiliser systématiquement le composant `EmptyState` avec une icône + titre + description + CTA sur toutes les listes vides (annonces, inventaire, échanges).

5. **Breadcrumbs**  
   - Ajouter un fil d’Ariane sur Détail annonce (Accueil > Marketplace > [Titre]) et éventuellement sur Créer/Modifier annonce (Mes annonces > Nouvelle annonce / Modifier).

6. **Formulaires**  
   - Barre d’actions sticky en bas sur Créer/Modifier annonce (Annuler, Enregistrer brouillon, Publier) pour réduire les clics et garder les actions visibles au scroll.

7. **Images**  
   - Lazy-load des images dans la grille (ListingCard) et sur la page détail (gallery) pour améliorer le LCP.

8. **Tests**  
   - Vérifier que les routes lazy ne cassent pas les tests E2E ou d’intégration (attente du chargement du composant).
