.pragma library

// Grok Bot avatar colours. Eyes are flat cutouts: dark capsules on every
// colour except black, which cuts light capsules out of the dark fill.
// "omarchy" is resolved by the shell from the active theme accent.

var NAMES = [
  "black", "brown", "red", "orange", "yellow", "green",
  "cyan", "blue", "violet", "magenta", "gray"
]

var OMARCHY = "omarchy"

var CUTOUT = "#141416"
var CUTOUT_ON_BLACK = "#F4F4F5"

var COLORS = {
  black:   { fill: "#3F3F46", highlight: "#3F3F46", eye: CUTOUT_ON_BLACK, outline: "#141416", pupil: "#FFFFFF" },
  brown:   { fill: "#A16237", highlight: "#A16237", eye: CUTOUT, outline: "#141416", pupil: "#09090B" },
  red:     { fill: "#F05252", highlight: "#F05252", eye: CUTOUT, outline: "#141416", pupil: "#09090B" },
  orange:  { fill: "#F28B30", highlight: "#F28B30", eye: CUTOUT, outline: "#141416", pupil: "#09090B" },
  yellow:  { fill: "#F0B429", highlight: "#F0B429", eye: CUTOUT, outline: "#141416", pupil: "#09090B" },
  green:   { fill: "#5BC67A", highlight: "#5BC67A", eye: CUTOUT, outline: "#141416", pupil: "#09090B" },
  cyan:    { fill: "#22B8CF", highlight: "#22B8CF", eye: CUTOUT, outline: "#141416", pupil: "#09090B" },
  blue:    { fill: "#4E8CFF", highlight: "#4E8CFF", eye: CUTOUT, outline: "#141416", pupil: "#09090B" },
  violet:  { fill: "#A864FD", highlight: "#A864FD", eye: CUTOUT, outline: "#141416", pupil: "#09090B" },
  magenta: { fill: "#EC5399", highlight: "#EC5399", eye: CUTOUT, outline: "#141416", pupil: "#09090B" },
  gray:    { fill: "#71717A", highlight: "#71717A", eye: CUTOUT, outline: "#141416", pupil: "#09090B" }
}

function known(name) {
  return Object.prototype.hasOwnProperty.call(COLORS, String(name || ""))
}

function accepts(name) {
  return known(name) || String(name || "") === OMARCHY
}

function get(name) {
  return known(name) ? COLORS[name] : COLORS.orange
}
