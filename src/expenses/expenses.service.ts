import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import * as fs from 'fs';
import type { Response } from 'express';
import { join } from 'path';
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
import { StorageService } from '../storage/storage.service';

@Injectable()
export class ExpensesService implements OnModuleInit {
    private readonly logger = new Logger('ExpensesService');

    constructor(
        @InjectRepository(Expense)
        private expensesRepository: Repository<Expense>,
        private readonly usersService: UsersService,
        @Optional()
        private readonly storageService?: StorageService,
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

    private async assertExpenseAccess(expense: Expense, user?: any): Promise<void> {
        if (!user) return;
        const userId = user.id || user.userId;
        let userRole = user.role;
        if (!userRole && userId) {
            try {
                const fullUser = await this.usersService.findOneById(userId);
                userRole = fullUser?.role;
            } catch {
                // fallback silently
            }
        }
        const isAdminOrSuper = userRole === Role.Admin || userRole === Role.SuperAdmin || (userRole as string) === 'superadmin';
        if (!isAdminOrSuper && userId && expense.usuario_id && expense.usuario_id !== userId) {
            throw new ForbiddenException('No tienes permiso para acceder o modificar este gasto.');
        }
    }

    async create(createExpenseDto: CreateExpenseDto, user: any): Promise<Expense> {
        const { client_id, opportunity_id, ...expenseData } = createExpenseDto;

        // Validar lógica XOR: Debe tener client_id O opportunity_id, pero no ambos ni ninguno.
        if ((client_id && opportunity_id) || (!client_id && !opportunity_id)) {
            throw new BadRequestException(
                'El gasto debe estar asociado a un Cliente O a una Oportunidad, pero no a ambos ni a ninguno.',
            );
        }

        if (expenseData.monto !== undefined && (isNaN(Number(expenseData.monto)) || Number(expenseData.monto) <= 0)) {
            throw new BadRequestException('El monto del gasto debe ser mayor a 0.');
        }

        if (client_id) {
            const clientExists = await this.expensesRepository.manager.getRepository(Client).findOne({ where: { id: client_id } });
            if (!clientExists) {
                throw new NotFoundException(`Cliente con ID "${client_id}" no encontrado.`);
            }
        }
        if (opportunity_id) {
            const oppExists = await this.expensesRepository.manager.getRepository(Opportunity).findOne({ where: { id: opportunity_id } });
            if (!oppExists) {
                throw new NotFoundException(`Oportunidad con ID "${opportunity_id}" no encontrada.`);
            }
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

    async findOne(id: string, user?: any): Promise<Expense> {
        const expense = await this.expensesRepository.findOne({
            where: { id },
            relations: ['client', 'opportunity', 'usuario'],
        });

        if (!expense) {
            throw new NotFoundException(`Expense with ID ${id} not found`);
        }

        await this.assertExpenseAccess(expense, user);
        return this.formatExpense(expense);
    }

    async update(id: string, updateExpenseDto: UpdateExpenseDto, user?: any): Promise<Expense> {
        const expense = await this.findOne(id, user);

        const { client_id, opportunity_id, ...updateData } = updateExpenseDto;

        if (updateData.monto !== undefined && (isNaN(Number(updateData.monto)) || Number(updateData.monto) <= 0)) {
            throw new BadRequestException('El monto del gasto debe ser mayor a 0.');
        }

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
                const clientExists = await this.expensesRepository.manager.getRepository(Client).findOne({ where: { id: newClientId } });
                if (!clientExists) {
                    throw new NotFoundException(`Cliente con ID "${newClientId}" no encontrado.`);
                }
                expense.client_id = newClientId;
                expense.client = { id: newClientId } as Client;
                expense.opportunity_id = null;
                expense.opportunity = null;
            } else if (newOpportunityId) {
                const oppExists = await this.expensesRepository.manager.getRepository(Opportunity).findOne({ where: { id: newOpportunityId } });
                if (!oppExists) {
                    throw new NotFoundException(`Oportunidad con ID "${newOpportunityId}" no encontrada.`);
                }
                expense.opportunity_id = newOpportunityId;
                expense.opportunity = { id: newOpportunityId } as Opportunity;
                expense.client_id = null;
                expense.client = null;
            }
        }

        Object.assign(expense, updateData);

        await this.expensesRepository.save(expense);
        return this.findOne(id, user);
    }

    async remove(id: string, user?: any): Promise<void> {
        const expense = await this.findOne(id, user);
        if (expense.receiptUrl) {
            if (this.storageService) {
                await this.storageService.deleteFile(expense.receiptUrl);
            } else {
                const filePath = `.${expense.receiptUrl}`;
                if (fs.existsSync(filePath)) {
                    try { fs.unlinkSync(filePath); } catch {}
                }
            }
        }
        await this.expensesRepository.remove(expense);
    }

    async uploadReceiptFile(id: string, file: Express.Multer.File, user?: any): Promise<Expense> {
        if (!file) {
            throw new BadRequestException('Se requiere un archivo de comprobante.');
        }
        const expense = await this.findOne(id, user);
        const relativePath = file.path.replace(/\\/g, '/');
        const storedUrl = this.storageService
            ? await this.storageService.uploadFile(file.path, `/${relativePath}`)
            : `/${relativePath}`;
        return this.uploadReceipt(expense.id, storedUrl);
    }

    async uploadReceipt(id: string, receiptUrl: string): Promise<Expense> {
        const expense = await this.findOne(id);

        // Eliminar archivo antiguo si existe y es distinto al nuevo
        if (expense.receiptUrl && expense.receiptUrl !== receiptUrl) {
            if (this.storageService) {
                await this.storageService.deleteFile(expense.receiptUrl);
            } else {
                const oldPath = `.${expense.receiptUrl}`;
                if (fs.existsSync(oldPath)) {
                    try {
                        fs.unlinkSync(oldPath);
                    } catch (error) {
                        this.logger.error(`Failed to delete old receipt: ${oldPath} — ${error.message}`);
                    }
                }
            }
        }

        expense.receiptUrl = receiptUrl;
        await this.expensesRepository.save(expense);
        return this.findOne(id);
    }

    async removeReceipt(id: string, user?: any): Promise<Expense> {
        const expense = await this.findOne(id, user);

        if (expense.receiptUrl) {
            if (this.storageService) {
                await this.storageService.deleteFile(expense.receiptUrl);
            } else {
                const filePath = `.${expense.receiptUrl}`;
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                    } catch (error) {
                        this.logger.error(`Failed to delete receipt: ${filePath} — ${error.message}`);
                    }
                }
            }
            expense.receiptUrl = null;
            await this.expensesRepository.save(expense);
            return this.findOne(id, user);
        }

        return expense;
    }

    async downloadReceipt(id: string, res: Response, user?: any): Promise<void> {
        const filePath = await this.getReceiptPath(id, user);
        if (this.storageService) {
            return this.storageService.downloadFile(filePath, res);
        }
        const normalizedPath = filePath.replace(/\\/g, '/');
        const absolutePath = join(process.cwd(), normalizedPath);
        return res.sendFile(absolutePath);
    }

    async getReceiptPath(id: string, user?: any): Promise<string> {
        const expense = await this.findOne(id, user);
        if (!expense.receiptUrl) {
            throw new NotFoundException(`Receipt not found for expense with ID "${id}"`);
        }
        return expense.receiptUrl;
    }
}
