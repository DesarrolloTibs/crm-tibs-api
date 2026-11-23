import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { MulterModule } from '@nestjs/platform-express';
import { Expense } from './entities/expense.entity';
import { ClientsModule } from '../clients/clients.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { UsersModule } from '../users/users.module';
import { StorageModule } from '../storage/storage.module';
import {
    assertSafeUploadParamId,
    createDiskMulterOptions,
} from '../common/utils/upload.util';

@Module({
    imports: [
        TypeOrmModule.forFeature([Expense]),
        ClientsModule,
        OpportunitiesModule,
        UsersModule,
        StorageModule,
        MulterModule.register(
            createDiskMulterOptions({
                resolveDestination: (req) => {
                    const expenseId = assertSafeUploadParamId((req.params as any)?.id, 'Expense ID');
                    return `./uploads/expenses/${expenseId}`;
                },
                mode: 'receipt',
                maxFileSizeBytes: 15 * 1024 * 1024,
            }),
        ),
    ],
    controllers: [ExpensesController],
    providers: [ExpensesService],
    exports: [ExpensesService],
})
export class ExpensesModule { }
