# AGENTS.md

## Objet du dépôt

TL;PR est une extension Chrome Manifest V3 qui améliore la lecture des longues conversations de pull requests et d’issues GitHub. La première version doit conserver le comportement du userscript Tampermonkey fourni comme référence

## Contrat fonctionnel

- Exécuter le script uniquement sur `github.com/*/*/pull/*` et `github.com/*/*/issues/*`
- Replier par défaut les commentaires humains dont la hauteur dépasse `140px`
- Conserver les deux premiers et les trois derniers éléments d’une longue chronologie
- Ne jamais modifier les commentaires de bots ou les commentaires en cours d’édition
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

## Conventions

- Code, commentaires de code et commits en anglais
- TypeScript strict sans `any` implicite
- Chaînes visibles localisées dans `src/_locales/`
- Comportement DOM testable dans `src/content/controller.ts`
- Sources graphiques dans `assets/*.svg`
- Fichiers PNG générés par `pnpm assets`, jamais retouchés manuellement
- `dist/` et `release/` sont générés et ne doivent pas être versionnés
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
