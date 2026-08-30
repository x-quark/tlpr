# TL;PR

[English](./README.md) · **Français**

<img src="./assets/icon.svg" alt="Icône TL;PR" width="96" height="96">

**TL;PR** rend les longues conversations des pull requests et issues GitHub plus faciles à lire. Il replie les commentaires longs, condense le milieu des chronologies chargées et garde les contrôles utiles à portée de main

## Pourquoi

Les longues revues GitHub deviennent difficiles à parcourir quand les réponses, événements automatiques et blocs Markdown s’accumulent. TL;PR réduit ce bruit visuel sans supprimer ni modifier le contenu GitHub

## Fonctionnalités

- Replie automatiquement les commentaires humains de plus de `140px`
- Conserve les deux premiers et les trois derniers éléments d’une longue chronologie
- Déplie le milieu masqué à la demande
- Ajoute des contrôles pour replier ou déplier tous les commentaires humains
- Conserve l’état par page avec la clé existante `gh-pr-comment-collapse:v3`
- Ignore les commentaires de bots et les commentaires en cours d’édition
- Fonctionne sur les pull requests et les issues GitHub
- Fournit les interfaces anglaise et française

## Confidentialité et permissions

TL;PR ne collecte et ne transmet aucune donnée. Il ne contient ni télémétrie, ni analyse d’usage, ni service distant, ni code hébergé à distance

L’extension ne demande aucune permission Chrome nommée. Son script de contenu est limité aux URL suivantes :

- `https://github.com/*/*/pull/*`
- `https://github.com/*/*/issues/*`

Les préférences d’affichage restent dans le stockage local du site GitHub afin de préserver la compatibilité avec le userscript d’origine. Consultez la [politique de confidentialité](./PRIVACY.fr.md) pour le contrat complet

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

- `release/tlpr-v0.1.0.zip`
- `release/tlpr-v0.1.0.zip.sha256`

Le ZIP contient directement `manifest.json` à sa racine et peut être chargé sur le Chrome Web Store

## Développement

| Commande         | Effet                                                        |
| ---------------- | ------------------------------------------------------------ |
| `pnpm assets`    | Génère les icônes PNG et les visuels du store depuis les SVG |
| `pnpm format`    | Formate les fichiers suivis                                  |
| `pnpm lint`      | Analyse le code avec ESLint                                  |
| `pnpm typecheck` | Vérifie TypeScript en mode strict                            |
| `pnpm test`      | Exécute les tests Vitest avec JSDOM                          |
| `pnpm build`     | Construit l’extension non empaquetée dans `dist/`            |
| `pnpm package`   | Construit le ZIP et son checksum dans `release/`             |
| `pnpm check`     | Exécute tous les contrôles et valide le paquet final         |

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

La version initiale reproduit volontairement le comportement du userscript. Elle ne propose ni page de réglages, ni synchronisation entre appareils, ni prise en charge de GitHub Enterprise. Les sélecteurs DOM dépendent de l’interface GitHub et sont couverts par des fixtures automatisées, mais une modification majeure de GitHub peut nécessiter une mise à jour

## Publication

Le guide [Publication sur le Chrome Web Store](./docs/publication-chrome-web-store.md) contient les textes de fiche, les déclarations de confidentialité, l’inventaire des visuels et la procédure de versionnement
