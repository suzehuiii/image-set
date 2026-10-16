import {
  createDatabaseClient,
  migrateDatabase,
  type DatabaseClient,
} from '@image-set/database';
import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly client: DatabaseClient;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('Missing DATABASE_URL');
    this.client = createDatabaseClient(connectionString);
  }

  async onModuleInit(): Promise<void> {
    await migrateDatabase(this.client.pool);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.pool.end();
  }
}
