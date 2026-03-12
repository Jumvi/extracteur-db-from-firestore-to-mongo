import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  @Post('strict')
  async strict(@Body() body: any) {
    return this.svc.runStrict(body || {});
  }

  @Post('repair')
  async repair(@Body() body: any) {
    return this.svc.runRepair(body || {});
  }

  @Get('status/:id')
  status(@Param('id') id: string) {
    return this.svc.status(id);
  }
}
