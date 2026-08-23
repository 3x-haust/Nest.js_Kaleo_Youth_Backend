import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { configuration } from './config/configuration';
import { validateEnv } from './config/validate-env';
import { CsrfGuard } from './common/guards/csrf.guard';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';
import { DatabaseModule } from './database/database.module';
import { AboutModule } from './modules/about/about.module';
import { AdminsModule } from './modules/admins/admins.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { AuthModule } from './modules/auth/auth.module';
import { EventsModule } from './modules/events/events.module';
import { PostsModule } from './modules/posts/posts.module';
import { SermonsModule } from './modules/sermons/sermons.module';
import { SetlistsModule } from './modules/setlists/setlists.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { WorshipTeamModule } from './modules/worship-team/worship-team.module';
import { YoutubeModule } from './modules/youtube/youtube.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    AuditLogsModule,
    AboutModule,
    AuthModule,
    AdminsModule,
    SermonsModule,
    EventsModule,
    PostsModule,
    WorshipTeamModule,
    YoutubeModule,
    SetlistsModule,
    UploadsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // 상태를 바꾸는 요청은 예외 없이 CSRF 검사를 거칩니다.
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware).forRoutes('*');
  }
}
