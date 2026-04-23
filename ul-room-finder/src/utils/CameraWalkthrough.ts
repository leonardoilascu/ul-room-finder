import * as THREE from 'three'
import { PathNode } from '../types'

export class CameraWalkthrough {
  private camera: THREE.Camera
  private path: PathNode[]
  private isPlaying: boolean = false
  private currentNodeIndex: number = 0
  private segmentProgress: number = 0
  private speed: number = 1.0
  private offsetX: number
  private offsetZ: number
  private floorHeight: number
  private scale: number = 1
  private floorOffsets: Map<number, { x: number; z: number }> = new Map()
  private onProgressUpdate?: (progress: number) => void
  private onComplete?: () => void
  private targetQuaternion: THREE.Quaternion = new THREE.Quaternion()
  private rotationSpeed: number = 5.0
  private onFloorTransition?: (fromFloor: number, toFloor: number) => void
  private transitioning: boolean = false
  private transitionPauseDuration: number = 2.0 // seconds to pause at floor transition
  private transitionTimer: number = 0


setFloorTransitionCallback(cb: (fromFloor: number, toFloor: number) => void) {
  this.onFloorTransition = cb
}

  constructor(
    camera: THREE.Camera,
    offsetX: number = 0,
    offsetZ: number = 0,
    floorHeight: number = 150
  ) {
    this.camera = camera
    this.path = []
    this.offsetX = offsetX
    this.offsetZ = offsetZ
    this.floorHeight = floorHeight
  }

  /** Call after computing per-floor centering offsets in Viewer3D */
  setFloorOffsets(scale: number, offsets: Map<number, { x: number; z: number }>) {
    this.scale = scale
    this.floorOffsets = offsets
  }

  /** Compute the 3D position of a path node */
  private getNodePos(node: PathNode, eyeHeight = 90): THREE.Vector3 {
    const off = this.floorOffsets.get(node.floor)
    if (off) {
      return new THREE.Vector3(
        node.x * this.scale + off.x,
        node.floor * this.floorHeight + eyeHeight,
        node.y * this.scale + off.z
      )
    }
    // Legacy fallback (single offset, no scale)
    return new THREE.Vector3(
      node.x + this.offsetX,
      node.floor * this.floorHeight + eyeHeight,
      node.y + this.offsetZ
    )
  }

  setPath(pathNodes: PathNode[]) {
    if (pathNodes.length < 2) return
    this.path = pathNodes
    this.currentNodeIndex = 0
    this.segmentProgress = 0
    this.updateCameraPosition(1.0)
  }

  play() { if (this.path.length >= 2) this.isPlaying = true }
  pause() { this.isPlaying = false }
  stop() {
    this.isPlaying = false
    this.currentNodeIndex = 0
    this.segmentProgress = 0
    if (this.path.length > 0) this.updateCameraPosition(1.0)
  }
  reset() { this.stop() }
  isActive(): boolean { return this.isPlaying }
  setSpeed(speed: number) { this.speed = Math.max(0.1, Math.min(speed, 5.0)) }
  getSpeed(): number { return this.speed }
  setProgressCallback(cb: (p: number) => void) { this.onProgressUpdate = cb }
  setCompletionCallback(cb: () => void) { this.onComplete = cb }

  update(delta: number) {
    if (!this.isPlaying || this.path.length < 2) return

    // Handle transition pause first
    if (this.transitioning) {
      this.transitionTimer -= delta
      if (this.transitionTimer <= 0) {
        this.transitioning = false
      } else {
        return
      }
    }

    const moveSpeed = 10.0
    this.segmentProgress += (delta * moveSpeed * this.speed) / this.getSegmentLength()

    if (this.segmentProgress >= 1.0) {
      this.segmentProgress = 0
      this.currentNodeIndex++

      if (this.currentNodeIndex >= this.path.length - 1) {
        this.currentNodeIndex = this.path.length - 1
        this.segmentProgress = 1.0
        this.isPlaying = false
        this.onComplete?.()
        return
      }

      // Look AHEAD — if the next node is on a different floor, pause NOW before moving
      const currentNode = this.path[this.currentNodeIndex]
      const nextNode = this.path[this.currentNodeIndex + 1]
      if (currentNode && nextNode && currentNode.floor !== nextNode.floor) {
        this.transitioning = true
        this.transitionTimer = this.transitionPauseDuration
        this.onFloorTransition?.(currentNode.floor, nextNode.floor)
      }
    }

    this.updateCameraPosition(delta)
    if (this.onProgressUpdate) {
      this.onProgressUpdate(
        (this.currentNodeIndex + this.segmentProgress) / (this.path.length - 1)
      )
    }
  }

  private getSegmentLength(): number {
    if (this.currentNodeIndex >= this.path.length - 1) return 1
    const a = this.getNodePos(this.path[this.currentNodeIndex])
    const b = this.getNodePos(this.path[this.currentNodeIndex + 1])
    return a.distanceTo(b) || 1
  }

  private updateCameraPosition(delta: number) {
    if (this.path.length < 2) return
    if (this.currentNodeIndex >= this.path.length - 1) {
      this.camera.position.copy(this.getNodePos(this.path[this.path.length - 1]))
      return
    }
    const cur = this.getNodePos(this.path[this.currentNodeIndex])
    const nxt = this.getNodePos(this.path[this.currentNodeIndex + 1])
    const t = this.segmentProgress
    const pos = cur.clone().lerp(nxt, t)
    this.camera.position.copy(pos)

    const tempCam = this.camera.clone() as THREE.Camera
    tempCam.position.copy(pos)
    ;(tempCam as THREE.PerspectiveCamera).lookAt(nxt)
    this.targetQuaternion.copy((tempCam as THREE.PerspectiveCamera).quaternion)
    this.camera.quaternion.slerp(this.targetQuaternion, Math.min(1.0, delta * this.rotationSpeed))
  }

  getCurrentNodeIndex(): number { return this.currentNodeIndex }
  getProgress(): number {
    if (this.path.length < 2) return 0
    return (this.currentNodeIndex + this.segmentProgress) / (this.path.length - 1)
  }
  setProgress(progress: number) {
    progress = Math.max(0, Math.min(1, progress))
    const t = progress * (this.path.length - 1)
    this.currentNodeIndex = Math.min(Math.floor(t), this.path.length - 2)
    this.segmentProgress = t - this.currentNodeIndex
    this.updateCameraPosition(1.0)
  }
}