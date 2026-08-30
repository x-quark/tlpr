# Politique de confidentialité

[English](./PRIVACY.md) · **Français**

Date d’entrée en vigueur : 2026-08-30

## Périmètre

Cette politique s’applique à l’extension Chrome TL;PR publiée par x-quark

## Collecte de données

TL;PR ne collecte, ne transmet, ne vend, ne partage et ne traite à distance aucune donnée personnelle, historique de navigation, contenu GitHub, information d’authentification ou mesure d’usage

## Stockage local

TL;PR stocke uniquement les préférences d’interface nécessaires pour mémoriser l’état des commentaires et des chronologies. Ces préférences :

- restent sur l’appareil de l’utilisateur dans le stockage local associé à `github.com`
- sont indexées par le chemin de la page GitHub et les identifiants des commentaires GitHub
- utilisent la clé `gh-pr-comment-collapse:v3` pour rester compatibles avec le userscript d’origine
- ne sont jamais envoyées à x-quark ou à un tiers

L’utilisateur peut supprimer ces préférences en effaçant les données du site `github.com`

## Accès au site

TL;PR s’exécute uniquement sur les URL de pull requests et d’issues GitHub correspondant à :

- `https://github.com/*/*/pull/*`
- `https://github.com/*/*/issues/*`

L’extension lit et modifie la page affichée uniquement pour replier, déplier, masquer et révéler des éléments de conversation. Elle ne lit pas les jetons d’authentification GitHub, n’appelle pas l’API GitHub et n’effectue aucune requête réseau

## Tiers et code distant

TL;PR ne contient aucun SDK d’analyse, SDK publicitaire, service distant, code hébergé à distance ou sous-traitant de données

## Modifications

Toute modification substantielle de cette politique sera publiée dans ce dépôt avec la version correspondante de l’extension

## Contact

Les questions et demandes relatives à la confidentialité peuvent être ouvertes dans le [gestionnaire d’issues TL;PR](https://github.com/x-quark/tlpr/issues)
