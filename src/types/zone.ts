import { ZoneType } from './enums';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Zone {
  _id: string;
  name: string;
  zoneType: ZoneType;
  boundaries: Coordinates[]; // Array of coordinates defining the zone boundary
  maxAltitude: number; // Maximum allowed altitude in meters
  minAltitude: number; // Minimum allowed altitude in meters
  isActive: boolean; // Whether the zone is currently active
  description: string; // Additional information about the zone
  createdAt: number; // Timestamp when zone was created
  updatedAt: number; // Timestamp when zone was last updated
}
