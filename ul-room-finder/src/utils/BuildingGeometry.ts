import * as THREE from 'three'

export class BuildingGeometry {
  private scene: THREE.Scene
  private offsetX: number
  private offsetZ: number

  constructor(scene: THREE.Scene, offsetX: number = -425, offsetZ: number = -325) {
    this.scene = scene
    this.offsetX = offsetX
    this.offsetZ = offsetZ
  }

  // Create exterior building walls (dynamically calculated from nodes)
  createExteriorWalls(floor: number, floorHeight: number, allNodes: any[]) {
    const wallHeight = 120
    const wallThickness = 10
    const yPosition = floor * floorHeight
    const padding = 25 // Extra space around building

    // Calculate building bounds from all nodes on this floor
    const floorNodes = allNodes.filter(n => n.floor === floor)
    if (floorNodes.length === 0) return

    const xCoords = floorNodes.map(n => n.x)
    const zCoords = floorNodes.map(n => n.y) // Note: y in JSON is z in 3D

    const minX = Math.min(...xCoords) - padding
    const maxX = Math.max(...xCoords) + padding
    const minZ = Math.min(...zCoords) - padding
    const maxZ = Math.max(...zCoords) + padding

    const width = maxX - minX
    const depth = maxZ - minZ
    const centerX = (minX + maxX) / 2
    const centerZ = (minZ + maxZ) / 2

    // Wall material
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.9,
      metalness: 0.1
    })

    // Get entrance positions for ground floor
    const entrances = floorNodes.filter(n => n.type === 'entrance')

    // North wall (top)
    const northWall = this.createWall(width, wallHeight, wallThickness, wallMaterial)
    northWall.position.set(centerX + this.offsetX, yPosition + wallHeight/2, minZ + this.offsetZ)
    northWall.userData.isBuilding = true
    this.scene.add(northWall)

    // South wall (bottom)
    const southWall = this.createWall(width, wallHeight, wallThickness, wallMaterial)
    southWall.position.set(centerX + this.offsetX, yPosition + wallHeight/2, maxZ + this.offsetZ)
    southWall.userData.isBuilding = true
    this.scene.add(southWall)

    // East wall (right)
    const eastWall = this.createWall(wallThickness, wallHeight, depth, wallMaterial)
    eastWall.position.set(maxX + this.offsetX, yPosition + wallHeight/2, centerZ + this.offsetZ)
    eastWall.userData.isBuilding = true
    this.scene.add(eastWall)

    // West wall (left) - with entrance openings on ground floor
    if (floor === 0 && entrances.length > 0) {
      // Create wall segments around entrances
      const sortedEntrances = entrances.sort((a, b) => a.y - b.y)
      const entranceGap = 40 // Size of opening

      let lastZ = minZ
      sortedEntrances.forEach(entrance => {
        const entranceZ = entrance.y
        const segmentDepth = entranceZ - entranceGap/2 - lastZ

        if (segmentDepth > 10) { // Only create segment if it's big enough
          const segment = this.createWall(wallThickness, wallHeight, segmentDepth, wallMaterial)
          segment.position.set(
            minX + this.offsetX,
            yPosition + wallHeight/2,
            lastZ + segmentDepth/2 + this.offsetZ
          )
          segment.userData.isBuilding = true
          this.scene.add(segment)
        }

        lastZ = entranceZ + entranceGap/2
      })

      // Final segment after last entrance
      const finalSegmentDepth = maxZ - lastZ
      if (finalSegmentDepth > 10) {
        const finalSegment = this.createWall(wallThickness, wallHeight, finalSegmentDepth, wallMaterial)
        finalSegment.position.set(
          minX + this.offsetX,
          yPosition + wallHeight/2,
          lastZ + finalSegmentDepth/2 + this.offsetZ
        )
        finalSegment.userData.isBuilding = true
        this.scene.add(finalSegment)
      }
    } else {
      // Solid west wall for upper floors or no entrances
      const westWall = this.createWall(wallThickness, wallHeight, depth, wallMaterial)
      westWall.position.set(minX + this.offsetX, yPosition + wallHeight/2, centerZ + this.offsetZ)
      westWall.userData.isBuilding = true
      this.scene.add(westWall)
    }
  }

  // Create a wall segment
  private createWall(width: number, height: number, depth: number, material: THREE.Material): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(width, height, depth)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }

  // Create room walls
  createRoomWalls(roomX: number, roomY: number, floor: number, floorHeight: number, roomWidth: number = 80, roomDepth: number = 50) {
    const wallHeight = 100
    const wallThickness = 5
    const yPosition = floor * floorHeight

    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      roughness: 0.8
    })

    // Front wall (with door opening)
    const frontWallLeft = this.createWall(roomWidth/2 - 15, wallHeight, wallThickness, wallMaterial)
    frontWallLeft.position.set(
      roomX - roomWidth/4 - 7.5 + this.offsetX,
      yPosition + wallHeight/2,
      roomY - roomDepth/2 + this.offsetZ
    )
    frontWallLeft.userData.isBuilding = true
    this.scene.add(frontWallLeft)

    const frontWallRight = this.createWall(roomWidth/2 - 15, wallHeight, wallThickness, wallMaterial)
    frontWallRight.position.set(
      roomX + roomWidth/4 + 7.5 + this.offsetX,
      yPosition + wallHeight/2,
      roomY - roomDepth/2 + this.offsetZ
    )
    frontWallRight.userData.isBuilding = true
    this.scene.add(frontWallRight)

    // Add door frame
    this.createDoorFrame(roomX, roomY - roomDepth/2, yPosition)

    // Back wall
    const backWall = this.createWall(roomWidth, wallHeight, wallThickness, wallMaterial)
    backWall.position.set(
      roomX + this.offsetX,
      yPosition + wallHeight/2,
      roomY + roomDepth/2 + this.offsetZ
    )
    backWall.userData.isBuilding = true
    this.scene.add(backWall)

    // Left wall
    const leftWall = this.createWall(wallThickness, wallHeight, roomDepth, wallMaterial)
    leftWall.position.set(
      roomX - roomWidth/2 + this.offsetX,
      yPosition + wallHeight/2,
      roomY + this.offsetZ
    )
    leftWall.userData.isBuilding = true
    this.scene.add(leftWall)

    // Right wall
    const rightWall = this.createWall(wallThickness, wallHeight, roomDepth, wallMaterial)
    rightWall.position.set(
      roomX + roomWidth/2 + this.offsetX,
      yPosition + wallHeight/2,
      roomY + this.offsetZ
    )
    rightWall.userData.isBuilding = true
    this.scene.add(rightWall)
  }

  // Create door frame
  private createDoorFrame(x: number, z: number, yPosition: number) {
    const doorFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.7
    })

    // Door frame
    const doorWidth = 30
    const doorHeight = 80

    // Left frame
    const leftFrame = new THREE.BoxGeometry(3, doorHeight, 3)
    const leftFrameMesh = new THREE.Mesh(leftFrame, doorFrameMaterial)
    leftFrameMesh.position.set(x - doorWidth/2 + this.offsetX, yPosition + doorHeight/2, z + this.offsetZ)
    leftFrameMesh.userData.isBuilding = true
    this.scene.add(leftFrameMesh)

    // Right frame
    const rightFrameMesh = new THREE.Mesh(leftFrame, doorFrameMaterial)
    rightFrameMesh.position.set(x + doorWidth/2 + this.offsetX, yPosition + doorHeight/2, z + this.offsetZ)
    rightFrameMesh.userData.isBuilding = true
    this.scene.add(rightFrameMesh)

    // Top frame
    const topFrame = new THREE.BoxGeometry(doorWidth, 3, 3)
    const topFrameMesh = new THREE.Mesh(topFrame, doorFrameMaterial)
    topFrameMesh.position.set(x + this.offsetX, yPosition + doorHeight, z + this.offsetZ)
    topFrameMesh.userData.isBuilding = true
    this.scene.add(topFrameMesh)

    // Door (slightly open)
    const doorGeometry = new THREE.BoxGeometry(doorWidth - 6, doorHeight - 6, 2)
    const doorMaterial = new THREE.MeshStandardMaterial({
      color: 0x654321,
      roughness: 0.6
    })
    const door = new THREE.Mesh(doorGeometry, doorMaterial)
    door.position.set(x + 8 + this.offsetX, yPosition + doorHeight/2, z - 3 + this.offsetZ)
    door.rotation.y = Math.PI / 6 // Slightly open
    door.userData.isBuilding = true
    this.scene.add(door)
  }

  // Create realistic stairs
  createStairs(x: number, z: number, bottomFloor: number, floorHeight: number) {
    const yStart = bottomFloor * floorHeight
    const numSteps = 15
    const stepHeight = floorHeight / numSteps
    const stepDepth = 8
    const stepWidth = 40

    const stepMaterial = new THREE.MeshStandardMaterial({
      color: 0x999999,
      roughness: 0.8
    })

    // Create each step
    for (let i = 0; i < numSteps; i++) {
      const stepGeometry = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth)
      const step = new THREE.Mesh(stepGeometry, stepMaterial)

      step.position.set(
        x + this.offsetX,
        yStart + (i * stepHeight) + stepHeight/2,
        z + (i * stepDepth) + this.offsetZ
      )

      step.castShadow = true
      step.receiveShadow = true
      step.userData.isBuilding = true
      this.scene.add(step)
    }

    // Add railings
    this.createRailing(x - stepWidth/2, z, yStart, floorHeight, numSteps, stepDepth)
    this.createRailing(x + stepWidth/2, z, yStart, floorHeight, numSteps, stepDepth)

    // Stairwell walls
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.9
    })

    const wallHeight = floorHeight
    const wallThickness = 5

    // Left wall
    const leftWall = new THREE.BoxGeometry(wallThickness, wallHeight, numSteps * stepDepth + 20)
    const leftWallMesh = new THREE.Mesh(leftWall, wallMaterial)
    leftWallMesh.position.set(
      x - stepWidth/2 - 10 + this.offsetX,
      yStart + wallHeight/2,
      z + (numSteps * stepDepth)/2 + this.offsetZ
    )
    leftWallMesh.userData.isBuilding = true
    this.scene.add(leftWallMesh)

    // Right wall
    const rightWallMesh = new THREE.Mesh(leftWall, wallMaterial)
    rightWallMesh.position.set(
      x + stepWidth/2 + 10 + this.offsetX,
      yStart + wallHeight/2,
      z + (numSteps * stepDepth)/2 + this.offsetZ
    )
    rightWallMesh.userData.isBuilding = true
    this.scene.add(rightWallMesh)
  }

  // Create stair railing
  private createRailing(x: number, z: number, yStart: number, height: number, numSteps: number, stepDepth: number) {
    const railingMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,
      metalness: 0.8,
      roughness: 0.2
    })

    // Handrail
    const points = []
    for (let i = 0; i <= numSteps; i++) {
      points.push(new THREE.Vector3(
        x + this.offsetX,
        yStart + (i * height / numSteps) + 40,
        z + (i * stepDepth) + this.offsetZ
      ))
    }

    const curve = new THREE.CatmullRomCurve3(points)
    const tubeGeometry = new THREE.TubeGeometry(curve, 50, 2, 8, false)
    const handrail = new THREE.Mesh(tubeGeometry, railingMaterial)
    handrail.userData.isBuilding = true
    this.scene.add(handrail)

    // Vertical posts
    for (let i = 0; i <= numSteps; i += 3) {
      const postGeometry = new THREE.CylinderGeometry(1.5, 1.5, 40, 8)
      const post = new THREE.Mesh(postGeometry, railingMaterial)
      post.position.set(
        x + this.offsetX,
        yStart + (i * height / numSteps) + 20,
        z + (i * stepDepth) + this.offsetZ
      )
      post.userData.isBuilding = true
      this.scene.add(post)
    }
  }

  // Create elevator shaft
  createElevatorShaft(x: number, z: number, numFloors: number, floorHeight: number) {
    const shaftWidth = 35
    const shaftDepth = 35
    const totalHeight = numFloors * floorHeight
    const wallThickness = 3

    const shaftMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.7,
      metalness: 0.3
    })

    // Shaft walls
    const positions = [
      { x: x - shaftWidth/2, z: z, width: wallThickness, depth: shaftDepth },
      { x: x + shaftWidth/2, z: z, width: wallThickness, depth: shaftDepth },
      { x: x, z: z - shaftDepth/2, width: shaftWidth, depth: wallThickness },
      { x: x, z: z + shaftDepth/2, width: shaftWidth, depth: wallThickness }
    ]

    positions.forEach(pos => {
      const wall = new THREE.BoxGeometry(pos.width, totalHeight, pos.depth)
      const wallMesh = new THREE.Mesh(wall, shaftMaterial)
      wallMesh.position.set(
        pos.x + this.offsetX,
        totalHeight/2,
        pos.z + this.offsetZ
      )
      wallMesh.userData.isBuilding = true
      this.scene.add(wallMesh)
    })

    // Elevator car (moves between floors - you can animate this later)
    const carGeometry = new THREE.BoxGeometry(30, 80, 30)
    const carMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b5cf6,
      roughness: 0.3,
      metalness: 0.7
    })
    const car = new THREE.Mesh(carGeometry, carMaterial)
    car.position.set(x + this.offsetX, 40, z + this.offsetZ)
    car.userData.isBuilding = true
    car.userData.isElevatorCar = true
    this.scene.add(car)
  }

  // Create ceiling for a floor (dynamically sized)
  createCeiling(floor: number, floorHeight: number, allNodes: any[]) {
    const yPosition = floor * floorHeight + 120
    const padding = 25

    // Calculate bounds from nodes
    const floorNodes = allNodes.filter(n => n.floor === floor)
    if (floorNodes.length === 0) return

    const xCoords = floorNodes.map(n => n.x)
    const zCoords = floorNodes.map(n => n.y)

    const minX = Math.min(...xCoords) - padding
    const maxX = Math.max(...xCoords) + padding
    const minZ = Math.min(...zCoords) - padding
    const maxZ = Math.max(...zCoords) + padding

    const width = maxX - minX
    const depth = maxZ - minZ
    const centerX = (minX + maxX) / 2
    const centerZ = (minZ + maxZ) / 2

    const ceilingGeometry = new THREE.BoxGeometry(width, 5, depth)
    const ceilingMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9
    })
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial)
    ceiling.position.set(centerX + this.offsetX, yPosition, centerZ + this.offsetZ)
    ceiling.receiveShadow = true
    ceiling.userData.isBuilding = true
    this.scene.add(ceiling)
  }
}