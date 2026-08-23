import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { normalizeTrimmedString } from '../../../common/utils/transform.util';

export class SetlistSongDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  songTitle: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  artist?: string;

  /** 영상 URL 또는 ID. 서버가 ID만 추출해 저장합니다. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  youtubeUrl?: string;

  /** 임포트 확인 화면에서 그대로 되돌려 보내는 원본 영상 제목 */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  youtubeVideoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sheetFileUrl?: string;

  @IsOptional()
  @IsBoolean()
  isUnavailable?: boolean;
}

export class CreateSetlistDto {
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsDateString()
  serviceDate: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string;

  /** 플레이리스트에서 임포트한 경우에만 채워집니다. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  youtubePlaylistUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  youtubePlaylistTitle?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];

  /** 관리자가 확인·수정을 마친 최종 곡 목록 */
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SetlistSongDto)
  songs: SetlistSongDto[];
}

export class UpdateSetlistDto extends PartialType(CreateSetlistDto) {}

export class PreviewPlaylistDto {
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  @Transform(({ value }) => normalizeTrimmedString(value))
  playlistUrl: string;
}

export class SetlistQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => normalizeTrimmedString(value))
  keyword?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
