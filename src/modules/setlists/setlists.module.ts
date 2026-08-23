import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setlist, SetlistSong } from '../../entities';
import { SetlistsController } from './setlists.controller';
import { SetlistsService } from './setlists.service';
import { UploadsModule } from '../uploads/uploads.module';
import { FixedPlaylistSyncService } from './fixed-playlist-sync.service';

@Module({
  imports: [TypeOrmModule.forFeature([Setlist, SetlistSong]), UploadsModule],
  controllers: [SetlistsController],
  providers: [SetlistsService, FixedPlaylistSyncService],
  exports: [SetlistsService],
})
export class SetlistsModule {}
