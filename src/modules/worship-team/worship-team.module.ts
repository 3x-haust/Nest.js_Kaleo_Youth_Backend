import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorshipTeam, WorshipTeamMember } from '../../entities';
import { WorshipTeamController } from './worship-team.controller';
import { WorshipTeamService } from './worship-team.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorshipTeam, WorshipTeamMember]),
    UploadsModule,
  ],
  controllers: [WorshipTeamController],
  providers: [WorshipTeamService],
  exports: [WorshipTeamService],
})
export class WorshipTeamModule {}
