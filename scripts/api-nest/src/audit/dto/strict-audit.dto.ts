import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, IsBoolean } from 'class-validator';

export class StrictAuditDto {
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
    type: 'boolean',
    description: 'Si true, exécute l’audit en mode `dry-run`'
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
