import { ApiProperty } from '@nestjs/swagger';

/**
 * Standard error response shape returned by GlobalExceptionFilter.
 * Documented here so Swagger can show it as a reusable schema.
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 400, description: 'HTTP status code' })
  statusCode: number;

  @ApiProperty({
    example: 'Validation failed: field is required',
    description: 'Human-readable error message',
  })
  message: string;

  @ApiProperty({
    example: '2025-07-29T14:30:00.000Z',
    description: 'ISO 8601 timestamp of when the error occurred',
  })
  timestamp: string;

  @ApiProperty({
    example: '/api/clients',
    description: 'Request path that triggered the error',
  })
  path: string;

  @ApiProperty({
    required: false,
    description: 'Stack trace — only present in non-production environments',
    example: 'Error: ...\n    at ...',
  })
  stack?: string;
}
