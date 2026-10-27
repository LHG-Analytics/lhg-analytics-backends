import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class SetSystemsDto {
  @ApiProperty({
    description:
      'Conjunto COMPLETO de sistemas ativos da pessoa (substitui o atual)',
    example: ['analytics', 'cms'],
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  systems: string[];

  constructor(systems: string[]) {
    this.systems = systems;
  }
}
