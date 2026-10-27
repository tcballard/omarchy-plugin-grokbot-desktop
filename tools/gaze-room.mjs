#!/usr/bin/env node
// Regenerates the GAZE_ROOM block in qml/shapes.js from the measured outlines
// and eyes. Run it after tools/measure-avatars.py or after changing the gaze
// constants in qml/face.js:
//
//   node tools/gaze-room.mjs
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

export function tables() {
  const shapes = load('qml/shapes.js')
  const face = load('qml/face.js')
  const out = {}
  for (const name of shapes.NAMES) {
    const shape = shapes.get(name)
    out[name] = Array.from(face.roomTable(shape.points, shape.eyes))
  }
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const table = tables()
  const body = Object.entries(table)
    .map(([name, room]) => `  ${name}: [${room.join(', ')}]`)
    .join(',\n')
  const source = fs.readFileSync(shapesPath, 'utf8')
  const next = source.replace(
    /\/\/ BEGIN GAZE ROOM\n[\s\S]*?\/\/ END GAZE ROOM/,
    `// BEGIN GAZE ROOM\nvar GAZE_ROOM = {\n${body}\n}\n// END GAZE ROOM`
  )
  fs.writeFileSync(shapesPath, next)
  console.log(`wrote ${Object.keys(table).length} gaze room tables`)
}
