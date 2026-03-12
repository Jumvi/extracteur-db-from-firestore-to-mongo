import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { AuditService } from './audit.service';
import { RepairDto } from './dto/repair.dto';
import { StrictAuditDto } from './dto/strict-audit.dto';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  @Post('strict')
  @ApiOperation({ summary: 'Audit des rapports flag_rapport=1 — identifie médias manquants' })
  @ApiBody({
    description: 'Paramètres d’audit. Fournir soit `uuids` pour auditer des rapports spécifiques, soit `since`/`until` pour une fenêtre temporelle, ou rien pour un audit global.',
    type: StrictAuditDto,
    required: true,
    examples: {
      example_by_uuids: {
        summary: 'Audit pour une liste d’UUIDs',
        value: { uuids: ['5fcfea2a-470b-4587-9d46-efb5fac8272b'], dryRun: true }
      },
      example_by_window: {
        summary: 'Audit pour une fenêtre temporelle',
        value: { since: '2026-02-07', until: '2026-02-11', dryRun: true }
      }
    }
  })
  async strict(@Body() body: StrictAuditDto) {
    return this.svc.runStrict(body || {});
  }

  @Post('repair')
  @ApiOperation({ summary: 'Lancer une réparation pour un ou plusieurs rapports' })
  @ApiBody({
    description: 'Fournir `input` (chemin NDJSON), `uuid` (single) ou `uuids` (liste). `concurrency` et `overwrite` contrôlent l’exécution.',
    type: RepairDto,
    required: true,
    examples: {
      example_single: { summary: 'Réparer un UUID', value: { uuid: '5fcfea2a-470b-4587-9d46-efb5fac8272b' } },
      example_list: { summary: 'Réparer plusieurs UUIDs', value: { uuids: ['uuid1','uuid2'], concurrency: 2 } },
      example_input: { summary: 'Réparer à partir d’un fichier NDJSON', value: { input: 'tmp/audit_flag1_missing.ndjson', overwrite: true } }
    }
  })
  async repair(@Body() body: RepairDto) {
    return this.svc.runRepair(body || {});
  }

  @Get('status/:id')
  status(@Param('id') id: string) {
    return this.svc.status(id);
  }
}
