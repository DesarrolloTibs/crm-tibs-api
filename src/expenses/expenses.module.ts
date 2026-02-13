import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import { Expense } from './entities/expense.entity';
import { ClientsModule } from '../clients/clients.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Expense]),
        ClientsModule,
        OpportunitiesModule,
        UsersModule,
        MulterModule.register({
            storage: diskStorage({
                destination: (req, file, cb) => {
                    const expenseId = (req.params as any).id;
                    if (!expenseId) {
                        return cb(new Error('Expense ID is missing'), '');
                    }
                    const uploadPath = `./uploads/expenses/${expenseId}`;
                    if (!fs.existsSync(uploadPath)) {
                        fs.mkdirSync(uploadPath, { recursive: true });
                    }
                    cb(null, uploadPath);
                },
                filename: (req, file, cb) => {
                    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
                    cb(null, decodedName);
                },
            }),
        }),
    ],
    controllers: [ExpensesController],
    providers: [ExpensesService],
})
export class ExpensesModule { }
