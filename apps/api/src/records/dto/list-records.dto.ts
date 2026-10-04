import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListRecordsDto {
  @IsOptional() @Transform(({ value }) => value === undefined ? 1 : Number(value)) @IsInt() @Min(1)
  page = 1;
  @IsOptional() @Transform(({ value }) => value === undefined ? 20 : Number(value)) @IsInt() @Min(1) @Max(100)
  limit = 20;
  @IsOptional() @IsString()
  search?: string;
}
