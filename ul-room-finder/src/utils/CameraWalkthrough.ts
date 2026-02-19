import * as THREE from 'three'
import { PathNode } from '../types'

export class CameraWalkthrough {
  private camera: THREE.Camera
  private path: PathNode[]
  private curve: THREE.CatmullRomCurve3 | null = null
  private isPlaying: boolean = false
  private progress: number = 0
  private speed: number = 1.0
  private offsetX: number
  private offsetZ: number
  private floorHeight: number
  private onProgressUpdate?: (progress: number) => void
  private onComplete?: () => void

  constructor(
    camera: THREE.Camera,
    offsetX: number = -425,
    offsetZ: number = -325,
    floorHeight: number = 150
  ) {
    this.camera = camera
    this.offsetX = offsetX
    this.offsetZ = offsetZ
    this.floorHeight = floorHeight
    this.path = []
  }

  // Set the path to follow
  setPath(pathNodes: PathNode[]) {
    if (pathNodes.length < 2) {
      console.warn('Path must have at least 2 nodes')
      return
    }

    this.path = pathNodes
    this.progress = 0
    this.createCurve()
  }

  // Create smooth curve from path nodes
  private createCurve() {
    const points: THREE.Vector3[] = []
    const eyeHeight = 60 // Camera at eye level (about 1.7m in real scale)

    this.path.forEach((node, index) => {
      const x = node.x + this.offsetX
      const y = node.floor * this.floorHeight + eyeHeight
      const z = node.y + this.offsetZ

      // Add point
      points.push(new THREE.Vector3(x, y, z))

      // For stairs/elevators, add intermediate points for smooth transition
      if (index < this.path.length - 1) {
        const nextNode = this.path[index + 1]
        
        // If floor changes, add intermediate points for vertical movement
        if (node.floor !== nextNode.floor) {
          const numIntermediatePoints = 8
          const startY = node.floor * this.floorHeight + eyeHeight
          const endY = nextNode.floor * this.floorHeight + eyeHeight
          const startX = node.x + this.offsetX
          const endX = nextNode.x + this.offsetX
          const startZ = node.y + this.offsetZ
          const endZ = nextNode.y + this.offsetZ

          for (let i = 1; i <= numIntermediatePoints; i++) {
            const t = i / (numIntermediatePoints + 1)
            const interpX = startX + (endX - startX) * t
            const interpY = startY + (endY - startY) * t
            const interpZ = startZ + (endZ - startZ) * t
            points.push(new THREE.Vector3(interpX, interpY, interpZ))
          }
        }
      }
    })

    // Create smooth curve through all points
    this.curve = new THREE.CatmullRomCurve3(points)
    this.curve.tension = 0.5 // Smoother curves
  }

  // Start the walkthrough
  play() {
    if (!this.curve) {
      console.warn('No path set for walkthrough')
      return
    }
    this.isPlaying = true
  }

  // Pause the walkthrough
  pause() {
    this.isPlaying = false
  }

  // Reset to beginning
  reset() {
    this.progress = 0
    this.isPlaying = false
    if (this.curve && this.path.length > 0) {
      this.updateCameraPosition()
    }
  }

  // Set playback speed (0.5 = half speed, 2.0 = double speed)
  setSpeed(speed: number) {
    this.speed = Math.max(0.1, Math.min(5.0, speed)) // Clamp between 0.1x and 5x
  }

  // Get current speed
  getSpeed(): number {
    return this.speed
  }

  // Check if currently playing
  isActive(): boolean {
    return this.isPlaying
  }

  // Get current progress (0 to 1)
  getProgress(): number {
    return this.progress
  }

  // Set progress callback
  onProgress(callback: (progress: number) => void) {
    this.onProgressUpdate = callback
  }

  // Set completion callback
  onFinish(callback: () => void) {
    this.onComplete = callback
  }

  // Update camera position (call this in animation loop)
  update(delta: number) {
    if (!this.isPlaying || !this.curve) return

    // Update progress based on speed and delta time
    const baseSpeed = 0.05 // Base movement speed
    this.progress += delta * baseSpeed * this.speed

    // Check if completed
    if (this.progress >= 1.0) {
      this.progress = 1.0
      this.isPlaying = false
      if (this.onComplete) {
        this.onComplete()
      }
    }

    // Update camera position and rotation
    this.updateCameraPosition()

    // Notify progress listeners
    if (this.onProgressUpdate) {
      this.onProgressUpdate(this.progress)
    }
  }

  // Update camera position and look direction
  private updateCameraPosition() {
    if (!this.curve) return

    // Get position on curve
    const position = this.curve.getPoint(this.progress)
    this.camera.position.copy(position)

    // Get look-ahead point for smooth camera rotation
    const lookAheadDistance = 0.02 // Look slightly ahead
    const lookAheadProgress = Math.min(this.progress + lookAheadDistance, 1.0)
    const lookAtPoint = this.curve.getPoint(lookAheadProgress)

    // Make camera look in direction of travel
    this.camera.lookAt(lookAtPoint)

    // Optional: Add slight head bob for realism
    const bobAmount = 2
    const bobSpeed = 10
    const bob = Math.sin(this.progress * bobSpeed * Math.PI * 2) * bobAmount
    this.camera.position.y += bob
  }

  // Get current node index (which node are we closest to?)
  getCurrentNodeIndex(): number {
    if (this.path.length === 0) return -1
    
    // Approximate which node we're at based on progress
    const nodeIndex = Math.floor(this.progress * (this.path.length - 1))
    return Math.min(nodeIndex, this.path.length - 1)
  }

  // Get current node
  getCurrentNode(): PathNode | null {
    const index = this.getCurrentNodeIndex()
    return index >= 0 ? this.path[index] : null
  }

  // Skip to specific progress point
  skipTo(progress: number) {
    this.progress = Math.max(0, Math.min(1, progress))
    this.updateCameraPosition()
  }

  // Get path visualization line
  getPathLine(): THREE.Line | null {
    if (!this.curve) return null

    const points = this.curve.getPoints(100)
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({ 
      color: 0x00ff00,
      linewidth: 3
    })
    return new THREE.Line(geometry, material)
  }
}
