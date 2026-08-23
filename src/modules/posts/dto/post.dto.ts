import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { normalizeTrimmedString } from '../../../common/utils/transform.util';
import { BoardType } from '../../../entities';

const toBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class CreatePostDto {
  @IsEnum(BoardType)
  boardType: BoardType;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  thumbnailUrl?: string | null;

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isPinned?: boolean;

  /** 먼저 업로드해 둔 첨부파일 id 목록 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}

export class UpdatePostDto extends PartialType(CreatePostDto) {}

export class PostQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(BoardType)
  boardType?: BoardType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => normalizeTrimmedString(value))
  keyword?: string;
}
