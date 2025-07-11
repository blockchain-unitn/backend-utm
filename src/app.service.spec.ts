import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import { CountryCode, TaxIdType, ZoneType } from './types/enums';
import { DroneType, DroneStatus } from './types/drone';
import {
  LocationUpdateRequest,
  PreAuthorizationRequest,
  PreAuthorizationStatus,
} from './types/dto';
import { Zone } from './types/zone';
import { Position } from './types/route';
import { DroneInput } from './types/drone';
import { OperatorInput } from './types/operator';
import { ConfigService } from '@nestjs/config';

// Mock fetch globally
global.fetch = jest.fn();

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'ENDPOINT_URL') return 'http://mock-endpoint';
              if (key === 'PORT') return 3000;
              if (key === 'OPERATOR')
                return '0x1512151204511516fdjdfjdjfdjfdjfdjfdjfdj';
              if (key === 'OPERATOR_ADDRESS')
                return '0x1546515t48sbetywhuhsuriwysir';
              if (key === 'ADMIN_ADDRESS') return '0xarijusbajtoaou21647219';
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
    (fetch as jest.Mock).mockClear();
    service['database'] = {
      drones: [],
      flightPlans: [],
      locations: [],
      operators: [],
    };
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

    it('should return error if getRouteCharacteristics fails', async () => {
      const request: PreAuthorizationRequest = {
        droneId: 'drone123',
        flightPlan: {
          route: [{ lat: 40.75, lon: -74.05, alt: 160 }],
          start_time: new Date(),
          end_time: new Date(),
        },
      };
      jest
        .spyOn(service, 'getRouteCharacteristics')
        .mockResolvedValueOnce(null as any);

      const result = await service.preAuthorization(request);

      expect(result.droneId).toEqual('drone123');
      expect(result.preauthorization_status).toEqual('FAILED');
    });

    it('should call external API and return response on success', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({
          data: {
            droneId: 'drone123',
            preauthorizationStatus: PreAuthorizationStatus.APPROVED,
            reason: '',
          },
        }),
      });
      jest.spyOn(service, 'getRouteCharacteristics').mockResolvedValueOnce({
        droneId: 'drone123',
        zones: [],
        altitudeLimit: 160,
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

      expect(service.getRouteCharacteristics).toHaveBeenCalledWith(request);
      expect(fetch).toHaveBeenCalledWith(
        'http://mock-endpoint/api/route-permissions/check',
        expect.any(Object),
      );
      expect(result.preauthorizationStatus).toEqual(
        PreAuthorizationStatus.APPROVED,
      );
      expect(result.droneId).toEqual('drone123');
    });

    it('should handle API fetch error', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      jest.spyOn(service, 'getRouteCharacteristics').mockResolvedValueOnce({
        droneId: 'drone123',
        zones: [],
        altitudeLimit: 160,
      });

      const request: PreAuthorizationRequest = {
        droneId: 'drone123',
        flightPlan: {
          route: [{ lat: 40.75, lon: -74.05, alt: 160 }],
          start_time: new Date(),
          end_time: new Date(new Date().getTime() + 3600000),
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

  describe('getZonesLimits', () => {
    it('should fetch and return zone limits successfully', async () => {
      const mockZones: Zone[] = [
        {
          _id: '1',
          zoneType: ZoneType.URBAN,
          boundaries: [
            { latitude: 40.75, longitude: -74.05 },
            { latitude: 40.76, longitude: -74.06 },
            { latitude: 40.77, longitude: -74.07 },
            { latitude: 40.78, longitude: -74.08 },
            { latitude: 40.79, longitude: -74.09 },
            { latitude: 40.8, longitude: -74.1 },
            { latitude: 40.81, longitude: -74.11 },
            { latitude: 40.82, longitude: -74.12 },
            { latitude: 40.83, longitude: -74.13 },
          ],
          minAltitude: 0,
          maxAltitude: 100,
          isActive: true,
          name: ' Urban Zone',
          description: ' Urban area with restrictions',
          createdAt: 0,
          updatedAt: 0,
        },
      ];
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({ data: mockZones }),
      });

      const result = await service.getZonesLimits();

      expect(fetch).toHaveBeenCalledWith('http://mock-endpoint/api/zones');
      expect(result).toEqual(mockZones);
    });

    it('should throw an error if fetching zone limits fails', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Server Error',
      });

      await expect(service.getZonesLimits()).rejects.toThrow(
        'Failed to retrieve zone limits',
      );
    });
  });

  describe('authorizeFlightPlan', () => {
    const flightPlan = {
      droneId: 'drone123',
      flightPlan: {
        route: [{ lat: 1, lon: 1, alt: 100 }],
        start_time: new Date(),
        end_time: new Date(),
      },
      zones: [],
    };

    it('should authorize flight plan and add to local database on success', async () => {
      // The service does NOT call fetch, it just adds to local DB
      const result = await service.authorizeFlightPlan(flightPlan);

      expect(result.droneId).toBe('drone123');
      expect(service['database'].flightPlans).toHaveLength(1);
      expect(service['database'].flightPlans[0].droneId).toBe('drone123');
    });

    it('should throw an error if something fails', async () => {
      // Simulate error by making mongoose.Types.ObjectId throw
      const original = service['database'].flightPlans.push;
      service['database'].flightPlans.push = () => {
        throw new Error('Mock error');
      };
      await expect(service.authorizeFlightPlan(flightPlan)).rejects.toThrow(
        'Failed to authorize flight plan on blockchain',
      );
      service['database'].flightPlans.push = original;
    });
  });

  describe('addMockDrone', () => {
    const droneInput: DroneInput = {
      model: 'DJI Mavic Pro',
      droneType: DroneType.MEDICAL,
      permittedZones: [ZoneType.URBAN],
      operatorId: 'op123',
      serialNumber: 'SN123',
      maintenanceHash: 'hash123',
      status: DroneStatus.ACTIVE,
      certHashes: ['cert-hash-1'],
    };

    it('should throw error for invalid drone data', async () => {
      const invalidDrone: any = { model: 'test' };
      await expect(service.addMockDrone(invalidDrone)).rejects.toThrow(
        'Invalid drone data',
      );
    });

    it('should throw error for empty certHashes', async () => {
      const invalidDrone: DroneInput = {
        ...droneInput,
        certHashes: [],
      };
      await expect(service.addMockDrone(invalidDrone)).rejects.toThrow(
        'certHashes must be a non-empty array of strings',
      );
    });

    it('should add drone and call blockchain API successfully', async () => {
      const mockResponse = {
        data: {
          _id: 'drone-id-from-db',
          tokenId: 'token-id-123',
          serialNumber: 'SN123',
          model: 'DJI Mavic Pro',
          droneType: DroneType.MEDICAL,
          permittedZones: [ZoneType.URBAN],
          ownerHistory: ['op123'],
          maintenanceHash: 'hash123',
          status: DroneStatus.ACTIVE,
        },
      };
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await service.addMockDrone(droneInput);

      expect(result.status).toBe('success');
      expect(result.droneId).toBe('token-id-123');
      expect(fetch).toHaveBeenCalledWith(
        'http://mock-endpoint/api/drones/mint',
        expect.any(Object),
      );
      expect(service['database'].drones).toHaveLength(1);
      expect(service['database'].drones[0]._id).toBe('token-id-123');
    });

    it('should throw error if blockchain API call fails', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Blockchain error'));

      await expect(service.addMockDrone(droneInput)).rejects.toThrow(
        'Failed to add drone to blockchain',
      );
    });
  });
});
