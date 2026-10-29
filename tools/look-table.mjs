#!/usr/bin/env node
// Regenerates the LOOK block in qml/shapes.js: for each shape, where its eyes
// sit when it faces you, how big they are, and how much of each gaze they can
// take before running into its edge (see look() in qml/face.js). Run it after
// tools/measure-avatars.py or after changing the look constants in
// qml/face.js:
//
//   node tools/look-table.mjs
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const shapesPath = path.join(root, 'qml/shapes.js')

function load(file) {
  const context = {}
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8').replace('.pragma library', ''), context)
  return context
}

export function tables(names) {
  const shapes = load('qml/shapes.js')
  const face = load('qml/face.js')
  const out = {}
  for (const name of names || shapes.NAMES) {
    const shape = shapes.get(name)
    out[name] = JSON.parse(JSON.stringify(face.shapeLook(shape.points, shape.eyes)))
  }
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const table = tables()
  const body = Object.entries(table)
    .map(([name, look]) => `  ${name}: { face: [${look.face.join(', ')}], size: ${look.size}, fit: [${look.fit.join(', ')}] }`)
    .join(',\n')
  const source = fs.readFileSync(shapesPath, 'utf8')
  const next = source.replace(
    /\/\/ BEGIN LOOK\n[\s\S]*?\/\/ END LOOK/,
    `// BEGIN LOOK\nvar LOOK = {\n${body}\n}\n// END LOOK`
  )
  fs.writeFileSync(shapesPath, next)
  console.log(`wrote ${Object.keys(table).length} look tables`)
}
