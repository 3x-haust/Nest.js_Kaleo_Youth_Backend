import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { normalizeTrimmedString } from '../../../common/utils/transform.util';

export class CreateSermonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  preacherName: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bibleReference?: string;

  /** 전체 URL을 받아도 서버가 ID만 추출해 저장합니다. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  youtubeUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  summary?: string;

  @IsDateString()
  publishedAt: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}

export class UpdateSermonDto extends PartialType(CreateSermonDto) {}

export class SermonQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => normalizeTrimmedString(value))
  preacher?: string;

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
