import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Graph } from '../utils/graph'
import { AStar } from '../utils/pathfinding'
import { PathNode } from '../types'
import exampleBuildingData from '../data/buildings_example.json'
import csisBuildingData from '../data/buildings_csis.json'

// Building options
const BUILDINGS = {
  example: { name: "Example Building", data: exampleBuildingData },
  csis: { name: "CSIS Building", data: csisBuildingData }
}

function Viewer2D() {
  const navigate = useNavigate()
  const [zoom, setZoom] = useState(0.6) // Start zoomed out to see full building
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [currentFloor, setCurrentFloor] = useState(0)
  const maxFloor = 1

  // Building selection
  const [selectedBuilding, setSelectedBuilding] = useState<'example' | 'csis'>('example')
  const buildingData = BUILDINGS[selectedBuilding].data

  // Pathfinding state
  const [graph, setGraph] = useState<Graph | null>(null)
  const [pathfinder, setPathfinder] = useState<AStar | null>(null)
  const [startRoom, setStartRoom] = useState<string>('')
  const [endRoom, setEndRoom] = useState<string>('')
  const [path, setPath] = useState<PathNode[]>([])
  const [requireAccessible, setRequireAccessible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Initialize graph and pathfinder
  useEffect(() => {
    const g = new Graph()

    // Add all nodes
    buildingData.nodes.forEach(node => {
      g.addNode(node as PathNode)
    })

    // Add all edges
    buildingData.edges.forEach(edge => {
      g.addEdge(edge)
    })

    setGraph(g)
    setPathfinder(new AStar(g))

    // Reset selections when building changes
    setStartRoom('')
    setEndRoom('')
    setPath([])
    setCurrentFloor(0)
  }, [selectedBuilding, buildingData])

  // Get all room nodes
  const allRoomNodes = graph?.getAllNodes().filter(n => n.type === 'room') || []
  const entranceNodes = graph?.getAllNodes().filter(n => n.type === 'entrance') || []

  // Filter rooms by current floor
  const currentFloorRooms = allRoomNodes.filter(room => room.floor === currentFloor)
  const currentFloorEntrances = entranceNodes.filter(e => e.floor === currentFloor)

  // Get stairs and elevators on current floor
  const stairs = graph?.getAllNodes().filter(n => n.type === 'stairs' && n.floor === currentFloor) || []
  const elevators = graph?.getAllNodes().filter(n => n.type === 'elevator' && n.floor === currentFloor) || []

  // Filter rooms for search dropdown
  const filteredRooms = allRoomNodes.filter(room =>
    room.label?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Calculate path when start or end changes
  useEffect(() => {
    if (pathfinder && startRoom && endRoom) {
      const result = pathfinder.findPath(startRoom, endRoom, requireAccessible)
      if (result.found) {
        setPath(result.path)
        console.log('Path found:', result.path.map(n => `${n.id} (${n.type})`).join(' → '))
        console.log('Total distance:', result.distance)

        // Auto-switch to floor of first node in path
        if (result.path.length > 0) {
          setCurrentFloor(result.path[0].floor)
        }
      } else {
        setPath([])
        console.log('No path found')
      }
    }
  }, [startRoom, endRoom, requireAccessible, pathfinder])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.2, 3))
  }

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.2, 0.3)) // Allow zooming out more for large building
  }

  const resetView = () => {
    setZoom(0.6) // Match initial zoom
    setPan({ x: 0, y: 0 })
  }

  const handleRoomClick = (roomId: string) => {
    if (!startRoom) {
      setStartRoom(roomId)
    } else if (!endRoom) {
      setEndRoom(roomId)
    } else {
      // Reset and start new path
      setStartRoom(roomId)
      setEndRoom('')
      setPath([])
    }
  }

  const clearPath = () => {
    setStartRoom('')
    setEndRoom('')
    setPath([])
  }

  // Generate SVG path string from path nodes on current floor
  const generatePathString = () => {
    const floorPath = path.filter(node => node.floor === currentFloor)
    if (floorPath.length < 2) return ''

    let pathString = `M ${floorPath[0].x} ${floorPath[0].y}`
    for (let i = 1; i < floorPath.length; i++) {
      pathString += ` L ${floorPath[i].x} ${floorPath[i].y}`
    }
    return pathString
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-md p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                ← Back to Search
              </button>
              <h1 className="text-2xl font-bold text-gray-800">2D Map Viewer</h1>

              {/* Building Selector */}
              <select
                value={selectedBuilding}
                onChange={(e) => setSelectedBuilding(e.target.value as 'example' | 'csis')}
                className="px-4 py-2 bg-white border-2 border-blue-600 text-gray-800 rounded-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="example">Example Building</option>
                <option value="csis">CSIS Building</option>
              </select>

              {/* Switch to 3D button */}
              <button
                onClick={() => navigate('/3d-viewer')}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2"
              >
                <span>🎮</span>
                <span>Switch to 3D</span>
              </button>
            </div>

            <div className="flex items-center gap-4">
              {/* Floor Controls */}
              <div className="flex gap-2 items-center">
                <span className="text-gray-600 font-semibold">
                  Floor: {currentFloor === 0 ? 'Ground' : currentFloor}
                </span>

                {currentFloor > 0 && (
                  <button
                    onClick={() => setCurrentFloor(prev => prev - 1)}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded flex items-center gap-2"
                  >
                    <span>↓</span>
                    <span>Previous Floor</span>
                  </button>
                )}

                {currentFloor < maxFloor && (
                  <button
                    onClick={() => setCurrentFloor(prev => prev + 1)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center gap-2"
                  >
                    <span>↑</span>
                    <span>Next Floor</span>
                  </button>
                )}
              </div>

              {/* Zoom Controls */}
              <div className="flex gap-2">
                <button
                  onClick={handleZoomOut}
                  className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded font-bold"
                >
                  −
                </button>
                <button
                  onClick={resetView}
                  className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm"
                >
                  Reset
                </button>
                <button
                  onClick={handleZoomIn}
                  className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded font-bold"
                >
                  +
                </button>
                <span className="px-3 py-1 text-gray-600">
                  {Math.round(zoom * 100)}%
                </span>
              </div>
            </div>
          </div>

          {/* Room Selection Controls */}
          <div className="grid grid-cols-3 gap-4">
            {/* Start Room */}
            <div>
              <label className="block text-sm font-semibold mb-2">Start Location</label>
              <select
                value={startRoom}
                onChange={(e) => setStartRoom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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

            {/* End Room */}
            <div>
              <label className="block text-sm font-semibold mb-2">Destination</label>
              <select
                value={endRoom}
                onChange={(e) => setEndRoom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select destination...</option>
                {allRoomNodes.map(node => (
                  <option key={node.id} value={node.id}>
                    {node.label || node.id} (Floor {node.floor === 0 ? 'G' : node.floor})
                  </option>
                ))}
              </select>
            </div>

            {/* Controls */}
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

          {/* Path Info */}
          {path.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm font-semibold text-blue-900">
                Path found: {path.length} steps
                {path.some(n => n.type === 'stairs') && ' (via stairs)'}
                {path.some(n => n.type === 'elevator') && ' (via elevator)'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Map Canvas */}
      <div
        className="relative overflow-hidden bg-gray-200"
        style={{ height: 'calc(100vh - 250px)', cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Map Container */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: isDragging ? 'none' : 'transform 0.1s',
          }}
          className="absolute"
        >
          <svg width="1000" height="1400" className="bg-white" viewBox="0 0 1000 1400">
            {/* Dynamic Corridors - draw lines between connected nodes */}
            {buildingData.edges
              .filter(edge => {
                const fromNode = buildingData.nodes.find(n => n.id === edge.from)
                const toNode = buildingData.nodes.find(n => n.id === edge.to)
                return fromNode?.floor === currentFloor && toNode?.floor === currentFloor
              })
              .map((edge, idx) => {
                const fromNode = buildingData.nodes.find(n => n.id === edge.from)
                const toNode = buildingData.nodes.find(n => n.id === edge.to)
                if (!fromNode || !toNode) return null

                return (
                  <line
                    key={`edge-${idx}`}
                    x1={fromNode.x}
                    y1={fromNode.y}
                    x2={toNode.x}
                    y2={toNode.y}
                    stroke="#d0d0d0"
                    strokeWidth="3"
                  />
                )
              })}

            {/* Corridor nodes */}
            {buildingData.nodes
              .filter(n => n.type === 'corridor' && n.floor === currentFloor)
              .map(node => (
                <circle
                  key={`corridor-${node.id}`}
                  cx={node.x}
                  cy={node.y}
                  r="4"
                  fill="#999"
                />
              ))}

            {/* Path - draw AFTER corridors so it's visible */}
            {path.length > 0 && (
              <path
                d={generatePathString()}
                stroke="#f44336"
                strokeWidth="6"
                strokeDasharray="10,5"
                fill="none"
              />
            )}

            {/* Rooms */}
            {currentFloorRooms.map(room => {
              const isStart = room.id === startRoom
              const isEnd = room.id === endRoom
              const isInPath = path.some(n => n.id === room.id)
              const isEmergency = room.label?.includes('Emergency')

              return (
                <g
                  key={room.id}
                  onClick={() => !isEmergency && handleRoomClick(room.id)}
                  className={isEmergency ? '' : 'cursor-pointer'}
                >
                  <rect
                    x={room.x - 50}
                    y={room.y - 30}
                    width="100"
                    height="60"
                    fill={isStart ? '#22c55e' : isEnd ? '#f44336' : isInPath ? '#fbbf24' : isEmergency ? '#6b7280' : '#e3f2fd'}
                    stroke={isStart ? '#16a34a' : isEnd ? '#dc2626' : isEmergency ? '#374151' : '#1976d2'}
                    strokeWidth="3"
                    rx="4"
                  />
                  <text
                    x={room.x}
                    y={room.y + 5}
                    textAnchor="middle"
                    className="text-sm font-bold pointer-events-none"
                    fill={isStart || isEnd ? '#fff' : '#1976d2'}
                  >
                    {room.label}
                  </text>
                </g>
              )
            })}

            {/* Entrances - only on ground floor */}
            {currentFloorEntrances.map(entrance => {
              const isStart = entrance.id === startRoom

              return (
                <g
                  key={entrance.id}
                  onClick={() => handleRoomClick(entrance.id)}
                  className="cursor-pointer"
                >
                  <circle
                    cx={entrance.x}
                    cy={entrance.y}
                    r="18"
                    fill={isStart ? '#16a34a' : '#22c55e'}
                    strokeWidth="3"
                    stroke="#166534"
                  />
                  <text
                    x={entrance.x}
                    y={entrance.y - 25}
                    textAnchor="middle"
                    className="text-sm font-bold pointer-events-none"
                    fill="#22c55e"
                  >
                    {entrance.label}
                  </text>
                </g>
              )
            })}

            {/* Stairs */}
            {stairs.map(stair => (
              <g key={stair.id}>
                <rect
                  x={stair.x - 25}
                  y={stair.y - 25}
                  width="50"
                  height="50"
                  fill="#ec4899"
                  stroke="#be185d"
                  strokeWidth="3"
                  rx="4"
                />
                <text
                  x={stair.x}
                  y={stair.y + 5}
                  textAnchor="middle"
                  className="text-xs font-bold pointer-events-none"
                  fill="#fff"
                >
                  Stairs
                </text>
              </g>
            ))}

            {/* Elevators */}
            {elevators.map(elevator => (
              <g key={elevator.id}>
                <rect
                  x={elevator.x - 25}
                  y={elevator.y - 25}
                  width="50"
                  height="50"
                  fill="#8b5cf6"
                  stroke="#6d28d9"
                  strokeWidth="3"
                  rx="4"
                />
                <text
                  x={elevator.x}
                  y={elevator.y + 5}
                  textAnchor="middle"
                  className="text-xs font-bold pointer-events-none"
                  fill="#fff"
                >
                  Elevator
                </text>
              </g>
            ))}
          </svg>
        </div>

        {/* Floor Indicator */}
        <div className="absolute top-4 left-4 bg-white bg-opacity-90 p-3 rounded-lg shadow-lg">
          <p className="text-lg font-bold text-gray-800">
            {currentFloor === 0 ? 'Ground Floor' : `Floor ${currentFloor}`}
          </p>
        </div>

        {/* Instructions */}
        <div className="absolute bottom-4 left-4 bg-white bg-opacity-90 p-4 rounded-lg shadow-lg max-w-md">
          <p className="text-sm text-gray-600">
            <strong>Controls:</strong> Click and drag to pan • Use +/− to zoom • Use floor buttons to change floors<br/>
            <strong>Navigation:</strong> Select start and destination from dropdowns or click rooms on the map
          </p>
          <div className="mt-2 flex gap-2 text-xs">
            <span className="px-2 py-1 bg-green-100 text-green-800 rounded">Green = Start</span>
            <span className="px-2 py-1 bg-red-100 text-red-800 rounded">Red = Destination</span>
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded">Yellow = Path</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Viewer2D
