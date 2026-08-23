import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from '../../entities';
import { buildMulterOptions } from './multer.config';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { StoredImageMigrationService } from './stored-image-migration.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Attachment]),
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildMulterOptions(
          configService.get<string>('upload.dir') ?? './uploads',
        ),
    }),
  ],
  controllers: [UploadsController],
  providers: [UploadsService, StoredImageMigrationService],
  exports: [UploadsService, StoredImageMigrationService],
})
export class UploadsModule {}
