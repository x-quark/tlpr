# Publication sur le Chrome Web Store

## Préparation vérifiée par le dépôt

```bash
pnpm install --frozen-lockfile
pnpm check
```

La commande produit et valide :

- `release/tlpr-v0.1.0.zip`
- `release/tlpr-v0.1.0.zip.sha256`
- les icônes PNG 16, 32, 48 et 128 dans le paquet
- les traductions anglaise et française
- le manifeste MV3 sans permission Chrome nommée

## Visuels disponibles

| Usage                          | Source                                       | Export                                                        |
| ------------------------------ | -------------------------------------------- | ------------------------------------------------------------- |
| Icône principale               | `assets/icon.svg`                            | `assets/generated/icon-128.png`                               |
| Icônes de barre                | `assets/icon-small.svg`                      | `assets/generated/icon-16.png` et `icon-32.png`               |
| Petite vignette promotionnelle | `assets/store/small-promo.svg`               | `assets/generated/store-small-promo-440x280.png`              |
| Bannière Marquee               | `assets/store/marquee.svg`                   | `assets/generated/store-marquee-1400x560.png`                 |
| Capture des commentaires       | Page GitHub réelle avec TL;PR actif          | `assets/store/screenshots/tlpr-comment-folding-1280x800.png`  |
| Capture de la chronologie      | Résumé TL;PR réel avec compteur et contrôles | `assets/store/screenshots/tlpr-timeline-folding-1280x800.png` |

Chrome n’accepte pas les SVG comme icônes du manifeste. Les SVG restent les sources de vérité et `pnpm assets` régénère les PNG attendus

## Textes de fiche

### Anglais

**Nom**

> TL;PR

**Résumé court**

> Make long GitHub pull request and issue conversations easier to read

**Description détaillée**

> TL;PR reduces visual noise in long GitHub pull request and issue conversations without changing their content
>
> Long human comments collapse automatically and remain expandable with one click. When a timeline becomes crowded, TL;PR keeps the first two and last three items visible while folding the middle behind a compact summary. Dedicated controls can collapse or expand every human comment on the page
>
> Bot comments and comments being edited are left untouched. Display preferences remain on the device and are stored per GitHub page. TL;PR contains no analytics, telemetry, remote service, or remotely hosted code

### Français

**Nom**

> TL;PR

**Résumé court**

> Rend les longues conversations des pull requests et issues GitHub plus faciles à lire

**Description détaillée**

> TL;PR réduit le bruit visuel des longues conversations de pull requests et d’issues GitHub sans modifier leur contenu
>
> Les commentaires humains longs sont automatiquement repliés et restent dépliables en un clic. Lorsqu’une chronologie devient chargée, TL;PR conserve les deux premiers et les trois derniers éléments visibles et replie le milieu derrière un résumé compact. Des contrôles dédiés permettent de replier ou déplier tous les commentaires humains de la page
>
> Les commentaires de bots et les commentaires en cours d’édition restent intacts. Les préférences d’affichage restent sur l’appareil et sont stockées par page GitHub. TL;PR ne contient ni analyse d’usage, ni télémétrie, ni service distant, ni code hébergé à distance

## Déclarations de confidentialité

- Finalité unique : amélioration de la lisibilité des conversations GitHub
- Données collectées : aucune
- Données vendues ou partagées : aucune
- Analyse d’usage : aucune
- Code distant : aucun
- Requêtes réseau propres à l’extension : aucune
- Permission nommée : aucune
- Accès hôte : pages de pull requests et d’issues sur `github.com`
- Politique : [`PRIVACY.md`](../PRIVACY.md)

Le compte éditeur doit fournir une URL publiquement accessible vers la politique avant la soumission. Le dépôt est actuellement privé, donc le fichier doit être exposé sur une URL publique contrôlée par x-quark avant publication

## Justification de l’accès au site

> TL;PR needs access to GitHub pull request and issue pages to identify rendered conversation elements and add local collapse and expand controls. The extension does not access other websites, call the GitHub API, or transmit page content

## Procédure de soumission

1. Exécuter `pnpm check` sur le commit à publier
2. Vérifier le checksum du ZIP
3. Créer le tag `v<version>` après merge sur `main`
4. Attendre la GitHub Release produite par `.github/workflows/release.yml`
5. Charger le ZIP de la release dans le tableau de bord Chrome Web Store
6. Ajouter les textes anglais et français
7. Ajouter l’icône, la petite vignette, la bannière et la capture réelle
8. Déclarer l’accès à `github.com` avec la justification ci-dessus
9. Déclarer qu’aucune donnée utilisateur n’est collectée ou transmise
10. Fournir l’URL publique de la politique de confidentialité
11. Soumettre la version pour examen

## Vérification manuelle avant soumission

- Charger `dist/` depuis `chrome://extensions`
- Désactiver le userscript Tampermonkey équivalent
- Vérifier une pull request avec plus de cinq éléments de chronologie
- Vérifier une issue avec plus de cinq éléments de chronologie
- Vérifier les thèmes GitHub clair et sombre
- Vérifier l’interface Chrome en anglais et en français
- Vérifier qu’un commentaire de bot et un commentaire en édition restent intacts
- Vérifier qu’aucune requête réseau n’est initiée par TL;PR

## Références officielles

- [Manifeste des scripts de contenu](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts)
- [Icônes d’extension](https://developer.chrome.com/docs/extensions/reference/manifest/icons)
- [Visuels du Chrome Web Store](https://developer.chrome.com/docs/webstore/images)
- [Sécurité Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security)
