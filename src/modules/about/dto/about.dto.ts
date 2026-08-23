import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AboutValueDto {
  @IsIn(['cross', 'bible', 'people'])
  icon: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  label: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  body: string;
}

export class UpdateAboutDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  introEyebrow?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  introTitle?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  introBody?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => AboutValueDto)
  values?: AboutValueDto[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  leaderEyebrow?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  leaderName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  leaderRole?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  leaderBody?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  teamEyebrow?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  closingPhotoLabel?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(200, { each: true })
  closingLines?: string[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  closingLabel?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  metaDescription?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];

  @IsOptional()
  @IsUUID('4')
  leaderPhotoAttachmentId?: string;

  @IsOptional()
  @IsUUID('4')
  closingPhotoAttachmentId?: string;
}
