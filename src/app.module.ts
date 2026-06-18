import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule } from './clients/clients.module';
import { InteractionsModule } from './interactions/interactions.module';
import { RemindersModule } from './reminders/reminders.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ActivitiesModule } from './Activities/activities.module';
import { OpportunityTrackingsModule } from './opportunity-trackings/opportunity-trackings.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from './notifications/notifications.module';
import { CompaniesModule } from './companies/companies.module';
import { PipelinesModule } from './pipelines/pipelines.module';
import { ProductsModule } from './products/products.module';
import { DataSource } from 'typeorm';


@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true, // Makes the ConfigService available throughout the app
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true, // In production, this should be false and migrations should be used
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    ClientsModule,
    InteractionsModule,
    RemindersModule,
    OpportunitiesModule,
    UsersModule,
    ActivitiesModule,
    OpportunityTrackingsModule,
    ExpensesModule,
    NotificationsModule,
    CompaniesModule,
    PipelinesModule,
    ProductsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap() {
    console.log('Running automatic data migration...');
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // 1. Check if the table "companies" exists
      const tableExists = await queryRunner.hasTable('companies');
      if (!tableExists) {
        console.log('Companies table does not exist yet. Skipping migration for now.');
        return;
      }

      // Check if there are already companies
      const companyCountResult = await queryRunner.query('SELECT COUNT(*) as count FROM companies');
      const companyCount = parseInt(companyCountResult[0].count);

      // We will migrate any client that has a non-empty `empresa` AND `companyId` IS NULL.
      const clientsToMigrate = await queryRunner.query(`
        SELECT DISTINCT empresa 
        FROM clients 
        WHERE "companyId" IS NULL 
          AND empresa IS NOT NULL 
          AND TRIM(empresa) != ''
      `);

      for (const row of clientsToMigrate) {
        const empresaName = row.empresa.trim();
        // Check if a company with this name already exists
        const companyRow = await queryRunner.query(
          'SELECT id FROM companies WHERE LOWER(nombre) = LOWER($1)',
          [empresaName]
        );

        let companyId: string;
        if (companyRow.length === 0) {
          // Create the company
          const insertResult = await queryRunner.query(
            'INSERT INTO companies (id, nombre, "estatus") VALUES (gen_random_uuid(), $1, true) RETURNING id',
            [empresaName]
          );
          companyId = insertResult[0].id;
          console.log(`Created company "${empresaName}" with ID ${companyId}`);
        } else {
          companyId = companyRow[0].id;
        }

        // Link clients
        await queryRunner.query(
          'UPDATE clients SET "companyId" = $1 WHERE empresa = $2 AND "companyId" IS NULL',
          [companyId, row.empresa]
        );
        console.log(`Linked clients with empresa "${row.empresa}" to company ID ${companyId}`);
      }

      // 2. Link opportunities to companies
      const opps = await queryRunner.query(`
        SELECT o.id, o.cliente_id, c."companyId"
        FROM opportunities o
        INNER JOIN clients c ON o.cliente_id = c.id
        WHERE o."companyId" IS NULL AND c."companyId" IS NOT NULL
      `);

      for (const opp of opps) {
        await queryRunner.query(
          'UPDATE opportunities SET "companyId" = $1 WHERE id = $2',
          [opp.companyId, opp.id]
        );
        console.log(`Linked opportunity ${opp.id} to company ID ${opp.companyId}`);

        // Insert into opportunity_contacts many-to-many
        const exists = await queryRunner.query(
          'SELECT 1 FROM opportunity_contacts WHERE "opportunitiesId" = $1 AND "clientsId" = $2',
          [opp.id, opp.cliente_id]
        );
        if (exists.length === 0) {
          await queryRunner.query(
            'INSERT INTO opportunity_contacts ("opportunitiesId", "clientsId") VALUES ($1, $2)',
            [opp.id, opp.cliente_id]
          );
          console.log(`Associated contact ${opp.cliente_id} to opportunity ${opp.id} in opportunity_contacts`);
        }
      }

      // 3. Link activities to companies
      const acts = await queryRunner.query(`
        SELECT a.id, a."clientId", c."companyId"
        FROM activities a
        INNER JOIN clients c ON a."clientId" = c.id
        WHERE a."companyId" IS NULL AND c."companyId" IS NOT NULL
      `);

      for (const act of acts) {
        await queryRunner.query(
          'UPDATE activities SET "companyId" = $1 WHERE id = $2',
          [act.companyId, act.id]
        );
        console.log(`Linked activity ${act.id} to company ID ${act.companyId}`);

        // Insert into activity_contacts many-to-many
        const exists = await queryRunner.query(
          'SELECT 1 FROM activity_contacts WHERE "activitiesId" = $1 AND "clientsId" = $2',
          [act.id, act.clientId]
        );
        if (exists.length === 0) {
          await queryRunner.query(
            'INSERT INTO activity_contacts ("activitiesId", "clientsId") VALUES ($1, $2)',
            [act.id, act.clientId]
          );
          console.log(`Associated contact ${act.clientId} to activity ${act.id} in activity_contacts`);
        }
      }

    } catch (err) {
      console.error('Error running automatic migration:', err);
    } finally {
      await queryRunner.release();
    }
  }
}

