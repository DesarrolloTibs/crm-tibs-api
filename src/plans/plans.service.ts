import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';

export class CreatePlanDto {
  plan_name: string;
  price: number;
  tokens_limit: number;
  billing_period_months?: number;
  blnstatus?: boolean;
}

export class UpdatePlanDto {
  plan_name?: string;
  price?: number;
  tokens_limit?: number;
  billing_period_months?: number;
  blnstatus?: boolean;
}


@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>
  ) {}

  async findAll(): Promise<Plan[]> {
    return this.planRepository.find({ order: { plan_id: 'ASC' } });
  }

  async findOne(id: number): Promise<Plan> {
    const plan = await this.planRepository.findOne({ where: { plan_id: id } });
    if (!plan) {
      throw new NotFoundException(`Plan con ID ${id} no encontrado.`);
    }
    return plan;
  }

  async create(dto: CreatePlanDto): Promise<Plan> {
    const plan = this.planRepository.create({
      ...dto,
      billing_period_months: dto.billing_period_months ?? 1,
      blnstatus: dto.blnstatus ?? true,
    });
    return this.planRepository.save(plan);
  }

  async update(id: number, dto: UpdatePlanDto): Promise<Plan> {
    const plan = await this.findOne(id);
    Object.assign(plan, dto);
    return this.planRepository.save(plan);
  }

  async remove(id: number): Promise<{ message: string }> {
    const plan = await this.findOne(id);
    plan.blnstatus = false;
    await this.planRepository.save(plan);
    return { message: `Plan con ID ${id} desactivado correctamente.` };
  }
}
