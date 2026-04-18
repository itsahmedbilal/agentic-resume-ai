import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableShutdownHooks();
  const port = process.env.PORT ?? 8000;
  await app.listen(port);
  console.log(`Agentic Resume AI listening on port ${port}`);
}
bootstrap();
