# AGENTS.md

## Objet du dépôt

TL;PR est une extension Chrome Manifest V3 qui améliore la lecture des longues conversations de pull requests et d’issues GitHub. La première version doit conserver le comportement du userscript Tampermonkey fourni comme référence

## Contrat fonctionnel

- Exception ciblée autorisée le 21 octobre 2026 (ADR 005) : charger un bootstrap sur `https://github.com/*`, limité hors conversations à la lecture de l’URL et à l’écoute de navigation ; aucune lecture du contenu, modification DOM, collecte ou transmission hors PR/issues numériques
- Activer les contrôles, styles, observateurs et stockage de conversation uniquement sur les routes numériques de PR/issues prises en charge ; aucun autre site ni permission API nommée supplémentaire
- Prendre en charge la conversation classique, la page Overview des pull requests (préversion GitHub du 5 novembre 2026) et la vue React des issues, sans jamais modifier la préférence de compte GitHub (ADR 006)
- Replier par défaut les commentaires humains dont la hauteur dépasse `140px`
- Conserver les deux premiers et les trois derniers éléments d’une longue chronologie, dans l’ordre chronologique même quand GitHub affiche les plus récents en premier
- Ne jamais modifier les commentaires de bots (applications GitHub, libellé « Bot » ou suffixe `[bot]`) ou les commentaires en cours d’édition
- Conserver la clé de stockage `gh-pr-comment-collapse:v3` pour la compatibilité avec le userscript
- Ne collecter, transmettre ou analyser aucune donnée
- Ne pas ajouter de permission Chrome nommée sans ADR et justification produit explicite

## Outils

Utiliser exclusivement `pnpm`

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm package
pnpm check
```

Publier une version validée avec `pnpm webstore publish`, en suivant le skill `.claude/skills/publish-chrome-web-store` et `docs/publication-chrome-web-store.md`. Les identifiants du Chrome Web Store restent hors du dépôt et ne sont jamais affichés

## Conventions

- Code, commentaires de code et commits en anglais
- TypeScript strict sans `any` implicite
- Chaînes visibles localisées dans `src/_locales/`
- Comportement DOM testable dans `src/content/controller.ts`
- Sources graphiques dans `assets/*.svg`
- Fichiers PNG générés par `pnpm assets`, jamais retouchés manuellement
- `dist/` et `release/` sont générés et ne doivent pas être versionnés
- Outils de publication dans `tools/`, hors du paquet de l’extension et de ses sources embarquées
- `README.md` anglais canonique et `README.fr.md` français avec structure strictement alignée
- Actions GitHub épinglées par SHA complet avec la version vérifiée en commentaire

## Scopes de commit

Les scopes établis sont `extension`, `assets`, `docs`, `ci` et `release`

## Validation avant PR

1. Exécuter `pnpm check`
2. Exécuter `git diff --check`
3. Scanner le diff pour les secrets et le code distant
4. Vérifier que le ZIP contient `manifest.json` à sa racine
5. Vérifier les dimensions PNG 16, 32, 48 et 128
6. Vérifier la parité structurelle des README anglais et français
