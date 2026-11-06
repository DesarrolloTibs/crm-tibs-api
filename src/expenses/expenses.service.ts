import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { Expense } from './entities/expense.entity';
import { Client } from '../clients/entities/client.entity';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../role.enum';
import { UsersService } from '../users/users.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

@Injectable()
export class ExpensesService implements OnModuleInit {
    private readonly logger = new Logger('ExpensesService');

    constructor(
        @InjectRepository(Expense)
        private expensesRepository: Repository<Expense>,
        private readonly usersService: UsersService,
    ) { }

    async onModuleInit() {
        try {
            const tenants = await this.expensesRepository.query(`SELECT schema_name FROM public.tenants WHERE is_active = true`).catch(() => []);
            for (const t of tenants) {
                await this.expensesRepository.query(
                    `ALTER TABLE "${t.schema_name}".expenses DROP CONSTRAINT IF EXISTS expenses_usuario_id_fkey;`
                ).catch(() => null);
            }
            await this.expensesRepository.query(
                `ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_usuario_id_fkey;`
            ).catch(() => null);
        } catch (e) {}
    }

    private formatExpense(expense: Expense): Expense {
        if (expense.client && !expense.client_id) {
            expense.client_id = expense.client.id;
        }
        if (expense.opportunity && !expense.opportunity_id) {
            expense.opportunity_id = expense.opportunity.id;
        }
        if (expense.usuario && !expense.usuario_id) {
            expense.usuario_id = expense.usuario.id;
        }
        return expense;
    }

    async create(createExpenseDto: CreateExpenseDto, user: any): Promise<Expense> {
        const { client_id, opportunity_id, ...expenseData } = createExpenseDto;

        // Validar lógica XOR: Debe tener client_id O opportunity_id, pero no ambos ni ninguno.
        if ((client_id && opportunity_id) || (!client_id && !opportunity_id)) {
            throw new BadRequestException(
                'El gasto debe estar asociado a un Cliente O a una Oportunidad, pero no a ambos ni a ninguno.',
            );
        }

        const userId = user ? (user.id || user.userId) : null;
        const tenantSchema = TenantContextService.getTenantSchema() || 'public';

        // Asegurarse de quitar la restricción FK en el esquema actual si existe
        await this.expensesRepository.query(
            `ALTER TABLE "${tenantSchema}".expenses DROP CONSTRAINT IF EXISTS expenses_usuario_id_fkey;`
        ).catch(() => null);

        if (userId && tenantSchema !== 'public') {
            try {
                await this.expensesRepository.query(`
                    INSERT INTO "${tenantSchema}".users (id, username, email, password, role, "isActive")
                    SELECT id, username, email, password, role, "isActive"
                    FROM public.users
                    WHERE id::text = $1
                    ON CONFLICT (id) DO UPDATE SET
                        username = EXCLUDED.username,
                        email = EXCLUDED.email,
                        role = EXCLUDED.role,
                        "isActive" = EXCLUDED."isActive";
                `, [userId]).catch(() => null);
            } catch (e) {
                // Silenciosamente capturar
            }
        }

        const newExpense = this.expensesRepository.create({
            ...expenseData,
            client_id: client_id || null,
            opportunity_id: opportunity_id || null,
            usuario_id: userId,
        });

        const saved = await this.expensesRepository.save(newExpense);
        return this.findOne(saved.id);
    }

    async findAll(user: any): Promise<Expense[]> {
        const userId = user ? (user.id || user.userId) : null;
        let userRole = user ? user.role : null;

        if (!userRole && userId) {
            try {
                const fullUser = await this.usersService.findOneById(userId);
                userRole = fullUser ? fullUser.role : null;
            } catch (e) {
                // Silenciosamente capturar si el usuario no se encuentra en el esquema local
            }
        }

        const query = this.expensesRepository.createQueryBuilder('expense')
            .leftJoinAndSelect('expense.client', 'client')
            .leftJoinAndSelect('expense.opportunity', 'opportunity')
            .leftJoinAndSelect('expense.usuario', 'usuario')
            .orderBy('expense.fecha', 'DESC');

        const isAdminOrSuper = userRole === Role.Admin || userRole === Role.SuperAdmin || (userRole as string) === 'superadmin';

        if (!isAdminOrSuper && userId) {
            query.where('expense.usuario_id = :userId', { userId });
        }

        const expenses = await query.getMany();
        return expenses.map((exp) => this.formatExpense(exp));
    }

    async findOne(id: string): Promise<Expense> {
        const expense = await this.expensesRepository.findOne({
            where: { id },
            relations: ['client', 'opportunity', 'usuario'],
        });

        if (!expense) {
            throw new NotFoundException(`Expense with ID ${id} not found`);
        }

        return this.formatExpense(expense);
    }

    async update(id: string, updateExpenseDto: UpdateExpenseDto): Promise<Expense> {
        const expense = await this.findOne(id);

        const { client_id, opportunity_id, ...updateData } = updateExpenseDto;

        // Lógica de actualización de relaciones si se enviaron en el DTO
        if (client_id !== undefined || opportunity_id !== undefined) {
            const currentClientId = expense.client_id || (expense.client ? expense.client.id : null);
            const currentOppId = expense.opportunity_id || (expense.opportunity ? expense.opportunity.id : null);

            let newClientId: string | null = null;
            let newOpportunityId: string | null = null;

            if (client_id !== undefined && opportunity_id !== undefined) {
                newClientId = client_id;
                newOpportunityId = opportunity_id;
            } else if (client_id !== undefined) {
                newClientId = client_id;
                newOpportunityId = newClientId ? null : currentOppId;
            } else if (opportunity_id !== undefined) {
                newOpportunityId = opportunity_id;
                newClientId = newOpportunityId ? null : currentClientId;
            }

            if ((newClientId && newOpportunityId) || (!newClientId && !newOpportunityId)) {
                throw new BadRequestException(
                    'La actualización resultaría en un estado inválido: El gasto debe estar asociado a un Cliente O a una Oportunidad.',
                );
            }

            if (newClientId) {
                expense.client_id = newClientId;
                expense.client = { id: newClientId } as Client;
                expense.opportunity_id = null;
                expense.opportunity = null;
            } else if (newOpportunityId) {
                expense.opportunity_id = newOpportunityId;
                expense.opportunity = { id: newOpportunityId } as Opportunity;
                expense.client_id = null;
                expense.client = null;
            }
        }

        Object.assign(expense, updateData);

        await this.expensesRepository.save(expense);
        return this.findOne(id);
    }

    async remove(id: string): Promise<void> {
        const expense = await this.findOne(id);
        await this.expensesRepository.remove(expense);
    }

    async uploadReceipt(id: string, receiptUrl: string): Promise<Expense> {
        const expense = await this.findOne(id);

        // Eliminar archivo antiguo si existe
        if (expense.receiptUrl) {
            const oldPath = `.${expense.receiptUrl}`;
            if (fs.existsSync(oldPath)) {
                try {
                    fs.unlinkSync(oldPath);
                } catch (error) {
                    this.logger.error(`Failed to delete old receipt: ${oldPath} — ${error.message}`);
                }
            }
        }

        expense.receiptUrl = receiptUrl;
        await this.expensesRepository.save(expense);
        return this.findOne(id);
    }

    async removeReceipt(id: string): Promise<Expense> {
        const expense = await this.findOne(id);

        if (expense.receiptUrl) {
            const filePath = `.${expense.receiptUrl}`;
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (error) {
                    this.logger.error(`Failed to delete receipt: ${filePath} — ${error.message}`);
                }
            }
            expense.receiptUrl = null;
            await this.expensesRepository.save(expense);
            return this.findOne(id);
        }

        return expense;
    }

    async getReceiptPath(id: string): Promise<string> {
        const expense = await this.findOne(id);
        if (!expense.receiptUrl) {
            throw new NotFoundException(`Receipt not found for expense with ID "${id}"`);
        }
        return expense.receiptUrl;
    }
}
