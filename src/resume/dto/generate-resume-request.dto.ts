import { Transform } from 'class-transformer';
import { IsString, MinLength, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class GenerateResumeRequestDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(50)
  jdText: string;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(30)
  topNBullets?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1.0)
  fidelityThreshold?: number;
}
