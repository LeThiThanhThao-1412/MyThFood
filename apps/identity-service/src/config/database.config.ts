import { registerAs } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';
import { UserEntity } from '../modules/user/infrastructure/user.entity';

export const databaseConfig = registerAs(
  'database',
  (): DataSourceOptions => ({
    type: 'postgres',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    username: process.env.DATABASE_USER ?? 'mythfood',
    password: process.env.DATABASE_PASSWORD ?? 'mythfood_secret',
    database: process.env.DATABASE_NAME ?? 'mythfood_identity',
    entities: [UserEntity],
    synchronize: process.env.NODE_ENV === 'development',
    logging: process.env.NODE_ENV === 'development',
    migrations: [__dirname + '/../migrations/*.{ts,js}'],
    migrationsRun: process.env.NODE_ENV === 'production',
  }),
);