import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Graph } from '../utils/graph'
import { AStar } from '../utils/pathfinding'
import { PathNode } from '../types'
import { BuildingGeometry } from '../utils/BuildingGeometry'
import { CameraWalkthrough } from '../utils/CameraWalkthrough'
import exampleBuildingData from '../data/buildings_example.json'
import csisBuildingData from '../data/buildings_csis.json'

// Building options
const BUILDINGS = {
  example: { name: "Example Building", data: exampleBuildingData },
  csis: { name: "CSIS Building", data: csisBuildingData }
}

function Viewer3D() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)

  // Building selection
  const [selectedBuilding, setSelectedBuilding] = useState<'example' | 'csis'>('example')
  const buildingData = BUILDINGS[selectedBuilding].data

  const [graph, setGraph] = useState<Graph | null>(null)
  const [pathfinder, setPathfinder] = useState<AStar | null>(null)
  const [startRoom, setStartRoom] = useState<string>('')
  const [endRoom, setEndRoom] = useState<string>('')
  const [path, setPath] = useState<PathNode[]>([])
  const [requireAccessible, setRequireAccessible] = useState(false)
  const [visibleFloors, setVisibleFloors] = useState<Set<number>>(new Set([0, 1])) // Both floors visible by default
  const maxFloor = 1

  // Wall and ceiling visibility per floor
  const [floorWallsVisible, setFloorWallsVisible] = useState<{[floor: number]: boolean}>({
    0: true,
    1: true
  })
  const [floorCeilingsVisible, setFloorCeilingsVisible] = useState<{[floor: number]: boolean}>({
    0: true,
    1: true
  })

  // Walkthrough state
  const [walkthroughActive, setWalkthroughActive] = useState(false)
  const [walkthroughPlaying, setWalkthroughPlaying] = useState(false)
  const [walkthroughProgress, setWalkthroughProgress] = useState(0)
  const [walkthroughSpeed, setWalkthroughSpeed] = useState(1.0)
  const walkthroughRef = useRef<CameraWalkthrough | null>(null)

  // Initialize graph and pathfinder
  useEffect(() => {
    console.log('Loading building data...', selectedBuilding)
    const g = new Graph()

    buildingData.nodes.forEach(node => {
      g.addNode(node as PathNode)
    })

    buildingData.edges.forEach(edge => {
      g.addEdge(edge)
    })

    console.log('Graph loaded with', g.getAllNodes().length, 'nodes')
    setGraph(g)
    setPathfinder(new AStar(g))

    // Reset selections when building changes
    setStartRoom('')
    setEndRoom('')
    setPath([])
    setVisibleFloors(new Set([0]))
  }, [selectedBuilding, buildingData])

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return

    // Prevent double initialization in React Strict Mode
    if (rendererRef.current) return

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)
    scene.fog = new THREE.Fog(0x1a1a2e, 500, 2000)
    sceneRef.current = scene

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      3000
    )
    camera.position.set(400, 600, 800)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // Initialize walkthrough system
    const walkthrough = new CameraWalkthrough(camera)
    walkthrough.onProgress((progress) => {
      setWalkthroughProgress(progress)
    })
    walkthrough.onFinish(() => {
      setWalkthroughPlaying(false)
    })
    walkthroughRef.current = walkthrough

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Controls setup
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.minDistance = 200
    controls.maxDistance = 1500
    controls.maxPolarAngle = Math.PI / 2.1
    controlsRef.current = controls

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(100, 200, 100)
    directionalLight.castShadow = true
    directionalLight.shadow.camera.left = -500
    directionalLight.shadow.camera.right = 500
    directionalLight.shadow.camera.top = 500
    directionalLight.shadow.camera.bottom = -500
    scene.add(directionalLight)

    // Grid helper (only one)
    const gridHelper = new THREE.GridHelper(1000, 20, 0x444444, 0x222222)
    scene.add(gridHelper)

    // Animation loop
    let lastTime = 0
    const animate = (currentTime: number) => {
      requestAnimationFrame(animate)

      const delta = (currentTime - lastTime) / 1000 // Convert to seconds
      lastTime = currentTime

      // Update walkthrough if active
      if (walkthroughRef.current) {
        walkthroughRef.current.update(delta)

        // Disable orbit controls during walkthrough
        if (walkthroughRef.current.isActive()) {
          controls.enabled = false
        } else {
          controls.enabled = true
        }
      }

      controls.update()
      renderer.render(scene, camera)
    }
    animate(0)

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return

      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      if (containerRef.current && renderer.domElement.parentElement === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement)
      }
      renderer.dispose()
      rendererRef.current = null
    }
  }, [])

  // Build 3D structure when graph is loaded
  useEffect(() => {
    if (graph && sceneRef.current) {
      console.log('Building 3D structure with', graph.getAllNodes().length, 'nodes')
      build3DStructure(sceneRef.current, graph)
    }
  }, [graph])

  // Rebuild 3D structure when visible floors change
  useEffect(() => {
    if (graph && sceneRef.current) {
      console.log('Updating visible floors:', Array.from(visibleFloors))
      build3DStructure(sceneRef.current, graph)
    }
  }, [visibleFloors, floorWallsVisible, floorCeilingsVisible, graph])

  // Toggle floor visibility
  const toggleFloor = (floorNumber: number) => {
    setVisibleFloors(prev => {
      const newSet = new Set(prev)
      if (newSet.has(floorNumber)) {
        newSet.delete(floorNumber)
      } else {
        newSet.add(floorNumber)
      }
      return newSet
    })
  }

  // Toggle walls for a specific floor
  const toggleFloorWalls = (floorNumber: number) => {
    setFloorWallsVisible(prev => ({
      ...prev,
      [floorNumber]: !prev[floorNumber]
    }))
  }

  // Toggle ceiling for a specific floor
  const toggleFloorCeiling = (floorNumber: number) => {
    setFloorCeilingsVisible(prev => ({
      ...prev,
      [floorNumber]: !prev[floorNumber]
    }))
  }

  // Auto-show floors based on path
  useEffect(() => {
    if (path.length > 0) {
      const floorsInPath = new Set(path.map(node => node.floor))
      setVisibleFloors(floorsInPath)

      // Setup walkthrough with new path
      if (walkthroughRef.current) {
        walkthroughRef.current.setPath(path)
        setWalkthroughActive(false)
        setWalkthroughPlaying(false)
        setWalkthroughProgress(0)
      }
    }
  }, [path])

  // Build 3D structure from graph data
  const build3DStructure = (scene: THREE.Scene, graph: Graph) => {
    // Remove existing building objects if they exist
    const existingObjects = scene.children.filter(obj =>
      obj.userData.isBuilding === true
    )
    existingObjects.forEach(obj => scene.remove(obj))

    const nodes = graph.getAllNodes()
    const floorHeight = 150
    const scale = 1

    // Calculate center offset to center building on grid
    const offsetX = -425
    const offsetZ = -325

    // Initialize building geometry helper
    const buildingGeom = new BuildingGeometry(scene, offsetX, offsetZ)

    // Group nodes by floor
    const floors = new Map<number, PathNode[]>()
    nodes.forEach(node => {
      if (!floors.has(node.floor)) {
        floors.set(node.floor, [])
      }
      floors.get(node.floor)?.push(node)
    })

    // Build each floor (only if visible)
    floors.forEach((nodesOnThisFloor, floorNumber) => {
      // Skip if floor is not visible
      if (!visibleFloors.has(floorNumber)) {
        return
      }

      const yPosition = floorNumber * floorHeight

      // Add exterior walls for this floor (dynamically calculated) - only if walls are visible
      if (floorWallsVisible[floorNumber]) {
        buildingGeom.createExteriorWalls(floorNumber, floorHeight, nodes)
      }

      // Add ceiling for this floor (dynamically sized) - only if ceiling is visible
      if (floorCeilingsVisible[floorNumber]) {
        buildingGeom.createCeiling(floorNumber, floorHeight, nodes)
      }

      // Floor plane (dynamically sized)
      if (nodesOnThisFloor.length > 0) {
        const xCoords = nodesOnThisFloor.map(n => n.x)
        const zCoords = nodesOnThisFloor.map(n => n.y)
        const padding = 25

        const minX = Math.min(...xCoords) - padding
        const maxX = Math.max(...xCoords) + padding
        const minZ = Math.min(...zCoords) - padding
        const maxZ = Math.max(...zCoords) + padding

        const width = maxX - minX
        const depth = maxZ - minZ
        const centerX = (minX + maxX) / 2
        const centerZ = (minZ + maxZ) / 2

        const floorGeometry = new THREE.BoxGeometry(width, 5, depth)
        const floorMaterial = new THREE.MeshStandardMaterial({
          color: 0x2a2a3e,
          roughness: 0.8,
          metalness: 0.2
        })
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial)
        floorMesh.position.set(centerX + offsetX, yPosition - 2.5, centerZ + offsetZ)
        floorMesh.receiveShadow = true
        floorMesh.userData.isBuilding = true
        scene.add(floorMesh)
      }

      // Draw rooms with walls
      const rooms = nodesOnThisFloor.filter(n => n.type === 'room')
      rooms.forEach(room => {
        // Create room walls and door - only if walls are visible
        if (floorWallsVisible[floorNumber]) {
          buildingGeom.createRoomWalls(room.x, room.y, floorNumber, floorHeight)
        }

        // Room label (sprite)
        if (room.label) {
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')
          if (context) {
            canvas.width = 256
            canvas.height = 128
            context.fillStyle = 'white'
            context.font = 'bold 48px Arial'
            context.textAlign = 'center'
            context.fillText(room.label, 128, 80)

            const texture = new THREE.CanvasTexture(canvas)
            const spriteMaterial = new THREE.SpriteMaterial({ map: texture })
            const sprite = new THREE.Sprite(spriteMaterial)
            sprite.position.set(room.x * scale + offsetX, yPosition + 110, room.y * scale + offsetZ)
            sprite.scale.set(60, 30, 1)
            sprite.userData.isBuilding = true
            scene.add(sprite)
          }
        }
      })

      // Draw corridor markers (small cylinders to show path nodes)
      const corridors = nodesOnThisFloor.filter(n => n.type === 'corridor')
      corridors.forEach(corridor => {
        const corridorGeometry = new THREE.CylinderGeometry(5, 5, 5, 16)
        const corridorMaterial = new THREE.MeshStandardMaterial({
          color: 0x888888,
          roughness: 0.7
        })
        const corridorMesh = new THREE.Mesh(corridorGeometry, corridorMaterial)
        corridorMesh.position.set(corridor.x * scale + offsetX, yPosition + 2.5, corridor.y * scale + offsetZ)
        corridorMesh.userData.isBuilding = true
        scene.add(corridorMesh)
      })

      // Draw entrances
      const entrances = nodesOnThisFloor.filter(n => n.type === 'entrance')
      entrances.forEach(entrance => {
        const entranceGeometry = new THREE.CylinderGeometry(15, 15, 20, 16)
        const entranceMaterial = new THREE.MeshStandardMaterial({
          color: 0x22c55e,
          emissive: 0x22c55e,
          emissiveIntensity: 0.3
        })
        const entranceMesh = new THREE.Mesh(entranceGeometry, entranceMaterial)
        entranceMesh.position.set(entrance.x * scale + offsetX, yPosition + 10, entrance.y * scale + offsetZ)
        entranceMesh.userData.isBuilding = true
        scene.add(entranceMesh)
      })

      // Draw stairs (only create 3D stairs for ground floor, they extend to next floor)
      if (floorNumber === 0) {
        const stairs = nodesOnThisFloor.filter(n => n.type === 'stairs')
        stairs.forEach(stair => {
          buildingGeom.createStairs(stair.x, stair.y, floorNumber, floorHeight)
        })
      } else {
        // Just show a platform at the top of stairs on upper floors
        const stairs = nodesOnThisFloor.filter(n => n.type === 'stairs')
        stairs.forEach(stair => {
          const platformGeometry = new THREE.BoxGeometry(40, 5, 40)
          const platformMaterial = new THREE.MeshStandardMaterial({
            color: 0xec4899,
            roughness: 0.6
          })
          const platform = new THREE.Mesh(platformGeometry, platformMaterial)
          platform.position.set(stair.x + offsetX, yPosition, stair.y + offsetZ)
          platform.userData.isBuilding = true
          scene.add(platform)
        })
      }
    })

    // Create elevator shaft (spans all floors, only create once)
    if (visibleFloors.size > 0) {
      const elevatorNodes = nodes.filter(n => n.type === 'elevator')
      if (elevatorNodes.length > 0) {
        // Get unique elevator positions
        const uniqueElevators = new Map<string, PathNode>()
        elevatorNodes.forEach(node => {
          const key = `${node.x},${node.y}`
          if (!uniqueElevators.has(key)) {
            uniqueElevators.set(key, node)
          }
        })

        uniqueElevators.forEach(elevator => {
          buildingGeom.createElevatorShaft(elevator.x, elevator.y, 2, floorHeight)
        })
      }
    }
  }

  // Calculate path when start or end changes
  useEffect(() => {
    if (pathfinder && startRoom && endRoom) {
      const result = pathfinder.findPath(startRoom, endRoom, requireAccessible)
      if (result.found) {
        setPath(result.path)
        console.log('Path found:', result.path.map(n => `${n.id} (${n.type})`).join(' → '))

        // Draw path in 3D
        if (sceneRef.current) {
          drawPath3D(sceneRef.current, result.path)
        }
      } else {
        setPath([])
      }
    }
  }, [startRoom, endRoom, requireAccessible, pathfinder])

  // Draw 3D path
  const drawPath3D = (scene: THREE.Scene, pathNodes: PathNode[]) => {
    // Remove old path
    const oldPath = scene.getObjectByName('pathLine')
    if (oldPath) scene.remove(oldPath)

    // Remove old path spheres
    const oldSpheres = scene.children.filter(obj => obj.name.startsWith('pathSphere_'))
    oldSpheres.forEach(sphere => scene.remove(sphere))

    if (pathNodes.length < 2) return

    // Same offset as building
    const offsetX = -425
    const offsetZ = -325

    // Create path line
    const points = pathNodes.map(node =>
      new THREE.Vector3(node.x + offsetX, node.floor * 150 + 60, node.y + offsetZ)
    )

    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({
      color: 0xff4444,
      linewidth: 5
    })
    const line = new THREE.Line(geometry, material)
    line.name = 'pathLine'
    scene.add(line)

    // Add animated spheres along path
    pathNodes.forEach((node, index) => {
      const sphereGeometry = new THREE.SphereGeometry(5, 16, 16)
      const sphereMaterial = new THREE.MeshStandardMaterial({
        color: 0xff4444,
        emissive: 0xff4444,
        emissiveIntensity: 0.5
      })
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
      sphere.position.set(node.x + offsetX, node.floor * 150 + 60, node.y + offsetZ)
      sphere.name = `pathSphere_${index}`
      scene.add(sphere)
    })
  }

  const allRoomNodes = graph?.getAllNodes().filter(n => n.type === 'room') || []
  const entranceNodes = graph?.getAllNodes().filter(n => n.type === 'entrance') || []

  const clearPath = () => {
    setStartRoom('')
    setEndRoom('')
    setPath([])

    if (sceneRef.current) {
      const oldPath = sceneRef.current.getObjectByName('pathLine')
      if (oldPath) sceneRef.current.remove(oldPath)

      // Remove path spheres
      const spheres = sceneRef.current.children.filter(obj => obj.name.startsWith('pathSphere_'))
      spheres.forEach(sphere => sceneRef.current?.remove(sphere))
    }
  }

  // Walkthrough controls
  const startWalkthrough = () => {
    if (!walkthroughRef.current || path.length < 2) return

    setWalkthroughActive(true)
    setWalkthroughPlaying(true)
    walkthroughRef.current.play()
  }

  const pauseWalkthrough = () => {
    if (!walkthroughRef.current) return

    setWalkthroughPlaying(false)
    walkthroughRef.current.pause()
  }

  const resumeWalkthrough = () => {
    if (!walkthroughRef.current) return

    setWalkthroughPlaying(true)
    walkthroughRef.current.play()
  }

  const resetWalkthrough = () => {
    if (!walkthroughRef.current) return

    walkthroughRef.current.reset()
    setWalkthroughActive(false)
    setWalkthroughPlaying(false)
    setWalkthroughProgress(0)

    // Reset camera to orbit view
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(400, 600, 800)
      cameraRef.current.lookAt(0, 0, 0)
      controlsRef.current.enabled = true
    }
  }

  const changeWalkthroughSpeed = (speed: number) => {
    if (!walkthroughRef.current) return

    setWalkthroughSpeed(speed)
    walkthroughRef.current.setSpeed(speed)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 shadow-md p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="text-green-400 hover:text-green-300 font-semibold"
              >
                ← Back to Search
              </button>
              <h1 className="text-2xl font-bold">3D Map Viewer</h1>

              {/* Building Selector */}
              <select
                value={selectedBuilding}
                onChange={(e) => setSelectedBuilding(e.target.value as 'example' | 'csis')}
                className="px-4 py-2 bg-gray-700 border-2 border-green-600 text-white rounded-lg font-semibold focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="example">Example Building</option>
                <option value="csis">CSIS Building</option>
              </select>

              {/* Switch to 2D button */}
              <button
                onClick={() => navigate('/2d-viewer')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2"
              >
                <span>🗺️</span>
                <span>Switch to 2D</span>
              </button>
            </div>

            {/* Floor Visibility Controls */}
            <div className="flex gap-4 items-start">
              <span className="text-gray-300 font-semibold mt-2">Floor Controls:</span>

              {/* Ground Floor Controls */}
              <div className="flex flex-col gap-1 bg-gray-800 p-2 rounded-lg">
                <button
                  onClick={() => toggleFloor(0)}
                  className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                    visibleFloors.has(0)
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-400'
                  }`}
                >
                  Ground Floor
                </button>
                <div className="flex gap-1">
                  <button
                    onClick={() => toggleFloorWalls(0)}
                    disabled={!visibleFloors.has(0)}
                    className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                      visibleFloors.has(0) && floorWallsVisible[0]
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-gray-700 text-gray-500'
                    }`}
                  >
                    Walls
                  </button>
                  <button
                    onClick={() => toggleFloorCeiling(0)}
                    disabled={!visibleFloors.has(0)}
                    className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                      visibleFloors.has(0) && floorCeilingsVisible[0]
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-gray-700 text-gray-500'
                    }`}
                  >
                    Ceiling
                  </button>
                </div>
              </div>

              {/* Floor 1 Controls */}
              <div className="flex flex-col gap-1 bg-gray-800 p-2 rounded-lg">
                <button
                  onClick={() => toggleFloor(1)}
                  className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                    visibleFloors.has(1)
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-400'
                  }`}
                >
                  Floor 1
                </button>
                <div className="flex gap-1">
                  <button
                    onClick={() => toggleFloorWalls(1)}
                    disabled={!visibleFloors.has(1)}
                    className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                      visibleFloors.has(1) && floorWallsVisible[1]
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-gray-700 text-gray-500'
                    }`}
                  >
                    Walls
                  </button>
                  <button
                    onClick={() => toggleFloorCeiling(1)}
                    disabled={!visibleFloors.has(1)}
                    className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                      visibleFloors.has(1) && floorCeilingsVisible[1]
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-gray-700 text-gray-500'
                    }`}
                  >
                    Ceiling
                  </button>
                </div>
              </div>

              <button
                onClick={() => setVisibleFloors(new Set([0, 1]))}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold mt-6"
              >
                Show All
              </button>
            </div>
          </div>

          {/* Room Selection Controls */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Start Location</label>
              <select
                value={startRoom}
                onChange={(e) => setStartRoom(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select start...</option>
                <optgroup label="Entrances">
                  {entranceNodes.map(node => (
                    <option key={node.id} value={node.id}>
                      {node.label || node.id}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Rooms">
                  {allRoomNodes.map(node => (
                    <option key={node.id} value={node.id}>
                      {node.label || node.id} (Floor {node.floor === 0 ? 'G' : node.floor})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Destination</label>
              <select
                value={endRoom}
                onChange={(e) => setEndRoom(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select destination...</option>
                {allRoomNodes.map(node => (
                  <option key={node.id} value={node.id}>
                    {node.label || node.id} (Floor {node.floor === 0 ? 'G' : node.floor})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={requireAccessible}
                  onChange={(e) => setRequireAccessible(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Accessible Route</span>
              </label>
              <button
                onClick={clearPath}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
              >
                Clear
              </button>
            </div>
          </div>

          {path.length > 0 && (
            <div className="mt-4 p-3 bg-blue-900 bg-opacity-50 rounded-lg">
              <p className="text-sm font-semibold text-blue-200">
                Path found: {path.length} steps
                {path.some(n => n.type === 'stairs') && ' (via stairs)'}
                {path.some(n => n.type === 'elevator') && ' (via elevator)'}
                {' • '}
                Floors: {Array.from(new Set(path.map(n => n.floor))).map(f => f === 0 ? 'Ground' : `Floor ${f}`).join(', ')}
              </p>

              {/* Walkthrough Controls */}
              <div className="mt-3 pt-3 border-t border-blue-700">
                <div className="flex items-center gap-3 flex-wrap">
                  {!walkthroughActive ? (
                    <button
                      onClick={startWalkthrough}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2"
                    >
                      <span>▶️</span>
                      <span>Start Walkthrough</span>
                    </button>
                  ) : (
                    <>
                      {walkthroughPlaying ? (
                        <button
                          onClick={pauseWalkthrough}
                          className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2"
                        >
                          <span>⏸️</span>
                          <span>Pause</span>
                        </button>
                      ) : (
                        <button
                          onClick={resumeWalkthrough}
                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2"
                        >
                          <span>▶️</span>
                          <span>Resume</span>
                        </button>
                      )}

                      <button
                        onClick={resetWalkthrough}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2"
                      >
                        <span>🔄</span>
                        <span>Reset</span>
                      </button>

                      {/* Speed Control */}
                      <div className="flex items-center gap-2 bg-gray-700 px-3 py-2 rounded-lg">
                        <span className="text-sm text-gray-300">Speed:</span>
                        <button
                          onClick={() => changeWalkthroughSpeed(0.5)}
                          className={`px-2 py-1 rounded ${walkthroughSpeed === 0.5 ? 'bg-blue-600' : 'bg-gray-600 hover:bg-gray-500'}`}
                        >
                          0.5x
                        </button>
                        <button
                          onClick={() => changeWalkthroughSpeed(1.0)}
                          className={`px-2 py-1 rounded ${walkthroughSpeed === 1.0 ? 'bg-blue-600' : 'bg-gray-600 hover:bg-gray-500'}`}
                        >
                          1x
                        </button>
                        <button
                          onClick={() => changeWalkthroughSpeed(2.0)}
                          className={`px-2 py-1 rounded ${walkthroughSpeed === 2.0 ? 'bg-blue-600' : 'bg-gray-600 hover:bg-gray-500'}`}
                        >
                          2x
                        </button>
                      </div>

                      {/* Progress Bar */}
                      <div className="flex-grow min-w-[200px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-grow bg-gray-700 rounded-full h-2">
                            <div
                              className="bg-green-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${walkthroughProgress * 100}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-300">
                            {Math.round(walkthroughProgress * 100)}%
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3D Canvas Container */}
      <div
        ref={containerRef}
        className="w-full"
        style={{ height: 'calc(100vh - 220px)' }}
      />

      {/* Controls Info */}
      <div className="absolute bottom-4 left-4 bg-gray-800 bg-opacity-90 p-4 rounded-lg shadow-lg max-w-xs">
        <p className="text-sm text-gray-300">
          <strong>Controls:</strong><br/>
          • Left click + drag to rotate<br/>
          • Right click + drag to pan<br/>
          • Scroll to zoom<br/>
          • Toggle floor buttons to show/hide floors<br/>
          • Select rooms to see 3D path<br/>
          • Click "Start Walkthrough" for first-person guided tour!
        </p>
      </div>
    </div>
  )
}

export default Viewer3D
