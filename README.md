# Backend UTM

A Node.js backend service that simulates requests from UTM (Unmanned Traffic Management) Service Providers to the SkyLedger Backend system.

## Overview

This backend service acts as a simulation layer for UTM Service Provider interactions with the SkyLedger platform. It provides a comprehensive testing environment for drone traffic management operations, in order to validate UTM integration workflows without requiring actual UTM provider connections.

## Features

- **UTM Request Simulation**: Mimics real-world UTM Service Provider API calls
- **SkyLedger Integration**: Seamless communication with the SkyLedger Backend
- **Traffic Management**: Simulates drone flight planning, authorization, and monitoring
- **Testing Environment**: Comprehensive testing suite for UTM workflows

## Use Cases

- Development and testing of UTM integration flows
- Validation of SkyLedger Backend responses
- Simulation of various UTM scenarios and edge cases

## Getting Started

This service is part of the larger SkyLedger ecosystem and requires proper configuration to communicate with the main SkyLedger Backend service.

## Running the Service

1. **Clone the repository**:
    ```bash
    git clone https://github.com/your-org/backend-utm.git
    cd backend-utm
    ```

2. **Install dependencies**:
    ```bash
    npm install
    ```

3. **Configure environment variables**:  
    Copy `.env.orig` to `.env` and update the values as needed for your environment.

4. **Start the service**:
    ```bash
    npm start
    ```

5. **Run tests (optional)**:
    ```bash
    npm test
    ```

The service will start and listen for simulated UTM requests as configured.