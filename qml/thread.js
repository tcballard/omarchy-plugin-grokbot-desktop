.pragma library

// Fold a fresh Bot Chat page into the thread already on screen.
// The host gateway (one process for every profile) is the source. A row already
// shown is kept; a row only the Hermes app has is appended. The live exchange
// still sitting in the composer is not copied in a second time.

function exchangeText(value) {
  return String(value || "").replace(/\r\n?/g, "\n").trim()
}

// Hermes wraps a /steer in this marker and stores it as its own user row.
// The card shows the plain line under the original question.
function askedShown(value) {
  var text = exchangeText(value)
  var open = "[OUT-OF-BAND USER MESSAGE"
  var close = "[/OUT-OF-BAND USER MESSAGE]"
  var at = text.indexOf(open)
  if (at < 0) return text
  var end = text.lastIndexOf(close)
  var innerAt = text.indexOf("]", at)
  if (end < at || innerAt < 0 || innerAt >= end) return text
  var inner = text.slice(innerAt + 1, end).trim()
  var head = text.slice(0, at).trim()
  if (head && inner) return head + "\n\n" + inner
  return inner || text
}

function sameExchange(a, b) {
  if (!a || !b) return false
  if (a.key && b.key && String(a.key) === String(b.key)) return true
  var aBody = exchangeText(a.body)
  var bBody = exchangeText(b.body)
  // Same reply text is the same turn. A steered follow-up is appended to the
  // local question, so the gateway row may carry only one of the two lines.
  if (aBody === "" || bBody === "" || aBody !== bBody) return false
  var aAsked = askedShown(a.asked)
  var bAsked = askedShown(b.asked)
  if (aAsked === bAsked || aAsked === "" || bAsked === "") return true
  return aAsked.indexOf(bAsked) !== -1 || bAsked.indexOf(aAsked) !== -1
}

function preferExchange(kept, row) {
  var next = kept
  if (row.key && !next.key) next = Object.assign({}, next, { key: row.key })
  var rowAsked = askedShown(row.asked)
  var nextAsked = askedShown(next.asked)
  if (rowAsked.length > nextAsked.length)
    next = Object.assign({}, next, { asked: rowAsked })
  else if (String(next.asked || "") !== nextAsked)
    next = Object.assign({}, next, { asked: nextAsked })
  if (row.body && exchangeText(row.body).length > exchangeText(next.body).length)
    next = Object.assign({}, next, { body: row.body })
  if ((row.files || []).length && !(next.files || []).length)
    next = Object.assign({}, next, { files: row.files })
  if ((row.links || []).length && !(next.links || []).length)
    next = Object.assign({}, next, { links: row.links })
  return next
}

function mergeExchanges(existing, incoming, live, limit) {
  var out = []
  var cap = limit > 0 ? limit : (existing || []).length + (incoming || []).length
  var i, j, row
  // A turn already filed twice (the live copy archived on the next send, plus
  // the gateway copy) collapses back to one before new rows are considered.
  for (i = 0; i < (existing || []).length; i++) {
    row = existing[i]
    var folded = false
    for (j = 0; j < out.length; j++) {
      if (!sameExchange(out[j], row)) continue
      out[j] = preferExchange(out[j], row)
      folded = true
      break
    }
    if (!folded && row) out.push(row)
  }
  for (i = 0; i < (incoming || []).length; i++) {
    row = incoming[i]
    if (!row || !row.body) continue
    var known = false
    for (j = 0; j < out.length; j++) {
      if (!sameExchange(out[j], row)) continue
      known = true
      out[j] = preferExchange(out[j], row)
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
