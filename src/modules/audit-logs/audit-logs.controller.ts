import { Controller, Delete, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { AuditAction } from '../../entities';
import { AuditLogsService } from './audit-logs.service';

@Controller('admin/audit-logs')
@UseGuards(AdminGuard)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('adminId') adminId?: string,
  ) {
    return this.auditLogsService.findAll({
      page: Math.max(1, Number.parseInt(page ?? '1', 10) || 1),
      limit: Math.min(
        100,
        Math.max(1, Number.parseInt(limit ?? '30', 10) || 30),
      ),
      action,
      adminId,
    });
  }

  @Get('actions')
  listActions() {
    return Object.values(AuditAction);
  }

  @Delete('expired')
  @UseGuards(SuperAdminGuard)
  async purgeExpired() {
    const deleted = await this.auditLogsService.purgeExpired();
    return { deleted };
  }
}
