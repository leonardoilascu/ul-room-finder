import { Graph } from './graph'
import { PathNode } from './types'

interface AStarNode {
  id: string
  g: number  // Cost from start to current node
  h: number  // Heuristic cost from current node to goal
  f: number  // Total cost (g + h)
  parent: string | null
}

export interface PathResult {
  path: PathNode[]
  distance: number
  found: boolean
}

export class AStar {
  private graph: Graph

  constructor(graph: Graph) {
    this.graph = graph
  }

  /**
   * Find the shortest path using A* algorithm
   * @param startId - Starting node ID
   * @param goalId - Goal node ID
   * @param requireAccessible - Whether to only use accessible paths
   * @returns PathResult containing the path, distance, and success status
   */
  findPath(
    startId: string,
    goalId: string,
    requireAccessible: boolean = false
  ): PathResult {
    // Validate nodes exist
    if (!this.graph.hasNode(startId) || !this.graph.hasNode(goalId)) {
      return { path: [], distance: 0, found: false }
    }

    // Initialize data structures
    const openSet = new Set<string>([startId])
    const closedSet = new Set<string>()
    const nodes = new Map<string, AStarNode>()

    // Initialize start node
    nodes.set(startId, {
      id: startId,
      g: 0,
      h: this.graph.getDistance(startId, goalId),
      f: this.graph.getDistance(startId, goalId),
      parent: null
    })

    while (openSet.size > 0) {
      // Find node in openSet with lowest f score
      let current = this.getLowestFScore(openSet, nodes)

      if (!current) break

      // Goal reached
      if (current === goalId) {
        return this.reconstructPath(nodes, current)
      }

      openSet.delete(current)
      closedSet.add(current)

      // Check all neighbors
      const neighbors = this.graph.getAccessibleNeighbors(current, requireAccessible)

      for (const edge of neighbors) {
        const neighbor = edge.to

        // Skip if already evaluated
        if (closedSet.has(neighbor)) continue

        // IMPORTANT: Don't route THROUGH rooms - only allow entering rooms if they're the goal
        const node = this.graph.getNode(neighbor)
        if (node?.type === 'room' && neighbor !== goalId) {
          continue // Skip this room - it's not our destination
        }

        // Calculate tentative g score
        const currentNode = nodes.get(current)!
        const tentativeG = currentNode.g + edge.weight

        // Discover a new node or find a better path
        if (!openSet.has(neighbor)) {
          openSet.add(neighbor)
        } else {
          const existingNode = nodes.get(neighbor)
          if (existingNode && tentativeG >= existingNode.g) {
            continue // This is not a better path
          }
        }

        // This path is the best so far
        const h = this.graph.getDistance(neighbor, goalId)
        nodes.set(neighbor, {
          id: neighbor,
          g: tentativeG,
          h: h,
          f: tentativeG + h,
          parent: current
        })
      }
    }

    // No path found
    return { path: [], distance: 0, found: false }
  }

  /**
   * Get the node with the lowest f score from the open set
   */
  private getLowestFScore(
    openSet: Set<string>,
    nodes: Map<string, AStarNode>
  ): string | null {
    let lowest: string | null = null
    let lowestF = Infinity

    for (const nodeId of openSet) {
      const node = nodes.get(nodeId)
      if (node && node.f < lowestF) {
        lowestF = node.f
        lowest = nodeId
      }
    }

    return lowest
  }

  /**
   * Reconstruct the path from start to goal
   */
  private reconstructPath(
    nodes: Map<string, AStarNode>,
    goalId: string
  ): PathResult {
    const path: PathNode[] = []
    let current: string | null = goalId
    let totalDistance = 0

    while (current !== null) {
      const node = this.graph.getNode(current)
      if (node) {
        path.unshift(node)
      }

      const astarNode = nodes.get(current)
      if (astarNode) {
        totalDistance = astarNode.g
        current = astarNode.parent
      } else {
        break
      }
    }

    return {
      path,
      distance: totalDistance,
      found: true
    }
  }
}