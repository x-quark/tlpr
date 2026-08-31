# ADR 002 — Distribution publique et licence GPL-3.0-only

> Date : 2026-08-31
> Statut : accepté
> Issue : [#4](https://github.com/x-quark/tlpr/issues/4)

## Contexte

TL;PR doit être consultable publiquement afin de rendre son comportement auditable et de fournir au Chrome Web Store une politique de confidentialité accessible sans authentification

Le dépôt ne contient ni secret, ni code Atlas Labs, ni service distant. L’extension est une application autonome, pas une bibliothèque destinée à être intégrée dans un produit tiers

La licence doit autoriser l’usage et les contributions tout en empêchant la redistribution de dérivés propriétaires sans publication du code source correspondant

## Décision

- Publier le dépôt `x-quark/tlpr`
- Distribuer le code et les archives sous `GPL-3.0-only`
- Déclarer l’identifiant SPDX `GPL-3.0-only` dans `package.json`
- Inclure le texte complet de la GPL dans chaque ZIP publié
- Inclure une notice générée qui relie chaque ZIP au tag contenant son code source correspondant
- Utiliser le dépôt public comme page d’accueil et support de l’extension
- Utiliser `https://github.com/x-quark/tlpr/blob/main/PRIVACY.md` comme politique de confidentialité publique
- Utiliser le compte dédié `publisher@x-quark.com` pour la propriété et les communications du store
- Déclarer `Website content` et `Web history` comme données traitées localement, sans transmission
- Conserver `"private": true` dans `package.json` pour empêcher une publication npm accidentelle

## Alternatives rejetées

### MIT

MIT simplifie la réutilisation mais autorise un tiers à distribuer un fork propriétaire, y compris commercial, sans publier ses modifications. Ce résultat contredit l’objectif de conserver les dérivés distribués ouverts

### AGPL-3.0-only

AGPL ajoute une obligation de mise à disposition du code pour les versions utilisées via un réseau. TL;PR ne possède ni backend, ni service réseau, ni exécution distante. Cette obligation supplémentaire ne protège aucun flux actuel

### Licence interdisant l’usage commercial

Une restriction non commerciale empêcherait certains usages mais ne respecterait pas la définition open source, qui interdit la discrimination contre un domaine d’activité. Elle compliquerait aussi les contributions et la redistribution sans protéger mieux le code

### Aucun fichier de licence

L’absence de licence autorise la lecture publique du dépôt mais ne définit aucun droit clair de modification ou redistribution. Cette ambiguïté bloque les contributions légitimes sans empêcher la copie abusive

## Conséquences

- Les utilisateurs peuvent utiliser, étudier, modifier et redistribuer TL;PR, y compris commercialement
- Les versions dérivées distribuées doivent respecter la GPL et fournir leur code source correspondant
- Les modifications privées qui ne sont pas distribuées ne déclenchent pas d’obligation de publication
- Le ZIP Chrome contient désormais onze entrées au lieu de neuf
- La politique de confidentialité devient vérifiable sans compte GitHub
- La publication sur le Chrome Web Store reste soumise au compte éditeur, à la validation en deux étapes et à l’examen de Google

## Retour arrière

Le dépôt peut redevenir privé et une version future peut utiliser une autre licence si tous les détenteurs de droits concernés l’acceptent. Une copie déjà distribuée sous GPL-3.0-only conserve toutefois les droits accordés par cette licence ; ces droits ne peuvent pas être retirés rétroactivement

## Références

- [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html)
- [Résumé GPL-3.0 sur Choose a License](https://choosealicense.com/licenses/gpl-3.0/)
- [Open Source Definition](https://opensource.org/osd)
- [Champs de confidentialité du Chrome Web Store](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
