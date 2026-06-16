import { PartialType } from '@nestjs/swagger';
import { CreateTypeActivityDto } from './create-type-activity.dto';

export class UpdateTypeActivityDto extends PartialType(CreateTypeActivityDto) {}
