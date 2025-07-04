import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import {
  PreAuthorizationRequest,
  LocationUpdateRequest,
  PreAuthorizationStatus,
  FlightPlan,
} from './types/dto';
import { CountryCode, TaxIdType, ZoneType } from './types/enums';
import { Location, Position, Route } from './types/route';
import { Drone, DroneInput, DroneStatus, DroneType } from './types/drone';
import * as mongoose from 'mongoose';
import * as turf from '@turf/turf';
import { Zone } from './types/zone';
import { Operator, OperatorInput } from './types/operator';
import { finished } from 'stream';
import { start } from 'repl';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private database = {
    drones: [] as Drone[],
    flightPlans: [] as Route[],
    locations: [] as Location[],
    operators: [] as { address: string }[],
  };
  constructor(private readonly configService: ConfigService) {}
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
        this.logger.error(
          `Invalid pre-authorization request: missing droneId or flightPlan`,
        );
        throw new Error(
          'Invalid request: droneId and flightPlan are required.',
        );
      }

      this.logger.debug(
        `Getting route characteristics for drone: ${request.droneId}`,
      );
      // Calling /get_route_characteristics
      const routeCharacteristics = await this.getRouteCharacteristics(request);
      if (!routeCharacteristics) {
        this.logger.error(
          `Route characteristics not found for drone: ${request.droneId}`,
        );
        throw new Error('Route characteristics not found.');
      }

      routeCharacteristics.zones =
        routeCharacteristics.zones.length > 0
          ? routeCharacteristics.zones
          : [ZoneType.RESTRICTED];

      this.logger.debug(
        `Route characteristics found: ${JSON.stringify(routeCharacteristics)}`,
      );

      const ENDPOINT_URL = this.configService.get<string>('ENDPOINT_URL');
      // Calling ENDPOINT_URL API for preauthorization
      this.logger.log(
        `Calling external API for pre-authorization: ${ENDPOINT_URL}/api/route-permissions/check`,
      );
      const response = await fetch(
        `${ENDPOINT_URL}/api/route-permissions/check`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(routeCharacteristics),
        },
      );

      let data = await response.json();
      data = data.data;
      this.logger.log(
        `Pre-authorization successful for drone: ${request.droneId}, status: ${data.preauthorizationStatus}`,
      );
      return data;
    } catch (error) {
      this.logger.error(
        `Error in preAuthorization for drone ${request.droneId}: ${error.message}`,
        error.stack,
      );
      return {
        droneId: request.droneId,
        preauthorization_status: 'FAILED',
        reason: error.message || 'Unknown error',
      };
    }
  }

  async getZonesLimits() {
    this.logger.debug('Retrieving zone limits');
    const ENDPOINT_URL = this.configService.get<string>('ENDPOINT_URL');
    // Fetching zone limits from the API /api/zones
    let response: any = await fetch(`${ENDPOINT_URL}/api/zones`);
    if (!response.ok) {
      this.logger.error(
        `Failed to retrieve zone limits: ${response.statusText}`,
      );
      throw new Error('Failed to retrieve zone limits');
    }
    response = await response.json();
    const zonesLimits: Zone[] = response.data;
    this.logger.log(
      `Zone limits retrieved successfully: ${JSON.stringify(zonesLimits)}`,
    );
    return zonesLimits;
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
  async getRouteCharacteristics(request: PreAuthorizationRequest) {
    this.logger.debug(
      `Analyzing route characteristics for drone: ${request.droneId}`,
    );

    const routeCharacteristics: {
      droneId: string;
      zones: ZoneType[];
      altitudeLimit: number;
    } = {
      droneId: request.droneId,
      zones: [],
      altitudeLimit: 0,
    };

    // Get the zones limits
    const zonesLimits: Zone[] = await this.getZonesLimits();

    this.logger.debug(
      `Retrieving altitude limit and zones for flight plan of drone: ${request.droneId}`,
    );
    // Setting the altitude limit to the maximum altitude on the flight plan
    if (request.flightPlan && request.flightPlan.route.length > 0) {
      routeCharacteristics.altitudeLimit = Math.max(
        ...request.flightPlan.route.map((point) => point.alt),
      );
      this.logger.debug(
        `Calculated altitude limit: ${routeCharacteristics.altitudeLimit}`,
      );
    }

    // Setting the zones based on the flight plan
    if (request.flightPlan && request.flightPlan.route.length > 0) {
      this.logger.debug(
        `Analyzing ${request.flightPlan.route.length} route points`,
      );

      request.flightPlan.route.forEach((point, index) => {
        this.logger.verbose(
          `Processing route point ${index}: lat=${point.lat}, lon=${point.lon}, alt=${point.alt}`,
        );

        // Object.keys(zonesLimits).forEach((zoneKey) => {
        //   const zone = zonesLimits[zoneKey];
        //   if (
        //     point.lat >= zone.yMin &&
        //     point.lat <= zone.yMax &&
        //     point.lon >= zone.xMin &&
        //     point.lon <= zone.xMax &&
        //     point.alt >= zone.altitudeMin &&
        //     point.alt <= zone.altitudeMax
        //   ) {
        //     if (!routeCharacteristics.zones.includes(zoneKey)) {
        //       this.logger.debug(`Route passes through zone: ${zoneKey}`);
        //       routeCharacteristics.zones.push(zoneKey);
        //     }
        //   }
        // });

        this.logger.log(
          `Checking zones for route point ${index + 1}/${request.flightPlan.route.length}`,
        );
        // use turf to check if the point is within the zone boundaries as a list of coordinates latitude and longitude
        zonesLimits.forEach((zone) => {
          if (!zone.isActive) {
            this.logger.debug(
              `Skipping inactive zone: ${zone.name} (${zone.zoneType})`,
            );
            return;
          }
          // optimization to avoid checking zones that are already included
          if (
            routeCharacteristics.zones.includes(
              ZoneType[zone.zoneType.toString()],
            )
          ) {
            this.logger.debug(
              `Zone ${zone.name} already included in route characteristics`,
            );
            return;
          }
          zone.boundaries.push(
            zone.boundaries[0], // Ensure the polygon is closed
          );
          const zonePolygon = turf.polygon([
            zone.boundaries.map((coord) => [coord.longitude, coord.latitude]),
          ]);
          const turfPoint = turf.point([point.lon, point.lat]);
          if (turf.booleanPointInPolygon(turfPoint, zonePolygon)) {
            if (
              !routeCharacteristics.zones.includes(
                ZoneType[zone.zoneType.toString()],
              )
            ) {
              this.logger.debug(`Route passes through zone: ${zone.name}`);
              routeCharacteristics.zones.push(
                ZoneType[zone.zoneType.toString()],
              );
            }
          }
        });
      });
    }

    this.logger.log(
      `Route analysis complete. Zones: [${routeCharacteristics.zones.join(', ')}], Altitude limit: ${routeCharacteristics.altitudeLimit}`,
    );
    return {
      ...routeCharacteristics,
      altitudeLimit: Math.floor(routeCharacteristics.altitudeLimit),
    };
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
      this.logger.error(
        `Invalid location update request: missing required fields`,
      );
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

    this.database.locations.push(locationData);
    this.logger.debug(
      `Location data stored locally for drone: ${request.droneId}, position: lat=${locationData.position.lat}, lon=${locationData.position.lon}, alt=${locationData.position.alt}`,
    );

    try {
      const ENDPOINT_URL = this.configService.get<string>('ENDPOINT_URL');
      // Sending telemetry data to the backend service
      this.logger.debug(
        `Sending location update to backend: ${ENDPOINT_URL}/location_update`,
      );
      await fetch(`${ENDPOINT_URL}/location_update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(locationData),
      });
      this.logger.log(
        `Location update sent to backend successfully for drone: ${request.droneId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error sending location update to backend for drone ${request.droneId}: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Failed to send location update to backend: ${error.message}`,
      );
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
    this.logger.log(
      `Adding mock drone: ${drone.model} for operator: ${drone.operatorId}`,
    );

    if (
      !drone.model ||
      drone.droneType == undefined ||
      !drone.permittedZones ||
      !drone.operatorId
    ) {
      this.logger.error(`Invalid drone data: missing required fields`);
      throw new Error('Invalid drone data');
    }

    // Validate certHashes
    if (
      !Array.isArray(drone.certHashes) ||
      drone.certHashes.length === 0 ||
      !drone.certHashes.every((x) => typeof x === 'string')
    ) {
      this.logger.error(
        `Invalid certHashes: must be a non-empty array of strings. Got: ${JSON.stringify(drone.certHashes)}`,
      );
      throw new Error('certHashes must be a non-empty array of strings');
    }
    this.logger.debug(
      'certHashes payload: ' + JSON.stringify(drone.certHashes),
    );

    const ENDPOINT_URL = this.configService.get<string>('ENDPOINT_URL');
    // Calling the backend service to add the drone on the blockchain
    try {
      const url = `${ENDPOINT_URL}/api/drones/mint`;
      this.logger.debug(`Registering drone on blockchain: ${url}`);
      // Add the drone to the blockchain calling the backend service
      let response: any = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: drone.model,
          droneType: drone.droneType,
          permittedZones: drone.permittedZones,
          ownerHistory: [drone.operatorId],
          serialNumber: drone.serialNumber,
          certHashes: drone.certHashes,
          maintenanceHash: drone.maintenanceHash,
          status: drone.status || DroneStatus.ACTIVE, // Default to ACTIVE if not provided
        }),
      });

      if (!response.ok) {
        this.logger.error(
          `Failed to add drone to blockchain: ${response.statusText}`,
        );
        throw new Error('Failed to add drone to blockchain');
      }
      response = await response.json();
      response = response.data;
      this.logger.log(
        `Drone added to blockchain successfully: ${JSON.stringify(response)}`,
      );
      const droneId = response._id;

      this.logger.debug(`Drone added to local database with ID: ${droneId}`);

      // Adding the drone to the mock database
      this.database.drones.push({
        _id: response.tokenId,
        serialNumber: drone.serialNumber,
        model: drone.model,
        droneType: drone.droneType,
        certHashes: drone.certHashes,
        permittedZones: drone.permittedZones,
        ownerHistory: [drone.operatorId],
        maintenanceHash: response.maintenanceHash,
        status: drone.status || DroneStatus.ACTIVE, // Default to ACTIVE if not provided
      });
    } catch (error) {
      this.logger.error(
        `Error adding drone to blockchain: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to add drone to blockchain');
    }

    const result = {
      status: 'success',
      message: 'Drone added successfully',
      droneId: this.database.drones[this.database.drones.length - 1]._id,
    };

    this.logger.log(
      `Mock drone creation completed successfully: ${JSON.stringify(result)}`,
    );
    return result;
  }

  /**
   * Authorize a flight plan for a drone operator.
   * This method add the flight Plan to the mock database and registers it on the blockchain.
   * @param flightPlan - The flight plan input data containing drone_id, path, and zones
   * @returns A promise that resolves to an object containing the operation status, success message,
   * and generated flight plan ID
   * @throws {Error} When the blockchain registration request fails
   */
  async authorizeFlightPlan(flightPlan: {
    droneId: string;
    flightPlan: {
      route: Position[];
      start_time: Date;
      end_time: Date;
    };
    zones: ZoneType[];
  }) {
    // Calling the backend service to authorize the flight plan on the blockchain
    try {
      const ENDPOINT_URL = this.configService.get<string>('ENDPOINT_URL');
      this.logger.debug(
        `Authorizing flight plan on blockchain: ${ENDPOINT_URL}/flight-plans/authorize`,
      );
      // const response = await fetch(`${ENDPOINT_URL}/flight-plans/authorize`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify(flightPlan),
      // });

      // if (!response.ok) {
      //   this.logger.error(
      //     `Failed to authorize flight plan on blockchain: ${response.statusText}`,
      //   );
      //   throw new Error('Failed to authorize flight plan on blockchain');
      // }

      // const result = await response.json();
      // this.logger.log(
      //   `Flight plan authorized successfully: ${JSON.stringify(result)}`,
      // );
      this.database.flightPlans.push({
        _id: new mongoose.Types.ObjectId().toString(),
        droneId: flightPlan.droneId,
        path: flightPlan.flightPlan.route.map((point) => ({
          lat: point.lat,
          lon: point.lon,
          altitude: point.alt,
          finished: false, // Assuming points are not finished upon creation
        })),
        end_time: flightPlan.flightPlan.end_time,
        start_time: flightPlan.flightPlan.start_time,
        finished: false, // Assuming flight plans are not finished upon creation
        zones: flightPlan.zones,
      });
      return this.database.flightPlans[this.database.flightPlans.length - 1];
    } catch (error) {
      this.logger.error(
        `Error authorizing flight plan on blockchain: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to authorize flight plan on blockchain');
    }
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
  async addMockOperator() {
    const ENDPOINT_URL = this.configService.get<string>('ENDPOINT_URL');
    const operatorAddr = this.configService.get<string>('OPERATOR_ADDRESS');
    const operator = this.configService.get<string>('OPERATOR');

    this.logger.debug(
      `Operator added to local database with ID: ${operatorAddr}`,
    );

    // check if the operator is already registered
    try {
      // call the backend service to check if the operator is already registered /api/operators/info
      this.logger.debug(
        `Checking existing operator in mock database: ${ENDPOINT_URL}/api/operators/info/${operatorAddr}`,
      );
      const response = await fetch(
        `${ENDPOINT_URL}/api/operators/info/${operatorAddr}`,
      );
      if (!response.ok) {
        this.logger.error(
          `Failed to check existing operator: ${response.statusText}`,
        );
        throw new Error('Failed to check existing operator');
      }
      const existingOperator = await response.json();
      if (existingOperator.data?.registered) {
        if (this.database.operators.length === 0) {
          this.database.operators.push({
            address: operatorAddr || '',
          });
        }
        this.logger.warn(
          `Operator already exists in mock database: ${operator}, existing operator: ${JSON.stringify(existingOperator.data)}`,
        );
        // check the operator reputation
        try {
          this.logger.debug(
            `Checking operator reputation in mock database: ${ENDPOINT_URL}/api/operators/reputation/${operatorAddr}`,
          );
          const reputationResponse = await fetch(
            `${ENDPOINT_URL}/api/operators/reputation/${operatorAddr}`,
          );
          if (!reputationResponse.ok) {
            this.logger.error(
              `Failed to check operator reputation: ${reputationResponse.statusText}`,
            );
            throw new Error('Failed to check operator reputation');
          }
          const reputationData = await reputationResponse.json();
          this.logger.log(
            `Operator reputation retrieved successfully: ${JSON.stringify(reputationData)}`,
          );
        } catch (error) {
          this.logger.error(
            `Error checking operator reputation in mock database: ${error.message}`,
            error.stack,
          );
          throw new Error('Failed to check operator reputation');
        }
        return {
          status: 'warning',
          message: 'Operator already exists',
          operator: existingOperator.data,
        };
      }
    } catch (error) {
      this.logger.error(
        `Error checking existing operator in mock database: ${error.message}`,
        error.stack,
      );
    }
    // Calling the backend service to add the operator on the blockchain
    try {
      this.logger.debug(
        `Registering operator on blockchain: ${ENDPOINT_URL}/api/operators/register`,
      );
      const response = await fetch(`${ENDPOINT_URL}/api/operators/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operator: operator,
        }),
      });
      if (!response.ok) {
        this.logger.error(
          `Failed to register operator on blockchain: ${response.statusText}`,
        );
        throw new Error('Failed to register operator on blockchain');
      }
      this.logger.log(
        `Operator successfully registered on blockchain with ID: ${operator}`,
      );
      // Adding the operator to the mock database
      this.database.operators.push({
        address: operatorAddr || '',
      });
    } catch (error) {
      this.logger.error(
        `Error adding operator to blockchain: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to add operator to blockchain');
    }

    const result = {
      status: 'success',
      message: 'Operator added successfully',
      operator: operator,
    };

    this.logger.log(
      `Mock operator creation completed successfully: ${JSON.stringify(result)}`,
    );
    return result;
  }

  /**
   * Retrieves all mock drone data from the database.
   *
   * @returns {Array} An array of mock drone objects from the database
   */
  getMockDrones() {
    this.logger.debug(
      `Retrieving ${this.database.drones.length} mock drones from database`,
    );
    return this.database.drones;
  }

  /**
   * Retrieves all mock operators data from the database.
   *
   * @returns {Array} An array of mock operators objects from the database
   */
  getMockOperators() {
    this.logger.debug(
      `Retrieving ${this.database.operators.length} mock operators from database`,
    );
    return this.database.operators;
  }

  /**
   * Send a violation to the backend service.
   */
  async sendViolation(locationUpdate: LocationUpdateRequest) {
    const ENDPOINT_URL = this.configService.get<string>('ENDPOINT_URL');
    try {
      const response = await fetch(`${ENDPOINT_URL}/api/violations/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          droneID: locationUpdate.droneId.toString(),
          position: `lat:${locationUpdate.position.lat},lng:${locationUpdate.position.lon}`,
        }),
      });

      if (!response.ok) {
        this.logger.error(
          `Failed to send violation to backend: ${response.statusText}`,
        );
        throw new Error('Failed to send violation to backend');
      }

      this.logger.log(
        `Violation sent successfully: ${JSON.stringify(locationUpdate)}`,
      );
    } catch (error) {
      this.logger.error(
        `Error sending violation to backend: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to send violation to backend');
    }
  }

  /**
   * Send the complete flight plan to the backend service.
   */
  async completeFlightPlan(flightPlan: Route) {
    const ENDPOINT_URL = this.configService.get<string>('ENDPOINT_URL');
    const ADMIN_ADDRESS = this.configService.get<string>('ADMIN_ADDRESS');
    try {
      const response = await fetch(`${ENDPOINT_URL}/api/route-logs/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          droneId: parseInt(flightPlan.droneId),
          utmAuthorizer: ADMIN_ADDRESS,
          zones: flightPlan.zones,
          startPoint: {
            latitude: flightPlan.path[0].lat,
            longitude: flightPlan.path[0].lon,
          },
          endPoint: {
            latitude: flightPlan.path[flightPlan.path.length - 1].lat,
            longitude: flightPlan.path[flightPlan.path.length - 1].lon,
          },
          route: flightPlan.path.map((point) => ({
            latitude: point.lat,
            longitude: point.lon,
          })),
          startTime: Math.floor(flightPlan.start_time.getTime() / 1000), // Convert to unix timestamp
          endTime: Math.floor(flightPlan.end_time.getTime() / 1000), // Convert to unix timestamp
          status: 0, // Assuming 0 means completed
        }),
      });

      if (!response.ok) {
        this.logger.error(
          `Failed to complete flight plan on backend: ${response.statusText}`,
        );
        throw new Error('Failed to complete flight plan on backend');
      }

      this.logger.log(`Flight plan completed successfully`);
    } catch (error) {
      this.logger.error(
        `Error completing flight plan on backend: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to complete flight plan on backend');
    }
  }

  /**
   * Generates a mock flight plan based on the drone's permitted zones.
   * The flight plan consists of a series of route points that are either valid (within permitted zones)
   * or invalid (crossing a non-permitted zone).
   * The number of points should be between 30 and 50, with valid points in the case of a valid flight plan and a mix of valid and invalid points for an invalid flight plan.
   * @param {ZoneType[]} options.permittedZones - Array of permitted zones for the drone
   * @param {boolean} options.valid - Whether the flight plan should be valid (true) or invalid (false)
   * @returns {Position[]} The generated mock flight plan
   */
  async generateMockFlightPlan({
    permittedZones,
    valid,
  }: {
    permittedZones: ZoneType[];
    valid: boolean;
  }): Promise<Position[]> {
    const numPoints = Math.floor(Math.random() * (50 - 30 + 1)) + 30;
    const flightPlan: Position[] = [];

    const zonesLimits: Zone[] = await this.getZonesLimits();
    for (let i = 0; i < numPoints; i++) {
      let point: Position;
      if (i === 0) {
        // First point: pick a random permitted zone and generate a point inside it.
        const targetZone = zonesLimits.find((z) =>
          !valid
            ? permittedZones.includes(ZoneType.RESTRICTED) && z.isActive
            : permittedZones.includes(ZoneType[`${z.zoneType.toString()}`]) &&
              z.isActive,
        );

        if (!targetZone) {
          this.logger.warn(
            `No active zone found for type: ${permittedZones}. Generating a random point.`,
          );
          // Fallback to a completely random point if no suitable zone is found
          point = {
            lat: Math.random() * 0.1 + 40.7, // Example coordinates
            lon: Math.random() * 0.1 - 74.0,
            alt: Math.random() * 50 + 100,
          };
        } else {
          this.logger.debug(
            `Generating first point in zone: ${targetZone.name} (${targetZone.zoneType})`,
          );
          targetZone.boundaries.push(
            targetZone.boundaries[0], // Ensure the polygon is closed
          );
          // Create a Turf polygon from the zone boundaries
          const zonePolygon = turf.polygon([
            targetZone.boundaries.map((coord) => [
              coord.longitude,
              coord.latitude,
            ]),
          ]);
          const bbox = turf.bbox(zonePolygon);
          // Generate a random point within the zone's bounding box
          let randomPointFeatures;
          do {
            randomPointFeatures = turf.randomPoint(1, { bbox });
          } while (
            !turf.booleanPointInPolygon(
              randomPointFeatures.features[0],
              zonePolygon,
            )
          );
          const [lon, lat] =
            randomPointFeatures.features[0].geometry.coordinates;
          point = {
            lat,
            lon,
            alt:
              Math.random() *
                (targetZone.maxAltitude - targetZone.minAltitude) +
              targetZone.minAltitude,
          };
        }
        flightPlan.push(point);
      } else {
        // Subsequent points: generate a point near the previous one.
        const prevPoint = flightPlan[i - 1];
        this.logger.debug(
          `Generating point ${i + 1} based on previous point: lat=${prevPoint.lat}, lon=${prevPoint.lon}, alt=${prevPoint.alt}`,
        );
        const bearing = Math.random() * 360; // Random direction
        const distance = Math.random() * 0.01; // Small distance in degrees (about 1 km)
        const nextTurfPoint = turf.destination(
          [prevPoint.lon, prevPoint.lat],
          distance,
          bearing,
        );
        const [lon, lat] = nextTurfPoint.geometry.coordinates;

        // For invalid plans, occasionally create a point with a high altitude to go outside zone limits
        const alt =
          !valid && i > numPoints / 2 && i < numPoints / 1.5
            ? prevPoint.alt + 200 // Invalid altitude
            : prevPoint.alt + (Math.random() - 0.5) * 10; // Small altitude change

        point = { lat, lon, alt };
        flightPlan.push(point);
      }
    }

    return flightPlan;
  }

  /**
   * Cron job to simulate flight plans and send them to the backend service.
   * 1. Add a new operator to the mock database.
   * 2. Add a new drone to the mock database.
   * 3. Simulate 3 preauthorization requests generating two flights routes based on the drone's permitted zones and one which crossed a not permitted zone.
   * 4. if the preauthorization request is successful, authorize and add the flight plan to the mock database and the blockchain.
   *
   * @returns {Array} An array of flight plan objects from the database
   */
  @Cron('30 * * * * *') // Every minute at the 10th second
  async simulateFlightPlansAuthorization() {
    this.logger.debug('Simulating flight plans...');

    let response: any;

    // Step 1: Add a new operator
    if (this.database.operators.length === 0) {
      const operatorInput: OperatorInput = {
        name: 'Mock Operator',
        contact_email: 'mock.operator@example.com',
        country: CountryCode.US,
        tax_ids: [
          {
            type: TaxIdType.OTHER,
            value: '12-3456789',
          },
        ],
      };
      response = await this.addMockOperator();
    }

    // Step 2: Add a new drone
    if (this.database.drones.length === 0) {
      const droneInput: DroneInput = {
        certHashes: ['cert-hash-1', 'cert-hash-2'],
        droneType: DroneType.MEDICAL,
        model: 'Mock Drone Model',
        permittedZones: [ZoneType.URBAN, ZoneType.RURAL],
        operatorId:
          this.database.operators[this.database.operators.length - 1].address,
        serialNumber: `MOCK-DRONE-001-${Date.now()}`,
        maintenanceHash: 'maintenance-hash-1',
        status: DroneStatus.ACTIVE,
      };
      response = await this.addMockDrone(droneInput);
    }
    if (this.database.drones.length === 1) {
      // add a second drone to simulate multiple flight plans
      const droneInput: DroneInput = {
        certHashes: ['cert-hash-3'],
        droneType: DroneType.AGRICULTURAL,
        model: 'Mock Drone Model 2',
        permittedZones: [ZoneType.URBAN, ZoneType.RURAL],
        operatorId:
          this.database.operators[this.database.operators.length - 1].address,
        serialNumber: `MOCK-DRONE-002-${Date.now()}`,
        maintenanceHash: 'maintenance-hash-2',
        status: DroneStatus.ACTIVE,
      };
      response = await this.addMockDrone(droneInput);
    }
    if (this.database.drones.length === 2) {
      // add a third drone to simulate multiple flight plans
      const droneInput: DroneInput = {
        certHashes: ['cert-hash-4'],
        droneType: DroneType.MEDICAL,
        model: 'Mock Drone Model 3',
        permittedZones: [ZoneType.URBAN, ZoneType.RURAL],
        operatorId:
          this.database.operators[this.database.operators.length - 1].address,
        serialNumber: `MOCK-DRONE-003-${Date.now()}`,
        maintenanceHash: 'maintenance-hash-3',
        status: DroneStatus.ACTIVE,
      };
      response = await this.addMockDrone(droneInput);
    }
    // Step 3: Simulate preauthorization requests
    for (let i = 0; i < 3; i++) {
      this.logger.debug(`Simulating pre-authorization request ${i + 1}...`);
      // Generate a mock flight plan for a drone chosen randomly from the database considering that drones are from the 0 to 2 index
      const droneIndex = Math.floor(
        Math.random() * this.database.drones.length,
      );
      this.logger.debug(
        `Generating mock flight plan for drone: ${this.database.drones[droneIndex]._id}, valid: ${i < 2}, permitted zones: ${JSON.stringify(
          this.database.drones[droneIndex].permittedZones,
        )}`,
      );

      // Create a flight plan object with the drone's last added ID and a generated route
      const route = await this.generateMockFlightPlan({
        permittedZones: this.database.drones[droneIndex].permittedZones,
        valid: i < 2,
      });

      const routeCharacteristics = await this.getRouteCharacteristics({
        droneId: this.database.drones[droneIndex]._id,
        flightPlan: {
          route: route,
          start_time: new Date(),
          end_time: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
        },
      });

      const flightPlan: {
        droneId: string;
        flightPlan: {
          route: Position[];
          start_time: Date;
          end_time: Date;
        };
        zones: ZoneType[];
      } = {
        droneId: this.database.drones[this.database.drones.length - 1]._id,
        flightPlan: {
          route: route,
          end_time: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
          start_time: new Date(),
        },
        zones:
          routeCharacteristics.zones.length > 0
            ? routeCharacteristics.zones
            : [ZoneType.RESTRICTED],
      };
      response = await this.preAuthorization(flightPlan);
      this.logger.debug(response);
      if (response.preauthorizationStatus === PreAuthorizationStatus.APPROVED) {
        this.logger.log(
          `Flight plan ${i + 1} pre-authorized successfully: ${JSON.stringify(response)}`,
        );
        // Step 4: Authorize and add flight plans to the database
        // Authorize and add flight plan to the database
        await this.authorizeFlightPlan(flightPlan);
      } else {
        this.logger.warn(
          `Flight plan ${i + 1} pre-authorization failed: ${response.reason}`,
        );
      }
    }
    this.logger.debug(
      `Flight plan simulation completed. Total flight plans: ${this.database.flightPlans.length}`,
    );

    return this.database.flightPlans;
  }

  /**
   * Call each 1 minute 40 times the /location_update endpoint
   * to simulate drone telemetry data for the authorized flight plans. Considering
   * the flight plan's route and the drone's current location. Send each 30 location_update 5 violations sending locations that are not in the flight plan's route.
   * Each location_update should be sent every 1 second.
   * @returns {Promise<void>}
   */
  @Cron('*/1 * * * *') // Every minute
  async simulateDroneTelemetry() {
    this.logger.debug('Simulating drone telemetry data...');

    // flightPlans not finished
    const flightPlans = this.database.flightPlans.filter(
      (plan) => !plan.finished,
    );

    if (flightPlans.length === 0) {
      this.logger.warn('No flight plans available for telemetry simulation');
      return;
    }
    for (
      let calculatedIndex = 0;
      calculatedIndex < flightPlans.length;
      calculatedIndex++
    ) {
      const flightPlan = flightPlans[calculatedIndex];
      if (!flightPlan || !flightPlan.path || flightPlan.path.length === 0) {
        this.logger.warn(
          `Flight plan ${flightPlan._id} has no valid path or is already finished`,
        );
        continue;
      }
      for (let i = 0; i < 40; i++) {
        await new Promise((resolve) => setTimeout(resolve, i * 500));
        const drone = this.database.drones.find(
          (d) => d._id === flightPlan.droneId,
        );
        if (!drone) {
          this.logger.warn('No drones available for telemetry simulation');
          return;
        }

        // Simulate a location update based on the flight plan's route
        const routePoint = flightPlan.path.findIndex(
          (point) => !point.finished,
        );
        if (routePoint === -1) {
          this.logger.debug('All route points have been reached');
          // set the flightPlan.finished to true
          flightPlan.finished = true;

          // send all the flight plan as completed
          await this.completeFlightPlan(flightPlan);
          this.logger.debug(`Flight plan ${flightPlan._id} has been completed`);
          return;
        }
        let locationUpdate: LocationUpdateRequest;
        if (i % 30 === 0) {
          const violationPoint = {
            lat: flightPlan.path[routePoint].lat + 0.1,
            lon: flightPlan.path[routePoint].lon + 0.1,
            alt: flightPlan.path[routePoint].altitude + 100,
          };
          this.logger.warn(
            `Sending violation location update for drone ${drone.serialNumber}: ${JSON.stringify(
              violationPoint,
            )}`,
          );
          locationUpdate = {
            droneId: drone._id,
            timestamp: new Date(),
            position: {
              lat: violationPoint.lat,
              lon: violationPoint.lon,
              alt: violationPoint.alt,
            },
          };
          await this.sendViolation(locationUpdate);
        }

        // set the first route point as finished
        flightPlan.path[routePoint].finished = true;
        this.logger.debug(
          `Route point ${routePoint} marked as finished for flight plan ${flightPlan._id}`,
        );
      }
    }

    this.logger.debug('Drone telemetry simulation completed.');
  }
}
