import { IsInt, IsPositive, Min } from 'class-validator';

export class CreateJobDto {
  @IsInt()
  @IsPositive()
  @Min(1)
  totalRecords: number;

  @IsInt()
  @IsPositive()
  @Min(1)
  recordsPerMinute: number;
}
