# Publication sur le Chrome Web Store

## Préparation vérifiée par le dépôt

```bash
pnpm install --frozen-lockfile
pnpm check
```

La commande produit et valide :

- `release/tlpr-v0.3.2.zip`
- `release/tlpr-v0.3.2.zip.sha256`
- les icônes PNG 16, 32, 48 et 128 dans le paquet
- les traductions anglaise et française
- le texte complet de la licence `GPL-3.0-only`
- une notice `SOURCE.md` et les sources correspondantes complètes dans `source/`
- le manifeste MV3 avec uniquement la permission `storage`, justifiée par ADR 003

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
> Long human comments collapse automatically and remain expandable with one click. When a timeline becomes crowded, TL;PR keeps the first two and last three items visible while folding the middle behind a compact summary. Dedicated controls can collapse or expand every human comment on the page. TL;PR works with the classic conversation and the new pull request Overview page, and keeps the timeline in chronological order even when GitHub lists the newest comments first
>
> Bot comments and comments being edited are left untouched. TL;PR processes rendered GitHub conversation content and page paths only on the user’s device. Display preferences remain on the device and are stored per GitHub page. TL;PR never transmits this information and contains no analytics, telemetry, remote service, or remotely hosted code

### Français

**Nom**

> TL;PR

**Résumé court**

> Rend les longues conversations des pull requests et issues GitHub plus faciles à lire

**Description détaillée**

> TL;PR réduit le bruit visuel des longues conversations de pull requests et d’issues GitHub sans modifier leur contenu
>
> Les commentaires humains longs sont automatiquement repliés et restent dépliables en un clic. Lorsqu’une chronologie devient chargée, TL;PR conserve les deux premiers et les trois derniers éléments visibles et replie le milieu derrière un résumé compact. Des contrôles dédiés permettent de replier ou déplier tous les commentaires humains de la page. TL;PR fonctionne avec la conversation classique et la nouvelle page Overview des pull requests, et respecte l’ordre chronologique même quand GitHub affiche les commentaires les plus récents en premier
>
> Les commentaires de bots et les commentaires en cours d’édition restent intacts. TL;PR traite le contenu des conversations GitHub affichées et les chemins des pages uniquement sur l’appareil de l’utilisateur. Les préférences d’affichage restent sur l’appareil et sont stockées par page GitHub. TL;PR ne transmet jamais ces informations et ne contient ni analyse d’usage, ni télémétrie, ni service distant, ni code hébergé à distance

## Déclarations de confidentialité

- Finalité unique : `TL;PR improves the readability of GitHub pull request and issue conversations by locally collapsing long human comments and the middle of crowded timelines.`
- Données traitées localement : `Website content` et `Web history`
- Données transmises hors de l’appareil : aucune
- Données vendues ou partagées : aucune
- Analyse d’usage : aucune
- Code distant : aucun
- Requêtes réseau propres à l’extension : aucune
- Permission nommée : `storage`, uniquement pour les six préférences locales de la fenêtre de réglages (activation, langue, vue GitHub, animations, couleurs d’état et assistant optionnel)
- Accès hôte : pages de pull requests et d’issues sur `github.com`
- Code distant : sélectionner **No, I am not using remote code**
- Politique publique : `https://github.com/x-quark/tlpr/blob/main/PRIVACY.md`

Le dépôt et la politique de confidentialité sont accessibles publiquement sans authentification

## Configuration de la fiche

- Langue principale : `English`
- Catégorie principale : `Developer Tools`
- Nom de l’éditeur : `x-quark`
- Adresse du compte et de contact : `publisher@x-quark.com`
- Visibilité : publique
- Régions : toutes les régions disponibles
- Contenu mature : non
- Publication après examen : automatique, sans publication différée
- URL de la page d’accueil : `https://github.com/x-quark/tlpr`
- URL d’assistance : `https://github.com/x-quark/tlpr/issues`
- URL officielle : laisser vide tant qu’aucun domaine x-quark n’est vérifié dans Google Search Console

## Instructions de test pour l’équipe Chrome

> No credentials are required. Install the extension, then open https://github.com/microsoft/vscode/pull/226735. Long human comments should collapse automatically. The middle of the timeline should collapse while the first two and last three items remain visible. Bot comments remain unchanged. Use the injected controls to expand and collapse comments and timeline items.

Le compte éditeur doit être enregistré et utiliser un compte Google protégé par la validation en deux étapes avant de publier ou mettre à jour l’extension

## Justification de l’accès au site

> TL;PR needs access to GitHub pull request and issue pages to identify rendered conversation elements and add local collapse and expand controls. The extension does not access other websites, call the GitHub API, or transmit page content

## Procédure de soumission

1. Incrémenter la version dans `package.json`, puis exécuter `pnpm check` localement
2. Vérifier le checksum du ZIP et les sources incluses, identiques aux entrées de construction
3. Ne déclencher aucune GitHub Action : pas de push sur `main`, de PR ni de tag tant qu’un chemin de publication sans CI n’est pas validé
4. Vérifier les permissions, les interactions réelles et la politique de confidentialité publique à jour
5. Exécuter `pnpm webstore publish --dry-run`, puis `pnpm webstore publish` (voir [Publication par l’API](#publication-par-lapi)). À défaut, ouvrir l’élément existant `ejclfjeilcfnjdocgnmloilcaocelgnp`, onglet Package, puis charger `release/tlpr-v0.3.2.zip` avec « Importer un nouveau package » ; ne jamais créer un nouvel élément
6. Ajouter les textes anglais et français
7. Ajouter l’icône, la petite vignette, la bannière et la capture réelle
8. Déclarer l’accès à `github.com` avec la justification ci-dessus
9. Sélectionner les catégories `Website content` et `Web history`, toutes deux traitées uniquement sur l’appareil
10. Certifier les déclarations d’usage limité demandées par Chrome
11. Fournir l’URL publique de la politique de confidentialité
12. Copier les instructions de test ci-dessus sans fournir d’identifiants
13. Soumettre la version pour examen ; `pnpm webstore publish` le fait directement

Les étapes 6 à 12 ne concernent que le tableau de bord : elles ne sont à refaire que si la fiche, les visuels, les permissions ou les déclarations changent

## Publication par l’API

La commande `pnpm webstore` utilise l’[API Chrome Web Store v2](https://developer.chrome.com/docs/webstore/using-api) avec le compte éditeur. Elle se trouve dans `tools/`, hors du paquet de l’extension et de ses sources embarquées, et ne passe par aucune GitHub Action

### Configuration unique

1. Dans Google Cloud, avec le compte éditeur, créer un projet sans facturation et activer **Chrome Web Store API**
2. Dans Google Auth Platform, configurer une application **Externe** avec la page d’accueil `https://github.com/x-quark/tlpr`, la politique `https://github.com/x-quark/tlpr/blob/main/PRIVACY.md` et le domaine autorisé `github.com`, puis la passer **En production** pour que l’autorisation n’expire pas au bout de 7 jours
3. Créer un client OAuth de type **Application de bureau** et copier son identifiant et son code secret dans le fichier d’identifiants
4. Exécuter `pnpm webstore login`, ouvrir l’adresse affichée, choisir le compte éditeur et autoriser l’accès. L’écran « Google n’a pas validé cette application » est attendu pour cet outil personnel
5. Copier l’ID éditeur affiché dans **Publisher > Settings** du tableau de bord développeur dans `publisherId`

Le fichier d’identifiants est `%APPDATA%\x-quark\chrome-web-store.json` sous Windows et `~/.config/x-quark/chrome-web-store.json` ailleurs, ou le chemin donné par `CWS_CREDENTIALS_FILE`. Les variables `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` et `CWS_PUBLISHER_ID` le remplacent champ par champ

```json
{
  "clientId": "…apps.googleusercontent.com",
  "clientSecret": "…",
  "refreshToken": "écrit par pnpm webstore login",
  "publisherId": "…"
}
```

Ce fichier ne doit jamais être versionné ni affiché. L’accès se révoque depuis le compte Google, rubrique Sécurité, ou en supprimant le client OAuth. Une autorisation inutilisée pendant 6 mois expire : relancer `pnpm webstore login`

### Commandes

| Commande                          | Effet                                                                       |
| --------------------------------- | --------------------------------------------------------------------------- |
| `pnpm webstore status`            | Affiche les versions publiée et soumise                                     |
| `pnpm webstore publish --dry-run` | Vérifie identifiants, ZIP, checksum et état du store sans rien modifier     |
| `pnpm webstore publish`           | Envoie `release/tlpr-v<version>.zip` puis le soumet à l’examen              |
| `pnpm webstore cancel`            | Annule la soumission en attente d’examen                                    |
| `pnpm webstore submit --staged`   | Soumet le brouillon en gardant la version approuvée en attente de diffusion |

La commande refuse un ZIP sans `manifest.json` à la racine, un checksum différent du fichier `.sha256`, une version qui n’est pas supérieure à celles connues du store et une soumission déjà en attente d’examen

L’API ne modifie ni la fiche, ni les visuels, ni l’onglet Confidentialité : ces changements se font dans le tableau de bord, depuis un navigateur complet

## Vérification manuelle avant soumission

- Charger `dist/` depuis `chrome://extensions`
- Désactiver le userscript Tampermonkey équivalent
- Vérifier une pull request avec plus de cinq éléments de chronologie
- Vérifier une issue avec plus de cinq éléments de chronologie
- Vérifier une pull request en vue Overview (préversion GitHub) puis en vue classique avec `?overview=false`
- Vérifier l’insertion du message de fusion proposé dans un formulaire de fusion, sans confirmer la fusion
- Vérifier les thèmes GitHub clair et sombre
- Vérifier l’interface Chrome en anglais et en français
- Vérifier qu’un commentaire de bot et un commentaire en édition restent intacts
- Vérifier qu’aucune requête réseau n’est initiée par TL;PR

## Références officielles

- [Manifeste des scripts de contenu](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts)
- [Icônes d’extension](https://developer.chrome.com/docs/extensions/reference/manifest/icons)
- [Visuels du Chrome Web Store](https://developer.chrome.com/docs/webstore/images)
- [Sécurité Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security)
- [Publication d’un élément](https://developer.chrome.com/docs/webstore/register/)
- [Champs de confidentialité](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Informations de la fiche](https://developer.chrome.com/docs/webstore/publish)
- [API Chrome Web Store et validation en deux étapes](https://developer.chrome.com/docs/webstore/using-api)
