// ============================================================
// RIDE TRACKER - Version de l'application
// ============================================================
// À incrémenter manuellement à chaque livraison.
// Convention : MAJEUR.MINEUR.CORRECTIF
// - MAJEUR : refonte importante ou lot de fonctionnalités significatif
// - MINEUR : nouvelle fonctionnalité ou amélioration notable
// - CORRECTIF : correction de bug, ajustement visuel, retouche mineure

const APP_VERSION = '3.7.2';

window.APP_VERSION = APP_VERSION;

// Synthèse des améliorations par version (du plus récent au plus ancien).
// Affichée via le lien "détails" sous la version, dans les paramètres.
window.APP_CHANGELOG = [
  {
    version: '3.7.2',
    changes: [
      "Correctif : le défilement au doigt sur les graphiques ne fonctionnait pas (le scroll vertical de la page prenait le dessus, remplacé par un système qui tranche la direction du geste avant d'agir)",
      "Graphique kilométrage : histogramme (une barre par trajet) à la place de la courbe, plus lisible pour des sorties distinctes",
      "Indicateur de zoom clarifié : « X à Y sur Z » à la place du format en fraction"
    ]
  },
  {
    version: '3.7.1',
    changes: [
      "Graphiques : boutons de zoom et de défilement sous le graphique, en remplacement du pincement à deux doigts",
      "Le défilement au doigt sur le graphique reste actif en complément des flèches"
    ]
  },
  {
    version: '3.7.0',
    changes: [
      "Correctif : le diagnostic batterie apparaît désormais même sans avoir rouvert les paramètres appareil depuis la 3.6.0",
      "Prolonger un ride : nouvelle option du menu +, fusionne la sortie suivante dans le même trajet au lieu d'en créer un nouveau",
      "Zoom et défilement tactile sur les graphiques kilométrage et charge (glisser pour naviguer, pincer pour zoomer)"
    ]
  },
  {
    version: '3.6.1',
    changes: [
      "Sélection de texte désactivée partout dans l'app (fini le volet de recherche Google au tap)",
      "Diagnostic batterie repensé : case dédiée dans les paramètres appareil, type d'intervention en dur « Diagnostic batterie », voltage par cellule en V",
      "Une intervention de diagnostic batterie seule n'exige plus de sélectionner une pièce"
    ]
  },
  {
    version: '3.6.0',
    changes: [
      "Tuile ride en cours visible immédiatement au Dashboard, sans changer de vue",
      "Batterie de départ pré-remplie avec l'arrivée du dernier trajet, modifiable",
      "Fini le texte sélectionné par accident sur les tuiles et valeurs numériques",
      "Usages de roue déplacés dans l'onglet Appareil",
      "Champ Gear (nombre de dents) sur les roues, affiché au Dashboard si renseigné",
      "Autonomie potentielle en trois tuiles : mini, moyenne, maxi",
      "Diagnostic cellules : nombre de cellules par appareil, voltage par cellule en révision constructeur"
    ]
  },
  {
    version: '3.5.0',
    changes: [
      "Onglet « Activités » : les charges apparaissent dans le fil avec les rides, bordure verte",
      "Chaque charge affiche les km parcourus depuis la charge précédente",
      "Filtre du fil : cases Rides et Charges, et filtres date/distance/conso appliqués aux deux",
      "Historique des charges retiré des stats (désormais dans le fil)"
    ]
  },
  {
    version: '3.4.0',
    changes: [
      "Stats charge : « Injection moyenne » par charge à la place du cumul",
      "Lien « détails » sous la version : synthèse des nouveautés",
      "Bouton « Annuler le ride » du menu + plus lisible"
    ]
  },
  {
    version: '3.3.0',
    changes: [
      "Ajout d'un entretien depuis le bouton + (menu)",
      "Filtre des entretiens par période, budget et type",
      "Autonomie estimée en km sur la tuile État, avec choix du type de ride",
      "Deux indicateurs charge : km et jours moyens entre deux charges",
      "Tuile État renommée, libellés du Dashboard simplifiés"
    ]
  },
  {
    version: '3.2.1',
    changes: [
      "Dashboard en deux colonnes : semaine en cours et total"
    ]
  },
  {
    version: '3.2.0',
    changes: [
      "Vignette entretien : commentaire sur une ligne, montant masqué si 0 €",
      "Sélection groupée des pièces, lien détails par pièce",
      "Volets repliables dans les paramètres"
    ]
  },
  {
    version: '3.1.1',
    changes: [
      "Correction de la recherche et du tri des entretiens",
      "Import CSV débloqué sur Android",
      "Renommage d'un usage de roue propagé aux roues concernées"
    ]
  }
];
