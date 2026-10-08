import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class UpdateRecordRetentionSettingsDto {
  @IsBoolean()
  autoDeleteRecordsEnabled!: boolean;

  @IsInt() @Min(1) @Max(36_500)
  autoDeleteRecordsAfterDays!: number;

  @IsBoolean()
  purgeVideosEnabled!: boolean;

  @IsInt() @Min(1) @Max(36_500)
  purgeVideosAfterDays!: number;
}
