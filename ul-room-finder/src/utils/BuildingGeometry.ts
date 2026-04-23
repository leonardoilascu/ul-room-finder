import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js'

export class BuildingGeometry {
  private scene: THREE.Scene
  private offsetX: number
  private offsetZ: number

  // Shared materials — created once, reused across all geometry

  private static floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3e, roughness: 0.8 })
  private static ceilingMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.9 })
  private static stepMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.8 })
  private static railMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 })
  private static frameMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.7 })
  private static doorMat = new THREE.MeshStandardMaterial({ color: 0xa0784a, roughness: 0.6, metalness: 0.1 })

  private static wallMat = BuildingGeometry.createBrickMaterial()

  private static createBrickMaterial(): THREE.MeshStandardMaterial {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 256
    const ctx = canvas.getContext('2d')!

    // Base brick colour
    ctx.fillStyle = '#d4703a'   // base
    ctx.fillRect(0, 0, 512, 256)

    // Draw bricks
    const brickW = 64
    const brickH = 32
    const mortarSize = 4

    ctx.fillStyle = '#c45e2a'   // brick colour
    for (let row = 0; row < 256 / brickH; row++) {
      const offset = (row % 2 === 0) ? 0 : brickW / 2
      for (let col = -1; col < 512 / brickW + 1; col++) {
        const x = col * brickW + offset + mortarSize / 2
        const y = row * brickH + mortarSize / 2
        const w = brickW - mortarSize
        const h = brickH - mortarSize
        // Slight colour variation per brick
        const variation = (Math.sin(row * 7 + col * 13) * 0.5 + 0.5) * 20 - 10
        const r = Math.min(255, Math.max(0, 196 + variation))
        const g = Math.min(255, Math.max(0, 94 + variation * 0.5))
        const b = Math.min(255, Math.max(0, 42 + variation * 0.3))
        ctx.fillStyle = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
        ctx.fillRect(x, y, w, h)
      }
    }

    // Mortar lines (already show through as the base colour)
    ctx.fillStyle = '#e8916a'
    for (let row = 0; row <= 256 / brickH; row++) {
      ctx.fillRect(0, row * brickH - mortarSize / 2, 512, mortarSize)
    }
    for (let row = 0; row < 256 / brickH; row++) {
      const offset = (row % 2 === 0) ? 0 : brickW / 2
      for (let col = -1; col < 512 / brickW + 1; col++) {
        const x = col * brickW + offset
        ctx.fillRect(x - mortarSize / 2, row * brickH, mortarSize, brickH)
      }
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(4, 2)

    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.85,
      metalness: 0.0,
    })
  }

  constructor(scene: THREE.Scene, offsetX: number = 0, offsetZ: number = 0) {
    this.scene = scene
    this.offsetX = offsetX
    this.offsetZ = offsetZ
  }

createWallSegments(
  walls: Array<{ from: [number, number]; to: [number, number] }>,
  scale: number,
  floor: number,
  floorHeight: number,
  wallHeight: number = 125,
  wallThickness: number = 8,
  doorNodes: Array<{ x: number; y: number }> = []
) {
  const yPos = floor * floorHeight
  const doorGap = 18
  const geometries: THREE.BufferGeometry[] = []

  const addBox = (cx: number, cy: number, cz: number, w: number, h: number, d: number, rotY: number) => {
    const geom = new THREE.BoxGeometry(w, h, d)
    const matrix = new THREE.Matrix4()
    matrix.makeRotationY(rotY)
    matrix.setPosition(cx, cy, cz)
    geom.applyMatrix4(matrix)
    geometries.push(geom)
  }

  walls.forEach((wall) => {
    const x1 = wall.from[0] * scale + this.offsetX
    const z1 = wall.from[1] * scale + this.offsetZ
    const x2 = wall.to[0] * scale + this.offsetX
    const z2 = wall.to[1] * scale + this.offsetZ
    const dx = x2 - x1
    const dz = z2 - z1
    const length = Math.sqrt(dx * dx + dz * dz)
    if (length < 0.5) return
    const angle = -Math.atan2(dz, dx)

    const cuts: number[] = []
    doorNodes.forEach((door) => {
      const doorX = door.x * scale + this.offsetX
      const doorZ = door.y * scale + this.offsetZ
      const t = ((doorX - x1) * dx + (doorZ - z1) * dz) / (length * length)
      if (t < 0.05 || t > 0.95) return
      const projX = x1 + t * dx
      const projZ = z1 + t * dz
      const perpDist = Math.sqrt((doorX - projX) ** 2 + (doorZ - projZ) ** 2)
      if (perpDist < 15) cuts.push(t)
    })

    const addSegment = (tStart: number, tEnd: number) => {
      const segLen = (tEnd - tStart) * length
      if (segLen < 1) return
      const cx = x1 + (tStart + tEnd) / 2 * dx
      const cz = z1 + (tStart + tEnd) / 2 * dz
      addBox(cx, yPos + wallHeight / 2, cz, segLen, wallHeight, wallThickness, angle)
    }

    if (cuts.length === 0) {
      addBox((x1 + x2) / 2, yPos + wallHeight / 2, (z1 + z2) / 2, length, wallHeight, wallThickness, angle)
    } else {
      cuts.sort((a, b) => a - b)
      const gapT = doorGap / length
      let cursor = 0
      cuts.forEach((t) => {
        const gapStart = Math.max(0, t - gapT)
        const gapEnd = Math.min(1, t + gapT)
        if (cursor < gapStart) addSegment(cursor, gapStart)
        // Lintel above door
        const lintelH = wallHeight * 0.2
        const doorMidT = (gapStart + gapEnd) / 2
        const doorCx = x1 + doorMidT * dx
        const doorCz = z1 + doorMidT * dz
        const doorSegLen = (gapEnd - gapStart) * length
        addBox(doorCx, yPos + wallHeight - lintelH / 2, doorCz, doorSegLen, lintelH, wallThickness, angle)
        cursor = gapEnd
      })
      if (cursor < 1) addSegment(cursor, 1)
    }
  })

  if (geometries.length === 0) return

  // Merge all wall geometry into ONE mesh — massive performance win
  const merged = BufferGeometryUtils.mergeGeometries(geometries)
  if (!merged) return
  const mesh = new THREE.Mesh(merged, BuildingGeometry.wallMat)
  mesh.userData.isBuilding = true
  this.scene.add(mesh)

  // Dispose individual geometries
  geometries.forEach(g => g.dispose())
}

createRoomFloorPolygon(
  polygon: [number, number][],
  scale: number,
  floor: number,
  floorHeight: number,
  color: number = 0x1e3a5f,
  yWorldOverride?: number   // if provided, use this Y directly (for ceiling)
) {
  if (polygon.length < 3) return
  const yPos = yWorldOverride ?? (floor * floorHeight + 1)

  const shape = new THREE.Shape()
  polygon.forEach(([px, pz], i) => {
    const x = px * scale + this.offsetX
    const z = pz * scale + this.offsetZ
    if (i === 0) shape.moveTo(x, z)
    else shape.lineTo(x, z)
  })
  shape.closePath()

const geom = new THREE.ShapeGeometry(shape)
geom.rotateX(Math.PI / 2)

  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, transparent: color !== 0xf0f0f0, opacity: color === 0xf0f0f0 ? 1.0 : 0.55, side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.position.set(0, yPos, 0)
  mesh.userData.isBuilding = true
  this.scene.add(mesh)
}

  // ─── NEW: Text label sprite at a world position ──────────────────────────
  createRoomLabel(
    label: string,
    x: number,
    z: number,
    floor: number,
    floorHeight: number
  ) {
    const yPos = floor * floorHeight
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 384
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, 256, 96)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = 'bold 112px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, 512, 192)

    const texture = new THREE.CanvasTexture(canvas)
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true })
    )
    sprite.position.set(x + this.offsetX, yPos + 55, z + this.offsetZ)
    sprite.scale.set(192, 72, 1)
    sprite.userData.isBuilding = true
    this.scene.add(sprite)
  }

// Rectangular slab in JSON-space coordinates (scale applied internally)
createRectSlab(
  minX: number, minZ: number,
  maxX: number, maxZ: number,
  scale: number,
  yWorld: number,
  color: number,
  opacity: number = 1.0
) {
  const w = (maxX - minX) * scale
  const d = (maxZ - minZ) * scale
  const cx = ((minX + maxX) / 2) * scale + this.offsetX
  const cz = ((minZ + maxZ) / 2) * scale + this.offsetZ

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, 5, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8, transparent: opacity < 1, opacity })
  )
  mesh.position.set(cx, yWorld, cz)
  mesh.userData.isBuilding = true
  this.scene.add(mesh)
}

  // ─── NEW: Ceiling slab sized from wall bounds ────────────────────────────
  createCeilingFromWalls(
    walls: Array<{ from: [number, number]; to: [number, number] }>,
    scale: number,
    floor: number,
    floorHeight: number,
    wallHeight: number
  ) {
    if (walls.length === 0) return
    const yPos = floor * floorHeight + wallHeight + 2
    const allX = walls.flatMap((w) => [w.from[0], w.to[0]])
    const allZ = walls.flatMap((w) => [w.from[1], w.to[1]])
    const w = (Math.max(...allX) - Math.min(...allX)) * scale + 60
    const d = (Math.max(...allZ) - Math.min(...allZ)) * scale + 60

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, 5, d),
      new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.9 })
    )
    mesh.position.set(0, yPos, 0)
    mesh.userData.isBuilding = true
    this.scene.add(mesh)
  }
createDoorMarker(
  x: number,
  z: number,
  floor: number,
  floorHeight: number,
  wallAngleDeg: number = 0   // angle of the nearest wall in degrees
) {
  const yPos = floor * floorHeight
  const doorW = 22
  const doorH = 70
  const frameThickness = 3

  // The door opens perpendicular to the wall it's in.
  // Wall angle 0/180 = horizontal wall → door panel swings in Z
  // Wall angle 90/-90 = vertical wall → door panel swings in X
  const wallAngleRad = (wallAngleDeg * Math.PI) / 180

  const frameMat = BuildingGeometry.frameMat
  const doorMat = BuildingGeometry.doorMat

  const group = new THREE.Group()
  group.position.set(x + this.offsetX, yPos, z + this.offsetZ)
  group.rotation.y = wallAngleRad

  // Left frame post
  const leftPost = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, doorH, frameThickness), frameMat)
  leftPost.position.set(-doorW / 2, doorH / 2, 0)
  group.add(leftPost)

  // Right frame post
  const rightPost = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, doorH, frameThickness), frameMat)
  rightPost.position.set(doorW / 2, doorH / 2, 0)
  group.add(rightPost)

  // Top lintel
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + frameThickness, frameThickness, frameThickness), frameMat)
  lintel.position.set(0, doorH, 0)
  group.add(lintel)

  // Door panel (slightly open — rotated ~30° from closed)
  const panel = new THREE.Mesh(new THREE.BoxGeometry(doorW - 4, doorH - 4, 2), doorMat)
  // Pivot from left edge: offset panel centre, rotate around left edge
  panel.position.set((doorW - 4) / 2, (doorH - 4) / 2, -3)
  const panelPivot = new THREE.Group()
  panelPivot.position.set(-doorW / 2, 1, 0)
  panelPivot.rotation.y = Math.PI / 6   // ~30° open
  panelPivot.add(panel)
  group.add(panelPivot)

  group.userData.isBuilding = true
  this.scene.add(group)
}

createGlassEntrance(
  x: number,
  z: number,
  floor: number,
  floorHeight: number,
  wallAngleDeg: number = 0,
  width: number = 90
) {
  const yPos = floor * floorHeight
  const wallAngleRad = (wallAngleDeg * Math.PI) / 180
  const doorH = 110
  const panelW = width / 2 - 3
  const frameT = 4

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.2,
    metalness: 0.95,
  })
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x99ccff,
    roughness: 0.0,
    metalness: 0.1,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
  })

  const group = new THREE.Group()
  group.position.set(x + this.offsetX, yPos, z + this.offsetZ)
  group.rotation.y = wallAngleRad

  // Outer frame: top bar + two side posts + centre divider
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(width + frameT, frameT, frameT), frameMat)
  topBar.position.set(0, doorH, 0)
  group.add(topBar)

  const leftPost = new THREE.Mesh(new THREE.BoxGeometry(frameT, doorH, frameT), frameMat)
  leftPost.position.set(-width / 2, doorH / 2, 0)
  group.add(leftPost)

  const rightPost = new THREE.Mesh(new THREE.BoxGeometry(frameT, doorH, frameT), frameMat)
  rightPost.position.set(width / 2, doorH / 2, 0)
  group.add(rightPost)

  const centrePost = new THREE.Mesh(new THREE.BoxGeometry(frameT, doorH, frameT), frameMat)
  centrePost.position.set(0, doorH / 2, 0)
  group.add(centrePost)

  // Mid rail on each panel
  const midRailL = new THREE.Mesh(new THREE.BoxGeometry(panelW, frameT, frameT), frameMat)
  midRailL.position.set(-width / 4, doorH * 0.4, 0)
  group.add(midRailL)

  const midRailR = new THREE.Mesh(new THREE.BoxGeometry(panelW, frameT, frameT), frameMat)
  midRailR.position.set(width / 4, doorH * 0.4, 0)
  group.add(midRailR)

  // Door handles
  const handleGeo = new THREE.BoxGeometry(2, 18, 4)
  const leftHandle = new THREE.Mesh(handleGeo, frameMat)
  leftHandle.position.set(-4, doorH * 0.5, 2)
  group.add(leftHandle)

  const rightHandle = new THREE.Mesh(handleGeo, frameMat)
  rightHandle.position.set(4, doorH * 0.5, 2)
  group.add(rightHandle)

  // Left glass panel — pivots from left post, opens ~25° outward
  const leftPivot = new THREE.Group()
  leftPivot.position.set(-width / 2, 0, 0)
  leftPivot.rotation.y = Math.PI / 7
  const leftGlass = new THREE.Mesh(new THREE.BoxGeometry(panelW, doorH - frameT * 2, 2), glassMat)
  leftGlass.position.set(panelW / 2, doorH / 2, 0)
  leftPivot.add(leftGlass)
  group.add(leftPivot)

  // Right glass panel — pivots from right post, opens ~25° outward
  const rightPivot = new THREE.Group()
  rightPivot.position.set(width / 2, 0, 0)
  rightPivot.rotation.y = -Math.PI / 7
  const rightGlass = new THREE.Mesh(new THREE.BoxGeometry(panelW, doorH - frameT * 2, 2), glassMat)
  rightGlass.position.set(-panelW / 2, doorH / 2, 0)
  rightPivot.add(rightGlass)
  group.add(rightPivot)

  // Ground threshold strip
  const threshold = new THREE.Mesh(new THREE.BoxGeometry(width, 3, 8), frameMat)
  threshold.position.set(0, 1.5, 0)
  group.add(threshold)

  group.userData.isBuilding = true
  this.scene.add(group)
}
  // ─── NEW: Staircase at node position ─────────────────────────────────────
createStairMarker(
  x: number,
  z: number,
  floor: number,
  floorHeight: number,
  rotationY: number = 0,
  nudge: { x: number; z: number } = { x: 0, z: 0 }
) {
  const yPos = floor * floorHeight
  const numSteps = 12
  const stepH = 125 / numSteps
  const stepD = 9
  const stepW = 48

  // Use a Group so rotation + nudge apply to everything together
  const group = new THREE.Group()
  group.position.set(x + this.offsetX + nudge.x, yPos, z + this.offsetZ + nudge.z)
  group.rotation.y = rotationY

  const stepMat = BuildingGeometry.stepMat
  const railMat = BuildingGeometry.railMat

  for (let i = 0; i < numSteps; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(stepW, stepH, stepD), stepMat)
    step.position.set(0, i * stepH + stepH / 2, i * stepD)
    group.add(step)
  }

  for (let i = 0; i <= numSteps; i += 3) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 35, 8), railMat)
    post.position.set(stepW / 2, i * stepH + 18, i * stepD)
    group.add(post)
  }

  group.userData.isBuilding = true
  this.scene.add(group)

  // Label above the group
  this._makeLabel('STAIRS', x + nudge.x, z + nudge.z, yPos + 145, 0xfbbf24)
}

  // ─── NEW: Elevator marker at node position ────────────────────────────────
  createElevatorMarker(x: number, z: number, floor: number, floorHeight: number) {
    const yPos = floor * floorHeight

    // Shaft
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(42, 130, 42),
      new THREE.MeshStandardMaterial({
        color: 0x555566,
        roughness: 0.5,
        metalness: 0.4,
        transparent: true,
        opacity: 0.75,
      })
    )
    shaft.position.set(x + this.offsetX, yPos + 65, z + this.offsetZ)
    shaft.userData.isBuilding = true
    this.scene.add(shaft)

    // Car
    const car = new THREE.Mesh(
      new THREE.BoxGeometry(32, 68, 32),
      new THREE.MeshStandardMaterial({
        color: 0x8b5cf6,
        roughness: 0.3,
        metalness: 0.7,
      })
    )
    car.position.set(x + this.offsetX, yPos + 38, z + this.offsetZ)
    car.userData.isBuilding = true
    this.scene.add(car)

    this._makeLabel('LIFT', x, z, yPos + 148, 0xa78bfa)
  }

  // ─── Private helper: canvas text sprite ─────────────────────────────────
  private _makeLabel(
    text: string,
    x: number,
    z: number,
    worldY: number,
    color: string | number
  ) {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, 128, 64)
    const hexColor =
      typeof color === 'number'
        ? `#${color.toString(16).padStart(6, '0')}`
        : color
    ctx.fillStyle = hexColor
    ctx.font = 'bold 22px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 64, 32)

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
      })
    )
    sprite.position.set(x + this.offsetX, worldY, z + this.offsetZ)
    sprite.scale.set(55, 28, 1)
    sprite.userData.isBuilding = true
    this.scene.add(sprite)
  }

  // ─── LEGACY: kept for backward compatibility ─────────────────────────────

  createExteriorWalls(floor: number, floorHeight: number, allNodes: any[]) {
    const wallHeight = 120
    const wallThickness = 10
    const yPosition = floor * floorHeight
    const padding = 25
    const floorNodes = allNodes.filter((n) => n.floor === floor)
    if (floorNodes.length === 0) return
    const xCoords = floorNodes.map((n) => n.x)
    const zCoords = floorNodes.map((n) => n.y)
    const minX = Math.min(...xCoords) - padding
    const maxX = Math.max(...xCoords) + padding
    const minZ = Math.min(...zCoords) - padding
    const maxZ = Math.max(...zCoords) + padding
    const width = maxX - minX
    const depth = maxZ - minZ
    const centerX = (minX + maxX) / 2
    const centerZ = (minZ + maxZ) / 2
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.9,
      metalness: 0.1,
    })
    ;[
      { w: width, h: wallHeight, d: wallThickness, x: centerX, z: minZ },
      { w: width, h: wallHeight, d: wallThickness, x: centerX, z: maxZ },
      { w: wallThickness, h: wallHeight, d: depth, x: minX, z: centerZ },
      { w: wallThickness, h: wallHeight, d: depth, x: maxX, z: centerZ },
    ].forEach(({ w, h, d, x, z }) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        wallMaterial
      )
      m.position.set(x + this.offsetX, yPosition + h / 2, z + this.offsetZ)
      m.userData.isBuilding = true
      this.scene.add(m)
    })
  }

  createRoomWalls(
    roomX: number,
    roomY: number,
    floor: number,
    floorHeight: number,
    roomWidth = 80,
    roomDepth = 50
  ) {
    const wallHeight = 100
    const wallThickness = 5
    const yPosition = floor * floorHeight
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      roughness: 0.8,
    })
    const walls = [
      { w: roomWidth / 2 - 15, h: wallHeight, d: wallThickness, x: roomX - roomWidth / 4 - 7.5, z: roomY - roomDepth / 2 },
      { w: roomWidth / 2 - 15, h: wallHeight, d: wallThickness, x: roomX + roomWidth / 4 + 7.5, z: roomY - roomDepth / 2 },
      { w: roomWidth, h: wallHeight, d: wallThickness, x: roomX, z: roomY + roomDepth / 2 },
      { w: wallThickness, h: wallHeight, d: roomDepth, x: roomX - roomWidth / 2, z: roomY },
      { w: wallThickness, h: wallHeight, d: roomDepth, x: roomX + roomWidth / 2, z: roomY },
    ]
    walls.forEach(({ w, h, d, x, z }) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMaterial)
      m.position.set(x + this.offsetX, yPosition + h / 2, z + this.offsetZ)
      m.userData.isBuilding = true
      this.scene.add(m)
    })
  }

createStairs(x: number, z: number, bottomFloor: number, floorHeight: number) {
  this.createStairMarker(x, z, bottomFloor, floorHeight)
}

  createElevatorShaft(x: number, z: number, _numFloors: number, floorHeight: number) {
    this.createElevatorMarker(x, z, 0, floorHeight)
  }

  createCeiling(floor: number, floorHeight: number, allNodes: any[]) {
    const yPosition = floor * floorHeight + 120
    const padding = 25
    const floorNodes = allNodes.filter((n) => n.floor === floor)
    if (floorNodes.length === 0) return
    const xCoords = floorNodes.map((n) => n.x)
    const zCoords = floorNodes.map((n) => n.y)
    const width = Math.max(...xCoords) - Math.min(...xCoords) + padding * 2
    const depth = Math.max(...zCoords) - Math.min(...zCoords) + padding * 2
    const centerX = (Math.min(...xCoords) + Math.max(...xCoords)) / 2
    const centerZ = (Math.min(...zCoords) + Math.max(...zCoords)) / 2
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, 5, depth),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })
    )
    mesh.position.set(centerX + this.offsetX, yPosition, centerZ + this.offsetZ)
    mesh.userData.isBuilding = true
    this.scene.add(mesh)
  }

  private createWall(
    width: number,
    height: number,
    depth: number,
    material: THREE.Material
  ): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(width, height, depth)
    const mesh = new THREE.Mesh(geometry, material)
    return mesh
  }
}