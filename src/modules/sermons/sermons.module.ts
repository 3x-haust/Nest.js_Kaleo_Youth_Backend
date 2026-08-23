import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment, Sermon } from '../../entities';
import { SermonsController } from './sermons.controller';
import { SermonsService } from './sermons.service';
import { UploadsModule } from '../uploads/uploads.module';
import { SermonYoutubeSyncService } from './sermon-youtube-sync.service';

@Module({
  imports: [TypeOrmModule.forFeature([Sermon, Attachment]), UploadsModule],
  controllers: [SermonsController],
  providers: [SermonsService, SermonYoutubeSyncService],
  exports: [SermonsService, SermonYoutubeSyncService],
})
export class SermonsModule {}
