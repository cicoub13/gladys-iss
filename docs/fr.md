# ISS Overhead

> **Nécessite Gladys 5.1 ou supérieur.** Le widget de dashboard et le
> déclencheur/action de scène dont cette intégration est faite sont livrés
> avec Gladys 5.1 ; sur une version antérieure, elle ne peut pas être
> installée.

Prédit les prochains passages visibles de la Station Spatiale Internationale
au-dessus de votre maison, les affiche sur un widget de dashboard, et peut
déclencher une scène juste avant qu'un passage commence — parfait pour une
automatisation "va voir dehors".

## Ce qui est affiché

Le widget **Passages ISS** affiche :

- une photo de la station, et dans combien de temps aura lieu le prochain
  passage, avec son élévation maximale ;
- les prochains passages, avec leur heure, leur durée et la direction depuis
  laquelle l'ISS se lève ;
- si l'ISS est visible ce soir, et si les données orbitales utilisées pour le
  calcul sont à jour.

Un passage n'est affiché comme visible que si l'ISS est au-dessus de
l'horizon, que votre maison est dans le noir, et que l'ISS elle-même est
encore éclairée par le soleil — les conditions qui en font une "étoile"
brillante et rapide dans le ciel du soir ou du petit matin.

## Automatisations

- **Déclencheur « Passage ISS en cours de démarrage »** — se déclenche peu
  avant le début d'un passage visible. Filtrable par direction de lever.
  Utile pour une notification "regarde le ciel !", ou pour éteindre un
  éclairage extérieur qui gênerait l'observation.
- **Action « Obtenir le prochain passage ISS »** — récupère le prochain
  passage prédit à la demande, pour une scène qui veut l'annoncer (message
  vocal, par exemple) plutôt que réagir à son démarrage.

Les deux exposent le passage sous forme de variables. Pour un message,
préférez celles prêtes à lire, écrites dans la **Langue des scènes** de la
configuration et à l'heure locale : `start_date` (ex. « lundi 28 septembre »),
`start_hour` (ex. « 19:49 ») et `direction_name` (ex. « ouest »). `direction`
(code cardinal, ex. « W ») reste disponible pour les scènes qui le comparent. Par exemple « L'ISS passe
_start_date_ à _start_hour_, direction _direction_name_. » donne « L'ISS passe
lundi 28 septembre à 19:49, direction ouest. », aussi bien pour une
notification que pour un message vocal.

## Configuration

| Clé                     | Défaut    | Description                                                                                         |
| ----------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| Élévation minimale      | 10°       | Les passages ne dépassant jamais cette élévation sont ignorés.                                      |
| Fenêtre de prédiction   | 5 jours   | Sur combien de jours prédire les passages (3, 5 ou 7).                                              |
| Anticipation des scènes | 5 minutes | Combien de temps avant un passage le déclencheur « Passage ISS en cours de démarrage » part (≤ 60). |
| Langue des scènes       | Français  | Langue de la date, de l'heure et de la direction transmises aux scènes.                             |

L'intégration a besoin de la localisation de votre maison, accordée
automatiquement à l'installation (aucune adresse à saisir).

## Aucune clé API nécessaire

Les données orbitales (TLE) sont récupérées sur [Celestrak](https://celestrak.org/),
une source publique gratuite — rien à créer comme compte.
