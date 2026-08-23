import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { StoredImageMigrationService } from '../modules/uploads/stored-image-migration.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const result = await app.get(StoredImageMigrationService).migrate();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
