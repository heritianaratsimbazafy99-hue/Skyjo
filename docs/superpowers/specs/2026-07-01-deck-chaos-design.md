# Deck Chaos Design

## Objectif

Ajouter un mode optionnel "Deck Chaos" a Skyjo Score Arena pour rendre les manches plus imprevisibles, droles et strategiques. Le mode doit rester adapte a la webapp : les effets qui touchent aux scores sont calcules par l'application, les defis de table sont affiches clairement, et chaque modification est conservee dans l'historique.

Le design valide est : Deck Chaos avec intensite Extreme, revelation mixte avant/apres manche, et quelques regles adaptatives basees sur le classement.

## Principes

- Le mode Deck Chaos est desactive par defaut pour conserver le comportement Skyjo actuel.
- Quand le mode est actif, une carte chaos est associee a chaque manche.
- Certaines cartes sont revelees avant la manche, d'autres seulement apres validation.
- Les effets automatiques sont appliques apres les scores Skyjo normaux et apres la penalite officielle du joueur qui ferme.
- Les effets manuels sont presentes comme des contraintes de table, mais ne demandent pas de formulaire complexe dans la premiere version.
- L'application doit toujours expliquer les transformations de score, meme quand l'effet est volontairement injuste.
- Une meme carte ne doit pas sortir deux manches de suite.
- Les cartes tres rares ne doivent pas sortir plus d'une fois dans une partie.

## Etat De Partie

Ajouter les informations suivantes a l'etat de partie persistant :

- `chaosMode.enabled` : active ou desactive Deck Chaos.
- `chaosMode.intensity` : valeur initiale `extreme`.
- `chaosMode.revealMode` : valeur initiale `mixed`.
- `chaosMode.usedRareCardIds` : cartes tres rares deja jouees dans la partie.
- `activeChaosCard` : carte de la manche en cours, avec ses cibles resolues si besoin.

Chaque manche validee conserve aussi :

- `round.chaos.cardId`
- `round.chaos.title`
- `round.chaos.timing`
- `round.chaos.category`
- `round.chaos.description`
- `round.chaos.revealedBeforeSubmit`
- `round.chaos.targets`
- `round.chaos.effects`
- `round.chaos.scoreSteps`

`scoreSteps` doit permettre d'afficher une explication lisible du type : `18 -> 36 penalite fermeture -> 41 fermeture kamikaze`.

## Architecture

Le mode doit etre implemente comme un petit moteur de regles, pas comme du texte eparpille dans l'UI.

Creer un module partage entre le client et le serveur pour eviter de dupliquer les 36 effets dans `app.js` et `server.js`. Le module doit exposer :

- le catalogue de cartes chaos ;
- une fonction de selection ponderee ;
- une fonction de resolution des cibles ;
- une fonction d'application des effets ;
- des helpers de classement et d'analyse de manche.

Le calcul d'une manche suit toujours cet ordre :

1. scores bruts saisis par les joueurs ;
2. penalite officielle Skyjo, si active ;
3. effets Deck Chaos ;
4. score final enregistre ;
5. explication sauvegardee dans l'historique.

Le moteur doit retourner des donnees pures, sans modifier directement le DOM :

- `adjustedScores`
- `chaosAdjustedScores`
- `effects`
- `scoreSteps`
- `usedRareCardIds`

## Catalogue De Cartes

Le deck initial contient 36 cartes. Les cartes peuvent etre communes, rares ou tres rares. Les cartes tres rares sortent avec une probabilite basse et une seule fois par partie.

### Cartes Avant Manche

1. **Fermeture piegee** : si le joueur qui ferme n'est pas seul meilleur score de manche, son score positif est triple au lieu d'etre double.
2. **Dernier souffle** : le dernier au classement avant la manche retire 15 points s'il fait la meilleure manche.
3. **Chasse au leader** : si le leader ne finit pas dans les deux meilleurs scores de manche, il prend +10.
4. **Zero heroique** : tout joueur qui termine la manche a 0 marque -10.
5. **Interdit de fermer** : un joueur tire au hasard prend +20 s'il ferme cette manche.
6. **Mini-manche nucleaire** : les scores positifs entre 1 et 10 deviennent 0 ; les scores au-dessus de 25 prennent +10.
7. **Tout ou rien** : le meilleur score de manche gagne -8 ; le pire score prend +8.
8. **Annonce sous pression** : defi manuel, le joueur qui ferme doit etre choisi dans l'app avant de saisir les scores.

### Cartes Apres Manche

9. **Score miroir** : deux joueurs tires au hasard echangent leurs scores finaux de manche.
10. **La taxe du pire** : le pire score de manche prend +12.
11. **Hold-up** : le meilleur score de manche prend -8 et le pire prend +8.
12. **Egalite explosive** : si au moins deux joueurs ont le meme score de manche, chacun prend +5.
13. **Remboursement surprise** : un joueur tire au hasard retire 10 points, sauf s'il est deja premier au classement.
14. **Double fond** : le deuxieme meilleur score de manche retire 12 points.
15. **Retour de flamme** : si le joueur qui ferme a pris la penalite officielle, le meilleur adversaire retire 10 points.
16. **Derniere place protegee** : si le dernier au classement prend le pire score de manche, son malus chaos est annule une fois.

### Cartes Adaptatives

17. **Couronne lourde** : le leader commence la manche avec un handicap automatique de +7.
18. **Sous-marin** : le joueur le plus proche du leader sans etre premier retire 5 s'il bat le leader sur la manche.
19. **Rattrapage brutal** : si l'ecart entre le premier et le dernier depasse 50, le dernier retire 20 sur cette manche.
20. **Anti-domination** : si le meme joueur a gagne les deux dernieres manches, il prend +10 sur cette manche.

### Cartes Tres Rares

21. **Inversion totale** : apres calcul, le meilleur score de manche devient le pire score de manche, et inversement.
22. **Banque cassee** : tous les scores chaos sont divises par deux, arrondis vers le bas.
23. **Jackpot noir** : un joueur tire au hasard double son score de manche, y compris si le score est negatif.
24. **Reset de panique** : le pire score de manche est remplace par la moyenne arrondie des autres scores.

### Cartes Plus Violentes

25. **Dette instantanee** : le pire score de manche prend +20 ; s'il est aussi le joueur qui ferme, il prend encore +10.
26. **Leader en surtension** : le leader double son score de manche s'il finit pire que la moyenne des autres joueurs.
27. **Erreur fatale** : tout score superieur ou egal a 30 recoit +15.
28. **Fermeture kamikaze** : si le joueur qui ferme n'est pas strictement meilleur, son score est triple puis +5 est ajoute.

### Cartes Plus Droles

29. **Le banquier a glisse** : un joueur tire au hasard recoit -10 ou +10, tire aleatoirement par l'app apres la manche.
30. **Justice approximative** : l'app tire un joueur au hasard ; son score est remplace par la moyenne arrondie de la table.
31. **Applaudissements obligatoires** : defi manuel, le joueur avec la meilleure manche choisit quelqu'un qui doit annoncer son score avec respect.
32. **Mauvaise foi officielle** : defi manuel, avant la saisie chaque joueur annonce s'il pense finir meilleur que le leader. Les joueurs qui reussissent retirent 5 ; ceux qui ratent prennent +5. Dans la premiere version, l'app affiche la contrainte sans appliquer automatiquement l'effet.

### Cartes Plus Strategiques

33. **Pari de fermeture** : defi manuel, avant la manche chaque joueur peut declarer "je ferme". Dans la premiere version, l'app affiche le defi sans saisir les paris. L'application automatique de -15 si le pari reussit et +20 s'il rate est hors scope.
34. **Assurance anti-catastrophe** : defi manuel, un joueur peut accepter +5 quoi qu'il arrive pour plafonner son score final a 25. Dans la premiere version, l'app affiche le defi sans saisie dediee.
35. **Cible prioritaire** : l'app designe un joueur cible. Ceux qui font mieux que lui retirent 5 ; ceux qui font pire prennent +5.
36. **Contre-leader** : defi manuel, le dernier choisit attaque ou survie. Dans la premiere version, l'app affiche le choix a faire autour de la table sans appliquer automatiquement l'effet.

## Selection Et Ponderation

Le deck utilise une selection ponderee :

- cartes communes : poids fort ;
- cartes adaptatives et strategiques simples : poids moyen ;
- cartes violentes : poids moyen-faible ;
- cartes tres rares : poids faible.

La selection doit exclure :

- la carte de la manche precedente ;
- les cartes tres rares deja utilisees pendant la partie ;
- les cartes qui ne peuvent pas s'appliquer au contexte, par exemple une carte qui exige deux manches precedentes quand la partie vient de commencer.

Si aucune carte eligible n'est trouvee dans une categorie, la selection retombe sur les cartes communes applicables.

## UI

Ajouter dans "Joueurs et parametres" :

- un toggle `Deck Chaos` ;
- un indicateur ou selecteur d'intensite initialise a `Extreme`.

Ajouter dans "Nouvelle manche" :

- une carte visuelle `Carte Chaos active` ;
- pour les cartes avant manche : titre, description, cible et badge de rarete ;
- pour les cartes apres manche : un etat masque du type `Surprise chaos prete` jusqu'a la validation ;
- pour les defis manuels : un badge `Defi de table`.

Apres validation :

- le toast resume l'effet principal ;
- la carte revelee reste visible jusqu'au tirage de la manche suivante ;
- l'historique affiche la carte et les transformations de score importantes.

Le mode mobile QR doit afficher la meme carte active que le desktop pour que la personne qui saisit les scores ne travaille pas a l'aveugle.

## Donnees Et Compatibilite

Les anciennes parties sauvegardees sans `chaosMode` doivent etre normalisees automatiquement avec Deck Chaos desactive.

Quand Deck Chaos est desactive :

- aucun tirage de carte ne se produit ;
- le calcul existant reste identique ;
- l'UI ne doit pas encombrer la saisie de manche.

Quand une manche chaos est annulee :

- la manche est retiree ;
- si elle avait utilise une carte tres rare, cette carte redevient eligible seulement si aucune autre manche restante ne l'utilise.

## Erreurs Et Cas Limites

- Avec moins de deux joueurs, aucune carte ne doit etre tiree.
- Si une carte cible un joueur aleatoire, la cible doit etre resolue et sauvegardee avant l'affichage pour rester stable.
- Si une carte apres manche a besoin du classement avant la manche, ce classement doit etre capture avant l'application des scores.
- Les scores negatifs doivent rester supportes.
- Les egalites doivent etre gerees explicitement pour les meilleurs et pires scores de manche.
- Les explications doivent rester lisibles quand plusieurs transformations s'empilent.

## Verification

Executer au minimum :

- `npm run check`

Ajouter ou executer des tests unitaires du moteur chaos si le projet garde une structure testable sans alourdir l'outillage.

Verifier manuellement :

- Deck Chaos desactive conserve le comportement actuel ;
- une carte avant manche s'affiche avant la saisie ;
- une carte apres manche est masquee puis revelee apres validation ;
- les scores montrent l'ordre `brut -> penalite officielle -> chaos -> final` ;
- l'historique conserve la carte apres reload ;
- le mode QR mobile affiche la meme carte et valide une manche coherente ;
- une carte tres rare ne ressort pas deux fois dans la meme partie ;
- annuler une manche remet correctement l'etat chaos.

## Hors Scope Premiere Version

- Formulaires avances pour saisir tous les paris individuels.
- Editeur de deck personnalise.
- Mode multi-intensite complet au-dela de `Extreme`.
- Persistance serveur durable hors memoire.
