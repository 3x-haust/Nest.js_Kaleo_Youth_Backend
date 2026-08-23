import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { entities } from '../entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.database'),
        entities,
        // 개발 편의용. 운영에서는 validate-env가 true를 거부합니다.
        synchronize: configService.get<boolean>('database.synchronize'),
        ssl: configService.get<boolean>('database.ssl')
          ? {
              rejectUnauthorized:
                configService.get<boolean>('database.sslRejectUnauthorized') ??
                true,
            }
          : false,
        logging: configService.get<boolean>('isProduction')
          ? ['error']
          : ['error', 'warn'],
      }),
    }),
  ],
})
export class DatabaseModule {}
