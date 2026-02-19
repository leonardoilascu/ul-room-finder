export interface Room {
  id: string;
  name: string;
  building: string;
  floor: number;
  x: number;
  y: number;
}

export interface Building {
  id: string;
  name: string;
  floors: number;
}

export interface PathNode {
  id: string;
  x: number;
  y: number;
  floor: number;
  type: 'room' | 'corridor' | 'stairs' | 'elevator' | 'entrance';
  label?: string; // Optional display label
}

export interface PathEdge {
  from: string;
  to: string;
  weight: number;
  accessible: boolean; // Whether this edge is wheelchair accessible
}
