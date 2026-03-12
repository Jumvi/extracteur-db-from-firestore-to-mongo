import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, IsBoolean } from 'class-validator';

export class RepairDto {
  @ApiProperty({
    required: false,
    type: 'string',
    description: 'Chemin vers le fichier NDJSON d’entrée (ex: tmp/geosuivi_filenames_<uuid>.ndjson)'
  })
  @IsOptional()
  @IsString()
  input?: string;

  @ApiProperty({
    required: false,
    type: 'string',
    description: 'UUID du rapport si on veut réparer un seul rapport'
  })
  @IsOptional()
  @IsString()
  uuid?: string;

  @ApiProperty({
    required: false,
    type: 'integer',
    description: 'Nombre de processus concurrent pour la réparation'
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  concurrency?: number;

  @ApiProperty({
    required: false,
    type: 'boolean',
    description: "Si true, force l'écrasement des fichiers en S3 ('--overwrite')"
  })
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}
