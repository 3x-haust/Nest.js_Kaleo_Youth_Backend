import { Admin } from './admin.entity';
import { AboutPage } from './about-page.entity';
import { Attachment } from './attachment.entity';
import { AuditLog } from './audit-log.entity';
import { ChurchEvent } from './event.entity';
import { Post } from './post.entity';
import { RefreshToken } from './refresh-token.entity';
import { Sermon } from './sermon.entity';
import { SetlistSong } from './setlist-song.entity';
import { Setlist } from './setlist.entity';
import { WorshipTeamMember } from './worship-team-member.entity';
import { WorshipTeam } from './worship-team.entity';

export * from './admin.entity';
export * from './about-page.entity';
export * from './attachment.entity';
export * from './audit-log.entity';
export * from './event.entity';
export * from './post.entity';
export * from './refresh-token.entity';
export * from './sermon.entity';
export * from './setlist-song.entity';
export * from './setlist.entity';
export * from './worship-team-member.entity';
export * from './worship-team.entity';

export const entities = [
  Admin,
  AboutPage,
  RefreshToken,
  Sermon,
  ChurchEvent,
  Post,
  WorshipTeam,
  WorshipTeamMember,
  Setlist,
  SetlistSong,
  Attachment,
  AuditLog,
];
