import { IsInt } from 'class-validator';

export class CreateProcessingDto {
  @IsInt()
  totalRecords: number;

  @IsInt()
  recordsPerMinute: number;
}
