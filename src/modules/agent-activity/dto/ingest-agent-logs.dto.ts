import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** One `data` object from the agent's `activity.log` WebSocket frame. Extra fields
 *  (e.g. mediaTitle) are stripped by the global whitelist ValidationPipe. */
export class AgentLogDto {
  @IsInt()
  @Min(0)
  id!: number;

  @IsString()
  @MaxLength(100)
  deviceId!: string;

  @IsString()
  @MaxLength(30)
  eventType!: string;

  @IsDateString()
  startTs!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  appName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  windowTitle?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  mouseEventCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  keyEventCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  mediaState?: string | null;
}

export class IngestAgentLogsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AgentLogDto)
  logs!: AgentLogDto[];
}
