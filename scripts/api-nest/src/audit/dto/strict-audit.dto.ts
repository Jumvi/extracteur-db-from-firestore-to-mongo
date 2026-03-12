import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, IsBoolean } from 'class-validator';

export class StrictAuditDto {
  @ApiProperty({ required: false, type: 'string', description: 'Job id (string)' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ required: false, type: 'integer', description: 'PID number from a previous run' })
  @IsOptional()
  @IsInt()
  pid?: number;

  @ApiProperty({
    required: false,
    type: 'integer',
    description: "Limite du nombre d'UUIDs à vérifier (utile pour tests)"
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  limitUuids?: number;

  @ApiProperty({
    required: false,
    type: 'string',
    description: 'Filtrer rapports depuis cette date (ISO yyyy-mm-dd or full ISO)',
    example: '2026-02-07'
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiProperty({ required: false, type: 'string', description: 'Filtrer rapports jusqu’à cette date (ISO)', example: '2026-02-11' })
  @IsOptional()
  @IsString()
  since?: string;

  @ApiProperty({ required: false, type: 'array', description: 'Liste explicite d’UUIDs à auditer', example: ['5fcfea2a-470b-4587-9d46-efb5fac8272b'] })
  @IsOptional()
  @IsString()
  until?: string;
  @ApiProperty({ required: false, type: 'boolean', description: 'Si true, auditer tous les rapports (ignore pagination/limits)', example: false })
  @ApiProperty({ required: false, type: 'array', description: 'Liste explicite d’UUIDs à auditer' })
  @IsOptional()
  uuids?: string[];

  // Small example quick references for Swagger users
  static exampleByUuids() {
    return { uuids: ['5fcfea2a-470b-4587-9d46-efb5fac8272b'], dryRun: true };
  }

  static exampleByWindow() {
    return { since: '2026-02-07', until: '2026-02-11', dryRun: true };
  }

  @ApiProperty({ required: false, type: 'boolean', description: 'Si true, auditer tous les rapports (ignore pagination/limits)' })
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}
