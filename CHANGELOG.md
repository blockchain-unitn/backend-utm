# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),

## [Unreleased]

### Added 
- Added the CHANGELOG
- Add drone, operator, and route interfaces with enums for types
- Implemented pre-authorization endpoint to handle drone flight requests.
- Created get_route_characteristics endpoint to retrieve route details.
- Developed location_update endpoint for telemetry data storage.
- Introduced mock_drones endpoint to return sample drone data.
- Enhanced AppService with methods for pre-authorization, route characteristics analysis, and drone management.
- Added DTOs (Data Transfer Objects) for structured data transfer in requests.
- Implemented unit tests for AppService methods to ensure functionality and error handling.
- Created zone definitions for flight area restrictions.
- Added the ENDPOINT_URL environment variable
- Added `.env.orig` template with environment variables for backend configuration
- Added `@nestjs/config`, `@nestjs/schedule`, and `@turf/turf` dependencies for configuration, scheduling, and geospatial analysis
- Implemented zone boundaries and altitude checks using Turf.js for route validation
- Added mock operator and drone creation endpoints and logic
- Implemented simulation cron jobs for flight plan authorization and drone telemetry

### Changed
- Changed the README content
- Initialize Project and configuration
- Refactored zone and drone interfaces to match backend API structure
- Updated endpoints to use new environment variable and configuration module
- Changed zone type enums to numeric values for compatibility with backend
- Updated tests and service logic to use new zone and drone structures
- Improved error handling and logging throughout the service

