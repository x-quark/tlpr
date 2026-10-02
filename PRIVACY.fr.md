# Politique de confidentialité

[English](./PRIVACY.md) · **Français**

Date d’entrée en vigueur : 2026-08-30

Dernière mise à jour : 2026-09-30

## Périmètre

Cette politique s’applique à l’extension Chrome TL;PR publiée par x-quark

## Traitement des données

TL;PR traite localement deux catégories de données utilisateur du Chrome Web Store sur l’appareil de l’utilisateur :

- **Contenu de sites web :** les commentaires et éléments de chronologie GitHub affichés sont lus pour déterminer ce qui doit être replié et fournir les contrôles visibles. L’assistant optionnel lit également le titre de la pull request et un modèle affiché explicitement choisi dans un aperçu local. Leur contenu n’est pas enregistré par l’extension
- **Historique web :** le chemin de chaque pull request ou issue GitHub est stocké localement comme clé de ses préférences d’interface

TL;PR ne transmet, ne vend, ne partage et ne traite à distance aucune de ces informations. Il ne collecte aucune information d’authentification, donnée personnelle destinée au profilage ou mesure d’usage

## Limitation de la finalité

TL;PR utilise le contenu des conversations GitHub affichées uniquement sur l’appareil de l’utilisateur et uniquement pour fournir ses commandes locales de lecture et l’assistant de préparation et de copie explicitement activé. Il n’utilise pas ce contenu à des fins publicitaires, analytiques, de profilage ou sans rapport avec cette finalité

L’utilisation par TL;PR des informations provenant des pages GitHub respecte la [politique relative aux données utilisateur du Chrome Web Store](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), notamment ses exigences d’usage limité

## Stockage local

TL;PR stocke uniquement les préférences d’interface nécessaires pour mémoriser l’état des commentaires et des chronologies. Ces préférences :

- restent sur l’appareil de l’utilisateur dans le stockage local associé à `github.com`
- sont indexées par le chemin de la page GitHub et les identifiants des commentaires GitHub
- utilisent la clé `gh-pr-comment-collapse:v3` pour rester compatibles avec le userscript d’origine
- ne sont jamais envoyées à x-quark ou à un tiers

L’utilisateur peut supprimer ces préférences de repli en effaçant les données du site `github.com`

La permission `storage` mémorise également uniquement l’activation, la langue, les animations, les couleurs d’état et l’assistant optionnel dans `chrome.storage.local`, sous la clé `tlpr-settings:v1`. Ces réglages ne sont pas synchronisés. Désinstaller TL;PR supprime ce stockage de l’extension

L’assistant est désactivé par défaut. Le texte préparé existe uniquement dans l’aperçu ouvert. Un clic explicite sur Copier transfère ce texte dans le presse-papiers de l’appareil, géré par le système d’exploitation et potentiellement accessible à d’autres applications. TL;PR n’enregistre, n’envoie et ne soumet pas ce message

## Accès au site

TL;PR s’exécute uniquement sur les URL de pull requests et d’issues GitHub correspondant à :

- `https://github.com/*/*/pull/*`
- `https://github.com/*/*/issues/*`

L’extension lit et modifie la page affichée pour replier, déplier, masquer et révéler des éléments de conversation, et fournir l’assistant optionnel de préparation et de copie déclenché par l’utilisateur. Elle ne lit pas les jetons d’authentification GitHub, n’appelle pas l’API GitHub et n’effectue aucune requête réseau

## Tiers et code distant

TL;PR ne contient aucun SDK d’analyse, SDK publicitaire, service distant, code hébergé à distance ou sous-traitant de données

## Modifications

Toute modification substantielle de cette politique sera publiée dans ce dépôt avec la version correspondante de l’extension

## Contact

Les questions et demandes relatives à la confidentialité peuvent être envoyées à [publisher@x-quark.com](mailto:publisher@x-quark.com) ou ouvertes dans le [gestionnaire d’issues TL;PR](https://github.com/x-quark/tlpr/issues)
