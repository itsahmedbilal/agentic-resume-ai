import { Module } from '@nestjs/common';
import { InputGuard } from './input.guard';
import { ContentGuard } from './content.guard';
import { OutputGuard } from './output.guard';

@Module({
  providers: [InputGuard, ContentGuard, OutputGuard],
  exports: [InputGuard, ContentGuard, OutputGuard],
})
export class SecurityModule {}
