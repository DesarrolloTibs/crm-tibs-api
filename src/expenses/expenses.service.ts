import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class ExpensesService {
    constructor(
        @InjectRepository(Expense)
        private expensesRepository: Repository<Expense>,
        private readonly usersService: UsersService,
    ) { }

    async create(createExpenseDto: CreateExpenseDto, user: any): Promise<Expense> {
        console.log('ExpensesService.create - User:', user);
        console.log('ExpensesService.create - DTO:', createExpenseDto);
        const { client_id, opportunity_id, ...expenseData } = createExpenseDto;

        // Validate XOR logic: Either client_id OR opportunity_id, but NOT both, and NOT neither.
        if ((client_id && opportunity_id) || (!client_id && !opportunity_id)) {
            throw new BadRequestException(
                'El gasto debe estar asociado a un Cliente O a una Oportunidad, pero no a ambos ni a ninguno.',
            );
        }

        const newExpense = this.expensesRepository.create({
            ...expenseData,
            client_id,
            opportunity_id,
            usuario_id: user ? user.userId : null,
        });

        return this.expensesRepository.save(newExpense);
    }

    async findAll(user: any): Promise<Expense[]> {
        // Fetch full user to get the role, as JwtStrategy only returns userId
        const fullUser = await this.usersService.findOneById(user.userId);

        const query = this.expensesRepository.createQueryBuilder('expense')
            .leftJoinAndSelect('expense.client', 'client')
            .leftJoinAndSelect('expense.opportunity', 'opportunity')
            .leftJoinAndSelect('expense.usuario', 'usuario')
            .orderBy('expense.fecha', 'DESC');

        if (fullUser.role !== Role.Admin) {
            query.where('expense.usuario_id = :userId', { userId: fullUser.id });
        }

        return query.getMany();
    }

    async findOne(id: string): Promise<Expense> {
        const expense = await this.expensesRepository.findOne({
            where: { id },
            relations: ['client', 'opportunity', 'usuario'],
        });

        if (!expense) {
            throw new NotFoundException(`Expense with ID ${id} not found`);
        }

        return expense;
    }

    async update(id: string, updateExpenseDto: UpdateExpenseDto): Promise<Expense> {
        const expense = await this.findOne(id);

        const { client_id, opportunity_id, ...updateData } = updateExpenseDto;

        // Logic for updating relationships if provided
        if (client_id !== undefined || opportunity_id !== undefined) {
            // Determine new state
            const newClientId = client_id !== undefined ? client_id : expense.client ? expense.client.id : null;
            const newOpportunityId = opportunity_id !== undefined ? opportunity_id : expense.opportunity ? expense.opportunity.id : null;

            if ((newClientId && newOpportunityId) || (!newClientId && !newOpportunityId)) {
                throw new BadRequestException(
                    'La actualización resultaría en un estado inválido: El gasto debe estar asociado a un Cliente O a una Oportunidad.',
                );
            }

            // Update relations. Note: direct ID assignment is preferred if relations are not eager loaded or if you want to avoid overhead.
            // However, since we are using save() on the entity causing a reload, let's stick to what we have or better yet, assign IDs if possible.
            // Given previous issues, simple assignment is better contextually.
            if (client_id !== undefined) expense.client_id = client_id;
            if (opportunity_id !== undefined) expense.opportunity_id = opportunity_id;

            // We need to nullify the *other* relation if we are switching.
            // But validation above ensures we have exactly one.
            // If client_id is set, it means we want a client. We should ensure opportunity_id is null.
            if (newClientId) expense.opportunity_id = null;
            if (newOpportunityId) expense.client_id = null;
        }

        Object.assign(expense, updateData);

        return this.expensesRepository.save(expense);
    }

    async remove(id: string): Promise<void> {
        const expense = await this.findOne(id);
        await this.expensesRepository.remove(expense);
    }

    async uploadReceipt(id: string, receiptUrl: string): Promise<Expense> {
        const expense = await this.findOne(id);

        // Remove old file if exists
        if (expense.receiptUrl) {
            const oldPath = `.${expense.receiptUrl}`; // relative path to root
            if (fs.existsSync(oldPath)) {
                try {
                    fs.unlinkSync(oldPath);
                } catch (error) {
                    console.error(`Failed to delete old receipt: ${oldPath}`, error);
                }
            }
        }

        expense.receiptUrl = receiptUrl;
        return this.expensesRepository.save(expense);
    }

    async removeReceipt(id: string): Promise<Expense> {
        const expense = await this.findOne(id);

        if (expense.receiptUrl) {
            const filePath = `.${expense.receiptUrl}`;
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (error) {
                    console.error(`Failed to delete receipt: ${filePath}`, error);
                }
            }
            expense.receiptUrl = null;
            return this.expensesRepository.save(expense);
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
