.pragma library

// Wake phrases for Superwhisper and Voxtype. "hey bot", "hey bob",
// "hey grok", and "hey grok bot" ask the primary bot. "hey <name>" asks
// the roster bot whose short name or full name matches. The match is
// case-insensitive and only counts at the start of the text.

var PRIMARY_ID = "e0195a7d-f804-4688-9191-e2cf3574a6d1"

function normalize(text) {
  return String(text || "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim()
}

function boundary(rest, length) {
  if (rest.length === length) return true
  var ch = rest.charAt(length)
  return !/[a-z0-9]/i.test(ch)
}

function stripLead(value) {
  return String(value || "").replace(/^[\s,;:.!?\-–—]+/, "").trim()
}

function route(text, bots, primaryId) {
  var raw = normalize(text)
  var folded = raw.toLowerCase()
  var missed = { matched: false, botId: "", prompt: raw, wake: "" }
  if (folded.indexOf("hey ") !== 0) return missed
  var rest = raw.slice(4)
  var restFold = folded.slice(4)
  var primary = String(primaryId || PRIMARY_ID)
  if (restFold === "grok bot" || (restFold.indexOf("grok bot") === 0 && boundary(restFold, "grok bot".length))) {
    return {
      matched: true,
      botId: primary,
      prompt: stripLead(rest.slice("grok bot".length)),
      wake: "hey grok bot"
    }
  }

  var best = null
  var bestLen = 0
  var list = bots || []
  var i
  var j
  for (i = 0; i < list.length; i++) {
    var labels = [list[i].shortName, list[i].name]
    for (j = 0; j < labels.length; j++) {
      var label = normalize(labels[j]).toLowerCase()
      if (!label || label.length <= bestLen) continue
      if (restFold.slice(0, label.length) !== label) continue
      if (!boundary(restFold, label.length)) continue
      best = list[i]
      bestLen = label.length
    }
  }
  if (best) {
    var who = normalize(best.shortName || best.name)
    return {
      matched: true,
      botId: String(best.id || ""),
      prompt: stripLead(rest.slice(bestLen)),
      wake: who ? "hey " + who : "hey"
    }
  }

  var tails = ["bot", "bob", "grok"]
  for (i = 0; i < tails.length; i++) {
    if (restFold.slice(0, tails[i].length) !== tails[i]) continue
    if (!boundary(restFold, tails[i].length)) continue
    return {
      matched: true,
      botId: primary,
      prompt: stripLead(rest.slice(tails[i].length)),
      wake: "hey " + tails[i]
    }
  }
  return missed
}
