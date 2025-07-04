import { ApiProperty } from '@nestjs/swagger';
import { ZoneType } from './enums';

export interface RoutePoint {
  lat: number;
  lon: number;
  altitude: number;
  finished?: boolean; // Indicates if the route point has been reached
}

/**
 * Represents a flight route for a drone with associated path points and zones.
 *
 * @interface Route
 * @property {string} _id - Unique identifier for the route
 * @property {string} drone_id - Identifier of the drone assigned to this route
 * @property {RoutePoint[]} path - Array of waypoints defining the flight path
 * @property {ZoneType[]} zones - Array of zones associated with this route
 */
export interface Route {
  _id: string;
  droneId: string;
  path: RoutePoint[];
  start_time: Date; // Start time of the route
  end_time: Date; // End time of the route
  finished: boolean; // Indicates if the route has been completed
  zones: ZoneType[]; // Array of zones associated with this route
}

export interface RoutePointInput {
  lat: number;
  lon: number;
  altitude: number;
}

export interface RouteInput {
  drone_id: string;
  path: RoutePointInput[];
}

export class Position {
  @ApiProperty({ type: Number })
  lat: number;
  @ApiProperty({ type: Number })
  lon: number;
  @ApiProperty({ type: Number })
  alt: number;
}

export interface Position {
  lat: number;
  lon: number;
  alt: number;
}

export interface Location {
  droneId: string;
  timestamp: Date;
  position: Position;
}
