/**
 * Le catalogue des catégories d'events.
 *
 * Chaque groupe en choisit de 3 à 10 à sa création (groups.categories), et
 * « Autre » s'y ajoute toujours. Un event garde l'affichage de sa catégorie
 * même si le groupe la retire ensuite : on la cherche donc ici, jamais dans
 * la liste du groupe.
 *
 * Les clés partent en base et ne doivent plus changer. Les libellés, emojis
 * et couleurs, si.
 *
 * Couleurs assez sombres pour porter du texte : au moins 4,5:1 en étiquette
 * sur fond teinté comme sous un titre blanc. Deux voisines d'une même
 * famille ne partagent jamais la même.
 */

export type Category = { label: string; emoji: string; color: string };

export type Family = { label: string; keys: string[] };

export const CATEGORIES: Record<string, Category> = {
  // Fête
  soiree:       { label: "Soirée",            emoji: "🎉", color: "#7C3AED" },
  apero:        { label: "Apéro",             emoji: "🍻", color: "#B45309" },
  bar:          { label: "Bar",               emoji: "🍸", color: "#9D174D" },
  boite:        { label: "Boîte",             emoji: "🪩", color: "#4338CA" },
  concert:      { label: "Concert",           emoji: "🎤", color: "#BE123C" },
  festival:     { label: "Festival",          emoji: "🎪", color: "#A21CAF" },
  anniv:        { label: "Anniversaire",      emoji: "🎂", color: "#DB2777" },
  karaoke:      { label: "Karaoké",           emoji: "🎙️", color: "#6D28D9" },

  // À table
  resto:        { label: "Resto",             emoji: "🍽️", color: "#C2410C" },
  picnic:       { label: "Pique-nique",       emoji: "🧺", color: "#3F6212" },
  brunch:       { label: "Brunch",            emoji: "🥐", color: "#A16207" },
  barbecue:     { label: "Barbecue",          emoji: "🍖", color: "#B91C1C" },
  diner:        { label: "Dîner à la maison", emoji: "🍲", color: "#92400E" },
  degustation:  { label: "Dégustation",       emoji: "🍷", color: "#881337" },
  cuisine:      { label: "Cours de cuisine",  emoji: "🧑‍🍳", color: "#9A3412" },

  // Sport
  sport:        { label: "Sport",             emoji: "⚽", color: "#0F766E" },
  running:      { label: "Running",           emoji: "🏃", color: "#15803D" },
  velo:         { label: "Vélo",              emoji: "🚴", color: "#0E7490" },
  rando:        { label: "Rando",             emoji: "🥾", color: "#4D7C0F" },
  ski:          { label: "Ski",               emoji: "⛷️", color: "#1D4ED8" },
  escalade:     { label: "Escalade",          emoji: "🧗", color: "#854D0E" },
  raquette:     { label: "Tennis / padel",    emoji: "🎾", color: "#047857" },
  natation:     { label: "Natation",          emoji: "🏊", color: "#0369A1" },
  surf:         { label: "Surf",              emoji: "🏄", color: "#155E75" },
  match:        { label: "Match à regarder",  emoji: "📺", color: "#334155" },

  // Jeux
  coinche:      { label: "Coinche",           emoji: "🃏", color: "#BE185D" },
  jeux_societe: { label: "Jeux de société",   emoji: "🎲", color: "#7E22CE" },
  poker:        { label: "Poker",             emoji: "♠️", color: "#166534" },
  jeux_video:   { label: "Jeux vidéo",        emoji: "🎮", color: "#5B21B6" },
  escape:       { label: "Escape game",       emoji: "🔐", color: "#78350F" },
  quiz:         { label: "Quiz / blind test", emoji: "🧠", color: "#C026D3" },

  // Culture
  cinema:       { label: "Cinéma",            emoji: "🎬", color: "#991B1B" },
  theatre:      { label: "Théâtre",           emoji: "🎭", color: "#86198F" },
  expo:         { label: "Expo",              emoji: "🖼️", color: "#3730A3" },
  standup:      { label: "Stand-up",          emoji: "😂", color: "#B45309" },
  atelier:      { label: "Atelier créatif",   emoji: "🎨", color: "#9333EA" },

  // Évasion
  voyage:       { label: "Voyage",            emoji: "✈️", color: "#2563EB" },
  weekend:      { label: "Week-end",          emoji: "🧳", color: "#0F766E" },
  roadtrip:     { label: "Road trip",         emoji: "🚗", color: "#C2410C" },
  camping:      { label: "Camping",           emoji: "⛺", color: "#3F6212" },
  plage:        { label: "Plage",             emoji: "🏖️", color: "#0E7490" },
  balade:       { label: "Balade",            emoji: "🚶", color: "#15803D" },
  bateau:       { label: "Bateau",            emoji: "⛵", color: "#1E40AF" },

  // Vie de groupe
  chill:        { label: "Chill",             emoji: "🛋️", color: "#57534E" },
  afterwork:    { label: "Afterwork",         emoji: "💼", color: "#1E3A8A" },
  visio:        { label: "Visio",             emoji: "💻", color: "#0369A1" },
  coup_de_main: { label: "Coup de main",      emoji: "📦", color: "#92400E" },
  mariage:      { label: "Mariage",           emoji: "💍", color: "#9D174D" },
  evg:          { label: "EVJF / EVG",        emoji: "🎊", color: "#7C3AED" },
  benevolat:    { label: "Bénévolat",         emoji: "🤝", color: "#047857" },

  // Toujours offerte, hors des 3 à 10 choisies.
  autre:        { label: "Autre",             emoji: "📌", color: "#475569" },
};

/** Pour l'écran de choix, rangées comme on les cherche. */
export const FAMILIES: Family[] = [
  { label: "Fête",          keys: ["soiree", "apero", "bar", "boite", "concert", "festival", "anniv", "karaoke"] },
  { label: "À table",       keys: ["resto", "picnic", "brunch", "barbecue", "diner", "degustation", "cuisine"] },
  { label: "Sport",         keys: ["sport", "running", "velo", "rando", "ski", "escalade", "raquette", "natation", "surf", "match"] },
  { label: "Jeux",          keys: ["coinche", "jeux_societe", "poker", "jeux_video", "escape", "quiz"] },
  { label: "Culture",       keys: ["cinema", "theatre", "expo", "standup", "atelier"] },
  { label: "Évasion",       keys: ["voyage", "weekend", "roadtrip", "camping", "plage", "balade", "bateau"] },
  { label: "Vie de groupe", keys: ["chill", "afterwork", "visio", "coup_de_main", "mariage", "evg", "benevolat"] },
];

export const MIN_CATEGORIES = 3;
export const MAX_CATEGORIES = 10;

/** Une clé inconnue — catégorie retirée du catalogue — s'affiche en « Autre ». */
export const categoryOf = (key: string): Category => CATEGORIES[key] || CATEGORIES.autre;

/**
 * Les catégories proposées dans le formulaire d'un groupe : les siennes, puis
 * « Autre ». `keep` ajoute celle d'un event qu'on modifie, si le groupe l'a
 * retirée depuis — sinon l'ouvrir suffirait à la lui faire perdre.
 */
export function groupCategories(keys: string[], keep = ""): string[] {
  const own = keys.filter((k) => CATEGORIES[k] && k !== "autre");
  if (keep && keep !== "autre" && CATEGORIES[keep] && !own.includes(keep)) own.push(keep);
  return [...own, "autre"];
}
