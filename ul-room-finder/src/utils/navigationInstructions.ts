import { PathNode } from './types'

export interface NavInstruction {
  step: number
  text: string
  icon: string
}

const getAngle = (from: PathNode, to: PathNode) =>
  Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI

const angleDiff = (a: number, b: number) => {
  let d = b - a
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return d
}

const getTurnDirection = (diff: number): 'left' | 'right' | null => {
  if (Math.abs(diff) < 25) return null
  return diff > 0 ? 'right' : 'left'
}

const dist = (a: PathNode, b: PathNode): number =>
  Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)

const METRES_PER_UNIT = 0.25  // 1 JSON coordinate unit = 0.25 real metres
const formatDistance = (units: number): string => {
  const m = Math.round(units * METRES_PER_UNIT)
  const paces = Math.round(units * METRES_PER_UNIT * 1.33)
  if (m < 1) return ''
  return `approximately ${m} metre${m !== 1 ? 's' : ''} (${paces} pace${paces !== 1 ? 's' : ''})`
}
// Accumulate distance along a straight run from fromIndex until a turn, floor change, or special node
// Returns { metres, endIndex } where endIndex is the last node of the straight segment
const measureStraightRun = (path: PathNode[], fromIndex: number): { metres: number; endIndex: number } => {
  let metres = 0
  let lastAngle: number | null = null
  let endIndex = fromIndex

  for (let i = fromIndex; i < path.length - 1; i++) {
    const cur = path[i]
    const nxt = path[i + 1]

    if (nxt.floor !== cur.floor) break
    if (nxt.type === 'stairs' || nxt.type === 'elevator') break  // ← removed 'door' from here

    const angle = getAngle(cur, nxt)
    if (lastAngle !== null) {
      const diff = angleDiff(lastAngle, angle)
      if (Math.abs(diff) > 25) break
    }
    metres += dist(cur, nxt)
    lastAngle = angle
    endIndex = i + 1

    if (nxt.type === 'door') break  // ← stop AFTER measuring to the door, not before
  }
  return { metres, endIndex }
}
export function generateNavInstructions(path: PathNode[]): NavInstruction[] {
  const instructions: NavInstruction[] = []
  if (path.length < 2) return instructions

  let step = 1
  const push = (text: string, icon: string) => instructions.push({ step: step++, text, icon })

  // ── Step 0: entrance / start ────────────────────────────────────────────
  const startNode = path[0]
  if (startNode.type === 'entrance') {
    const isMain = startNode.label?.toLowerCase().includes('lobby') || startNode.label?.toLowerCase().includes('main')
    const label = isMain ? 'the main entrance' : startNode.label ? startNode.label.toLowerCase() : 'the entrance'
    push(`Enter through ${label}.`, '🚪')
  } else {
    push(`Start at ${startNode.label || 'your location'}.`, '📍')
  }

  let i = 1
  while (i < path.length) {
    const node = path[i]
    const prev = path[i - 1]
    const next = path[i + 1]

    // ── Destination ──────────────────────────────────────────────────────
    if (i === path.length - 1) {
      const destLabel = node.label
        ? node.label.replace(/ door$/i, '').replace(/_/g, ' ')
        : 'your destination'
      push(`You have arrived at ${destLabel}.`, '🎯')
      break
    }

    // ── Floor change ─────────────────────────────────────────────────────
    if (node.floor !== prev.floor) {
      const via = prev.type === 'elevator' || node.type === 'elevator' ? 'elevator' : 'stairs'
      const floorLabel = node.floor === 0 ? 'the Ground Floor' : `Floor ${node.floor}`
      push(`Take the ${via} to ${floorLabel}.`, via === 'elevator' ? '🛗' : '🪜')
      i++; continue
    }

    // ── Upcoming stairs/elevator ─────────────────────────────────────────
    if (node.type === 'stairs' && next) {
      const floorLabel = next.floor === 0 ? 'the Ground Floor' : `Floor ${next.floor}`
      // Measure distance to stairs from previous corridor
      const d = dist(prev, node)
      const distStr = formatDistance(d)
      push(`Walk forward${distStr ? ' ' + distStr : ''} and take the stairs to ${floorLabel}.`, '🪜')
      i++; continue
    }
    if (node.type === 'elevator' && next) {
      const floorLabel = next.floor === 0 ? 'the Ground Floor' : `Floor ${next.floor}`
      const d = dist(prev, node)
      const distStr = formatDistance(d)
      push(`Walk forward${distStr ? ' ' + distStr : ''} and take the elevator to ${floorLabel}.`, '🛗')
      i++; continue
    }

    // ── Corridor — turn or straight ───────────────────────────────────────
    if (node.type === 'corridor' && next) {
      const inAngle = getAngle(prev, node)
      const outAngle = getAngle(node, next)
      const diff = angleDiff(inAngle, outAngle)
      const dir = getTurnDirection(diff)
      const isFirstMove = prev.type === 'entrance'

      if (dir) {
        // Measure the straight run AFTER this turn
        const { metres: straightMetres } = measureStraightRun(path, i + 1)
        const distStr = formatDistance(straightMetres)

        if (isFirstMove) {
          if (distStr) {
            push(`Immediately turn ${dir} after entering, then walk ${distStr}.`, dir === 'right' ? '↱' : '↰')
          } else {
            push(`Immediately turn ${dir} after entering.`, dir === 'right' ? '↱' : '↰')
          }
        } else if (distStr) {
          push(`Turn ${dir} and walk ${distStr}.`, dir === 'right' ? '↱' : '↰')
        } else {
          push(`Turn ${dir}.`, dir === 'right' ? '↱' : '↰')
        }
      } else if (isFirstMove) {
        // Straight from entrance
        const { metres } = measureStraightRun(path, i)
        const distStr = formatDistance(metres)
        if (distStr) push(`Walk straight ahead ${distStr}.`, '⬆️')
        else push(`Walk straight ahead.`, '⬆️')
      } else {
        // Check if we just turned (prev was a turn node)
        const prevPrev = i >= 2 ? path[i - 2] : null
        if (prevPrev && prevPrev.type === 'corridor') {
          const prevInAngle = getAngle(prevPrev, prev)
          const prevDiff = angleDiff(prevInAngle, inAngle)
          if (Math.abs(prevDiff) > 25) {
            // Just turned — measure straight ahead
            const { metres } = measureStraightRun(path, i)
            const distStr = formatDistance(metres)
            if (distStr) push(`Continue straight ahead ${distStr}.`, '⬆️')
          }
        }
      }
    }

    // ── Door node (just before destination) ──────────────────────────────
    if (node.type === 'door' && i === path.length - 2) {
      const destLabel = next?.label
        ? next.label.replace(/ door$/i, '').replace(/_/g, ' ')
        : 'your destination'
      push(`The entrance to ${destLabel} will be directly in front of you.`, '🚪')
    }

    i++
  }

  return instructions
}

export function speakInstructions(instructions: NavInstruction[], voiceURI?: string): void {
  window.speechSynthesis.cancel()
  const fullText = instructions.map(i => i.text).join('. ')
  const utt = new SpeechSynthesisUtterance(fullText)
  utt.rate = 0.9
  utt.pitch = 1.0
  utt.volume = 0.5
  if (voiceURI) {
    const voices = window.speechSynthesis.getVoices()
    const voice = voices.find(v => v.voiceURI === voiceURI)
    if (voice) utt.voice = voice
  }
  window.speechSynthesis.speak(utt)
}

export function stopSpeech(): void {
  window.speechSynthesis.cancel()
}

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  return window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'))
}