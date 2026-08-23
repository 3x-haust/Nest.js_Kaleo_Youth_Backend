import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * 관리자 계정이 뚫리면 사이트 전체 콘텐츠가 위험해지는 구조이므로,
 * 계정 수가 적은 만큼 비밀번호 요건을 다소 강하게 잡습니다.
 */
export const PASSWORD_RULE =
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$/;
export const PASSWORD_MESSAGE =
  '비밀번호는 10자 이상이며 영문·숫자·특수문자를 각각 하나 이상 포함해야 합니다.';

export class CreateAdminDto {
  @IsString()
  @Length(3, 50)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: '아이디는 영문·숫자와 . _ - 만 사용할 수 있습니다.',
  })
  loginId: string;

  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password: string;

  @IsString()
  @Length(1, 50)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  positionLabel?: string;

  @IsOptional()
  @IsBoolean()
  isSuperAdmin?: boolean;
}

export class UpdateAdminDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  positionLabel?: string;

  @IsOptional()
  @IsBoolean()
  isSuperAdmin?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** 슈퍼관리자가 다른 관리자의 비밀번호를 재발급해주는 경우 */
export class ResetPasswordDto {
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

/** 본인이 직접 변경하는 경우 — 현재 비밀번호를 반드시 확인합니다. */
export class ChangePasswordDto {
  @IsString()
  @Length(8, 128)
  currentPassword: string;

  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  newPassword: string;
}
