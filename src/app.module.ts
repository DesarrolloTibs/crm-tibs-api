import { Module, OnApplicationBootstrap, NestModule, MiddlewareConsumer, Logger } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ClientsModule } from './clients/clients.module';
import { InteractionsModule } from './interactions/interactions.module';
import { RemindersModule } from './reminders/reminders.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ActivitiesModule } from './activities/activities.module';
import { OpportunityTrackingsModule } from './opportunity-trackings/opportunity-trackings.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from './notifications/notifications.module';
import { CompaniesModule } from './companies/companies.module';
import { PipelinesModule } from './pipelines/pipelines.module';
import { ProductsModule } from './products/products.module';
import { TicketsModule } from './tickets/tickets.module';
import { TicketInteractionsModule } from './ticket-interactions/ticket-interactions.module';
import { ReportsModule } from './reports/reports.module';
import { ConversationsModule } from './conversations/conversations.module';
import { DataSource } from 'typeorm';
import { RagModule } from './rag/rag.module';
import { WebchatModule } from './webchat/webchat.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { PlansModule } from './plans/plans.module';
import { TenantsModule } from './tenants/tenants.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TenantMiddleware } from './tenancy/tenant.middleware';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // EventEmitter global: permite comunicación desacoplada entre módulos
    // eliminando la necesidad de forwardRef() en dependencias circulares
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
    // Rate limiting global: tres niveles diferenciados
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,   // 1 minuto
        limit: 5000,   // 500 req/min para endpoints autenticados en desarrollo/producción
      },
      {
        name: 'auth',
        ttl: 60000,
        limit: 1000,    // 10 req/min para endpoints de autenticación sensibles
      },
      {
        name: 'webhook',
        ttl: 60000,
        limit: 1000,   // 200 req/min para webhooks de IA (webchat)
      },
    ]),
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
        autoLoadEntities: true,
        // synchronize se controla con DB_SYNCHRONIZE (ver main.ts para la guardia de producción)
        synchronize: configService.get<string>('DB_SYNCHRONIZE', 'true') === 'true' && configService.get<string>('NODE_ENV') !== 'production',
      }),
      inject: [ConfigService],
    }),
    TenancyModule,
    PlansModule,
    TenantsModule,
    SubscriptionsModule,
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
    TicketsModule,
    TicketInteractionsModule,
    ReportsModule,
    ConversationsModule,
    RagModule,
    WebchatModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // ThrottlerGuard global: aplica rate limiting a todos los endpoints
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements OnApplicationBootstrap, NestModule {
  private readonly logger = new Logger('AppModule');

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }

  constructor(private readonly dataSource: DataSource) { }


  async onApplicationBootstrap() {
    this.logger.log('Running automatic data migration...');
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // 1. Check if the table "companies" exists
      const tableExists = await queryRunner.hasTable('companies');
      if (!tableExists) {
        this.logger.log('Companies table does not exist yet. Skipping migration for now.');
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
          this.logger.log(`Created company "${empresaName}" with ID ${companyId}`);
        } else {
          companyId = companyRow[0].id;
        }

        // Link clients
        await queryRunner.query(
          'UPDATE clients SET "companyId" = $1 WHERE empresa = $2 AND "companyId" IS NULL',
          [companyId, row.empresa]
        );
        this.logger.log(`Linked clients with empresa "${row.empresa}" to company ID ${companyId}`);
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
        this.logger.log(`Linked opportunity ${opp.id} to company ID ${opp.companyId}`);

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
          this.logger.log(`Associated contact ${opp.cliente_id} to opportunity ${opp.id} in opportunity_contacts`);
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
        this.logger.log(`Linked activity ${act.id} to company ID ${act.companyId}`);

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
          this.logger.log(`Associated contact ${act.clientId} to activity ${act.id} in activity_contacts`);
        }
      }

    } catch (err) {
      this.logger.error('Error running automatic migration:', err);
    } finally {
      await queryRunner.release();
    }
  }
}

