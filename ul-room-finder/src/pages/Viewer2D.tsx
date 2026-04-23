import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { generateNavInstructions, speakInstructions, stopSpeech, NavInstruction } from '../utils/navigationInstructions'

interface Node {
  id: string
  x: number
  y: number
  floor: number
  type: 'room' | 'corridor' | 'stairs' | 'elevator' | 'entrance' | 'door'
  label: string
  polygon?: number[][]
  room_id?: string
}

interface Edge {
  from: string
  to: string
  accessible: boolean
}

interface Wall {
  from: number[]
  to: number[]
}

interface CorridorPolygon {
  polygon: number[][]
}

interface RoomPolygon {
  id: string
  label: string
  polygon: number[][]
  floor: number
  clickable: boolean
}

interface Building {
  name: string
  description: string
  walls?: Wall[]  // Deprecated: kept for backward compatibility
  walls_by_floor?: {[floor: string]: Wall[]}  // NEW: per-floor walls
  corridor_polygons?: CorridorPolygon[]
  room_polygons_by_floor?: {[floor: string]: RoomPolygon[]}  // NEW: per-floor room polygons
  nodes: Node[]
  edges: Edge[]
}

function Viewer2D() {
  const navigate = useNavigate()
  const location = useLocation()
  const [building, setBuilding] = useState<Building | null>(null)
  const [selectedFloor, setSelectedFloor] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)  // Control dropdown visibility
  const [accessibleMode, setAccessibleMode] = useState(false)  // Accessible mode toggle - use elevator only
  const [useSideStairs, setUseSideStairs] = useState(false)  // Use side stairs instead of main stairs
  const [startNode, setStartNode] = useState<string>('lobby_entrance')  // Default to lobby entrance
  const [endNode, setEndNode] = useState<string | null>(null)
  const [path, setPath] = useState<string[]>([])
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [darkMode, setDarkMode] = useState(false)
  const [showWallLabels, setShowWallLabels] = useState(false)
  const [showDevTools, setShowDevTools] = useState(false)
  const [showCorridorNodes, setShowCorridorNodes] = useState(true)
  const [navInstructions, setNavInstructions] = useState<NavInstruction[]>([])
  const [voiceMuted, setVoiceMuted] = useState(false)
  const [showInstructions, setShowInstructions] = useState(true)
  const mapInnerRef = useRef<HTMLDivElement>(null)
  const panRef = useRef(pan)


  // Load building data
  useEffect(() => {
    fetch('/src/data/buildings_csis.json')
      .then(res => res.json())
      .then(data => {
        console.log('Loaded building:', data)
        setBuilding(data)
        // Set default start point to Lobby Entrance
        const lobbyEntrance = data.nodes.find((n: Node) => n.id === 'lobby_entrance')
        if (lobbyEntrance) {
          setStartNode('lobby_entrance')
        }
      })
      .catch(err => console.error('Failed to load building:', err))
  }, [])
  useEffect(() => {
    if (!building) return

    console.log('Viewer2D location.state:', location.state)

    const targetRoomId = location.state?.targetRoomId
    if (!targetRoomId) return

    console.log('=== ROOM FROM HOME PAGE ===')
    console.log('Target room ID:', targetRoomId)

    const doorId = `${targetRoomId}_door`
    const door = building.nodes.find(n => n.id === doorId)

    if (door) {
      console.log('Setting destination from Home:', doorId)
      setEndNode(doorId)
      setSelectedFloor(door.floor)
      return
    }

    console.error('Door not found for target room:', targetRoomId)
    console.log(
      'Available doors:',
      building.nodes.filter(n => n.type === 'door').map(n => n.id)
    )
  }, [building, location.state])
  useEffect(() => {
      const handler = (e: WheelEvent) => {
        const mapDiv = document.querySelector('.map-container')
        if (!mapDiv?.contains(e.target as Node)) return
        e.preventDefault()

        const delta = e.deltaY > 0 ? -0.1 : 0.1
        const rect = (mapDiv as HTMLElement).getBoundingClientRect()
        const cursorX = e.clientX - rect.left
        const cursorY = e.clientY - rect.top

        // Use functional updates and batch both state changes together
        setZoom(prevZoom => {
          const newZoom = Math.max(0.5, Math.min(3, prevZoom + delta))
          const zoomRatio = newZoom / prevZoom
          setPan(prevPan => ({
            x: cursorX - zoomRatio * (cursorX - prevPan.x),
            y: cursorY - zoomRatio * (cursorY - prevPan.y),
          }))
          return newZoom
        })
      }

      document.addEventListener('wheel', handler, { passive: false })
      return () => document.removeEventListener('wheel', handler)
    }, [])
  // Floor change - preserve pan and zoom exactly as-is
    useEffect(() => {}, [selectedFloor, building])

  // A* Pathfinding Algorithm
  const findPath = (startId: string, endId: string) => {
    if (!building) return []

    const nodes = building.nodes
    const edges = building.edges

    console.log('=== A* PATHFINDING DEBUG ===')
    console.log('Building graph from', edges.length, 'edges')
    console.log('Navigation mode:', accessibleMode ? 'ACCESSIBLE (elevator only)' : useSideStairs ? 'SIDE STAIRS' : 'MAIN STAIRS (default)')

    // Build adjacency list
    const graph: {[key: string]: string[]} = {}
    edges.forEach(edge => {
      if (!graph[edge.from]) graph[edge.from] = []
      graph[edge.from].push(edge.to)
    })

    console.log('Graph has', Object.keys(graph).length, 'nodes')
    console.log('Start neighbors:', graph[startId])
    console.log('End in graph?', endId in graph)

    // Edge weight function based on navigation mode
    const getEdgeWeight = (fromId: string, toId: string, baseDistance: number): number => {
      const fromNode = nodes.find(n => n.id === fromId)
      const toNode = nodes.find(n => n.id === toId)

      if (!fromNode || !toNode) return baseDistance

      // Check if this is an inter-floor stair connection (vertical)
      const isInterFloorStairs = (fromNode.type === 'stairs' && toNode.type === 'stairs' &&
                                   fromNode.floor !== toNode.floor)

      // Check if this edge involves elevator
      const isElevator = fromNode.type === 'elevator' || toNode.type === 'elevator'

      if (isElevator) {
        // Elevator edges
        if (accessibleMode) {
          return baseDistance * 0.01  // VERY LOW weight in accessible mode
        } else {
          return baseDistance * 1000  // VERY HIGH weight otherwise (strongly avoid elevator)
        }
      }

      // CRITICAL: Don't penalize inter-floor stair connections!
      // Only penalize horizontal movement to/from stairs on the SAME floor
      if (isInterFloorStairs) {
        return baseDistance  // Normal weight for vertical connections
      }

      // Check if this is a same-floor connection involving stairs
      const isSameFloorStairs = (fromNode.type === 'stairs' || toNode.type === 'stairs') &&
                                fromNode.floor === toNode.floor

      if (isSameFloorStairs) {
        // Get the stair ID (whichever node is the stairs)
        const stairId = fromNode.type === 'stairs' ? fromNode.id : toNode.id

        // STAIR CLASSIFICATION:
        // Main stairs: stairs_2 (ground) → stairs_f1_1 (first)
        // Side stairs: stairs_1, stairs_3 (ground) → stairs_f1_2, stairs_f1_3 (first)

        const isMainStairs = stairId === 'stairs_2' || stairId === 'stairs_f1_1'
        const isSideStairs = ['stairs_1', 'stairs_3', 'stairs_f1_2', 'stairs_f1_3'].includes(stairId)

        if (accessibleMode) {
          // In accessible mode, avoid ALL stairs
          return baseDistance * 1000
        } else if (useSideStairs) {
          // Side stairs mode: prefer side stairs, avoid main
          if (isSideStairs) {
            return baseDistance * 0.1  // VERY LOW weight
          } else if (isMainStairs) {
            return baseDistance * 1000  // VERY HIGH weight
          }
        } else {
          // Default mode: prefer main stairs, avoid side
          if (isMainStairs) {
            return baseDistance * 0.1  // VERY LOW weight
          } else if (isSideStairs) {
            return baseDistance * 1000  // VERY HIGH weight
          }
        }
      }

      return baseDistance  // Normal corridor edges
    }

    // A* implementation
    const getNode = (id: string) => nodes.find(n => n.id === id)
    if (!getNode(startId)) {
      console.error('Start node not found in nodes array!')
      return []
    }
    if (!getNode(endId)) {
      console.error('End node not found in nodes array!')
      return []
    }

    const heuristic = (a: string, b: string) => {
      const nodeA = getNode(a)
      const nodeB = getNode(b)
      if (!nodeA || !nodeB) return Infinity
      return Math.sqrt((nodeA.x - nodeB.x)**2 + (nodeA.y - nodeB.y)**2)
    }

    const openSet = [startId]
    const cameFrom: {[key: string]: string} = {}
    const gScore: {[key: string]: number} = { [startId]: 0 }
    const fScore: {[key: string]: number} = { [startId]: heuristic(startId, endId) }

    let iterations = 0
    const maxIterations = 1000

    while (openSet.length > 0 && iterations < maxIterations) {
      iterations++

      // Get node with lowest fScore
      const current = openSet.reduce((a, b) => {
        const scoreA = fScore[a] ?? Infinity
        const scoreB = fScore[b] ?? Infinity
        return scoreA < scoreB ? a : b
      })

      if (current === endId) {
        // Reconstruct path
        const reconstructedPath = [current]
        let temp = current
        while (cameFrom[temp]) {
          temp = cameFrom[temp]
          reconstructedPath.unshift(temp)
        }
        console.log('✅ PATH FOUND after', iterations, 'iterations:', reconstructedPath)
        return reconstructedPath
      }

      openSet.splice(openSet.indexOf(current), 1)

      const neighbors = graph[current] || []
      console.log(`Processing ${current}, neighbors:`, neighbors)

      neighbors.forEach(neighbor => {
        const currentNode = getNode(current)
        const neighborNode = getNode(neighbor)

        if (neighborNode && (neighborNode.type === 'room' || neighborNode.type === 'door') && neighbor !== endId) return
        if (!currentNode || !neighborNode) {
          console.error(`Missing node! current: ${currentNode ? 'OK' : 'MISSING'}, neighbor: ${neighborNode ? 'OK' : 'MISSING'}`)
          return
        }

        const baseDist = Math.sqrt((currentNode.x - neighborNode.x)**2 + (currentNode.y - neighborNode.y)**2)
        const weightedDist = getEdgeWeight(current, neighbor, baseDist)
        const currentScore = gScore[current] !== undefined ? gScore[current] : Infinity
        const tentativeGScore = currentScore + weightedDist

        console.log(`  Neighbor ${neighbor}: tentativeG=${tentativeGScore.toFixed(2)}, currentG=${gScore[neighbor] !== undefined ? gScore[neighbor].toFixed(2) : 'undefined'}`)

        if (tentativeGScore < (gScore[neighbor] ?? Infinity)) {
          cameFrom[neighbor] = current
          gScore[neighbor] = tentativeGScore
          fScore[neighbor] = tentativeGScore + heuristic(neighbor, endId)

          if (!openSet.includes(neighbor)) {
            openSet.push(neighbor)
            console.log(`    → Added ${neighbor} to openSet`)
          } else {
            console.log(`    → ${neighbor} already in openSet`)
          }
        } else {
          console.log(`    → Skipped (not better)`)
        }
      })

      console.log(`End of iteration ${iterations}, openSet:`, openSet)
    }

    console.error('❌ NO PATH after', iterations, 'iterations')
    console.log('Open set at end:', openSet)
    console.log('Came from:', cameFrom)
    return [] // No path found
  }

  // Handle room search
  const handleSearch = (query: string) => {
    setSearchQuery(query)
    setShowDropdown(true)  // Show dropdown when typing
  }

  // Handle room click - sets the DOOR as destination
  const handleRoomClick = (roomId: string) => {
    // Find the door for this room
    const doorId = `${roomId}_door`
    const door = building.nodes.find(n => n.id === doorId)

    console.log('=== ROOM CLICKED ===')
    console.log('Room ID:', roomId)
    console.log('Looking for door:', doorId)
    console.log('Door found?', door)

    if (door) {
      console.log('Setting door as destination:', doorId)
      setEndNode(doorId)
    } else {
      console.error('Door not found for room:', roomId)
      console.log('Available doors:', building.nodes.filter(n => n.type === 'door').map(n => n.id))
    }
  }

  // Change start point (click entrance)
  const handleStartClick = (nodeId: string) => {
    setStartNode(nodeId)
    setPath([]) // Clear path when changing start
  }

  // Calculate path when start and end are set
  useEffect(() => {
    if (startNode && endNode && building) {
      console.log('=== PATHFINDING ===')
      console.log('Start:', startNode)
      console.log('End:', endNode)
      console.log('Start node exists?', building.nodes.find(n => n.id === startNode))
      console.log('End node exists?', building.nodes.find(n => n.id === endNode))

      const calculatedPath = findPath(startNode, endNode)
      console.log('Path found:', calculatedPath)
      console.log('Path length:', calculatedPath.length)
      setPath(calculatedPath)

      // Generate voice instructions
      if (calculatedPath.length > 0) {
        const pathNodes = calculatedPath
          .map(id => building.nodes.find((n: any) => n.id === id))
          .filter(Boolean) as any[]
        const instrs = generateNavInstructions(pathNodes)
        setNavInstructions(instrs)
        if (!voiceMuted) speakInstructions(instrs)
      }

      // AUTO-SWITCH TO START FLOOR: If path found and we're not on the start node's floor, switch to it
      if (calculatedPath.length > 0) {
        const startNodeObj = building.nodes.find(n => n.id === startNode)
        if (startNodeObj && startNodeObj.floor !== selectedFloor) {
          console.log(`🔄 Auto-switching to floor ${startNodeObj.floor} (path starts there)`)
          setSelectedFloor(startNodeObj.floor)
        }
      }

      if (calculatedPath.length === 0) {
        console.error('NO PATH FOUND! Check edges and node connectivity')
      }
    } else {
      console.log('Pathfinding conditions not met:', { startNode, endNode, hasBuilding: !!building })
    }
  }, [startNode, endNode, building, accessibleMode, useSideStairs])

  // Reset path
  const resetPath = () => {
    setStartNode('lobby_entrance')
    setEndNode(null)
    setPath([])
    setNavInstructions([])
    stopSpeech()
    setSearchQuery('')
  }

const handleMouseDown = (e: React.MouseEvent) => {
  setIsDragging(true)
  panRef.current = pan
  setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
}

const handleMouseMove = (e: React.MouseEvent) => {
  if (!isDragging) return
  const newX = e.clientX - dragStart.x
  const newY = e.clientY - dragStart.y
  panRef.current = { x: newX, y: newY }
  // Directly update DOM — no React re-render
  if (mapInnerRef.current) {
    mapInnerRef.current.style.transform = `translate(${newX}px, ${newY}px) scale(${zoom})`
  }
}

const handleMouseUp = () => {
  setIsDragging(false)
  // Commit final pan position to React state once, on release
  setPan(panRef.current)
}
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 3))
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.5))
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  // Scroll wheel zoom handler
// Scroll wheel zoom handler
  const handleWheelRef = useRef<(e: WheelEvent) => void>(() => {})
  handleWheelRef.current = (e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setZoom(prev => Math.max(0.5, Math.min(3, prev + delta)))
  }

  if (!building) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  // Calculate viewBox bounds based on CURRENT FLOOR ONLY
  const allX: number[] = []
  const allY: number[] = []

  // Add walls for current floor only
  const currentFloorWalls = building.walls_by_floor
    ? building.walls_by_floor[selectedFloor.toString()] || []
    : building.walls || []

  currentFloorWalls.forEach(wall => {
    allX.push(wall.from[0], wall.to[0])
    allY.push(wall.from[1], wall.to[1])
  })

  // Add nodes for current floor only
  const currentFloorNodes = building.nodes.filter(n => n.floor === selectedFloor)

  currentFloorNodes.forEach(node => {
    allX.push(node.x)
    allY.push(node.y)

    if (node.polygon) {
      node.polygon.forEach(point => {
        allX.push(point[0])
        allY.push(point[1])
      })
    }
  })

  // Add room polygons for current floor only
  const currentFloorRooms = building.room_polygons_by_floor?.[selectedFloor.toString()] || []

  currentFloorRooms.forEach(room => {
    room.polygon.forEach(point => {
      allX.push(point[0])
      allY.push(point[1])
    })
  })

  const padding = 15
  const minX = Math.min(...allX) - padding
  const maxX = Math.max(...allX) + padding
  const minY = Math.min(...allY) - padding
  const maxY = Math.max(...allY) + padding
  const width = maxX - minX
  const height = maxY - minY

  // Filter nodes by floor
  const floorNodes = building.nodes.filter(n => n.floor === selectedFloor)
  const corridors = building.corridor_polygons || []

  // Get room polygons for current floor (NEW)
  const roomPolygons = building.room_polygons_by_floor?.[selectedFloor.toString()] || []

  // Legacy: Get rooms from nodes (for backward compatibility)
  const legacyRooms = floorNodes.filter(n => n.type === 'room')

  // Use room polygons if available, otherwise fall back to legacy node-based rooms
  const rooms = roomPolygons.length > 0 ? roomPolygons.filter(r => r.clickable) : legacyRooms

  const corridorNodes = floorNodes.filter(n => n.type === 'corridor')
  const doors = floorNodes.filter(n => n.type === 'door')
  const stairs = floorNodes.filter(n => n.type === 'stairs')
  const elevators = floorNodes.filter(n => n.type === 'elevator')
  const entrances = floorNodes.filter(n => n.type === 'entrance')

  // Filter searchable rooms - show ALL if no search query
  const searchableRooms = searchQuery
    ? rooms.filter(r => r.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : rooms

  // Get path nodes for rendering
  const pathNodes = path.map(id => building.nodes.find(n => n.id === id)).filter(Boolean) as Node[]

  // Smart floor-based path rendering with multi-floor support
  let displayPathNodes: Node[] = []
  let floorTransitionNode: Node | null = null
  let nextFloor: number | null = null

  if (pathNodes.length > 0) {
    // Identify start and end floors
    const startFloor = pathNodes[0].floor
    const endFloor = pathNodes[pathNodes.length - 1].floor

    // Find all nodes on current floor
    const nodesOnCurrentFloor = pathNodes.filter(n => n.floor === selectedFloor)

    if (nodesOnCurrentFloor.length > 0) {
      // We have nodes on this floor
      const firstNodeOnFloorIndex = pathNodes.findIndex(n => n.floor === selectedFloor)
      const lastNodeOnFloorIndex = pathNodes.map((n, i) => n.floor === selectedFloor ? i : -1)
        .filter(i => i !== -1)
        .pop()!

      // Determine if this is an intermediate floor (not start, not destination)
      const isIntermediateFloor = selectedFloor !== startFloor && selectedFloor !== endFloor

      if (isIntermediateFloor) {
        // INTERMEDIATE FLOOR: Only show stairs/elevator, not corridors
        // Find the stairs/elevator on this floor
        const transitionNodes = pathNodes.filter(n =>
          n.floor === selectedFloor && (n.type === 'stairs' || n.type === 'elevator')
        )

        if (transitionNodes.length > 0) {
          // Show only the transition node (stairs/elevator)
          displayPathNodes = [transitionNodes[0]]
          floorTransitionNode = transitionNodes[0]

          // Find next floor in path
          const currentFloorLastIndex = pathNodes.findIndex(n =>
            (n.type === 'stairs' || n.type === 'elevator') && n.floor === selectedFloor
          )
          if (currentFloorLastIndex >= 0 && currentFloorLastIndex < pathNodes.length - 1) {
            nextFloor = pathNodes[currentFloorLastIndex + 1].floor
          }
        }
      } else {
        // START OR END FLOOR: Show full segment on this floor
        displayPathNodes = pathNodes.slice(firstNodeOnFloorIndex, lastNodeOnFloorIndex + 1)

        // Check if path continues to another floor (forward direction)
        if (lastNodeOnFloorIndex < pathNodes.length - 1) {
          const transitionNode = pathNodes[lastNodeOnFloorIndex]
          const nextNode = pathNodes[lastNodeOnFloorIndex + 1]

          if ((transitionNode.type === 'stairs' || transitionNode.type === 'elevator') &&
              nextNode.floor !== selectedFloor) {
            floorTransitionNode = transitionNode
            nextFloor = nextNode.floor
          }
        }
      }
    } else {
      // No nodes on current floor - don't show anything
      displayPathNodes = []
    }
  }

  return (
    <div style={{ height: '100vh', overflow: 'clip', background: '#0a0e1a', display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div style={{ background: 'rgba(15,23,42,0.98)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '12px 24px', flexShrink: 0, overflow: 'visible' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

          {/* Top row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button
                onClick={() => navigate('/')}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#94a3b8', padding: '6px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              >← Home</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22d3ee', boxShadow: '0 0 8px #22d3ee' }} />
                <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>{building.name} — 2D Map</h1>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={() => navigate('/3d-viewer')}
                style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >🏗️ 3D View</button>
              <button
                onClick={() => setShowCorridorNodes(v => !v)}
                style={{ background: !showCorridorNodes ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)', border: !showCorridorNodes ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: !showCorridorNodes ? '#93c5fd' : '#64748b', padding: '7px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >{showCorridorNodes ? 'Hide Nodes' : 'Show Nodes'}</button>
              <button
                onClick={() => setDarkMode(!darkMode)}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#94a3b8', padding: '7px 14px', fontSize: '13px', cursor: 'pointer' }}
              >{darkMode ? '☀️' : '🌙'}</button>
            </div>
          </div>

          {/* Controls row */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Floor selector */}
            <select
              value={selectedFloor}
              onChange={(e) => setSelectedFloor(Number(e.target.value))}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#f1f5f9', padding: '7px 12px', fontSize: '13px', cursor: 'pointer', outline: 'none' }}
            >
              <option value={0} style={{ background: '#1e293b' }}>Ground Floor</option>
              <option value={1} style={{ background: '#1e293b' }}>First Floor</option>
              <option value={2} style={{ background: '#1e293b' }}>Second Floor</option>
              <option value={3} style={{ background: '#1e293b' }}>Third Floor</option>
            </select>

            {/* Search */}
            <div style={{ flex: 1, maxWidth: '360px', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '7px 12px' }}>
                <span style={{ fontSize: '14px' }}>🔍</span>
                <input
                  type="text"
                  placeholder="Search rooms…"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  style={{ background: 'none', border: 'none', outline: 'none', color: '#f1f5f9', fontSize: '13px', width: '100%' }}
                />
              </div>
              {showDropdown && searchableRooms.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', boxShadow: '0 16px 32px rgba(0,0,0,0.5)', zIndex: 9999, maxHeight: '200px', overflowY: 'auto' }}>
                  {searchableRooms.map(room => (
                    <button
                      key={room.id}
                      onClick={() => { setEndNode(`${room.id}_door`); setSearchQuery(''); setShowDropdown(false) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: '13px', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.15)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >{room.label}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Zoom controls */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button onClick={handleZoomOut} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#f1f5f9', width: '30px', height: '30px', fontSize: '16px', cursor: 'pointer', fontWeight: 700 }}>−</button>
              <button onClick={resetView} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#94a3b8', padding: '0 10px', height: '30px', fontSize: '12px', cursor: 'pointer' }}>Reset</button>
              <button onClick={handleZoomIn} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#f1f5f9', width: '30px', height: '30px', fontSize: '16px', cursor: 'pointer', fontWeight: 700 }}>+</button>
              <span style={{ color: '#475569', fontSize: '12px', minWidth: '36px' }}>{Math.round(zoom * 100)}%</span>
            </div>

            {/* Nav mode toggles */}
            <button
              onClick={() => { setUseSideStairs(!useSideStairs); setAccessibleMode(false) }}
              style={{ background: useSideStairs ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.06)', border: useSideStairs ? '1px solid rgba(249,115,22,0.4)' : '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: useSideStairs ? '#fb923c' : '#64748b', padding: '7px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >{useSideStairs ? '✓ ' : ''}Side Stairs</button>
            <button
              onClick={() => { setAccessibleMode(!accessibleMode); setUseSideStairs(false) }}
              style={{ background: accessibleMode ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)', border: accessibleMode ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: accessibleMode ? '#4ade80' : '#64748b', padding: '7px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >{accessibleMode ? '✓ ' : ''}Elevator Priority</button>
          </div>

          {/* Path info bar */}
          <div style={{ marginTop: '10px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '10px', padding: '10px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '20px', fontSize: '13px', flexWrap: 'wrap' }}>
                {startNode && (
                  <span style={{ color: '#94a3b8' }}>
                    <span style={{ color: '#64748b' }}>From: </span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{building.nodes.find(n => n.id === startNode)?.label || 'Unknown'}</span>
                  </span>
                )}
                {endNode && (
                  <span style={{ color: '#94a3b8' }}>
                    <span style={{ color: '#64748b' }}>To: </span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                      {endNode.endsWith('_door')
                        ? building.nodes.find(n => n.id === endNode.replace('_door', ''))?.label || 'Unknown'
                        : building.nodes.find(n => n.id === endNode)?.label || 'Unknown'}
                    </span>
                  </span>
                )}
                {path.length > 0 && (
                  <span style={{ color: '#4ade80', fontWeight: 600 }}>✓ Route found ({path.length} steps)</span>
                )}
                {!endNode && (
                  <span style={{ color: '#475569', fontStyle: 'italic' }}>Click any room on the map to set destination</span>
                )}
              </div>
              {(startNode || endNode) && (
                <button onClick={resetPath} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', color: '#f87171', padding: '4px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Clear</button>
              )}
            </div>

            {/* Navigation Instructions */}
            {navInstructions.length > 0 && (
              <div style={{ marginTop: '8px', borderTop: '1px solid rgba(59,130,246,0.2)', paddingTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <button
                    onClick={() => setShowInstructions(v => !v)}
                    style={{ background: 'none', border: 'none', color: '#93c5fd', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                  >{showInstructions ? 'Hide' : 'Show'} directions ({navInstructions.length} steps)</button>
                  <button
                    onClick={() => { const next = !voiceMuted; setVoiceMuted(next); if (next) stopSpeech(); else speakInstructions(navInstructions) }}
                    style={{ background: voiceMuted ? 'rgba(255,255,255,0.06)' : 'rgba(59,130,246,0.25)', border: voiceMuted ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(59,130,246,0.4)', borderRadius: '6px', color: voiceMuted ? '#475569' : '#93c5fd', padding: '2px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >{voiceMuted ? '🔇 Muted' : '🔊 Speaking'}</button>
                </div>
                {showInstructions && (
                  <ol style={{ margin: 0, padding: 0, listStyle: 'none', maxHeight: '100px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
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

        </div>
      </div>

      {/* Map Canvas */}
      <div
        className="map-container"
        style={{ flex: 1, position: 'relative', overflow: 'hidden', background: darkMode ? '#020617' : '#1e293b', cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
                  ref={mapInnerRef}
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: '0 0',
                    transition: isDragging ? 'none' : 'transform 0.1s',
                  }}
                  className="absolute"
                >
          <svg
            viewBox={`${minX} ${minY} ${width} ${height}`}
            className={darkMode ? 'bg-gray-800' : 'bg-white'}
            style={{ width: width * 10, height: height * 10 }}
          >
            {/* RENDER CORRIDOR POLYGONS (grey background) */}
            {corridors.map((corridor, idx) => (
              corridor.polygon ? (
                <polygon
                  key={`corridor-${idx}`}
                  points={corridor.polygon.map(p => `${p[0]},${p[1]}`).join(' ')}
                  fill="#f0f0f0"
                  stroke="none"
                />
              ) : null
            ))}
            {/* RENDER WALLS - Per floor, with optional labels */}
            {(() => {
              const wallsToRender = building.walls_by_floor
                ? building.walls_by_floor[selectedFloor.toString()] || []
                : building.walls || []

              // Compute building bounds for this floor to classify exterior vs interior
              const allWallX = wallsToRender.flatMap(w => [w.from[0], w.to[0]])
              const allWallY = wallsToRender.flatMap(w => [w.from[1], w.to[1]])
              const bMinX = Math.min(...allWallX)
              const bMaxX = Math.max(...allWallX)
              const bMinY = Math.min(...allWallY)
              const bMaxY = Math.max(...allWallY)
              const edgeTolerance = 3  // units — how close to the boundary = exterior

              const getWallLabel = (wall: Wall): string => {
                const mx = (wall.from[0] + wall.to[0]) / 2
                const my = (wall.from[1] + wall.to[1]) / 2
                const dx = wall.to[0] - wall.from[0]
                const dy = wall.to[1] - wall.from[1]
                const isHorizontal = Math.abs(dy) < Math.abs(dx)

                const nearTop = my <= bMinY + edgeTolerance
                const nearBottom = my >= bMaxY - edgeTolerance
                const nearLeft = mx <= bMinX + edgeTolerance
                const nearRight = mx >= bMaxX - edgeTolerance
                const isExterior = nearTop || nearBottom || nearLeft || nearRight

                if (isExterior) {
                  if (nearTop && isHorizontal) return 'North Wall'
                  if (nearBottom && isHorizontal) return 'South Wall'
                  if (nearLeft && !isHorizontal) return 'West Wall'
                  if (nearRight && !isHorizontal) return 'East Wall'
                  return 'Exterior Wall'
                }
                return isHorizontal ? 'H Partition' : 'V Partition'
              }

              return wallsToRender.map((wall, idx) => {
                const mx = (wall.from[0] + wall.to[0]) / 2
                const my = (wall.from[1] + wall.to[1]) / 2
                const dx = wall.to[0] - wall.from[0]
                const dy = wall.to[1] - wall.from[1]
                const angle = Math.atan2(dy, dx) * (180 / Math.PI)
                const label = getWallLabel(wall)

                return (
                  <g key={`wall-${idx}`}>
                    <line
                      x1={wall.from[0]} y1={wall.from[1]}
                      x2={wall.to[0]}   y2={wall.to[1]}
                      stroke="#333"
                      strokeWidth="0.2"
                    />
                    {showWallLabels && (
                      <text
                        x={mx}
                        y={my}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="1.0"
                        fill="#b45309"
                        fontWeight="500"
                        transform={`rotate(${angle}, ${mx}, ${my})`}
                        pointerEvents="none"
                        style={{ userSelect: 'none' }}
                      >
                        {label}
                      </text>
                    )}
                  </g>
                )
              })
            })()}

            {/* RENDER PATH (if exists) - Manhattan routing, truncated at floor transitions */}
            {displayPathNodes.length > 1 && (
              <g>
                {displayPathNodes.slice(0, -1).map((node, idx) => {
                  const nextNode = displayPathNodes[idx + 1]

                  // Check if nodes are aligned horizontally or vertically
                  const isHorizontal = Math.abs(node.y - nextNode.y) < 1
                  const isVertical = Math.abs(node.x - nextNode.x) < 1

                  if (isHorizontal || isVertical) {
                    // Already aligned - draw straight line
                    return (
                      <line
                        key={`path-${idx}`}
                        x1={node.x}
                        y1={node.y}
                        x2={nextNode.x}
                        y2={nextNode.y}
                        stroke="#ff4081"
                        strokeWidth="0.4"
                        strokeDasharray="0.5,0.3"
                      />
                    )
                  } else {
                      return (
                          <line
                            key={`path-${idx}`}
                            x1={node.x}
                            y1={node.y}
                            x2={nextNode.x}
                            y2={nextNode.y}
                                          stroke="#ff4081"
                                          strokeWidth="0.4"
                                          strokeDasharray="0.5,0.3"
                                        />
                                      )
                                    }
                                  })}
                                </g>
                              )}
            {/* RENDER "NEXT FLOOR" INDICATOR at floor transition point - CLICKABLE */}
            {floorTransitionNode && nextFloor !== null && (
              <g
                onClick={() => setSelectedFloor(nextFloor)}
                style={{ cursor: 'pointer' }}
                className="floor-transition-indicator"
              >
                {/* Pulsing circle around stairs/lift */}
                <circle
                  cx={floorTransitionNode.x}
                  cy={floorTransitionNode.y}
                  r="3"
                  fill="none"
                  stroke="#ff4081"
                  strokeWidth="0.5"
                  opacity="0.7"
                  pointerEvents="all"
                >
                  <animate
                    attributeName="r"
                    from="3"
                    to="5"
                    dur="1s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    from="0.7"
                    to="0"
                    dur="1s"
                    repeatCount="indefinite"
                  />
                </circle>

                {/* "Next Floor" label - clickable */}
                <g transform={`translate(${floorTransitionNode.x}, ${floorTransitionNode.y - 5})`}>
                  <rect
                    x="-10"
                    y="-3"
                    width="20"
                    height="5"
                    fill="#ff4081"
                    rx="1"
                    pointerEvents="all"
                  />
                  <text
                    x="0"
                    y="0"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="2"
                    fill="white"
                    fontWeight="700"
                    pointerEvents="none"
                  >
                    ▲ Floor {nextFloor}
                  </text>
                </g>
              </g>
            )}

            {/* RENDER ROOMS - CLICKABLE POLYGONS */}
            {rooms.map(room => {
              const isDoorDestination = endNode === `${room.id}_door`

              // Calculate center of polygon for label
              let centerX, centerY
              if ('polygon' in room && room.polygon) {
                const xs = room.polygon.map(p => p[0])
                const ys = room.polygon.map(p => p[1])
                centerX = (Math.min(...xs) + Math.max(...xs)) / 2
                centerY = (Math.min(...ys) + Math.max(...ys)) / 2
              } else if ('x' in room && 'y' in room) {
                // Legacy format
                centerX = (room as any).x
                centerY = (room as any).y
              } else {
                return null
              }

              return (
                <g
                  key={room.id}
                  onClick={() => handleRoomClick(room.id)}
                  style={{ cursor: 'pointer' }}
                  className="room-polygon"
                >
                  {'polygon' in room && room.polygon ? (
                    <polygon
                      points={room.polygon.map(p => `${p[0]},${p[1]}`).join(' ')}
                      fill={isDoorDestination ? '#ffcdd2' : '#e3f2fd'}
                      stroke={isDoorDestination ? '#f44336' : '#1976d2'}
                      strokeWidth={isDoorDestination ? '0.35' : '0.15'}
                      pointerEvents="all"
                    />
                  ) : (
                    <rect
                      x={centerX - 12}
                      y={centerY - 4}
                      width="24"
                      height="8"
                      fill={isDoorDestination ? '#ffcdd2' : '#e3f2fd'}
                      stroke={isDoorDestination ? '#f44336' : '#1976d2'}
                      strokeWidth={isDoorDestination ? '0.35' : '0.15'}
                      rx="1"
                      pointerEvents="all"
                    />
                  )}
                  <text
                    x={centerX}
                    y={centerY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="2.4"
                    fill={isDoorDestination ? '#c62828' : '#1976d2'}
                    fontWeight={isDoorDestination ? '700' : '600'}
                    pointerEvents="none"
                  >
                    {room.label}
                  </text>
                </g>
              )
            })}

            {/* RENDER NON-CLICKABLE ROOMS (faculty rooms, etc.) */}
            {roomPolygons.filter(r => !r.clickable).map(room => (
              <g key={room.id} className="room-polygon-non-clickable">
                {room.polygon && (
                  <>
                    <polygon
                      points={room.polygon.map(p => `${p[0]},${p[1]}`).join(' ')}
                      fill="#f5f5f5"
                      stroke="#bdbdbd"
                      strokeWidth="0.15"
                      pointerEvents="none"
                    />
                    <text
                      x={(Math.min(...room.polygon.map(p => p[0])) + Math.max(...room.polygon.map(p => p[0]))) / 2}
                      y={(Math.min(...room.polygon.map(p => p[1])) + Math.max(...room.polygon.map(p => p[1]))) / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="1.8"
                      fill="#757575"
                      fontWeight="400"
                      pointerEvents="none"
                    >
                      {room.label}
                    </text>
                  </>
                )}
              </g>
            ))}

            {/* RENDER CORRIDOR NODES - hidden by default */}
            {!showCorridorNodes && corridorNodes.map(node => (
              <g key={node.id}>
                <circle cx={node.x} cy={node.y} r="1.0" fill={path.includes(node.id) ? '#ff4081' : '#42a5f5'} stroke={path.includes(node.id) ? '#c51162' : '#1976d2'} strokeWidth="0.25" opacity="0.95" />
                <circle cx={node.x} cy={node.y} r="0.4" fill="#ffffff" opacity="0.8" />
              </g>
            ))}

            {/* RENDER DOORS (red dots inside rooms) */}
            {doors.map(door => {
              const isDest = door.id === endNode
              const isInPath = path.includes(door.id)

              return (
                <g key={door.id}>
                  {/* Glow for destination */}
                  {isDest && (
                    <circle
                      cx={door.x}
                      cy={door.y}
                      r="1.2"
                      fill="#f44336"
                      opacity="0.3"
                    />
                  )}
                  {/* Main door dot */}
                  <circle
                    cx={door.x}
                    cy={door.y}
                    r={isDest ? "0.9" : "0.7"}
                    fill={isInPath || isDest ? '#f44336' : '#d32f2f'}
                    stroke={isDest ? '#c62828' : '#b71c1c'}
                    strokeWidth={isDest ? '0.25' : '0.15'}
                  />
                  {/* White center highlight */}
                  <circle
                    cx={door.x}
                    cy={door.y}
                    r={isDest ? "0.35" : "0.25"}
                    fill="#ffffff"
                    opacity="0.9"
                  />
                  {/* Label for destination */}
                  {isDest && (
                    <text
                      x={door.x}
                      y={door.y + 2}
                      textAnchor="middle"
                      fontSize="1.8"
                      fill="#f44336"
                      fontWeight="700"
                    >
                      DESTINATION
                    </text>
                  )}
                </g>
              )
            })}

            {/* RENDER STAIRS */}
            {stairs.map(s => (
              <g key={s.id}>
                <rect
                  x={s.x - 0.8}
                  y={s.y - 0.8}
                  width="1.6"
                  height="1.6"
                  fill="#ff9800"
                  stroke="#e65100"
                  strokeWidth="0.1"
                />
                <text
                  x={s.x}
                  y={s.y - 1.2}
                  textAnchor="middle"
                  fontSize="1.8"
                  fill="#e65100"
                  fontWeight="600"
                >
                  Stairs
                </text>
              </g>
            ))}

            {/* RENDER ELEVATOR */}
            {elevators.map(el => (
              <g key={el.id}>
                <rect
                  x={el.x - 0.6}
                  y={el.y - 0.6}
                  width="1.2"
                  height="1.2"
                  fill="#9c27b0"
                  stroke="#6a1b9a"
                  strokeWidth="0.1"
                />
                <text
                  x={el.x}
                  y={el.y + 1.5}
                  textAnchor="middle"
                  fontSize="1.8"
                  fill="#6a1b9a"
                  fontWeight="600"
                >
                  Lift
                </text>
              </g>
            ))}

            {/* RENDER ENTRANCES */}
            {entrances.map(ent => (
              <g key={ent.id} onClick={() => handleStartClick(ent.id)} style={{ cursor: 'pointer' }}>
                <circle
                  cx={ent.x}
                  cy={ent.y}
                  r="0.8"
                  fill={ent.id === startNode ? '#2e7d32' : '#4caf50'}
                  stroke={ent.id === startNode ? '#000' : '#2e7d32'}
                  strokeWidth={ent.id === startNode ? '0.3' : '0.15'}
                />
                <text
                  x={ent.x}
                  y={ent.y - 1.5}
                  textAnchor="middle"
                  fontSize="2"
                  fill="#2e7d32"
                  fontWeight="700"
                  pointerEvents="none"
                >
                  {ent.label}
                </text>
                {ent.id === startNode && (
                  <text
                    x={ent.x}
                    y={ent.y + 2.5}
                    textAnchor="middle"
                    fontSize="1.6"
                    fill="#2e7d32"
                    fontWeight="700"
                    pointerEvents="none"
                  >
                    START
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white bg-opacity-90 p-4 rounded-lg shadow-lg max-w-xs">
          <p className="text-sm text-gray-800 mb-2 font-semibold">
            🎯 How to navigate:
          </p>
          <p className="text-xs text-gray-600 mb-3">
            <strong>1.</strong> Click green entrance to set START<br/>
            <strong>2.</strong> Click blue room box to set destination<br/>
            <strong>3.</strong> Path ends at red dot inside room!
          </p>
          {startNode && (
            <div className="text-xs bg-green-50 p-2 rounded mb-2">
              <strong className="text-green-700">START:</strong> {building.nodes.find(n => n.id === startNode)?.label}
            </div>
          )}
          {endNode && (
            <div className="text-xs bg-red-50 p-2 rounded mb-2">
              <strong className="text-red-700">DESTINATION:</strong>{' '}
              {endNode.endsWith('_door')
                ? building.nodes.find(n => n.id === endNode.replace('_door', ''))?.label || 'Unknown'
                : building.nodes.find(n => n.id === endNode)?.label || 'Unknown'}
            </div>
          )}
          {path.length > 0 && (
            <div className="text-xs bg-pink-50 p-2 rounded mb-2">
              <strong className="text-pink-700">✓ Path found:</strong> {path.length} steps
            </div>
          )}
          <div className="text-xs text-gray-600 border-t pt-2">
            <strong>🔴 Red dot</strong> = Door (destination)<br/>
            <strong>🔵 Blue circles</strong> = Corridors ({corridorNodes.length})<br/>
            <strong>📦 Click blue room boxes!</strong><br/>
            <strong>Pink line</strong> = Your route
          </div>
        </div>
      </div>
    </div>
  )
}

export default Viewer2D