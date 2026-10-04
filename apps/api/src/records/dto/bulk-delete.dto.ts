import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class BulkDeleteDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsUUID('4', { each: true })
  ids!: string[];
}
