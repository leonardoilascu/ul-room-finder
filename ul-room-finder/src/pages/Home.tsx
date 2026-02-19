import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import buildingData from '../data/buildings.json'

function Home() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const navigate = useNavigate()

  // Fuzzy search implementation
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    const query = searchQuery.toLowerCase()
    const rooms = buildingData.nodes.filter(node => node.type === 'room')
    
    // Simple fuzzy matching: check if query chars appear in order
    const fuzzyMatch = (text: string, query: string): boolean => {
      const textLower = text.toLowerCase()
      let queryIndex = 0
      
      for (let i = 0; i < textLower.length && queryIndex < query.length; i++) {
        if (textLower[i] === query[queryIndex]) {
          queryIndex++
        }
      }
      
      return queryIndex === query.length
    }

    const matches = rooms.filter(room => {
      const label = room.label || room.id
      return fuzzyMatch(label, query) || label.toLowerCase().includes(query)
    })

    setSearchResults(matches.slice(0, 5)) // Limit to 5 results
  }, [searchQuery])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-blue-600 mb-2">
            UL Room Finder
          </h1>
          <p className="text-gray-600 text-lg">
            Accessible Indoor Navigation with 2D Maps and 3D Flythroughs
          </p>
        </div>

        {/* Viewer Buttons */}
        <div className="flex justify-center gap-4 mb-8">
          <button
            onClick={() => navigate('/2d-viewer')}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold shadow-lg"
          >
            📍 2D Map Viewer
          </button>
          <button
            onClick={() => navigate('/3d-viewer')}
            className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 transition-colors font-semibold shadow-lg"
          >
            🎬 3D Flythrough
          </button>
        </div>

        {/* Search Box */}
        <div className="bg-white rounded-lg shadow-xl p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search for a Room
          </label>
          <input
            type="text"
            placeholder="Try: CS1-020, CS1-022, or just '020'"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
          />

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <p className="text-sm text-gray-600 mb-2">Found {searchResults.length} room(s):</p>
              <div className="space-y-2">
                {searchResults.map(room => (
                  <div
                    key={room.id}
                    className="p-3 bg-blue-50 rounded-lg hover:bg-blue-100 cursor-pointer transition-colors"
                    onClick={() => {
                      // In a full implementation, this would pass the room ID to the viewer
                      navigate('/2d-viewer')
                    }}
                  >
                    <p className="font-semibold text-blue-800">
                      {room.label || room.id}
                    </p>
                    <p className="text-sm text-gray-600">
                      Floor {room.floor} • Click to navigate
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchQuery && searchResults.length === 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                No rooms found matching "{searchQuery}". Try a different search term.
              </p>
            </div>
          )}
        </div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-3xl mb-2">♿</div>
            <h3 className="font-semibold text-lg mb-2">Accessible Routes</h3>
            <p className="text-sm text-gray-600">
              Prioritizes elevators and wheelchair-accessible paths
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-3xl mb-2">🎯</div>
            <h3 className="font-semibold text-lg mb-2">A* Pathfinding</h3>
            <p className="text-sm text-gray-600">
              Optimal route calculation using advanced algorithms
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-3xl mb-2">🔍</div>
            <h3 className="font-semibold text-lg mb-2">Fuzzy Search</h3>
            <p className="text-sm text-gray-600">
              Finds rooms even with incomplete or approximate input
            </p>
          </div>
        </div>

        {/* Project Info */}
        <div className="mt-8 bg-white p-6 rounded-lg shadow-md">
          <h3 className="font-semibold text-lg mb-2">About This Project</h3>
          <p className="text-sm text-gray-600 mb-2">
            UL Room Finder is a Final Year Project for BSc Computer Systems, supervised by Dr. Katie Crowley.
            It demonstrates indoor navigation using graph-based pathfinding with accessibility features.
          </p>
          <p className="text-sm text-gray-500">
            Currently showing: CSIS Building Floor 1 (Sample Data)
          </p>
        </div>
      </div>
    </div>
  )
}

export default Home
