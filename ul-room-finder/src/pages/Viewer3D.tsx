import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Graph } from '../utils/graph'
import { AStar } from '../utils/pathfinding'
import { PathNode } from '../types'
import { BuildingGeometry } from '../utils/BuildingGeometry'
import { CameraWalkthrough } from '../utils/CameraWalkthrough'
import { generateNavInstructions, speakInstructions, stopSpeech, NavInstruction } from '../utils/navigationInstructions'
import csisBuildingData from '../data/buildings_csis.json'

const SCALE = 10
const FLOOR_HEIGHT = 150
const WALL_HEIGHT = 125
const WALL_THICKNESS = 8
// Shared materials — defined once, never recreated
const MAT_FLOOR      = new THREE.MeshStandardMaterial({ color: 0x2a2a3e, roughness: 0.8 })
const MAT_FLOOR_DARK = new THREE.MeshStandardMaterial({ color: 0x252535, roughness: 0.8 })
const MAT_CEILING    = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.9 })
const MAT_ROOM       = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.8, transparent: true, opacity: 0.55 })
const MAT_ENTRANCE   = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.3 })
const MAT_PATH       = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff4444, emissiveIntensity: 0.5 })

const BUILDINGS = {
  csis: { name: 'CSIS Building', data: csisBuildingData as any },
}

function Viewer3D() {
    const pathRef = useRef<PathNode[]>([])
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const walkthroughRef = useRef<CameraWalkthrough | null>(null)
  const floorOffsetsRef = useRef<Map<number, { x: number; z: number }>>(new Map())

  const [selectedBuilding] = useState<'csis'>('csis')
  const buildingData = BUILDINGS[selectedBuilding].data

  const [graph, setGraph] = useState<Graph | null>(null)
  const [pathfinder, setPathfinder] = useState<AStar | null>(null)
  const [startRoom, setStartRoom] = useState('')
  const [endRoom, setEndRoom] = useState('')
  const [path, setPath] = useState<PathNode[]>([])
  const [requireAccessible, setRequireAccessible] = useState(false)
  const [visibleFloors, setVisibleFloors] = useState<Set<number>>(new Set([0]))
  const [floorWallsVisible, setFloorWallsVisible] = useState<Record<number, boolean>>({
    0: true, 1: true, 2: true, 3: true,
  })
  const [floorCeilingsVisible, setFloorCeilingsVisible] = useState<Record<number, boolean>>({
    0: false, 1: false, 2: false, 3: false,
  })
  const [walkthroughActive, setWalkthroughActive] = useState(false)
  const [walkthroughPlaying, setWalkthroughPlaying] = useState(false)
  const [walkthroughProgress, setWalkthroughProgress] = useState(0)
  const [walkthroughSpeed, setWalkthroughSpeed] = useState(1.0)
  const [useSideStairs, setUseSideStairs] = useState(false)
  const [stairTransitionMsg, setStairTransitionMsg] = useState<string | null>(null)
  const [navInstructions, setNavInstructions] = useState<NavInstruction[]>([])
  const [voiceMuted, setVoiceMuted] = useState(false)
  const [showInstructions, setShowInstructions] = useState(true)
  const savedCameraStateRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null)

  // ── Load graph ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const g = new Graph()
    buildingData.nodes.forEach((node: PathNode) => g.addNode(node))
    buildingData.edges.forEach((edge: any) => g.addEdge(edge))
    setGraph(g)
    setPathfinder(new AStar(g))
    setStartRoom('')
    setEndRoom('')
    setPath([])
    setVisibleFloors(new Set([0]))
  }, [selectedBuilding])

  // ── Three.js scene init ────────────────────────────────────────────────────
    useEffect(() => {
      if (!containerRef.current) return
      // Dispose any existing renderer first
      if (rendererRef.current) {
        rendererRef.current.dispose()
        rendererRef.current = null
      }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)
    scene.fog = new THREE.Fog(0x1a1a2e, 1500, 4000)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(
      60,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      5000
    )
    camera.position.set(600, 900, 1200)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    const walkthrough = new CameraWalkthrough(camera, 0, 0, FLOOR_HEIGHT)
    walkthrough.setProgressCallback((p) => {
      // Only update React state every 10 frames to reduce re-renders
      if (Math.round(p * 100) % 2 === 0) setWalkthroughProgress(p)
    })
    walkthrough.setCompletionCallback(() => setWalkthroughPlaying(false))
    walkthroughRef.current = walkthrough
    walkthrough.setFloorTransitionCallback((fromFloor, toFloor) => {
          const label = toFloor === 0 ? 'Ground Floor' : `Floor ${toFloor}`
          setStairTransitionMsg(`🪜 Taking stairs to ${label}…`)
          setTimeout(() => setStairTransitionMsg(null), 2000)
        })

    const renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.setPixelRatio(1)
    renderer.shadowMap.enabled = false
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.minDistance = 200
    controls.maxDistance = 3000
    controls.maxPolarAngle = Math.PI / 2.1
    controlsRef.current = controls

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9)
    dirLight.position.set(300, 500, 400)
    scene.add(dirLight)

    const grid = new THREE.GridHelper(2000, 30, 0x444444, 0x222222)
    scene.add(grid)

    let lastTime = 0
    const animate = (t: number) => {
      requestAnimationFrame(animate)
      const delta = (t - lastTime) / 1000
      lastTime = t
      if (walkthroughRef.current?.isActive()) {
        walkthroughRef.current.update(delta)
        controls.enabled = false
      } else {
        controls.enabled = true
        controls.update()
        controls.update()
                savedCameraStateRef.current = {
                  pos: camera.position.clone(),
                  target: controls.target.clone()
                }
      }
      renderer.render(scene, camera)
    }
    animate(0)

    const onResize = () => {
      if (!containerRef.current) return
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      if (containerRef.current?.contains(renderer.domElement))
        containerRef.current.removeChild(renderer.domElement)
      renderer.dispose()
      renderer.forceContextLoss()
      rendererRef.current = null
    }
  }, [])

  // ── Rebuild 3D when graph/visibility changes ───────────────────────────────
  useEffect(() => {
    if (graph && sceneRef.current) {
      // Save camera state before rebuild
      const saved = savedCameraStateRef.current
          build3DStructure(sceneRef.current, graph)
          if (saved && controlsRef.current && cameraRef.current) {
            cameraRef.current.position.copy(saved.pos)
            controlsRef.current.target.copy(saved.target)
            controlsRef.current.update()
          }
    }
  }, [graph, visibleFloors, floorWallsVisible, floorCeilingsVisible])

  // ── Auto-show floors when path changes ────────────────────────────────────
  useEffect(() => {
    if (path.length > 0) {
        pathRef.current = path
      setVisibleFloors(new Set(path.map((n) => n.floor)))
      setWalkthroughActive(false)
      setWalkthroughPlaying(false)
      setWalkthroughProgress(0)
    }
  }, [path])

  // ── Core 3D structure builder ──────────────────────────────────────────────
  const build3DStructure = (scene: THREE.Scene, graph: Graph) => {
    // Remove old building geometry
    // Remove AND dispose old building geometry to free GPU memory
    const toRemove = scene.children.filter((o) => o.userData.isBuilding)
    toRemove.forEach((o) => {
      scene.remove(o)
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose()
      } else if (o instanceof THREE.Group) {
        o.traverse((child) => {
          if (child instanceof THREE.Mesh) child.geometry.dispose()
        })
      }
    })

    const nodes = graph.getAllNodes()
    const wallsByFloor: Record<string, Array<{ from: [number, number]; to: [number, number] }>> =
          buildingData.walls_by_floor || {}
    const roomPolygonsByFloor: Record<string, Array<{ id: string; label: string; polygon: [number, number][] }>> =
          buildingData.room_polygons_by_floor || {}

    // Group nodes by floor
    const floors = new Map<number, PathNode[]>()
    nodes.forEach((node) => {
      if (!floors.has(node.floor)) floors.set(node.floor, [])
      floors.get(node.floor)!.push(node)
    })

    // Compute per-floor centering offsets from wall bounds
    // Build a node lookup map
    const nodeMap = new Map<string, PathNode>()
    nodes.forEach((n) => nodeMap.set(n.id, n))

    const edges: Array<{ from: string; to: string }> = buildingData.edges || []

    // Helper: compute wall-centre offset for a floor
    const wallCentreOffset = (floorNum: number): { x: number; z: number } => {
      const walls = wallsByFloor[floorNum.toString()] || []
      if (walls.length > 0) {
        const allX = walls.flatMap((w) => [w.from[0], w.to[0]])
        const allZ = walls.flatMap((w) => [w.from[1], w.to[1]])
        const cx = (Math.min(...allX) + Math.max(...allX)) / 2
        const cz = (Math.min(...allZ) + Math.max(...allZ)) / 2
        return { x: -cx * SCALE, z: -cz * SCALE }
      }
      const fn = nodes.filter((n) => n.floor === floorNum)
      if (fn.length > 0) {
        const allX = fn.map((n) => n.x)
        const allZ = fn.map((n) => n.y)
        const cx = (Math.min(...allX) + Math.max(...allX)) / 2
        const cz = (Math.min(...allZ) + Math.max(...allZ)) / 2
        return { x: -cx * SCALE, z: -cz * SCALE }
      }
      return { x: 0, z: 0 }
    }

    // Ground floor is the anchor — centred from its own wall bounds
    const floorOffsets = new Map<number, { x: number; z: number }>()
    floorOffsets.set(0, wallCentreOffset(0))

    // For every floor above, find a cross-floor stair/elevator edge and
    // snap that node's world position to match its counterpart below
    for (let floor = 1; floor <= 3; floor++) {
      let anchor: { lower: PathNode; upper: PathNode } | null = null

      for (const edge of edges) {
        const a = nodeMap.get(edge.from)
        const b = nodeMap.get(edge.to)
        if (!a || !b) continue
        const isVertical = (a.type === 'stairs' || a.type === 'elevator') &&
                           (b.type === 'stairs' || b.type === 'elevator')
        if (!isVertical) continue
        if (a.floor === floor - 1 && b.floor === floor) { anchor = { lower: a, upper: b }; break }
        if (b.floor === floor - 1 && a.floor === floor) { anchor = { lower: b, upper: a }; break }
      }

      if (anchor && floorOffsets.has(floor - 1)) {
        const lowerOff = floorOffsets.get(floor - 1)!
        // World XZ of the lower stair/lift
        const worldX = anchor.lower.x * SCALE + lowerOff.x
        const worldZ = anchor.lower.y * SCALE + lowerOff.z
        // Offset that places the upper stair/lift at the same world XZ
        floorOffsets.set(floor, {
          x: worldX - anchor.upper.x * SCALE,
          z: worldZ - anchor.upper.y * SCALE,
        })
      } else {
        // No cross-floor edge found — fall back to wall-centre
        floorOffsets.set(floor, wallCentreOffset(floor))
      }
    }

    floorOffsetsRef.current = floorOffsets
    walkthroughRef.current?.setFloorOffsets(SCALE, floorOffsets)
        // Re-set path on walkthrough now that floor offsets are correct
        if (pathRef.current.length > 0) {
          walkthroughRef.current?.setPath(pathRef.current)
        }

    floors.forEach((nodesOnFloor, floorNum) => {
      if (!visibleFloors.has(floorNum)) return

      const { x: offX, z: offZ } = floorOffsets.get(floorNum)!
      const floorGeom = new BuildingGeometry(scene, offX, offZ)
      const yPos = floorNum * FLOOR_HEIGHT
      const floorWalls: Array<{ from: [number, number]; to: [number, number] }> =
        (buildingData.walls_by_floor || {})[floorNum.toString()] || []

      // ── Per-floor open/enclosed zone definitions (raw JSON coords) ───────
      // Bridge = open walkway between room clusters (floor only, no ceiling)
      // Enclosed = side-stairs corridor (floor + ceiling)
      const BRIDGE_ZONES: Record<number, { minX: number; maxX: number; minZ: number; maxZ: number }[]> = {
        1: [{ minX: 148, maxX: 304, minZ: 104, maxZ: 136 }],
        2: [{ minX: 168, maxX: 324, minZ: 118, maxZ: 150 }],
      }
      const ENCLOSED_CORRIDOR_ZONES: Record<number, { minX: number; maxX: number; minZ: number; maxZ: number }[]> = {
        1: [{ minX: 90, maxX: 165, minZ: 92, maxZ: 212 }],
        2: [{ minX: 110, maxX: 185, minZ: 86, maxZ: 226 }],
      }

      // ── Room polygon floor + ceiling slabs ───────────────────────────────
      const roomPolygonsForSlab = roomPolygonsByFloor[floorNum.toString()] || []

      roomPolygonsForSlab.forEach((room) => {
        // Floor
        floorGeom.createRoomFloorPolygon(room.polygon, SCALE, floorNum, FLOOR_HEIGHT, 0x2a2a3e)
        // Ceiling (if toggle on)
        if (floorCeilingsVisible[floorNum]) {
          floorGeom.createRoomFloorPolygon(
            room.polygon, SCALE, floorNum, FLOOR_HEIGHT, 0xf0f0f0,
            yPos + WALL_HEIGHT
          )
        }
      })

      // ── Floor slabs ────────────────────────────────────────────────────────
      // Ground floor: single slab (building is fully enclosed on ground)
      if (floorNum === 0 && floorWalls.length > 0) {
        const boundsWalls = floorWalls.filter((w) => w.from[0] > -55 && w.to[0] > -55)
        const validWalls = boundsWalls.length > 0 ? boundsWalls : floorWalls
        const allX = validWalls.flatMap((w) => [w.from[0], w.to[0]])
        const allZc = validWalls.flatMap((w) => [w.from[1], w.to[1]])
        const slabW = (Math.max(...allX) - Math.min(...allX)) * SCALE
        const slabD = (Math.max(...allZc) - Math.min(...allZc)) * SCALE
        const slabCX = ((Math.min(...allX) + Math.max(...allX)) / 2) * SCALE + offX
        const slabCZ = ((Math.min(...allZc) + Math.max(...allZc)) / 2) * SCALE + offZ
        const gf = new THREE.Mesh(
          new THREE.BoxGeometry(slabW, 5, slabD),
          MAT_FLOOR
        )
        gf.position.set(slabCX, yPos - 2.5, slabCZ)
        gf.userData.isBuilding = true
        scene.add(gf)
        if (floorCeilingsVisible[0]) {
          const gc = new THREE.Mesh(
            new THREE.BoxGeometry(slabW, 5, slabD),
            MAT_CEILING
          )
          gc.position.set(slabCX, yPos + WALL_HEIGHT, slabCZ)
          gc.userData.isBuilding = true
          scene.add(gc)
        }
      }

      // Floors 1-3: use room polygons + corridor zones (NOT bounding box)
      if (floorNum >= 1) {
        // Room polygon floor tiles
        roomPolygonsForSlab.forEach((room) => {
          const rxs = room.polygon.map((p: [number,number]) => p[0])
          const rzs = room.polygon.map((p: [number,number]) => p[1])
          const rMinX = Math.min(...rxs); const rMaxX = Math.max(...rxs)
          const rMinZ = Math.min(...rzs); const rMaxZ = Math.max(...rzs)
          const rW = (rMaxX - rMinX) * SCALE
          const rD = (rMaxZ - rMinZ) * SCALE
          const rCX = ((rMinX + rMaxX) / 2) * SCALE + offX
          const rCZ = ((rMinZ + rMaxZ) / 2) * SCALE + offZ
          // Floor tile
          const rf = new THREE.Mesh(
            new THREE.BoxGeometry(rW, 5, rD),
            MAT_FLOOR
          )
          rf.position.set(rCX, yPos - 2.5, rCZ)
          rf.userData.isBuilding = true
          scene.add(rf)
          // Ceiling tile
          if (floorCeilingsVisible[floorNum]) {
            const rc = new THREE.Mesh(
              new THREE.BoxGeometry(rW, 5, rD),
              MAT_CEILING
            )
            rc.position.set(rCX, yPos + WALL_HEIGHT, rCZ)
            rc.userData.isBuilding = true
            scene.add(rc)
          }
        })

        // Corridor zone floor + ceiling tiles
        const CORRIDOR_ZONES: Record<number, {minX:number;maxX:number;minZ:number;maxZ:number}[]> = {
          1: [{ minX: 90, maxX: 304, minZ: 72, maxZ: 212 }],
          2: [{ minX: 110, maxX: 324, minZ: 86, maxZ: 226 }],
          3: [{ minX: 56, maxX: 216, minZ: 50, maxZ: 98 }],
        }
        ;(CORRIDOR_ZONES[floorNum] || []).forEach((zone) => {
          const zW = (zone.maxX - zone.minX) * SCALE
          const zD = (zone.maxZ - zone.minZ) * SCALE
          const zCX = ((zone.minX + zone.maxX) / 2) * SCALE + offX
          const zCZ = ((zone.minZ + zone.maxZ) / 2) * SCALE + offZ
          const cf = new THREE.Mesh(
            new THREE.BoxGeometry(zW, 5, zD),
            MAT_FLOOR_DARK
          )
          cf.position.set(zCX, yPos - 2.5, zCZ)
          cf.userData.isBuilding = true
          scene.add(cf)
          if (floorCeilingsVisible[floorNum]) {
            const cc = new THREE.Mesh(
              new THREE.BoxGeometry(zW, 5, zD),
              MAT_CEILING
            )
            cc.position.set(zCX, yPos + WALL_HEIGHT, zCZ)
            cc.userData.isBuilding = true
            scene.add(cc)
          }
        })
      }

      // ── Ground floor room footprints + labels ──────────────────────────────
      if (floorNum === 0) {
        nodesOnFloor.filter((n) => n.type === 'room').forEach((room) => {
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(60, 4, 40),
            MAT_ROOM
          )
          mesh.position.set(room.x * SCALE + offX, yPos + 3, room.y * SCALE + offZ)
          mesh.userData.isBuilding = true
          scene.add(mesh)
          if (room.label) floorGeom.createRoomLabel(room.label, room.x * SCALE, room.y * SCALE, floorNum, FLOOR_HEIGHT)
        })
      }
      // ── Walls from actual segments ───────────────────────────────────────
      if (floorWallsVisible[floorNum] && floorWalls.length > 0) {
        const doorNodesOnFloor = nodesOnFloor.filter((n) => n.type === 'door')
                floorGeom.createWallSegments(
                  floorWalls, SCALE, floorNum, FLOOR_HEIGHT, WALL_HEIGHT, WALL_THICKNESS,
                  doorNodesOnFloor.map((n) => ({ x: n.x, y: n.y }))
                )
      }

      // ── Room labels (floors 1-3 use polygon centroids) ───────────────────
      roomPolygonsForSlab.forEach((room) => {
        if (room.label && room.polygon.length > 0) {
          const cx = room.polygon.reduce((s, p) => s + p[0], 0) / room.polygon.length
          const cz = room.polygon.reduce((s, p) => s + p[1], 0) / room.polygon.length
          floorGeom.createRoomLabel(room.label, cx * SCALE, cz * SCALE, floorNum, FLOOR_HEIGHT)
        }
      })

      // ── Stairs ───────────────────────────────────────────────────────────
      const MAIN_STAIR_IDS = new Set(['stairs_2', 'stairs_f1_1', 'stairs_f2_1', 'stairs_f3_1'])
      const SIDE_STAIR_IDS = new Set(['stairs_1', 'stairs_f1_2', 'stairs_f2_2', 'stairs_f3_2'])

      nodesOnFloor.filter((n) => n.type === 'stairs').forEach((stair) => {
        let rotationY = 0
        let nudge = { x: 0, z: 0 }
        if (MAIN_STAIR_IDS.has(stair.id)) {
          rotationY = Math.PI
        } else if (SIDE_STAIR_IDS.has(stair.id)) {
          rotationY = Math.PI / 2
          nudge = { x: -55, z: 0 }
        }
        floorGeom.createStairMarker(stair.x * SCALE, stair.y * SCALE, floorNum, FLOOR_HEIGHT, rotationY, nudge)
      })

      // ── Elevator ─────────────────────────────────────────────────────────
      nodesOnFloor.filter((n) => n.type === 'elevator').forEach((elev) =>
        floorGeom.createElevatorMarker(elev.x * SCALE, elev.y * SCALE, floorNum, FLOOR_HEIGHT)
      )

      // ── Entrance markers ─────────────────────────────────────────────────
      const GLASS_ENTRANCES: Record<string, { angleDeg: number; width: number }> = {
        lobby_entrance: { angleDeg: -90, width: 100 },
        side_entrance:  { angleDeg: -0, width: 80 },
      }

      nodesOnFloor.filter((n) => n.type === 'entrance').forEach((ent) => {
        const glassCfg = GLASS_ENTRANCES[ent.id]
        if (glassCfg) {
          floorGeom.createGlassEntrance(
            ent.x * SCALE,
            ent.y * SCALE,
            floorNum,
            FLOOR_HEIGHT,
            glassCfg.angleDeg,
            glassCfg.width
          )
        } else {
          // Fallback cylinder for emergency exit etc.
          const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(18, 18, 25, 16),
            MAT_ENTRANCE
          )
          mesh.position.set(ent.x * SCALE + offX, yPos + 12, ent.y * SCALE + offZ)
          mesh.userData.isBuilding = true
          scene.add(mesh)
        }
      })
      // ── Doors — snapped to wall, pushed outward toward corridor ──────────
      nodesOnFloor.filter((n) => n.type === 'door').forEach((door) => {
        let snapX = door.x * SCALE
        let snapZ = door.y * SCALE
        let bestDist = Infinity
        let bestAngleDeg = 0

        floorWalls.forEach((wall) => {
          const wdx = wall.to[0] - wall.from[0]
          const wdz = wall.to[1] - wall.from[1]
          const len2 = wdx * wdx + wdz * wdz
          if (len2 < 0.01) return
          const t = Math.max(0.05, Math.min(0.95,
            ((door.x - wall.from[0]) * wdx + (door.y - wall.from[1]) * wdz) / len2
          ))
          const px = (wall.from[0] + t * wdx) * SCALE
          const pz = (wall.from[1] + t * wdz) * SCALE
          const dist = Math.sqrt((px - door.x * SCALE) ** 2 + (pz - door.y * SCALE) ** 2)
          if (dist < bestDist) {
            bestDist = dist
            snapX = px
            snapZ = pz
            bestAngleDeg = (Math.atan2(wdz, wdx) * 180) / Math.PI
          }
        })

        // Push door outward past wall toward the corridor side
        // Direction: from original door position through snap point and beyond
        const ddx = snapX - door.x * SCALE
        const ddz = snapZ - door.y * SCALE
        const dlen = Math.sqrt(ddx * ddx + ddz * ddz) || 1
        const outwardX = snapX + (ddx / dlen) * 6
        const outwardZ = snapZ + (ddz / dlen) * 6

        floorGeom.createDoorMarker(outwardX, outwardZ, floorNum, FLOOR_HEIGHT, bestAngleDeg)
      })

    })
}
  // ── Pathfinding ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (pathfinder && startRoom && endRoom) {
      console.log('Finding path:', startRoom, '->', endRoom)
      const result = pathfinder.findPath(startRoom, endRoom, requireAccessible, useSideStairs)
      console.log('Result:', result.found, 'path length:', result.path.length)
      if (result.found) {
        setPath(result.path)
        const instrs = generateNavInstructions(result.path)
        setNavInstructions(instrs)
        if (!voiceMuted) speakInstructions(instrs)
        if (sceneRef.current) drawPath3D(sceneRef.current, result.path)
      } else {
        setPath([])
      }
    }
  }, [startRoom, endRoom, requireAccessible, pathfinder])

  const drawPath3D = (scene: THREE.Scene, pathNodes: PathNode[]) => {
    // Remove old path
    const old = scene.getObjectByName('pathLine')
    if (old) scene.remove(old)
    scene.children
      .filter((o) => o.name.startsWith('pathSphere_'))
      .forEach((o) => scene.remove(o))

    if (pathNodes.length < 2) return

    const getPos = (node: PathNode) => {
      const off = floorOffsetsRef.current.get(node.floor) || { x: 0, z: 0 }
      return new THREE.Vector3(
        node.x * SCALE + off.x,
        node.floor * FLOOR_HEIGHT + 6,
        node.y * SCALE + off.z
      )
    }

    const points = pathNodes.map(getPos)
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: 0xff4444, linewidth: 6 })
    )
    line.name = 'pathLine'
    scene.add(line)

    pathNodes.forEach((node, i) => {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(6, 14, 14),
        MAT_PATH
      )
      sphere.position.copy(getPos(node))
      sphere.name = `pathSphere_${i}`
      scene.add(sphere)
    })
  }

  // ── Floor toggle helpers ────────────────────────────────────────────────────
  const toggleFloor = (f: number) =>
    setVisibleFloors((prev) => {
      const s = new Set(prev)
      s.has(f) ? s.delete(f) : s.add(f)
      return s
    })
  const toggleWalls = (f: number) =>
    setFloorWallsVisible((prev) => ({ ...prev, [f]: !prev[f] }))
  const toggleCeiling = (f: number) =>
    setFloorCeilingsVisible((prev) => ({ ...prev, [f]: !prev[f] }))

  // ── Walkthrough controls ────────────────────────────────────────────────────
  const startWalkthrough = () => {
    if (!walkthroughRef.current || path.length < 2) return
    walkthroughRef.current.setPath(path)
    setWalkthroughActive(true)
    setWalkthroughPlaying(true)
    walkthroughRef.current.play()
  }
  const pauseWalkthrough = () => {
    walkthroughRef.current?.pause()
    setWalkthroughPlaying(false)
  }
  const resumeWalkthrough = () => {
    walkthroughRef.current?.play()
    setWalkthroughPlaying(true)
  }
  const resetWalkthrough = () => {
    walkthroughRef.current?.reset()
    setWalkthroughActive(false)
    setWalkthroughPlaying(false)
    setWalkthroughProgress(0)
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(600, 900, 1200)
      cameraRef.current.lookAt(0, 0, 0)
      controlsRef.current.enabled = true
    }
  }
  const changeWalkthroughSpeed = (s: number) => {
    setWalkthroughSpeed(s)
    walkthroughRef.current?.setSpeed(s)
  }

  const clearPath = () => {
    setStartRoom('')
    setEndRoom('')
    setPath([])
    setNavInstructions([])
    stopSpeech()
    if (sceneRef.current) {
      const old = sceneRef.current.getObjectByName('pathLine')
      if (old) sceneRef.current.remove(old)
      sceneRef.current.children
        .filter((o) => o.name.startsWith('pathSphere_'))
        .forEach((o) => sceneRef.current!.remove(o))
    }
  }

const allRoomNodes = graph?.getAllNodes().filter((n) => n.type === 'room') ?? []
const allDoorNodes = graph?.getAllNodes().filter((n) => n.type === 'door') ?? []
const entranceNodes = graph?.getAllNodes().filter((n) => n.type === 'entrance') ?? []
const allFloors = [0, 1, 2, 3]
const floorLabels: Record<number, string> = { 0: 'Ground', 1: 'Floor 1', 2: 'Floor 2', 3: 'Floor 3' }

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: '#0a0e1a', display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div style={{ background: 'rgba(15,23,42,0.97)', borderBottom: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', padding: '12px 24px', flexShrink: 0 }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

          {/* Top row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button onClick={() => navigate('/')}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#94a3b8', padding: '6px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              >← Home</button>
              <button onClick={() => navigate('/2d-viewer')}
                style={{ background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >📍 2D Map</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22d3ee', boxShadow: '0 0 8px #22d3ee' }} />
                <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>CSIS Building — 3D Viewer</h1>
              </div>
            </div>

            {/* Floor toggles */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {allFloors.map((f) => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '4px 8px' }}>
                  <button onClick={() => toggleFloor(f)}
                    style={{ background: visibleFloors.has(f) ? 'rgba(59,130,246,0.3)' : 'transparent', border: visibleFloors.has(f) ? '1px solid rgba(59,130,246,0.5)' : '1px solid transparent', borderRadius: '6px', color: visibleFloors.has(f) ? '#93c5fd' : '#475569', padding: '3px 8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >{floorLabels[f]}</button>
                  <button onClick={() => toggleWalls(f)} disabled={!visibleFloors.has(f)}
                    style={{ background: visibleFloors.has(f) && floorWallsVisible[f] ? 'rgba(234,179,8,0.25)' : 'transparent', border: 'none', borderRadius: '4px', color: visibleFloors.has(f) && floorWallsVisible[f] ? '#fde047' : '#334155', padding: '3px 6px', fontSize: '11px', cursor: 'pointer' }}
                  >Walls</button>
                  <button onClick={() => toggleCeiling(f)} disabled={!visibleFloors.has(f)}
                    style={{ background: visibleFloors.has(f) && floorCeilingsVisible[f] ? 'rgba(59,130,246,0.25)' : 'transparent', border: 'none', borderRadius: '4px', color: visibleFloors.has(f) && floorCeilingsVisible[f] ? '#93c5fd' : '#334155', padding: '3px 6px', fontSize: '11px', cursor: 'pointer' }}
                  >Ceil</button>
                </div>
              ))}
              <button onClick={() => setVisibleFloors(new Set(allFloors))}
                style={{ background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '8px', color: '#c084fc', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >All Floors</button>
            </div>
          </div>

          {/* Controls row */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {/* Start */}
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Start</div>
              <select value={startRoom} onChange={(e) => setStartRoom(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#f1f5f9', padding: '7px 10px', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
              >
                <option value="" style={{ background: '#1e293b' }}>Select start…</option>
                <optgroup label="Entrances">
                  {entranceNodes.map((n) => <option key={n.id} value={n.id} style={{ background: '#1e293b' }}>{n.label || n.id}</option>)}
                </optgroup>
                <optgroup label="Rooms">
                  {allDoorNodes.map((n) => <option key={n.id} value={n.id} style={{ background: '#1e293b' }}>{n.label || n.id} ({floorLabels[n.floor] ?? `Floor ${n.floor}`})</option>)}
                </optgroup>
              </select>
            </div>

            {/* Destination */}
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Destination</div>
              <select value={endRoom} onChange={(e) => setEndRoom(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#f1f5f9', padding: '7px 10px', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
              >
                <option value="" style={{ background: '#1e293b' }}>Select destination…</option>
                {allDoorNodes.map((n) => <option key={n.id} value={n.id} style={{ background: '#1e293b' }}>{n.label || n.id} ({floorLabels[n.floor] ?? `Floor ${n.floor}`})</option>)}
              </select>
            </div>

            {/* Options */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => { setUseSideStairs(!useSideStairs); if (!useSideStairs) setRequireAccessible(false) }}
                style={{ background: useSideStairs ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.06)', border: useSideStairs ? '1px solid rgba(249,115,22,0.4)' : '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: useSideStairs ? '#fb923c' : '#64748b', padding: '7px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >{useSideStairs ? '✓ ' : ''}Side Stairs</button>
              <button
                onClick={() => { setRequireAccessible(!requireAccessible); if (!requireAccessible) setUseSideStairs(false) }}
                style={{ background: requireAccessible ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)', border: requireAccessible ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: requireAccessible ? '#4ade80' : '#64748b', padding: '7px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >{requireAccessible ? '✓ ' : ''}Elevator Priority</button>
              <button onClick={clearPath}
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#f87171', padding: '7px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >Clear</button>
            </div>
          </div>

          {/* Path info + walkthrough */}
          {path.length > 0 && (
            <div style={{ marginTop: '10px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '10px', padding: '10px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: '#93c5fd', fontWeight: 600 }}>
                  {path.length} steps
                  {path.some((n) => n.type === 'stairs') && ' · via stairs'}
                  {path.some((n) => n.type === 'elevator') && ' · via lift'}
                  {' · '}
                  {[...new Set(path.map((n) => n.floor))].map((f) => floorLabels[f] ?? `Floor ${f}`).join(', ')}
                </span>

                {/* Walkthrough controls */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {!walkthroughActive ? (
                    <button onClick={startWalkthrough}
                      style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                    >▶ Start Walkthrough</button>
                  ) : (
                    <>
                      {walkthroughPlaying
                        ? <button onClick={pauseWalkthrough} style={{ background: 'rgba(234,179,8,0.2)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: '8px', color: '#fde047', padding: '7px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>⏸ Pause</button>
                        : <button onClick={resumeWalkthrough} style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '8px', color: '#34d399', padding: '7px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>▶ Resume</button>
                      }
                      <button onClick={resetWalkthrough} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#f87171', padding: '7px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>🔄 Reset</button>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '4px 8px' }}>
                        <span style={{ fontSize: '12px', color: '#475569', marginRight: '4px' }}>Speed:</span>
                        {[1.0, 2.0, 4.0].map((s) => (
                          <button key={s} onClick={() => changeWalkthroughSpeed(s)}
                            style={{ background: walkthroughSpeed === s ? 'rgba(59,130,246,0.3)' : 'transparent', border: walkthroughSpeed === s ? '1px solid rgba(59,130,246,0.5)' : '1px solid transparent', borderRadius: '6px', color: walkthroughSpeed === s ? '#93c5fd' : '#475569', padding: '3px 8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                          >{s}x</button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '140px' }}>
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: '999px', height: '6px' }}>
                          <div style={{ background: 'linear-gradient(90deg,#10b981,#06b6d4)', height: '6px', borderRadius: '999px', width: `${walkthroughProgress * 100}%`, transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize: '12px', color: '#475569' }}>{Math.round(walkthroughProgress * 100)}%</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Navigation Instructions */}
              {navInstructions.length > 0 && (
                <div style={{ marginTop: '8px', borderTop: '1px solid rgba(59,130,246,0.2)', paddingTop: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <button onClick={() => setShowInstructions(v => !v)}
                      style={{ background: 'none', border: 'none', color: '#93c5fd', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    >{showInstructions ? 'Hide' : 'Show'} directions ({navInstructions.length} steps)</button>
                    <button
                      onClick={() => { const next = !voiceMuted; setVoiceMuted(next); if (next) stopSpeech(); else speakInstructions(navInstructions) }}
                      style={{ background: voiceMuted ? 'rgba(255,255,255,0.06)' : 'rgba(59,130,246,0.25)', border: voiceMuted ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(59,130,246,0.4)', borderRadius: '6px', color: voiceMuted ? '#475569' : '#93c5fd', padding: '2px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >{voiceMuted ? '🔇 Muted' : '🔊 Speaking'}</button>
                  </div>
                  {showInstructions && (
                    <ol style={{ margin: 0, padding: 0, listStyle: 'none', maxHeight: '90px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {navInstructions.map((instr) => (
                        <li key={instr.step} style={{ display: 'flex', gap: '8px', fontSize: '12px', color: '#94a3b8' }}>
                          <span style={{ color: '#475569', minWidth: '16px' }}>{instr.step}.</span>
                          <span>{instr.icon} {instr.text}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Three.js canvas */}
      <div ref={containerRef} style={{ flex: 1 }} />

      {/* Stair transition overlay */}
      {stairTransitionMsg && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(10,14,26,0.92)', border: '1px solid rgba(59,130,246,0.4)', borderRadius: '14px', color: '#f1f5f9', padding: '20px 36px', fontSize: '17px', fontWeight: 700, pointerEvents: 'none', boxShadow: '0 0 40px rgba(59,130,246,0.2)', backdropFilter: 'blur(12px)' }}>
          {stairTransitionMsg}
        </div>
      )}

      {/* Controls hint */}
      <div style={{ position: 'absolute', bottom: '16px', left: '16px', background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#475569', pointerEvents: 'none', backdropFilter: 'blur(8px)', lineHeight: 1.6 }}>
        <span style={{ color: '#64748b', fontWeight: 600 }}>Controls: </span>Left-drag rotate · Right-drag pan · Scroll zoom<br />
        Toggle floors · Select rooms · Walkthrough for first-person view
      </div>
    </div>
  )
}

export default Viewer3D