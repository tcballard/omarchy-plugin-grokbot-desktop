.pragma library

// Fold a fresh Bot Chat page into the thread already on screen.
// The host gateway (one process for every profile) is the source. A row already
// shown is kept; a row only the Hermes app has is appended. The live exchange
// still sitting in the composer is not copied in a second time.

function sameExchange(a, b) {
  if (!a || !b) return false
  if (a.key && b.key && String(a.key) === String(b.key)) return true
  return String(a.asked || "") === String(b.asked || "") && String(a.body || "") === String(b.body || "") && String(b.body || "") !== ""
}

function mergeExchanges(existing, incoming, live, limit) {
  var out = (existing || []).slice()
  var cap = limit > 0 ? limit : out.length + (incoming || []).length
  var i, j, row
  for (i = 0; i < (incoming || []).length; i++) {
    row = incoming[i]
    if (!row || !row.body) continue
    var known = false
    for (j = 0; j < out.length; j++) {
      if (!sameExchange(out[j], row)) continue
      known = true
      var next = out[j]
      if (row.key && !next.key) next = Object.assign({}, next, { key: row.key })
      if (row.body && row.body.length > String(next.body || "").length)
        next = Object.assign({}, next, { body: row.body })
      out[j] = next
      break
    }
    if (known || (live && sameExchange(live, row))) continue
    out.push(row)
  }
  return out.slice(Math.max(0, out.length - cap))
}

// True when the latest row is new or its text changed. The first fill of an
// empty thread is not news: that is history the reader has not missed.
function hasNews(before, after) {
  if (!after || after.length === 0 || !before || before.length === 0) return false
  if (after.length > before.length) return true
  var last = after[after.length - 1]
  var prev = before[before.length - 1]
  return String(last.asked || "") !== String(prev.asked || "") || String(last.body || "") !== String(prev.body || "")
}

function sameThread(a, b) {
  if (!a || !b || a.length !== b.length) return false
  var i
  for (i = 0; i < a.length; i++) {
    if (String(a[i].key || "") !== String(b[i].key || "")) return false
    if (String(a[i].asked || "") !== String(b[i].asked || "")) return false
    if (String(a[i].body || "") !== String(b[i].body || "")) return false
  }
  return true
}
