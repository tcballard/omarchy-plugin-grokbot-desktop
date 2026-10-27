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
