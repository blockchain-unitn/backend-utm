import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { AppService } from './app.service';
import {
  PreAuthorizationRequest,
  LocationUpdateRequest,
  FlightPlan,
} from './types/dto';
import { DroneInput } from './types/drone';
import { OperatorInput } from './types/operator';
import { ApiParam, ApiQuery } from '@nestjs/swagger';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('preauthorization')
  async preAuthorization(@Body() request: PreAuthorizationRequest) {
    return await this.appService.preAuthorization(request);
  }

  @Post('get_route_characteristics')
  getRouteCharacteristics(
    @Body() request: PreAuthorizationRequest,
  ) {
    return this.appService.getRouteCharacteristics(request);
  }

  @Post('location_update')
  async locationUpdate(@Body() request: LocationUpdateRequest) {
    return await this.appService.locationUpdate(request);
  }

  @Post('addMockDrone')
  async addMockDrone(@Body() request: DroneInput) {
    return await this.appService.addMockDrone(request);
  }

  @Post('addMockOperator')
  async addMockOperator(@Body() request: OperatorInput) {
    return await this.appService.addMockOperator();
  }

  @Get('mock_drones')
  getMockDrones() {
    return this.appService.getMockDrones();
  }

  @Get('mock_operators')
  getMockOperators() {
    return this.appService.getMockOperators();
  }
}
