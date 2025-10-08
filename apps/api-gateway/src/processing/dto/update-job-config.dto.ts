import { IsInt, IsPositive, Min } from 'class-validator';

export class UpdateJobConfigDto {
  @IsInt()
  @IsPositive()
  @Min(1)
  recordsPerMinute: number;
}
