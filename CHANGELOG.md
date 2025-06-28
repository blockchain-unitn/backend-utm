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

### Changed
- Changed the README content
- Initialize Project and configuration

