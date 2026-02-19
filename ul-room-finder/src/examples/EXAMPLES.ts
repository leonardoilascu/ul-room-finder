/**
 * UL Room Finder - Example Usage and Tests
 * 
 * This file demonstrates how to use the Graph and AStar classes
 * Run these examples in your browser console or create unit tests
 */

import { Graph } from './utils/graph'
import { AStar } from './utils/pathfinding'
import { PathNode, PathEdge } from './types'

/**
 * Example 1: Building a Simple Graph
 */
export function createSimpleGraph(): Graph {
  const graph = new Graph()
  
  // Add entrance
  graph.addNode({
    id: 'entrance',
    x: 0,
    y: 0,
    floor: 1,
    type: 'entrance',
    label: 'Main Entrance'
  })
  
  // Add corridor
  graph.addNode({
    id: 'corridor1',
    x: 100,
    y: 0,
    floor: 1,
    type: 'corridor'
  })
  
  // Add room
  graph.addNode({
    id: 'room101',
    x: 200,
    y: 0,
    floor: 1,
    type: 'room',
    label: 'Room 101'
  })
  
  // Connect them
  graph.addEdge({
    from: 'entrance',
    to: 'corridor1',
    weight: 100,
    accessible: true
  })
  
  graph.addEdge({
    from: 'corridor1',
    to: 'room101',
    weight: 100,
    accessible: true
  })
  
  return graph
}

/**
 * Example 2: Finding a Path
 */
export function findSimplePath(): void {
  const graph = createSimpleGraph()
  const pathfinder = new AStar(graph)
  
  const result = pathfinder.findPath('entrance', 'room101', false)
  
  console.log('=== Simple Path Example ===')
  console.log('Path found:', result.found)
  console.log('Number of steps:', result.path.length)
  console.log('Total distance:', result.distance)
  console.log('Path:', result.path.map(n => n.id).join(' -> '))
}

/**
 * Example 3: Testing Accessibility
 */
export function testAccessibility(): void {
  const graph = new Graph()
  
  // Create two paths: one with stairs, one with elevator
  const nodes: PathNode[] = [
    { id: 'start', x: 0, y: 0, floor: 1, type: 'entrance' },
    { id: 'stairs', x: 100, y: 0, floor: 1, type: 'stairs' },
    { id: 'elevator', x: 100, y: 100, floor: 1, type: 'elevator' },
    { id: 'destination', x: 200, y: 0, floor: 2, type: 'room' }
  ]
  
  nodes.forEach(n => graph.addNode(n))
  
  // Stairs path - shorter but not accessible
  graph.addEdge({ from: 'start', to: 'stairs', weight: 100, accessible: false })
  graph.addEdge({ from: 'stairs', to: 'destination', weight: 100, accessible: false })
  
  // Elevator path - longer but accessible
  graph.addEdge({ from: 'start', to: 'elevator', weight: 150, accessible: true })
  graph.addEdge({ from: 'elevator', to: 'destination', weight: 150, accessible: true })
  
  const pathfinder = new AStar(graph)
  
  // Find path without accessibility constraint
  const anyPath = pathfinder.findPath('start', 'destination', false)
  console.log('\n=== Accessibility Test ===')
  console.log('Shortest path (any):', anyPath.path.map(n => n.id).join(' -> '))
  console.log('Distance:', anyPath.distance)
  
  // Find accessible path only
  const accessiblePath = pathfinder.findPath('start', 'destination', true)
  console.log('Accessible path:', accessiblePath.path.map(n => n.id).join(' -> '))
  console.log('Distance:', accessiblePath.distance)
}

/**
 * Example 4: Complex Multi-floor Building
 */
export function createMultiFloorBuilding(): Graph {
  const graph = new Graph()
  
  // Floor 1
  const floor1Nodes: PathNode[] = [
    { id: 'f1_entrance', x: 0, y: 0, floor: 1, type: 'entrance', label: 'Entrance' },
    { id: 'f1_corridor1', x: 100, y: 0, floor: 1, type: 'corridor' },
    { id: 'f1_corridor2', x: 200, y: 0, floor: 1, type: 'corridor' },
    { id: 'f1_room1', x: 100, y: 100, floor: 1, type: 'room', label: 'Room 101' },
    { id: 'f1_room2', x: 200, y: 100, floor: 1, type: 'room', label: 'Room 102' },
    { id: 'f1_stairs', x: 300, y: 0, floor: 1, type: 'stairs', label: 'Stairs' },
    { id: 'f1_elevator', x: 300, y: 100, floor: 1, type: 'elevator', label: 'Elevator' }
  ]
  
  // Floor 2
  const floor2Nodes: PathNode[] = [
    { id: 'f2_stairs', x: 300, y: 0, floor: 2, type: 'stairs', label: 'Stairs' },
    { id: 'f2_elevator', x: 300, y: 100, floor: 2, type: 'elevator', label: 'Elevator' },
    { id: 'f2_corridor1', x: 200, y: 0, floor: 2, type: 'corridor' },
    { id: 'f2_corridor2', x: 100, y: 0, floor: 2, type: 'corridor' },
    { id: 'f2_room1', x: 100, y: 100, floor: 2, type: 'room', label: 'Room 201' },
    { id: 'f2_room2', x: 200, y: 100, floor: 2, type: 'room', label: 'Room 202' }
  ]
  
  // Add all nodes
  ;[...floor1Nodes, ...floor2Nodes].forEach(n => graph.addNode(n))
  
  // Floor 1 connections
  const floor1Edges: PathEdge[] = [
    { from: 'f1_entrance', to: 'f1_corridor1', weight: 100, accessible: true },
    { from: 'f1_corridor1', to: 'f1_corridor2', weight: 100, accessible: true },
    { from: 'f1_corridor1', to: 'f1_room1', weight: 100, accessible: true },
    { from: 'f1_corridor2', to: 'f1_room2', weight: 100, accessible: true },
    { from: 'f1_corridor2', to: 'f1_stairs', weight: 100, accessible: false },
    { from: 'f1_corridor2', to: 'f1_elevator', weight: 150, accessible: true }
  ]
  
  // Floor 2 connections
  const floor2Edges: PathEdge[] = [
    { from: 'f2_stairs', to: 'f2_corridor1', weight: 100, accessible: false },
    { from: 'f2_elevator', to: 'f2_corridor1', weight: 150, accessible: true },
    { from: 'f2_corridor1', to: 'f2_corridor2', weight: 100, accessible: true },
    { from: 'f2_corridor1', to: 'f2_room2', weight: 100, accessible: true },
    { from: 'f2_corridor2', to: 'f2_room1', weight: 100, accessible: true }
  ]
  
  // Vertical connections (stairs and elevator)
  const verticalEdges: PathEdge[] = [
    { from: 'f1_stairs', to: 'f2_stairs', weight: 50, accessible: false },
    { from: 'f1_elevator', to: 'f2_elevator', weight: 100, accessible: true }
  ]
  
  // Add all edges
  ;[...floor1Edges, ...floor2Edges, ...verticalEdges].forEach(e => graph.addEdge(e))
  
  return graph
}

/**
 * Example 5: Finding Multi-floor Path
 */
export function testMultiFloorPath(): void {
  const graph = createMultiFloorBuilding()
  const pathfinder = new AStar(graph)
  
  console.log('\n=== Multi-floor Path Test ===')
  
  // Path from entrance to room on floor 2
  const result = pathfinder.findPath('f1_entrance', 'f2_room1', false)
  
  console.log('Path found:', result.found)
  console.log('Path:', result.path.map(n => `${n.label || n.id} (Floor ${n.floor})`).join(' -> '))
  console.log('Distance:', result.distance.toFixed(1))
  
  // Same path but accessible only
  const accessibleResult = pathfinder.findPath('f1_entrance', 'f2_room1', true)
  
  console.log('\nAccessible path:')
  console.log('Path:', accessibleResult.path.map(n => `${n.label || n.id} (Floor ${n.floor})`).join(' -> '))
  console.log('Distance:', accessibleResult.distance.toFixed(1))
}

/**
 * Example 6: No Path Scenario
 */
export function testNoPath(): void {
  const graph = new Graph()
  
  // Create isolated nodes
  graph.addNode({ id: 'isolated1', x: 0, y: 0, floor: 1, type: 'room' })
  graph.addNode({ id: 'isolated2', x: 100, y: 100, floor: 1, type: 'room' })
  
  // No edges connecting them
  
  const pathfinder = new AStar(graph)
  const result = pathfinder.findPath('isolated1', 'isolated2', false)
  
  console.log('\n=== No Path Test ===')
  console.log('Path found:', result.found) // Should be false
  console.log('Path length:', result.path.length) // Should be 0
}

/**
 * Run all examples
 */
export function runAllExamples(): void {
  console.log('🚀 UL Room Finder - Example Usage\n')
  
  findSimplePath()
  testAccessibility()
  testMultiFloorPath()
  testNoPath()
  
  console.log('\n✅ All examples completed!')
}

/**
 * Performance Test
 */
export function performanceTest(): void {
  const graph = createMultiFloorBuilding()
  const pathfinder = new AStar(graph)
  
  const iterations = 1000
  const start = performance.now()
  
  for (let i = 0; i < iterations; i++) {
    pathfinder.findPath('f1_entrance', 'f2_room1', false)
  }
  
  const end = performance.now()
  const avgTime = (end - start) / iterations
  
  console.log('\n=== Performance Test ===')
  console.log(`Average time per pathfinding: ${avgTime.toFixed(3)}ms`)
  console.log(`Iterations: ${iterations}`)
}

// Export all for use in other files
export default {
  createSimpleGraph,
  findSimplePath,
  testAccessibility,
  createMultiFloorBuilding,
  testMultiFloorPath,
  testNoPath,
  runAllExamples,
  performanceTest
}
