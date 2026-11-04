.pragma library

// Bot replies as Qt rich text, from the Markdown subset chat replies use.
//
// Safety first: the input is escaped before any formatting is added, so a reply can never
// carry its own markup (no raw HTML, no <img>, no styles). Only the tags written here come
// out. Images are shown as their alt text and never loaded. Links become anchors only for
// URLs the companion would open anyway (https, or http to localhost, without credentials);
// any other link stays plain text. Unclosed markers (a reply still streaming) stay literal.
//
// Supported: paragraphs (single line breaks kept), **bold**, *italic* / _italic_, ~~strike~~,
// `code`, fenced code blocks, # headings, - * + and 1. lists (nested by indentation),
// > quotes, --- rules, pipe tables, [links](https://…) and bare https:// URLs.

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function safeUrl(url) {
  var u = String(url || "").trim()
  if (u.length > 2048 || /[\s"<>\\]/.test(u)) return ""
  var m = /^(https?):\/\/([^/?#]*)/i.exec(u)
  if (!m) return ""
  if (m[2].indexOf("@") >= 0) return ""
  var host = m[2].replace(/:\d+$/, "").toLowerCase()
  if (m[1].toLowerCase() === "http" && host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") return ""
  return u
}

function defaults(style) {
  var s = style || {}
  return {
    code: s.code || "#232327",
    codeBlock: s.codeBlock || "#19191C",
    edge: s.edge || "#2E2E32",
    muted: s.muted || "#A1A1AA",
    link: s.link || "#F4F4F5",
    gap: s.gap || 8,
    size: s.size || 13
  }
}

// Inline spans of one block of text (already split off from block syntax).
function inline(raw, st) {
  var slots = []
  function hold(html) {
    slots.push(html)
    return "\u0000" + (slots.length - 1) + "\u0000"
  }
  var text = String(raw)
  // Code spans first: nothing inside them is formatted.
  text = text.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, function (_, ticks, body) {
    return hold("<span style=\"font-family:monospace; background-color:" + st.code + ";\">&nbsp;" +
                esc(body.trim()) + "&nbsp;</span>")
  })
  // Images: never loaded; their alt text stands in.
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/g, function (_, alt) {
    return hold("<i>" + esc(alt || "image") + "</i>")
  })
  // Links: an anchor only for a URL the companion would open.
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function (whole, label, url) {
    var href = safeUrl(url)
    if (!href) return hold(esc(label) + " (" + esc(url) + ")")
    return hold("<a href=\"" + esc(href) + "\" style=\"color:" + st.link + ";\">" + inlineMarks(esc(label)) + "</a>")
  })
  // Bare URLs.
  text = text.replace(/(^|[\s(])(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g, function (whole, lead, url) {
    var href = safeUrl(url)
    if (!href) return whole
    return lead + hold("<a href=\"" + esc(href) + "\" style=\"color:" + st.link + ";\">" + esc(url) + "</a>")
  })
  text = inlineMarks(esc(text))
  return text.replace(/\u0000(\d+)\u0000/g, function (_, i) { return slots[Number(i)] })
}

// Emphasis on already-escaped text.
function inlineMarks(t) {
  return t
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<b>$1</b>")
    .replace(/__(?=\S)([\s\S]*?\S)__/g, "<b>$1</b>")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<s>$1</s>")
    .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g, "$1<i>$2</i>")
    .replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?![_\w])/g, "$1<i>$2</i>")
}

function splitRow(line) {
  var t = line.trim()
  if (t.charAt(0) === "|") t = t.slice(1)
  if (t.charAt(t.length - 1) === "|") t = t.slice(0, -1)
  return t.split("|").map(function (c) { return c.trim() })
}

var LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
var TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

function toHtml(source, style) {
  var st = defaults(style)
  var lines = String(source || "").replace(/\r\n?/g, "\n").split("\n")
  var blocks = []
  var para = []
  var i = 0

  function flushPara() {
    if (para.length === 0) return
    blocks.push("<p>" + para.map(function (l) { return inline(l, st) }).join("<br>") + "</p>")
    para = []
  }

  while (i < lines.length) {
    var line = lines[i]
    var fence = /^\s*(```+|~~~+)\s*([\w+.-]*)\s*$/.exec(line)
    if (fence) {
      flushPara()
      var close = fence[1]
      var code = []
      i++
      while (i < lines.length && lines[i].trim().indexOf(close) !== 0) code.push(lines[i++])
      i++ // the closing fence (or the end, while a reply is still streaming)
      blocks.push("<table width=\"100%\" cellpadding=\"8\" cellspacing=\"0\" bgcolor=\"" + st.codeBlock + "\"><tr><td>" +
                  "<pre style=\"font-family:monospace; margin:0;\">" + esc(code.join("\n")) + "</pre></td></tr></table>")
      continue
    }
    if (line.trim() === "") {
      flushPara()
      i++
      continue
    }
    var heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      flushPara()
      var size = heading[1].length <= 2 ? st.size + 3 : st.size + 1
      blocks.push("<p><span style=\"font-size:" + size + "px; font-weight:600;\">" + inline(heading[2], st) + "</span></p>")
      i++
      continue
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushPara()
      blocks.push("<hr>")
      i++
      continue
    }
    if (/^\s{0,3}>/.test(line)) {
      flushPara()
      var quote = []
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) quote.push(lines[i++].replace(/^\s{0,3}>\s?/, ""))
      blocks.push("<table cellpadding=\"0\" cellspacing=\"0\"><tr><td width=\"3\" bgcolor=\"" + st.edge + "\"></td>" +
                  "<td style=\"padding-left:8px; color:" + st.muted + ";\">" + toHtml(quote.join("\n"), style) + "</td></tr></table>")
      continue
    }
    if (line.indexOf("|") >= 0 && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]) && lines[i + 1].indexOf("-") >= 0) {
      flushPara()
      var head = splitRow(line)
      var rows = []
      i += 2
      while (i < lines.length && lines[i].indexOf("|") >= 0 && lines[i].trim() !== "") rows.push(splitRow(lines[i++]))
      var cell = function (tag, c) {
        return "<" + tag + " style=\"border-color:" + st.edge + "; border-style:solid;\">" + inline(c, st) + "</" + tag + ">"
      }
      blocks.push("<table border=\"1\" cellpadding=\"4\" cellspacing=\"0\" style=\"border-color:" + st.edge + "; border-style:solid;\">" +
                  "<tr>" + head.map(function (c) { return cell("th", c) }).join("") + "</tr>" +
                  rows.map(function (r) { return "<tr>" + r.map(function (c) { return cell("td", c) }).join("") + "</tr>" }).join("") +
                  "</table>")
      continue
    }
    if (LIST.test(line)) {
      flushPara()
      var html = ""
      var stack = [] // {indent, tag}
      while (i < lines.length) {
        var m = LIST.exec(lines[i])
        if (!m) {
          // A wrapped continuation line belongs to the item above it.
          if (lines[i].trim() !== "" && /^\s+/.test(lines[i]) && stack.length > 0) {
            html += "<br>" + inline(lines[i].trim(), st)
            i++
            continue
          }
          break
        }
        var indent = m[1].replace(/\t/g, "  ").length
        var tag = /\d/.test(m[2]) ? "ol" : "ul"
        while (stack.length > 0 && indent < stack[stack.length - 1].indent) html += "</li></" + stack.pop().tag + ">"
        // Bullets followed by numbers at the same depth start a new list.
        if (stack.length > 0 && indent === stack[stack.length - 1].indent && stack[stack.length - 1].tag !== tag)
          html += "</li></" + stack.pop().tag + ">"
        var top = stack[stack.length - 1]
        if (!top || indent > top.indent) {
          var startAt = tag === "ol" ? " start=\"" + parseInt(m[2], 10) + "\"" : ""
          html += "<" + tag + startAt + " style=\"margin-top:0; margin-bottom:0; margin-left:-18px;\">"
          stack.push({ indent: indent, tag: tag })
        } else {
          html += "</li>"
        }
        html += "<li>" + inline(m[3], st)
        i++
      }
      while (stack.length > 0) html += "</li></" + stack.pop().tag + ">"
      blocks.push(html)
      continue
    }
    para.push(line)
    i++
  }
  flushPara()
  return blocks.map(function (b, n) {
    // One gap between blocks, none above the first.
    return n === 0 ? b : "<div style=\"font-size:" + st.gap + "px;\">&nbsp;</div>" + b
  }).join("").replace(/<p>/g, "<p style=\"margin:0;\">")
}
