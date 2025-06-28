import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import { CountryCode, Day, TaxIdType, ZoneType } from './types/enums';
import { LocationUpdateRequest, PreAuthorizationRequest } from './types/dto';
import { Zone } from './types/zone';
import { Position, RoutePoint } from './types/route';
import { DroneInput } from './types/drone';
import { OperatorInput } from './types/operator';

// Mock fetch globally
global.fetch = jest.fn();

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get<AppService>(AppService);
    jest.clearAllMocks();
  });

  describe('preAuthorization', () => {
    it('should return error for missing droneId', async () => {
      const request = {
        flightPlan: { route: [{ lat: 40.75, lon: -74.05, alt: 160 }] },
      } as any;

      const result = await service.preAuthorization(request);

      expect(result).toEqual({
        droneId: undefined,
        preauthorization_status: 'FAILED',
        reason: 'Invalid request: droneId and flightPlan are required.',
      });
    });

    it('should return error for missing flightPlan', async () => {
      const request = {
        droneId: 'drone123',
      } as any;

      const result = await service.preAuthorization(request);

      expect(result).toEqual({
        droneId: 'drone123',
        preauthorization_status: 'FAILED',
        reason: 'Invalid request: droneId and flightPlan are required.',
      });
    });

    it('should call external API and return response on success', async () => {
      const mockResponse = { preauthorization_status: 'APPROVED' };
      (fetch as jest.Mock).mockResolvedValueOnce({
        json: jest.fn().mockResolvedValueOnce(mockResponse),
      });

      const request: PreAuthorizationRequest = {
        droneId: 'drone123',
        flightPlan: {
          route: [{ lat: 40.75, lon: -74.05, alt: 160 }],
          start_time: new Date(),
          end_time: new Date(),
        },
      };

      const result = await service.preAuthorization(request);

      expect(fetch).toHaveBeenCalledWith(
        `${process.env.ENDPOINT_URL}/preauthorization`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        },
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle API fetch error', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const request: PreAuthorizationRequest = {
        droneId: 'drone123',
        flightPlan: {
          route: [{ lat: 40.75, lon: -74.05, alt: 160 }],
          start_time: new Date(),
          end_time: new Date(new Date().getTime() + 3600000), // 1 hour later
        },
      };

      const result = await service.preAuthorization(request);

      expect(result).toEqual({
        droneId: 'drone123',
        preauthorization_status: 'FAILED',
        reason: 'Network error',
      });
    });
  });

  describe('getRouteCharacteristics', () => {
    it('should return empty characteristics for empty route', () => {
      const request: PreAuthorizationRequest = {
        droneId: 'drone123',
        flightPlan: { route: [], start_time: new Date(), end_time: new Date() },
      };

      const result = service.getRouteCharacteristics(request);

      expect(result).toEqual({
        zones: [],
        altitudeLimit: 0,
        weatherStatus: ' ',
        temporaryRestrictions: [],
      });
    });

    it('should identify URBAN zone correctly', () => {
      const urbanZone: Zone = service.getZonesLimits()['urban'];
      // setting coordinates and altitude in the urbanZone
      const coordinates: Position = {
        lon: (urbanZone.xMin + urbanZone.xMax) / 2,
        lat: (urbanZone.yMin + urbanZone.yMax) / 2,
        alt: (urbanZone.altitudeMin + urbanZone.altitudeMax) / 2,
      };
      const request: PreAuthorizationRequest = {
        droneId: 'drone123',
        flightPlan: {
          route: [{ ...coordinates }],
          start_time: new Date(),
          end_time: new Date(new Date().getTime() + 3600000), // 1 hour later
        },
      };

      const result = service.getRouteCharacteristics(request);

      expect(result.zones).toContain(ZoneType.URBAN);
      expect(result.altitudeLimit).toBe(coordinates.alt);
    });

    it('should identify HOSPITALS zone correctly', () => {
      const hospitalZone: Zone = service.getZonesLimits()['hospitals'];
      // setting coordinates and altitude in the urbanZone
      const coordinates: Position = {
        lon: (hospitalZone.xMax + hospitalZone.xMin) / 2,
        lat: (hospitalZone.yMax + hospitalZone.yMin) / 2,
        alt: (hospitalZone.altitudeMax + hospitalZone.altitudeMin) / 2,
      };
      const request: PreAuthorizationRequest = {
        droneId: 'drone123',
        flightPlan: {
          route: [{ ...coordinates }],
          start_time: new Date(),
          end_time: new Date(new Date().getTime() + 3600000), // 1 hour later
        },
      };

      const result = service.getRouteCharacteristics(request);

      expect(result.zones).toContain(ZoneType.HOSPITALS);
      expect(result.altitudeLimit).toBe(coordinates.alt);
    });

    it('should identify multiple zones for route crossing boundaries', () => {
      const zones = service.getZonesLimits();
      // setting coordinates and altitude in the hospitalZone
      const hospitalCoordinates: Position = {
        lon: (zones.hospitals.xMax + zones.hospitals.xMin) / 2,
        lat: (zones.hospitals.yMax + zones.hospitals.yMin) / 2,
        alt: (zones.hospitals.altitudeMax + zones.hospitals.altitudeMin) / 2,
      };
      // setting coordinates and altitude in the urbanZone
      const urbanCoordinates: Position = {
        lon: (zones.urban.xMin + zones.urban.xMax) / 2,
        lat: (zones.urban.yMin + zones.urban.yMax) / 2,
        alt: (zones.urban.altitudeMin + zones.urban.altitudeMax) / 2,
      };
      const request: PreAuthorizationRequest = {
        droneId: 'drone123',
        flightPlan: {
          route: [
            { ...urbanCoordinates }, // URBAN
            { ...hospitalCoordinates }, // HOSPITALS
          ],
          start_time: new Date(),
          end_time: new Date(new Date().getTime() + 3600000), // 1 hour later
        },
      };

      const result = service.getRouteCharacteristics(request);

      expect(result.zones).toContain(ZoneType.URBAN);
      expect(result.zones).toContain(ZoneType.HOSPITALS);
      expect(result.altitudeLimit).toBe(
        Math.max(hospitalCoordinates.alt, urbanCoordinates.alt),
      );
    });

    it('should calculate correct altitude limit from multiple points', () => {
      const request: PreAuthorizationRequest = {
        droneId: 'drone123',
        flightPlan: {
          route: [
            { lat: 40.0, lon: -74.5, alt: 120 },
            { lat: 40.1, lon: -74.4, alt: 180 },
            { lat: 40.2, lon: -74.3, alt: 100 },
          ],
          start_time: new Date(),
          end_time: new Date(new Date().getTime() + 3600000), // 1 hour later
        },
      };

      const result = service.getRouteCharacteristics(request);

      expect(result.altitudeLimit).toBe(180);
    });
  });

  describe('locationUpdate', () => {
    it('should throw error for missing droneId', async () => {
      const request = {
        position: { lat: 40.75, lon: -74.05, alt: 160 },
        timestamp: '2023-10-01T10:00:00Z',
      } as any;

      await expect(service.locationUpdate(request)).rejects.toThrow(
        'Invalid request: droneId, position, and timestamp are required.',
      );
    });

    it('should throw error for missing position', async () => {
      const request = {
        droneId: 'drone123',
        timestamp: '2023-10-01T10:00:00Z',
      } as any;

      await expect(service.locationUpdate(request)).rejects.toThrow(
        'Invalid request: droneId, position, and timestamp are required.',
      );
    });

    it('should throw error for missing timestamp', async () => {
      const request = {
        droneId: 'drone123',
        position: { lat: 40.75, lon: -74.05, alt: 160 },
      } as any;

      await expect(service.locationUpdate(request)).rejects.toThrow(
        'Invalid request: droneId, position, and timestamp are required.',
      );
    });

    it('should store location data and call external API', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

      const request: LocationUpdateRequest = {
        droneId: 'drone123',
        position: { lat: 40.75, lon: -74.05, alt: 160 },
        timestamp: new Date('2023-10-01T10:00:00Z'),
      };

      await service.locationUpdate(request);

      expect(fetch).toHaveBeenCalledWith(
        `${process.env.ENDPOINT_URL}/location_update`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            droneId: 'drone123',
            timestamp: new Date('2023-10-01T10:00:00Z'),
            position: { lat: 40.75, lon: -74.05, alt: 160 },
          }),
        },
      );
    });

    it('should handle API error gracefully', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const request: LocationUpdateRequest = {
        droneId: 'drone123',
        position: { lat: 40.75, lon: -74.05, alt: 160 },
        timestamp: new Date('2023-10-01T10:00:00Z'),
      };

      await expect(service.locationUpdate(request)).rejects.toThrow();
    });
  });

  describe('addMockDrone', () => {
    it('should throw error for missing model', async () => {
      const drone = {
        operatorId: 'op123',
        authorizedZones: ['zone1'],
        authorizedPeriods: { days: ['Mon'], from: new Date(), to: new Date() },
      } as any;

      await expect(service.addMockDrone(drone)).rejects.toThrow(
        'Invalid drone data',
      );
    });

    it('should throw error for missing operatorId', async () => {
      const drone = {
        model: 'DJI Mavic',
        authorizedZones: ['zone1'],
        authorizedPeriods: { days: ['Mon'], from: new Date(), to: new Date() },
      } as any;

      await expect(service.addMockDrone(drone)).rejects.toThrow(
        'Invalid drone data',
      );
    });

    it('should throw error for missing authorizedZones', async () => {
      const drone = {
        model: 'DJI Mavic',
        operatorId: 'op123',
        authorizedPeriods: { days: ['Mon'], from: new Date(), to: new Date() },
      } as any;

      await expect(service.addMockDrone(drone)).rejects.toThrow(
        'Invalid drone data',
      );
    });

    it('should throw error for missing authorizedPeriods', async () => {
      const drone = {
        model: 'DJI Mavic',
        operatorId: 'op123',
        authorizedZones: ['zone1'],
      } as any;

      await expect(service.addMockDrone(drone)).rejects.toThrow(
        'Invalid drone data',
      );
    });

    it('should add drone successfully and call blockchain API', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

      const drone: DroneInput = {
        model: 'DJI Mavic Pro',
        operatorId: 'op123',
        authorizedZones: [ZoneType.HOSPITALS, ZoneType.RURAL],
        authorizedPeriods: [
          { days: [Day.Mon], from: new Date(), to: new Date() },
        ],
      };

      const result = await service.addMockDrone(drone);

      expect(result.status).toBe('success');
      expect(result.message).toBe('Drone added successfully');
      expect(result.droneId).toBeDefined();
      expect(fetch).toHaveBeenCalledWith(`${process.env.ENDPOINT_URL}/drone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(drone),
      });
    });

    it('should handle blockchain API error', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Blockchain error'));

      const drone: DroneInput = {
        model: 'DJI Mavic Pro',
        operatorId: 'op123',
        authorizedZones: [ZoneType.HOSPITALS, ZoneType.RURAL],
        authorizedPeriods: [
          { days: [Day.Mon], from: new Date(), to: new Date() },
        ],
      };

      await expect(service.addMockDrone(drone)).rejects.toThrow(
        'Failed to add drone to blockchain',
      );
    });
  });

  describe('getMockDrones', () => {
    it('should return drones after adding them', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

      const drone: DroneInput = {
        model: 'DJI Mavic Pro',
        operatorId: 'op123',
        authorizedZones: [ZoneType.URBAN, ZoneType.RURAL],
        authorizedPeriods: [
          { days: [Day.Mon], from: new Date(), to: new Date() },
        ],
      };

      await service.addMockDrone(drone);
      const result = service.getMockDrones();

      expect(result.length > 0);
      expect(result[result.length - 1].model).toBe(drone.model);
      expect(result[result.length - 1].operatorId).toBe(drone.operatorId);
      expect(result[result.length - 1].authorizedZones).toBe(
        drone.authorizedZones,
      );
    });
  });

  describe('addMockOperator', () => {
    it('should add operator successfully and call blockchain API', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

      const operator: OperatorInput = {
        name: 'Test Operator',
        contact_email: 'test@example.com',
        phone: '+1234567890',
        address: '123 Test St',
        country: CountryCode.US,
        tax_ids: [{ type: TaxIdType.OTHER, value: '123456789' }],
      };

      const result = await service.addMockOperator(operator);

      expect(result.status).toBe('success');
      expect(result.message).toBe('Operator added successfully');
      expect(result.operatorId).toBeDefined();
      expect(fetch).toHaveBeenCalledWith(
        `${process.env.ENDPOINT_URL}/operator`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(operator),
        },
      );
    });

    it('should handle blockchain API error', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Blockchain error'));

      const operator: OperatorInput = {
        name: 'Test Operator',
        contact_email: 'test@example.com',
        phone: '+1234567890',
        address: '123 Test St',
        country: CountryCode.US,
        tax_ids: [{ type: TaxIdType.OTHER, value: '123456789' }],
      };

      await expect(service.addMockOperator(operator)).rejects.toThrow(
        'Failed to add operator to blockchain',
      );
    });

    it('should add operator with minimal required fields', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

      const operator: OperatorInput = {
        name: 'Minimal Operator',
        contact_email: 'minimal@example.com',
        country: CountryCode.IT,
        tax_ids: [{ type: TaxIdType.VAT_EU, value: '987654321' }],
      };

      const result = await service.addMockOperator(operator);

      expect(result.status).toBe('success');
      expect(result.operatorId).toBeDefined();
    });
  });

  describe('getMockOperators', () => {
    it('should return operators after adding them', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

      const operator: OperatorInput = {
        name: 'Test Operator',
        contact_email: 'test@example.com',
        phone: '+1234567890',
        address: '123 Test St',
        country: CountryCode.US,
        tax_ids: [{ type: TaxIdType.OTHER, value: '123456789' }],
      };

      await service.addMockOperator(operator);
      const result = service.getMockOperators();

      expect(result.length > 0);
      expect(result[result.length - 1].name).toBe(operator.name);
      expect(result[result.length - 1].contact_email).toBe(
        operator.contact_email,
      );
      expect(result[result.length - 1].country).toBe(operator.country);
      expect(result[result.length - 1].tax_ids).toBe(operator.tax_ids);
    });

    it('should return empty array when no operators added', () => {
      const result = service.getMockOperators();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
