import { ApiBody, ApiProperty } from '@nestjs/swagger';
import { Day, ZoneType } from './enums';
import { Operator } from './operator';
export enum DroneType {
  MEDICAL,
  CARGO,
  SURVEILLANCE,
  AGRICULTURAL,
  RECREATIONAL,
  MAPPING,
  MILITAR,
}

export enum DroneStatus {
  ACTIVE,
  MAINTENANCE,
  INACTIVE,
}

export class DroneInput {
  @ApiProperty()
  serialNumber: string;
  @ApiProperty()
  model: string;
  @ApiProperty({ enum: DroneType })
  droneType: DroneType;
  @ApiProperty()
  certHashes: string[];
  @ApiProperty({ enum: ZoneType })
  permittedZones: ZoneType[];
  @ApiProperty()
  operatorId: string;
  @ApiProperty()
  maintenanceHash: string;
  @ApiProperty({ enum: DroneStatus })
  status: DroneStatus;
}

export interface Drone {
  _id: string; // Unique identifier for the drone
  serialNumber: string;
  model: string;
  droneType: DroneType;
  certHashes: string[];
  permittedZones: ZoneType[];
  ownerHistory: string[];
  maintenanceHash: string;
  status: DroneStatus;
}
