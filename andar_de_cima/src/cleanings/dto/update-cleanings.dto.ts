import { PartialType } from '@nestjs/swagger';
import { CreateCleaningsDto } from './create-cleanings.dto';

export class UpdateCleaningsDto extends PartialType(CreateCleaningsDto) {}
