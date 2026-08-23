import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { normalizeTrimmedString } from '../../../common/utils/transform.util';

export class CreateEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  itemsToBring?: string;

  /** 결제 기능이 없으므로 금액이 아닌 안내 문구입니다. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  feeInfo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactInfo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}

export class UpdateEventDto extends PartialType(CreateEventDto) {}

export class EventQueryDto extends PaginationDto {
  /** upcoming: 오늘 이후 / past: 지난 행사 / all: 전체 */
  @IsOptional()
  @IsIn(['upcoming', 'past', 'all'])
  scope?: 'upcoming' | 'past' | 'all';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => normalizeTrimmedString(value))
  keyword?: string;
}
