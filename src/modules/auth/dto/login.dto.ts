import { IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(3, 50)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: '아이디는 영문·숫자와 . _ - 만 사용할 수 있습니다.',
  })
  loginId: string;

  @IsString()
  @Length(8, 128)
  password: string;
}
