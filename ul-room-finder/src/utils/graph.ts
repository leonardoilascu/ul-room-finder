import { PathNode, PathEdge } from './types'

export class Graph {
  private nodes: Map<string, PathNode>
  private adjacencyList: Map<string, PathEdge[]>

  constructor() {
    this.nodes = new Map()
    this.adjacencyList = new Map()
  }

  addNode(node: PathNode): void {
    this.nodes.set(node.id, node)
    if (!this.adjacencyList.has(node.id)) {
      this.adjacencyList.set(node.id, [])
    }
  }

  addEdge(edge: PathEdge): void {
    // Add edge in both directions (bidirectional graph)
    const forwardEdge = edge
    const reverseEdge: PathEdge = {
      from: edge.to,
      to: edge.from,
      weight: edge.weight,
      accessible: edge.accessible
    }

    const fromEdges = this.adjacencyList.get(edge.from) || []
    fromEdges.push(forwardEdge)
    this.adjacencyList.set(edge.from, fromEdges)

    const toEdges = this.adjacencyList.get(edge.to) || []
    toEdges.push(reverseEdge)
    this.adjacencyList.set(edge.to, toEdges)
  }

  getNode(id: string): PathNode | undefined {
    return this.nodes.get(id)
  }

  getNeighbors(nodeId: string): PathEdge[] {
    return this.adjacencyList.get(nodeId) || []
  }

  getAllNodes(): PathNode[] {
    return Array.from(this.nodes.values())
  }

  hasNode(id: string): boolean {
    return this.nodes.has(id)
  }

  // Calculate Euclidean distance between two nodes (for heuristic)
  getDistance(nodeId1: string, nodeId2: string): number {
    const node1 = this.nodes.get(nodeId1)
    const node2 = this.nodes.get(nodeId2)

    if (!node1 || !node2) return Infinity

    // Add floor penalty if on different floors
    const floorPenalty = Math.abs(node1.floor - node2.floor) * 50

    const dx = node1.x - node2.x
    const dy = node1.y - node2.y

    return Math.sqrt(dx * dx + dy * dy) + floorPenalty
  }

  // Filter edges based on accessibility requirements
  getAccessibleNeighbors(nodeId: string, requireAccessible: boolean): PathEdge[] {
    const neighbors = this.getNeighbors(nodeId)
    
    if (!requireAccessible) {
      return neighbors
    }

    return neighbors.filter(edge => edge.accessible)
  }
}
