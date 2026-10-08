import { IsBoolean, IsIn, IsInt, Max, Min } from 'class-validator';

export class UpdateRecordRetentionSettingsDto {
  @IsBoolean()
  autoDeleteRecordsEnabled!: boolean;

  @IsInt() @Min(1) @Max(36_500)
  autoDeleteRecordsAfterDays!: number;

  @IsBoolean()
  purgeVideosEnabled!: boolean;

  @IsInt() @Min(1) @Max(36_500)
  purgeVideosAfterDays!: number;

  @IsIn(['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p'])
  preferredVideoQuality!: string;
}
