import { Controller, Post, Body, Get, Param, BadRequestException, Res, Req, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Response, Request } from 'express';
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
    description: 'Paramètres d’audit. Fournir soit `uuids` pour auditer des rapports spécifiques, soit `since`/`until` (ISO date) pour une fenêtre temporelle, ou rien pour un audit global. Les dates se basent sur `date_fincollecte` quand disponible.',
    type: StrictAuditDto,
    required: true,
    examples: {
      default: {
        summary: 'Exemple complet',
        value: { limitUuids: 10, dryRun: true, since: '2026-02-01', until: '2026-02-28' }
      },
      byUuids: { summary: 'Audit pour une liste d’UUIDs', value: { uuids: ['5fcfea2a-470b-4587-9d46-efb5fac8272b'], dryRun: true } },
      byWindow: { summary: 'Audit pour une fenêtre temporelle', value: { since: '2026-02-07', until: '2026-02-11', dryRun: true } }
    }
  })
  async strict(@Body() body: StrictAuditDto) {
    // Validate date inputs early and return clear 400 errors
    if (body) {
      if (body.since && isNaN(Date.parse(String(body.since)))) {
        throw new BadRequestException(`Invalid date for 'since': ${body.since}`);
      }
      if (body.until && isNaN(Date.parse(String(body.until)))) {
        throw new BadRequestException(`Invalid date for 'until': ${body.until}`);
      }
    }
    return this.svc.runStrict(body || {});
  }

  @Post('repair')
  @ApiOperation({ summary: 'Lancer une réparation pour un ou plusieurs rapports' })
  @ApiBody({
    description: 'Fournir `input` (chemin NDJSON), `uuid` (single) ou `uuids` (liste). `concurrency` et `overwrite` contrôlent l’exécution.',
    type: RepairDto,
    required: true,
    examples: {
      default: { summary: 'Exemple complet', value: { uuids: ['5fcfea2a-470b-4587-9d46-efb5fac8272b'], concurrency: 2, overwrite: false } },
      single: { summary: 'Réparer un UUID', value: { uuid: '5fcfea2a-470b-4587-9d46-efb5fac8272b' } },
      list: { summary: 'Réparer plusieurs UUIDs', value: { uuids: ['uuid1','uuid2'], concurrency: 2 } },
      input: { summary: 'Réparer à partir d’un fichier NDJSON', value: { input: 'tmp/audit_flag1_missing.ndjson', overwrite: true } }
    }
  })
  async repair(@Body() body: RepairDto) {
    return this.svc.runRepair(body || {});
  }

  @Get('status/:id')
  status(@Param('id') id: string) {
    return this.svc.status(id);
  }

  @Get('status/:id/report.ndjson')
  report(@Param('id') id: string, @Res() res: Response, @Req() req: Request) {
    const p = path.join(process.cwd(), 'tmp', `job_${id}_missing.ndjson`);
    if (!fs.existsSync(p)) {
      throw new NotFoundException('report not found');
    }
    res.setHeader('Content-Type', 'application/x-ndjson');
    const stream = fs.createReadStream(p);
    stream.pipe(res);
  }
}
