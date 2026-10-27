.pragma library

// Eye cut-out geometry for the flat marks. Each eye is a rounded rectangle
// whose corner radius is half its shorter side: open, it is a tall capsule;
// closing, it flattens into a short lid line instead of shrinking to a dot.
// `rad` is the silhouette radius in pixels, `open` runs 0 (shut) to 1, and
// `heightScale` is the expression's squint.

function eye(rad, open, heightScale) {
  var o = Math.max(0, Math.min(1, Number(open) || 0))
  var baseW = Math.max(1.6, rad * 0.165)
  var fullH = rad * 0.43 * (heightScale > 0 ? heightScale : 1)
  var lid = Math.max(1.4, rad * 0.04)
  var h = Math.max(lid, fullH * o)
  // A closing lid reads wider than the open slit.
  var w = baseW * (o < 0.3 ? 1 + (0.3 - o) * 0.6 : 1)
  return { w: w, h: h, r: Math.min(w, h) / 2 }
}

// Eye pose per expression: tilt in degrees, squint as a height scale, and
// the most the eyes may open. The mark eases between poses.
var POSES = {
  idle: { tilt: 11, height: 1, open: 1 },
  sleep: { tilt: 11, height: 1, open: 0.04 },
  think: { tilt: 18, height: 0.62, open: 0.45 },
  alert: { tilt: 7, height: 1.16, open: 1 },
  happy: { tilt: 16, height: 0.72, open: 1 },
  celebrate: { tilt: 16, height: 0.72, open: 1 }
}

function pose(name) {
  return Object.prototype.hasOwnProperty.call(POSES, String(name || "")) ? POSES[name] : POSES.idle
}
