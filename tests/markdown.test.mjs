import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { root } from '../scripts/template.mjs'

const context = {}
vm.createContext(context)
vm.runInContext(fs.readFileSync(path.join(root, 'qml/markdown.js'), 'utf8').replace(/^\.pragma library\s*/, ''), context)
const md = (s) => context.toHtml(s)

test('a reply can never carry its own markup', () => {
  const html = md('<img src="http://evil/x.png"> <b>raw</b> <a href="https://x">x</a> <style>p{}</style>')
  assert.doesNotMatch(html, /<img|<b>|<a |<style/)
  assert.match(html, /&lt;img src=&quot;http:\/\/evil\/x\.png&quot;&gt;/)
  // Images show their alt text and are never loaded.
  assert.doesNotMatch(md('![chart](https://x/y.png)'), /<img/)
  assert.match(md('![chart](https://x/y.png)'), /<i>chart<\/i>/)
})

test('links become anchors only for URLs the companion would open', () => {
  const html = md('[ok](https://example.com) [js](javascript:alert(1)) [lan](http://192.168.1.2/) [me](https://u:p@x.io) [here](http://localhost:8080/a)')
  assert.match(html, /<a href="https:\/\/example\.com"/)
  assert.match(html, /<a href="http:\/\/localhost:8080\/a"/)
  assert.doesNotMatch(html, /href="javascript|href="http:\/\/192|href="https:\/\/u:p/)
  assert.match(md('see https://github.com/x/y.'), /<a href="https:\/\/github\.com\/x\/y"[^>]*>https:\/\/github\.com\/x\/y<\/a>\./)
})

test('the usual chat Markdown renders', () => {
  assert.equal(md('Plain.\nSecond line.'), '<p style="margin:0;">Plain.<br>Second line.</p>')
  assert.match(md('**b** *i* _i_ ~~s~~ snake_case_name'), /<b>b<\/b> <i>i<\/i> <i>i<\/i> <s>s<\/s> snake_case_name/)
  assert.match(md('`a < b`'), /font-family:monospace[^>]*>&nbsp;a &lt; b&nbsp;</)
  assert.match(md('# Title'), /font-weight:600;">Title</)
  const lists = md('- one\n- two\n  - nested\n1. first\n2. second')
  assert.match(lists, /<ul[^>]*><li>one<\/li><li>two<ul[^>]*><li>nested<\/li><\/ul><\/li><\/ul>/)
  assert.match(lists, /<ol start="1"[^>]*><li>first<\/li><li>second<\/li><\/ol>/)
  assert.match(md('| a | b |\n|---|---|\n| 1 | **2** |'), /<th[^>]*>a<\/th>[\s\S]*<td[^>]*><b>2<\/b><\/td>/)
  assert.match(md('> quoted'), /padding-left:8px[^>]*><p style="margin:0;">quoted<\/p>/)
})

test('code blocks are literal, and unfinished markers stay as typed', () => {
  const block = md('```bash\necho "<hi>" && **not bold**\n```')
  assert.match(block, /<pre[^>]*>echo &quot;&lt;hi&gt;&quot; &amp;&amp; \*\*not bold\*\*<\/pre>/)
  // A reply still streaming: an open fence is code so far, an open ** is literal.
  assert.match(md('```\npartial'), /<pre[^>]*>partial<\/pre>/)
  assert.equal(md('**unclosed bold'), '<p style="margin:0;">**unclosed bold</p>')
})

test('replies render through the converter, and links open through openLink', () => {
  const panel = fs.readFileSync(path.join(root, 'BubblePanel.qml'), 'utf8')
  assert.match(panel, /import "qml\/markdown\.js" as Markdown/)
  assert.match(panel, /text: exchange\.body === "" \? "" : Markdown\.toHtml\(exchange\.body, bubble\.markdownStyle\)/)
  assert.match(panel, /textFormat: TextEdit\.RichText\n\s*onLinkActivated: function \(link\) \{ app\.openLink\(link\) \}/)
  // Rich text only ever comes from the converter.
  assert.equal((panel.match(/TextEdit\.RichText|Text\.RichText|MarkdownText|AutoText/g) || []).length, 1)
})
