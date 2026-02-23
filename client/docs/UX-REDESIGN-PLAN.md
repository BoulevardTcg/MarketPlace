# BoulevardTCG Market — UX Redesign Plan

## 1. Information Architecture (Sitemap)

```
/                     → Accueil (CTA: Marketplace, Connexion)
/produits             → Browse annonces (filtres, tri, grille)
/marketplace/:id      → Détail annonce (CTA: Contacter / Favori)
/annonces             → Mes annonces (liste, CTA: Nouvelle annonce)
/annonces/new         → Créer une annonce (formulaire)
/annonces/:id/edit    → Modifier annonce (brouillon)
/portfolio            → Mon portfolio (KPIs + graphiques + inventaire : liste + ajout cartes)
/trade | /trades      → Inbox échanges (liste offres)
/trades/new           → Nouvelle offre d’échange
/trades/:id           → Thread échange (messages)
/connexion            → Login
/profile              → Profil (placeholder)
/panier               → Panier (placeholder)
/admin                → Admin (placeholder)
/actualites, /contact → Placeholders
```

**Principes IA**
- Une URL = une ressource claire (pas de sous-routes redondantes).
- `/produits` et `/marketplace` → unifier sur `/produits` (canonical).
- Pages auth-gated (annonces, inventaire, portfolio, trades) : redirection vers `/connexion` si non connecté.

---

## 2. Primary User Journeys (End-to-End)

| # | Parcours | Étapes | Objectif click-reduction |
|---|----------|--------|---------------------------|
| 1 | **Découvrir et contacter** | Accueil → Produits (filtres) → Détail annonce → Contacter / Favori | Filtres en barre sticky; détail avec CTA unique principal (Contacter). |
| 2 | **Vendre une carte** | Mes annonces → Nouvelle annonce OU Portfolio (section inventaire) → « Mettre en vente » → Formulaire → Publier | Un CTA principal par écran; formulaire en une page; lien fort inventaire (dans Portfolio) → Créer annonce. |
| 3 | **Gérer inventaire et valeur** | Portfolio : section « Cartes de ma collection » (ajouter carte) + KPIs + snapshot | Tout sur une page : inventaire + valeur + « Enregistrer snapshot ». |
| 4 | **Échanger** | Échanges → Nouvelle offre OU ouvrir thread → Envoyer message | Inbox = liste; création offre = une page; thread = 2 colonnes (desktop) / 1 colonne (mobile). |
| 5 | **Se connecter** | Connexion → (succès) → Redirection vers page demandée ou Accueil | Un formulaire; pas d’étapes inutiles. |

---

## 3. Navigation Model

- **Navbar (desktop)**  
  - Logo (lien Accueil).  
  - Liens principaux: Accueil, Marketplace, Mes annonces, Portfolio, Échanges.  
  - Droite: Recherche (optionnel), Thème, Panier, Compte/Connexion.  
  - Un seul niveau; pas de mega-menu. (Inventaire fusionné dans Portfolio.)

- **Mobile**  
  - Même ordre dans un bottom sheet ou menu hamburger.  
  - Recherche soit en barre sous la navbar, soit dans le sheet.  
  - Toujours: Accueil, Marketplace, Mes annonces, Portfolio, Échanges, Connexion/Compte.

- **Pas de side menu** pour cette version (tout dans la navbar / sheet).

- **Breadcrumbs**  
  - Uniquement sur Détail annonce (Accueil > Marketplace > [Titre]) et éventuellement Créer/Modifier annonce (Mes annonces > Nouvelle annonce).

---

## 4. Page Templates and Layout Rules

| Template | Structure | Règles |
|----------|-----------|--------|
| **List (Browse, Mes annonces, Inbox)** | `PageHeader` (titre + sous-titre + 1 CTA principal) → Filtres/barre outil (si applicable) → Zone liste (grille ou lignes) → Pagination / Load more | Titre H1 cohérent; CTA en haut à droite (desktop) ou sous titre (mobile). |
| **Detail (Annonce, Thread)** | Breadcrumb (si utile) → Bloc principal (image + infos) → CTA principal sticky ou en bas → Sections secondaires | Une seule CTA principale (Contacter, Envoyer, etc.); actions secondaires en groupe discret. |
| **Form (Créer/Modifier annonce, Nouvelle offre)** | Titre court → Formulaire en sections (groupes logiques) → Barre d’actions sticky en bas (Annuler, Enregistrer brouillon, Publier) | Validation inline; pas de wizard multi-étapes sauf si nécessaire plus tard. |
| **Dashboard (Portfolio)** | Titre → KPIs en grille → Section inventaire (liste + ajout cartes) → Graphiques en cartes → Actions (Snapshot) | Données d’abord; actions secondaires groupées. |

**Règles transverses**
- **Header de page** : toujours `[Titre H1]` + `[Sous-titre court]` + `[CTA principal]` (alignés, même pattern).
- **Espacement** : scale `--space-*` (4, 8, 12, 16, 24, 32px); sections séparées par `--space-6` ou `--space-8`.
- **Largeur contenu** : `--content-max` (1400px), padding horizontal `--content-padding`.

---

## 5. Component Inventory

| Composant | Usage | Règles |
|-----------|--------|--------|
| **Button** | Actions | Primary (1 par contexte), Secondary, Ghost, Danger; tailles: sm, md, lg. |
| **Card** | Blocs de contenu, cartes annonce | Padding cohérent; hover discret; pas de bordures lourdes. |
| **Badge** | Statuts (Publié, Vendu, Brouillon), tags | Couleurs sémantiques (success, warning, muted). |
| **Input, Select, Textarea** | Formulaires | Labels au-dessus; erreur sous le champ; même hauteur/radius. |
| **Modal** | Confirmation, détail léger | Overlay + fermeture Escape/click outside; focus trap. |
| **Drawer** | Filtres mobile, panneau « Ajouter carte » | Slide depuis droite (ou bas sur mobile); même principes a11y que modal. |
| **Table** | Liste annonces (vue compacte), inventaire (optionnel) | En-têtes fixes sur scroll (si long); tri cliquable. |
| **Skeleton** | Chargement listes, cartes, détail | Même forme que le contenu final; aria-hidden. |
| **EmptyState** | Liste vide, aucun résultat | Icône + titre + description + 1 CTA. |
| **ErrorState** | Erreur chargement | Message + bouton Réessayer. |
| **PageHeader** | Toutes les pages | Titre + sous-titre + CTA(s); responsive (stack sur mobile). |

**Boutons**
- Primary : action principale de la page (ex. « Publier l’annonce », « Créer une annonce »).
- Secondary : actions secondaires (Annuler, Voir brouillon).
- Ghost/Danger : actions destructives ou tertiaires (Supprimer, Déconnexion).

---

## 6. Click-Reduction Strategy

- **Listes** : actions rapides sur la carte/ligne (Favori, Modifier, Voir) sans aller sur une page intermédiaire quand un clic suffit (ex. modal « Êtes-vous sûr ? »).
- **Création annonce** : depuis Inventaire, bouton « Mettre en vente » qui pré-remplit le formulaire et amène sur `/annonces/new` avec state.
- **Filtres** : garder les filtres en barre (ou drawer sur mobile) avec URL sync pour partage; pas de page « Filtres » dédiée.
- **Détail annonce** : un clic « Contacter » qui mène vers échange ou formulaire contact; pas de tunnel multi-pages.
- **Portfolio** : un bouton « Enregistrer la valeur » au lieu de plusieurs étapes.
- **Formulaires** : une page avec sections repliables si long; barre d’actions sticky pour toujours avoir Enregistrer visible.

---

## 7. Accessibility and Responsiveness

- **Contraste** : texte et bordures conformes (WCAG AA). Variables `--color-text`, `--color-text-muted` déjà présentes.
- **Focus** : outline visible sur tous les contrôles (boutons, liens, inputs); pas de `outline: none` sans équivalent.
- **Labels** : tous les champs de formulaire avec `<label>` ou `aria-label`; erreurs reliées via `aria-describedby`.
- **Clavier** : navigation complète (tab, Enter, Escape pour fermer modals/drawers).
- **Mobile-first** : breakpoints `--bp-sm`, `--bp-md`, `--bp-lg`; grille produits en 1 col (mobile), 2–4 cols (desktop); navbar → menu/drawer sur petit écran.
- **Touch** : zones cliquables ≥ 44px; espacement suffisant entre liens/boutons.

---

## 8. Technical Notes

- **Pas de nouvelle dépendance lourde** : design system en CSS + composants React légers; Recharts déjà présent pour Portfolio.
- **API** : garder `api.ts` centralisé; pas de `fetch` dispersé dans les pages (déjà le cas avec `fetchWithAuth`).
- **Tokens** : réutiliser `index.css` (variables) comme source de vérité; composants consomment des classes ou variables CSS.
- **Lazy routes** : possibilité de `React.lazy` pour routes secondaires (Trades, Portfolio) pour alléger le bundle initial.
