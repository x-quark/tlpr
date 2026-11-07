# TL;PR

[English](./README.md) · **Français**

<img src="./assets/icon.svg" alt="Icône TL;PR" width="96" height="96">

**TL;PR** rend les longues conversations des pull requests et issues GitHub plus faciles à lire. Il replie les commentaires longs, condense le milieu des chronologies chargées et garde les contrôles utiles à portée de main

## Pourquoi

Les longues revues GitHub deviennent difficiles à parcourir quand les réponses, événements automatiques et blocs Markdown s’accumulent. TL;PR réduit ce bruit visuel sans supprimer ni modifier le contenu GitHub

## Fonctionnalités

- Replie automatiquement les commentaires humains de plus de `140px`
- Conserve les deux premiers et les trois derniers éléments d’une longue chronologie, dans l’ordre chronologique même quand GitHub affiche les plus récents en premier
- Prend en charge la conversation classique de GitHub, la nouvelle page Overview des pull requests et la vue React des issues, détectées automatiquement
- Relie en un clic une pull request en vue Overview à sa vue classique
- Déplie le milieu masqué à la demande
- Garde les commandes globales de repli et de dépliage accessibles pendant le défilement
- Distingue les états par des accents, des chevrons et des libellés accessibles
- Propose des réglages compacts d’activation, de langue, de vue GitHub, d’animations et de couleurs d’état, en thème clair et sombre
- Affiche une aide contextuelle sur les intitulés au survol ; conserve confidentialité et version dans Infos
- Inclut un assistant optionnel de message de fusion, désactivé par défaut, qui remplit le formulaire de fusion GitHub depuis la proposition publiée dans la conversation
- Conserve le focus clavier sur les commandes de chronologie et révèle le contenu ciblé
- Révèle temporairement les commentaires liés sans remplacer les préférences de repli enregistrées
- Conserve l’état par page avec la clé existante `gh-pr-comment-collapse:v3`, partagée par toutes les vues GitHub
- Ignore les commentaires de bots, y compris les applications GitHub affichées avec un libellé « Bot », et les commentaires en cours d’édition
- Fonctionne sur les pull requests et les issues GitHub
- Fournit les interfaces anglaise et française
- Suit par défaut la langue du navigateur, avec repli en anglais pour les langues non prises en charge ; les choix manuels sont conservés

## Confidentialité et permissions

TL;PR ne collecte et ne transmet aucune donnée. Il ne contient ni télémétrie, ni analyse d’usage, ni service distant, ni code hébergé à distance

L’extension demande uniquement la permission `storage` pour mémoriser localement les réglages de la barre d’outils. Elle ne possède aucun processus d’arrière-plan et ne demande aucune permission sur les onglets, le presse-papiers ou des sites supplémentaires. Voir [ADR 003](./journal/decisions/003-local-reading-settings.md). Son bootstrap de navigation est déclaré sur `https://github.com/*` afin d’activer une conversation ouverte sans rechargement. Hors conversations numériques de PR/issues, il lit uniquement l’URL et écoute la navigation : aucune lecture du contenu, modification DOM, collecte ou transmission. Les styles et commandes de lecture ne sont activés que dans les conversations numériques prises en charge. Voir [ADR 005](./journal/decisions/005-github-navigation-bootstrap.md). Les routes de conversation comprennent :

- `https://github.com/<owner>/<repo>/pull/<positive-number>`
- `https://github.com/<owner>/<repo>/pull/<positive-number>/files`
- `https://github.com/<owner>/<repo>/issues/<positive-number>`

Les préférences de repli par page restent dans le stockage local du site GitHub afin de préserver la compatibilité avec le userscript d’origine. L’activation, la langue, la vue GitHub, les animations, les couleurs d’état et l’assistant optionnel restent dans `chrome.storage.local`. Consultez la [politique de confidentialité](./PRIVACY.fr.md) pour le contrat complet

## Installation locale

### Prérequis

- Node.js 22 ou supérieur
- pnpm 10 ou supérieur
- Google Chrome ou un navigateur Chromium compatible avec Manifest V3

### Charger l’extension non empaquetée

```bash
git clone https://github.com/x-quark/tlpr.git
cd tlpr
pnpm install --frozen-lockfile
pnpm build
```

1. Ouvrez `chrome://extensions`
2. Activez le **Mode développeur**
3. Cliquez sur **Charger l’extension non empaquetée**
4. Sélectionnez le dossier `dist/`
5. Désactivez le userscript Tampermonkey d’origine pour éviter des contrôles en double
6. Ouvrez une pull request ou une issue GitHub

Après une modification locale, exécutez à nouveau `pnpm build`, puis utilisez le bouton d’actualisation de TL;PR dans `chrome://extensions`

## Créer le paquet distribuable

```bash
pnpm package
pnpm validate:package
```

Les fichiers suivants sont produits :

- `release/tlpr-v0.3.1.zip`
- `release/tlpr-v0.3.1.zip.sha256`

Le ZIP contient directement `manifest.json`, la licence GPL et une notice `SOURCE.md` à sa racine. Le code source correspondant complet est inclus dans `source/`, avec les scripts de construction et le fichier de verrouillage des dépendances. Aucun tag Git publié n’est nécessaire pour obtenir ces sources

## Développement

| Commande             | Effet                                                                   |
| -------------------- | ----------------------------------------------------------------------- |
| `pnpm assets`        | Génère les icônes PNG et les visuels du store depuis les SVG            |
| `pnpm format`        | Formate les fichiers suivis                                             |
| `pnpm lint`          | Analyse le code avec ESLint                                             |
| `pnpm typecheck`     | Vérifie TypeScript en mode strict                                       |
| `pnpm test`          | Exécute les tests Vitest avec JSDOM                                     |
| `pnpm test:coverage` | Exécute les tests avec la couverture V8 et ses seuils de non-régression |
| `pnpm build`         | Construit l’extension non empaquetée dans `dist/`                       |
| `pnpm package`       | Construit le ZIP et son checksum dans `release/`                        |
| `pnpm check`         | Exécute tous les contrôles et valide le paquet final                    |

## Structure du projet

```text
assets/                  Sources SVG et exports Chrome Web Store
journal/decisions/       Décisions d’architecture
scripts/                 Génération, build, empaquetage et validation
src/_locales/            Traductions Chrome anglaise et française
src/content/             Contrôleur DOM, styles et point d’entrée
src/manifest.json        Manifeste MV3 source
tests/                   Tests de parité fonctionnelle
```

`dist/` et `release/` sont générés et exclus de Git

## Périmètre actuel

TL;PR conserve les règles de repli par défaut et le format de stockage du userscript tout en affinant ses commandes de lecture. La fenêtre de réglages applique les changements aux conversations ouvertes sans rechargement. Il ne propose ni synchronisation entre appareils, ni prise en charge de GitHub Enterprise. Des fixtures automatisées couvrent des structures représentatives classiques, d’issues React, de la page Overview des pull requests et de revue, ainsi que le remplacement de nœuds DOM, le mode édition, la navigation SPA entre pages, le focus clavier, les contrôles intégrés, la sélection de texte et les liens vers les commentaires. La page Overview, en préversion publique GitHub depuis le 2026-11-05, nécessite un compte inscrit : sa fixture est reconstruite depuis le bundle public de la page GitHub, et le contrôleur a aussi été exécuté sur une pull request Overview réelle. Les structures classique et React ont été sondées sur des pages publiques réelles. Voir [ADR 006](./journal/decisions/006-github-overview-and-merge-proposals.md)

L’assistant optionnel lit les propositions affichées dans la conversation : une section « 🧾 Proposed merge commit » ou « 🧾 Merge commit body » avec un bloc de code, ou un commentaire composé d’un seul bloc ` ```git `. Lorsque le formulaire de confirmation de fusion GitHub est ouvert, en ligne ou dans la boîte de dialogue Overview, **Insérer le message proposé** remplit **Commit message** avec le sujet et **Extended description** avec le corps d’un message complet. Un modèle limité au corps conserve le titre GitHub et se place sous le titre de la PR. La proposition la plus récente est présélectionnée et chaque proposition reste sélectionnable avec un aperçu. Le texte saisi n’est remplacé qu’après une seconde confirmation, et **Annuler** restaure les deux champs. L’assistant ne peut pas vérifier un marqueur Markdown masqué depuis le HTML affiché, ne récupère aucune donnée d’API privée et ne soumet jamais le formulaire ni ne fusionne de pull request. Une évolution de GitHub hors de ces fixtures peut nécessiter une mise à jour

## Licence

TL;PR est distribué sous la [GNU General Public License v3.0 uniquement](./LICENSE). L’usage commercial est autorisé. Les versions dérivées distribuées doivent rester sous `GPL-3.0-only` et fournir leur code source correspondant

Copyright © 2026 contributeurs de x-quark

## Publication

Le guide [Publication sur le Chrome Web Store](./docs/publication-chrome-web-store.md) contient les textes de fiche, les déclarations de confidentialité, l’inventaire des visuels et la procédure de versionnement
