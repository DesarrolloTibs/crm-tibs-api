import {
  IsIn,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateHelpdeskCronConfigDto {
  @ApiProperty({
    description: "Modo de ejecución: 'fixed' (hora fija) o 'interval' (cada cierto tiempo)",
    enum: ['fixed', 'interval'],
    example: 'fixed',
  })
  @IsIn(['fixed', 'interval'])
  cron_mode: 'fixed' | 'interval';

  @ApiPropertyOptional({
    description: "Hora de ejecución en formato 'HH:MM'. Requerido cuando cron_mode = 'fixed'.",
    example: '08:00',
  })
  @ValidateIf((o) => o.cron_mode === 'fixed')
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'cron_time debe tener formato HH:MM (p.ej. "08:30")',
  })
  cron_time?: string | null;

  @ApiPropertyOptional({
    description: 'Horas del intervalo (0-23). Requerido cuando cron_mode = "interval".',
    example: 2,
  })
  @ValidateIf((o) => o.cron_mode === 'interval')
  @IsInt()
  @Min(0)
  @Max(23)
  cron_interval_hours?: number | null;

  @ApiPropertyOptional({
    description: 'Minutos del intervalo (0-59). Requerido cuando cron_mode = "interval".',
    example: 30,
  })
  @ValidateIf((o) => o.cron_mode === 'interval')
  @IsInt()
  @Min(0)
  @Max(59)
  cron_interval_minutes?: number | null;
}
