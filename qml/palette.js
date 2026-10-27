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

// Colour blending for morphs. Mixing sRGB channels sends near-complementary
// pairs (orange to blue) through grey, so the blend runs in OKLCH: lightness
// and chroma interpolate linearly and hue takes the short way round. A grey
// end borrows the other end's hue so it fades in chroma only.

function toLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function fromLinear(c) {
  var v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(1, v))
}

function oklch(rgb) {
  var r = toLinear(rgb.r)
  var g = toLinear(rgb.g)
  var b = toLinear(rgb.b)
  var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
  var A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
  var B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  return { l: L, c: Math.sqrt(A * A + B * B), h: Math.atan2(B, A) }
}

function rgbFromOklch(lch) {
  var A = lch.c * Math.cos(lch.h)
  var B = lch.c * Math.sin(lch.h)
  var l = Math.pow(lch.l + 0.3963377774 * A + 0.2158037573 * B, 3)
  var m = Math.pow(lch.l - 0.1055613458 * A - 0.0638541728 * B, 3)
  var s = Math.pow(lch.l - 0.0894841775 * A - 1.2914855480 * B, 3)
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
  }
}

function mix(a, b, t) {
  var u = t < 0 ? 0 : t > 1 ? 1 : t
  var p = oklch(a)
  var q = oklch(b)
  if (p.c < 0.02) p.h = q.h
  if (q.c < 0.02) q.h = p.h
  var dh = q.h - p.h
  if (dh > Math.PI) dh -= Math.PI * 2
  if (dh < -Math.PI) dh += Math.PI * 2
  return rgbFromOklch({
    l: p.l + (q.l - p.l) * u,
    c: p.c + (q.c - p.c) * u,
    h: p.h + dh * u
  })
}
