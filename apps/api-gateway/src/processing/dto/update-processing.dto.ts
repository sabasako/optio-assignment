import { PartialType } from '@nestjs/mapped-types';
import { CreateProcessingDto } from './create-processing.dto';

export class UpdateProcessingDto extends PartialType(CreateProcessingDto) {}
