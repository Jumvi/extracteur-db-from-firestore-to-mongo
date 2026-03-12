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

  @ApiProperty({
    required: false,
    type: 'array',
    description: 'Liste des UUIDs à réparer (si fournie, l’API générera le NDJSON puis réparera)'
  })
  @IsOptional()
  uuids?: string[];

  // Examples for Swagger UI clarity
  static exampleSingle() {
    return { uuid: '5fcfea2a-470b-4587-9d46-efb5fac8272b' };
  }

  static exampleList() {
    return { uuids: ['5fcfea2a-470b-4587-9d46-efb5fac8272b', '38e920d7-ee35-447c-a037-425f1068726d'], concurrency: 2 };
  }
}
