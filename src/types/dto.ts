// DTOs (Data Transfer Objects) for type safety
import { ApiBody, ApiProperty } from '@nestjs/swagger';
import { Position } from './route';

export enum PreAuthorizationStatus {
  APPROVED,
  FAILED,
}

export interface FlightPlan {
  route: Position[];
  start_time: Date;
  end_time: Date;
}
export class FlightPlan {
  @ApiProperty({ type: [Position] })
  route: Position[];
  @ApiProperty()
  start_time: Date;
  @ApiProperty()
  end_time: Date;
}

export interface PreAuthorizationRequest {
  droneId: string;
  flightPlan: FlightPlan;
}

export class PreAuthorizationRequest {
  @ApiProperty()
  droneId: string;
  @ApiProperty()
  flightPlan: FlightPlan;
}

export interface LocationUpdateRequest {
  droneId: string;
  timestamp: Date;
  position: Position;
}
