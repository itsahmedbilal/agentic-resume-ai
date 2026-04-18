import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { ResumeModule } from './resume/resume.module';

@Module({
  imports: [
    AppConfigModule,
    ResumeModule,
  ],
})
export class AppModule {}
