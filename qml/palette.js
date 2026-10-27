.pragma library

// Grok Bot avatar colours. Eye and outline tokens are chosen to stay readable
// on the fill. "omarchy" is resolved by the shell from the active theme accent.

var NAMES = [
  "black", "brown", "red", "orange", "yellow", "green",
  "cyan", "blue", "violet", "magenta", "gray"
]

var OMARCHY = "omarchy"

var COLORS = {
  black:   { fill: "#1a1a1a", highlight: "#4a4a4a", eye: "#f6f3ec", outline: "#050505", pupil: "#111111" },
  brown:   { fill: "#7a4a28", highlight: "#c48a58", eye: "#fff6ee", outline: "#3a2212", pupil: "#1a0e08" },
  red:     { fill: "#d23b3b", highlight: "#ff9a90", eye: "#fff6f4", outline: "#5c1212", pupil: "#1a0808" },
  orange:  { fill: "#e06512", highlight: "#ffc48a", eye: "#fff8f2", outline: "#6a2c08", pupil: "#1a0c06" },
  yellow:  { fill: "#f0c431", highlight: "#fff0b0", eye: "#2a210c", outline: "#6e5410", pupil: "#fff4c8" },
  green:   { fill: "#2c8f4e", highlight: "#8ed9a6", eye: "#f3fff6", outline: "#0e3a20", pupil: "#06140c" },
  cyan:    { fill: "#129eb0", highlight: "#9aebf4", eye: "#f3feff", outline: "#084048", pupil: "#062024" },
  blue:    { fill: "#3a66d6", highlight: "#a9c0ff", eye: "#f5f7ff", outline: "#14285c", pupil: "#0a1024" },
  violet:  { fill: "#7346d4", highlight: "#c6b4ff", eye: "#f7f5ff", outline: "#2a1460", pupil: "#100820" },
  magenta: { fill: "#c73384", highlight: "#ffb3d4", eye: "#fff5fa", outline: "#5a1238", pupil: "#1a0610" },
  gray:    { fill: "#4e5560", highlight: "#c5cad3", eye: "#f4f6f8", outline: "#1c2026", pupil: "#101216" }
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
