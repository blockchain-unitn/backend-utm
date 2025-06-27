import { Day, ZoneType } from "./enums";
import { Operator } from "./operator";

export interface AuthorizedPeriod {
  days: Day[];
  from: Date;
  to: Date;
}

export interface Drone {
  _id: string;
  model: string;
  operator: Operator;
  authorized_zones: ZoneType[];
  authorized_periods: AuthorizedPeriod[];
}

/**
 * Input interface for creating or updating a drone entity.
 * 
 * @interface DroneInput
 * @property {string} model - The model name or identifier of the drone
 * @property {string} operator_id - Reference ID to the operator who owns/controls this drone
 * @property {ZoneType[]} authorized_zones - Array of zone types where this drone is authorized to operate
 * @property {AuthorizedPeriod[]} authorized_periods - Array of time periods when this drone is authorized to operate
 */
export interface DroneInput {
  model: string;
  operator_id: string; // Reference to Operator
  authorized_zones: ZoneType[];
  authorized_periods: AuthorizedPeriod[];
}