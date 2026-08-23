import { Global, Module } from '@nestjs/common';
import { YoutubeApiClient } from './youtube-api.client';
import { YoutubeChannelService } from './youtube-channel.service';
import { YoutubeService } from './youtube.service';

@Global()
@Module({
  providers: [YoutubeApiClient, YoutubeService, YoutubeChannelService],
  exports: [YoutubeService, YoutubeChannelService],
})
export class YoutubeModule {}
