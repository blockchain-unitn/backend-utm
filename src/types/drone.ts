import { ApiBody, ApiProperty } from '@nestjs/swagger';
import { Day, ZoneType } from './enums';
import { Operator } from './operator';

export class AuthorizedPeriod {
  @ApiProperty()
  days: Day[];
  @ApiProperty()
  from: Date;
  @ApiProperty()
  to: Date;
}

export interface Drone {
  _id: string;
  model: string;
  operatorId: string; // Reference to Operator
  authorizedZones: ZoneType[];
  authorizedPeriods: AuthorizedPeriod[];
}

/**
 * Input interface for creating or updating a drone entity.
 *
 * @interface DroneInput
 * @property {string} model - The model name or identifier of the drone
 * @property {string} operatorId - Reference ID to the operator who owns/controls this drone
 * @property {ZoneType[]} authorizedZones - Array of zone types where this drone is authorized to operate
 * @property {AuthorizedPeriod[]} authorizedPeriods - Array of time periods when this drone is authorized to operate
 */
export class DroneInput {
  @ApiProperty()
  model: string;
  @ApiProperty()
  operatorId: string; // Reference to Operator
  @ApiProperty()
  authorizedZones: ZoneType[];
  @ApiProperty()
  authorizedPeriods: AuthorizedPeriod[];
}
