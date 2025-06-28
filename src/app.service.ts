import { Injectable, Logger } from '@nestjs/common';
import { PreAuthorizationRequest, LocationUpdateRequest } from './types/dto';
import { ZoneType } from './types/enums';
import { Location, Route } from './types/route';
import { Drone, DroneInput } from './types/drone';
import * as mongoose from 'mongoose';
import { Zone } from './types/zone';
import { Operator, OperatorInput } from './types/operator';

const ENDPOINT_URL = process.env.ENDPOINT_URL;
const database: {
  drones: Drone[];
  flightPlans: Route[];
  locations: Location[];
  operators: Operator[];
} = {
  drones: [],
  flightPlans: [],
  locations: [],
  operators: [],
};

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  /**
   * Performs pre-authorization for a drone flight request.
   *
   * This method validates the incoming request, retrieves route characteristics,
   * and calls an external API endpoint to obtain pre-authorization status for the drone flight.
   *
   * @param request - The pre-authorization request containing drone_id and flight_plan
   * @returns A promise that resolves to the pre-authorization response data, or an error object
   *          containing the drone_id, status 'FAILED', and reason for failure
   *
   * @throws Will return an error response object if drone_id or flight_plan are missing,
   *         if route characteristics cannot be retrieved, or if the external API call fails
   **/
  async preAuthorization(request: PreAuthorizationRequest) {
    this.logger.log(`Starting pre-authorization for drone: ${request.droneId}`);
    
    try {
      if (!request.droneId || !request.flightPlan) {
        this.logger.error(`Invalid pre-authorization request: missing droneId or flightPlan`);
        throw new Error(
          'Invalid request: droneId and flightPlan are required.',
        );
      }

      this.logger.debug(`Getting route characteristics for drone: ${request.droneId}`);
      // Calling /get_route_characteristics
      const routeCharacteristics = this.getRouteCharacteristics(request);
      if (!routeCharacteristics) {
        this.logger.error(`Route characteristics not found for drone: ${request.droneId}`);
        throw new Error('Route characteristics not found.');
      }

      this.logger.debug(`Route characteristics found: ${JSON.stringify(routeCharacteristics)}`);

      // Calling ENDPOINT_URL API for preauthorization
      this.logger.log(`Calling external API for pre-authorization: ${ENDPOINT_URL}/preauthorization`);
      const response = await fetch(`${ENDPOINT_URL}/preauthorization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });
      
      const data = await response.json();
      this.logger.log(`Pre-authorization successful for drone: ${request.droneId}, status: ${data.preauthorization_status}`);
      return data;
    } catch (error) {
      this.logger.error(`Error in preAuthorization for drone ${request.droneId}: ${error.message}`, error.stack);
      return {
        droneId: request.droneId,
        preauthorization_status: 'FAILED',
        reason: error.message || 'Unknown error',
      };
    }
  }

  getZonesLimits() {
    this.logger.debug('Retrieving zone limits');
    return {
      [ZoneType.URBAN]: {
        xMin: -74.1,
        xMax: -73.9,
        yMin: 40.7,
        yMax: 40.8,
        altitudeMin: 150,
        altitudeMax: 200,
      },
      [ZoneType.RURAL]: {
        xMin: -75.0,
        xMax: -74.0,
        yMin: 39.0,
        yMax: 41.0,
        altitudeMin: 100,
        altitudeMax: 150,
      },
      [ZoneType.HOSPITALS]: {
        xMin: -74.05,
        xMax: -74.01,
        yMin: 40.71,
        yMax: 40.75,
        altitudeMin: 120,
        altitudeMax: 180,
      },
      [ZoneType.RESTRICTED]: {
        xMin: -73.95,
        xMax: -73.9,
        yMin: 40.7,
        yMax: 40.75,
        altitudeMin: 200,
        altitudeMax: 300,
      },
      [ZoneType.MILITARY]: {
        xMin: -73.85,
        xMax: -73.8,
        yMin: 40.65,
        yMax: 40.7,
        altitudeMin: 250,
        altitudeMax: 350,
      },
    };
  }

  /**
   * Analyzes a flight route and determines its characteristics including zones traversed,
   * altitude limits, weather status, and temporary restrictions.
   *
   * @param request - The pre-authorization request containing flight plan details
   * @returns An object containing route characteristics:
   *   - zones: Array of zone types (URBAN, RURAL, HOSPITALS, RESTRICTED, MILITARY) that the route passes through
   *   - altitude_limit: Maximum altitude from the flight plan route points
   *   - weather_status: Current weather status (currently returns empty string)
   *   - temporary_restrictions: Array of temporary restrictions (currently returns empty array)
   *
   * @remarks
   * This method currently uses hardcoded zone limits for demonstration purposes.
   * In production, zone data should be fetched from the blockchain.
   *
   * @example
   * ```typescript
   * const request: PreAuthorizationRequest = {
   *   flight_plan: {
   *     route: [
   *       { lat: 40.75, lon: -74.05, alt: 160 },
   *       { lat: 40.76, lon: -74.04, alt: 170 }
   *     ]
   *   }
   * };
   * const characteristics = getRouteCharacteristics(request);
   * // Returns: { zones: ['URBAN'], altitude_limit: 170, weather_status: ' ', temporary_restrictions: [] }
   * ```
   */
  getRouteCharacteristics(request: PreAuthorizationRequest) {
    this.logger.debug(`Analyzing route characteristics for drone: ${request.droneId}`);
    
    const routeCharacteristics: {
      zones: string[];
      altitudeLimit: number;
      weatherStatus: string;
      temporaryRestrictions: string[];
    } = {
      zones: [],
      altitudeLimit: 0,
      weatherStatus: ' ',
      temporaryRestrictions: [],
    };

    // Get the zones limits: TODO: This should be fetched from the blockchain
    const zonesLimits: {
      [key: string]: Zone;
    } = this.getZonesLimits();

    this.logger.debug(`Retrieving altitude limit and zones for flight plan of drone: ${JSON.stringify(request.flightPlan)}`);
    // Setting the altitude limit to the maximum altitude on the flight plan
    if (request.flightPlan && request.flightPlan.route.length > 0) {
      routeCharacteristics.altitudeLimit = Math.max(
        ...request.flightPlan.route.map((point) => point.alt),
      );
      this.logger.debug(`Calculated altitude limit: ${routeCharacteristics.altitudeLimit}`);
    }

    // Setting the zones based on the flight plan
    if (request.flightPlan && request.flightPlan.route.length > 0) {
      this.logger.debug(`Analyzing ${request.flightPlan.route.length} route points`);
      
      request.flightPlan.route.forEach((point, index) => {
        this.logger.verbose(`Processing route point ${index}: lat=${point.lat}, lon=${point.lon}, alt=${point.alt}`);
        
        Object.keys(zonesLimits).forEach((zoneKey) => {
          const zone = zonesLimits[zoneKey];
          if (
            point.lat >= zone.yMin &&
            point.lat <= zone.yMax &&
            point.lon >= zone.xMin &&
            point.lon <= zone.xMax &&
            point.alt >= zone.altitudeMin &&
            point.alt <= zone.altitudeMax
          ) {
            if (!routeCharacteristics.zones.includes(zoneKey)) {
              this.logger.debug(`Route passes through zone: ${zoneKey}`);
              routeCharacteristics.zones.push(zoneKey);
            }
          }
        });
      });
    }

    this.logger.log(`Route analysis complete. Zones: [${routeCharacteristics.zones.join(', ')}], Altitude limit: ${routeCharacteristics.altitudeLimit}`);
    return routeCharacteristics;
  }

  /**
   * Updates the location of a drone by storing telemetry data locally and forwarding it to a backend service.
   *
   * @param request - The location update request containing drone identification, position coordinates, and timestamp
   * @throws {Error} Throws an error if required fields (drone_id, position, timestamp) are missing
   * @returns A promise that resolves when the location update is processed
   *
   * @remarks
   * This method performs two operations:
   * 1. Validates and stores the location data in the local database
   * 2. Sends the telemetry data to the configured backend endpoint via HTTP POST
   *
   * If the HTTP request fails, the error is logged but does not prevent local storage.
   */
  async locationUpdate(request: LocationUpdateRequest) {
    this.logger.log(`Processing location update for drone: ${request.droneId}`);
    
    // Storing the telemetry data
    if (!request.droneId || !request.position || !request.timestamp) {
      this.logger.error(`Invalid location update request: missing required fields`);
      throw new Error(
        'Invalid request: droneId, position, and timestamp are required.',
      );
    }
    
    const locationData: Location = {
      droneId: request.droneId,
      timestamp: new Date(request.timestamp),
      position: {
        lat: request.position.lat,
        lon: request.position.lon,
        alt: request.position.alt,
      },
    };
    
    database.locations.push(locationData);
    this.logger.debug(`Location data stored locally for drone: ${request.droneId}, position: lat=${locationData.position.lat}, lon=${locationData.position.lon}, alt=${locationData.position.alt}`);

    try {
      // Sending telemetry data to the backend service
      this.logger.debug(`Sending location update to backend: ${ENDPOINT_URL}/location_update`);
      await fetch(`${ENDPOINT_URL}/location_update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(locationData),
      });
      this.logger.log(`Location update sent to backend successfully for drone: ${request.droneId}`);
    } catch (error) {
      this.logger.error(`Error sending location update to backend for drone ${request.droneId}: ${error.message}`, error.stack);
      throw new Error(`Failed to send location update to backend: ${error.message}`);
    }
  }

  /**
   * Adds a mock drone to the local database and registers it on the blockchain.
   *
   * This method validates the required drone input fields, adds the drone to the mock
   * database with a generated MongoDB ObjectId, and then attempts to register the
   * drone on the blockchain via a POST request to the configured endpoint.
   *
   * @param drone - The drone input data containing model, operatorId, authorizedZones, and authorizedPeriods
   * @returns A promise that resolves to an object containing the operation status, success message, and generated drone ID
   *
   * @throws {Error} When required drone fields are missing or invalid
   * @throws {Error} When the blockchain registration request fails
   *
   * @example
   * ```typescript
   * const droneInput = {
   *   model: "DJI Mavic Pro",
   *   operatorId: "operator123",
   *   authorizedZones: ["zone1", "zone2"],
   *   authorizedPeriods: {
   *      days: ["Mon", "Tue", "Wed"],
   *      from: new Date("2023-10-01T09:00:00"),
   *      to: new Date("2023-10-01T17:00:00"),
   *        }
   * };
   *
   * const result = await addMockDrone(droneInput);
   * console.log(result.droneId); // Generated drone ID
   * ```
   */
  async addMockDrone(drone: DroneInput) {
    this.logger.log(`Adding mock drone: ${drone.model} for operator: ${drone.operatorId}`);
    
    if (
      !drone.model ||
      !drone.operatorId ||
      !drone.authorizedZones ||
      !drone.authorizedPeriods
    ) {
      this.logger.error(`Invalid drone data: missing required fields`);
      throw new Error('Invalid drone data');
    }
    
    const droneId = new mongoose.Types.ObjectId().toString();
    
    // Adding the drone to the mock database
    database.drones.push({
      _id: droneId,
      model: drone.model,
      operatorId: drone.operatorId,
      authorizedZones: drone.authorizedZones,
      authorizedPeriods: drone.authorizedPeriods,
    });
    
    this.logger.debug(`Drone added to local database with ID: ${droneId}`);

    // Calling the backend service to add the drone on the blockchain
    try {
      this.logger.debug(`Registering drone on blockchain: ${ENDPOINT_URL}/drone`);
      await fetch(`${ENDPOINT_URL}/drone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(drone),
      });
      this.logger.log(`Drone successfully registered on blockchain with ID: ${droneId}`);
    } catch (error) {
      this.logger.error(`Error adding drone to blockchain: ${error.message}`, error.stack);
      throw new Error('Failed to add drone to blockchain');
    }

    const result = {
      status: 'success',
      message: 'Drone added successfully',
      droneId: droneId,
    };
    
    this.logger.log(`Mock drone creation completed successfully: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Add a mock operator to the local database and registers it on the blockchain.
   * This method validates the required operator input fields, adds the operator to the mock
   * database with a generated MongoDB ObjectId, and then attempts to register the
   * operator on the blockchain via a POST request to the configured endpoint.
   * @param operator - The operator input data containing name, contact_email, phone, address, country, and tax_ids
   * @returns A promise that resolves to an object containing the operation status, success message,
   * and generated operator ID
   * @throws {Error} When required operator fields are missing or invalid
   * @throws {Error} When the blockchain registration request fails
   */
  async addMockOperator(operator: OperatorInput) {
    this.logger.log(`Adding mock operator: ${operator.name} from ${operator.country}`);
    
    if (
      !operator.name ||
      !operator.contact_email ||
      !operator.country ||
      !operator.tax_ids
    ) {
      this.logger.error(`Invalid operator data: missing required fields`);
      throw new Error('Invalid operator data');
    }

    const operatorId = new mongoose.Types.ObjectId().toString();

    // Adding the operator to the mock database
    database.operators.push({
      _id: operatorId,
      name: operator.name,
      contact_email: operator.contact_email,
      phone: operator.phone,
      address: operator.address,
      country: operator.country,
      tax_ids: operator.tax_ids,
    });
    
    this.logger.debug(`Operator added to local database with ID: ${operatorId}`);

    // Calling the backend service to add the operator on the blockchain
    try {
      this.logger.debug(`Registering operator on blockchain: ${ENDPOINT_URL}/operator`);
      await fetch(`${ENDPOINT_URL}/operator`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(operator),
      });
      this.logger.log(`Operator successfully registered on blockchain with ID: ${operatorId}`);
    } catch (error) {
      this.logger.error(`Error adding operator to blockchain: ${error.message}`, error.stack);
      throw new Error('Failed to add operator to blockchain');
    }

    const result = {
      status: 'success',
      message: 'Operator added successfully',
      operatorId: operatorId,
    };
    
    this.logger.log(`Mock operator creation completed successfully: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Retrieves all mock drone data from the database.
   *
   * @returns {Array} An array of mock drone objects from the database
   */
  getMockDrones() {
    this.logger.debug(`Retrieving ${database.drones.length} mock drones from database`);
    return database.drones;
  }

  /**
   * Retrieves all mock operators data from the database.
   * 
   * @returns {Array} An array of mock operators objects from the database
   */
  getMockOperators() {
    this.logger.debug(`Retrieving ${database.operators.length} mock operators from database`);
    return database.operators;
  }
}
