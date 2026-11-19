import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateTenantIbmAudioDto {
  @ApiProperty({
    example: true,
    description: 'Habilita o deshabilita el add-on de transcripción de audio con IBM Speech-to-Text para el tenant.',
  })
  @IsBoolean({ message: 'El campo ibm_audio_enabled debe ser booleano (true o false).' })
  ibm_audio_enabled: boolean;
}
