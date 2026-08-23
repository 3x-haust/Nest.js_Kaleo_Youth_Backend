import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AboutPage } from '../../entities';
import { UploadsModule } from '../uploads/uploads.module';
import { AboutController } from './about.controller';
import { AboutService } from './about.service';

@Module({
  imports: [TypeOrmModule.forFeature([AboutPage]), UploadsModule],
  controllers: [AboutController],
  providers: [AboutService],
  exports: [AboutService],
})
export class AboutModule {}
