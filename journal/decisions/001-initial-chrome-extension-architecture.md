# ADR 001 — Architecture initiale de l’extension Chrome

> Date : 2026-08-30
> Statut : accepté

## Contexte

Le prototype TL;PR existe sous forme de userscript Tampermonkey exécuté sur les pull requests et issues GitHub. Il replie les commentaires longs, masque le milieu des chronologies chargées et conserve l’état d’affichage dans `localStorage`

L’objectif initial est de livrer une extension Chrome publiable sans modifier le comportement utilisateur ni introduire de service distant

## Décision

- Utiliser Manifest V3 avec un script de contenu statique limité aux URL GitHub concernées
- Écrire le comportement en TypeScript strict et le regrouper en IIFE avec Vite
- Ne créer ni service worker, ni page de réglages, ni permission Chrome nommée tant qu’aucun besoin fonctionnel ne les justifie
- Conserver la clé `gh-pr-comment-collapse:v3` et le stockage local du site pour préserver les préférences du userscript
- Isoler les chaînes visibles dans les locales Chrome anglaise et française
- Maintenir les sources graphiques en SVG et générer les PNG exigés par Chrome avec Sharp
- Produire un ZIP déterministe avec checksum SHA-256
- Valider le comportement DOM avec Vitest et JSDOM
- Exécuter les mêmes contrôles en local et dans GitHub Actions
- Épingler les actions GitHub par SHA complet avec leur version vérifiée en commentaire
- Séparer le build de release en lecture seule du job de publication qui possède l’accès d’écriture

## Alternatives rejetées

### Copier directement le JavaScript du userscript

Cette option minimise le travail initial mais conserve un fichier monolithique difficile à tester et ne fournit aucun pipeline de publication reproductible

### Migrer vers `chrome.storage`

Cette option nécessite une permission supplémentaire et abandonne les préférences existantes enregistrées par Tampermonkey. Aucun besoin actuel ne justifie cette rupture

### Ajouter un framework d’interface et un popup

Le comportement est automatique et ne nécessite aucune configuration. Un framework ou un popup augmenterait la surface de maintenance sans valeur dans cette première version

### Charger du code ou des ressources à distance

Manifest V3 et les règles du Chrome Web Store interdisent le code exécuté à distance. TL;PR reste entièrement autonome et sans requête réseau

## Conséquences

- L’installation locale repose sur le dossier généré `dist/`
- Le paquet du store reste petit et auditable
- Les permissions et le contrat de confidentialité sont minimaux
- Les sélecteurs DOM restent dépendants de l’interface GitHub et devront évoluer si GitHub remplace sa structure
- Les préférences peuvent être supprimées en effaçant les données du site `github.com`
- Toute mise à jour d’une action GitHub exige de résoudre à nouveau son tag publié vers un SHA de commit

## Retour arrière

La PR peut être revertée sans migration distante. Le userscript Tampermonkey d’origine reste utilisable avec la même clé de stockage, à condition de ne pas l’activer simultanément avec l’extension
