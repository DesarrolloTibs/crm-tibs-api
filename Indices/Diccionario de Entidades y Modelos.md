---
title: Diccionario de Entidades y Modelos - CRM TIBS API
tags:
  - "#indices-ai"
  - "#modelos"
  - "#typescript"
  - "#entidades"
  - "#typeorm"
  - "#backend"
date: 2026-09-08
status: produccion
---

# 📖 Diccionario de Entidades, Modelos y DTOs

Este documento compila las principales entidades de TypeORM, interfaces de TypeScript, enumeraciones y Data Transfer Objects (DTOs) utilizados en los módulos de **CRM TIBS API**.

---

## 1. Multi-Tenancy, Planes & Suscripciones (`src/tenants`, `src/plans`, `src/subscriptions`)

### 1.1. Tenant (`Tenant` - `public.tenants`)
```typescript
@Entity('tenants', { schema: 'public' })
export class Tenant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 150, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 63, unique: true })
  schema_name: string;

  @Column({ type: 'int', nullable: true })
  plan_id: number;

  @ManyToOne(() => Plan, { nullable: true, eager: true })
  @JoinColumn({ name: 'plan_id' })
  plan: Plan;

  @Column({ type: 'timestamptz', nullable: true })
  planned_date: Date;

  @Column({ type: 'timestamptz', nullable: true })
  next_renewal_date: Date;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'boolean', default: false })
  allow_extra: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logo: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
```

### 1.2. Plan (`Plan` - `public.plans`)
```typescript
@Entity('plans', { schema: 'public' })
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ type: 'int', default: 1 })
  billing_period_months: number;

  @Column({ type: 'int', default: 50000 })
  tokens_limit: number;

  @Column({ type: 'jsonb', nullable: true })
  features: Record<string, any>;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;
}
```

---

## 2. Usuarios, Roles & Autenticación (`src/users`, `src/auth`)

### 2.1. RoleEnum (`src/role.enum.ts`)
```typescript
export enum Role {
  SUPERADMIN = 'superadmin', // Residente exclusivo en public.users
  ADMIN = 'admin',           // Administrador de inquilino
  EXECUTIVE = 'executive',   // Ejecutivo comercial / soporte
}
```

### 2.2. User (`User` - `users`)
```typescript
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  username: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Column({ type: 'varchar', length: 20, default: 'executive' })
  role: Role;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  profileImageUrl: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reset_password_token: string;

  @Column({ type: 'timestamptz', nullable: true })
  reset_password_expires: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

---

## 3. Clientes, Empresas & CRM (`src/clients`, `src/companies`, `src/activities`, `src/interactions`)

### 3.1. Company (`Company` - `companies`)
```typescript
@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  nombre: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  rfc: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  telefono: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sitio_web: string;

  @Column({ type: 'text', nullable: true })
  direccion: string;

  @Column({ type: 'boolean', default: true })
  estatus: boolean;

  @OneToMany(() => Client, (client) => client.company)
  clients: Client[];
}
```

### 3.2. Client (`Client` - `clients`)
```typescript
@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  nombre: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  telefono: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  empresa: string;

  @Column({ type: 'uuid', nullable: true })
  companyId: string;

  @ManyToOne(() => Company, (company) => company.clients, { nullable: true, onDelete: 'SET NULL' })
  company: Company;

  @Column({ type: 'boolean', default: true })
  estatus: boolean;
}
```

### 3.3. Activity (`Activity` - `activities`)
```typescript
@Entity('activities')
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  @Column({ type: 'timestamptz' })
  fecha_hora: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fecha_fin: Date;

  @Column({ type: 'varchar', length: 30, default: 'pendiente' })
  estado: 'pendiente' | 'completada' | 'cancelada';

  @Column({ type: 'uuid', nullable: true })
  typeActivityId: string;

  @Column({ type: 'uuid', nullable: true })
  clientId: string;

  @Column({ type: 'uuid', nullable: true })
  companyId: string;

  @Column({ type: 'uuid', nullable: true })
  opportunityId: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalEventId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  externalProvider: 'google' | 'outlook' | 'icloud' | null;

  @Column({ type: 'timestamptz', nullable: true })
  externalLastSyncedAt: Date;
}
```

---

## 4. Oportunidades, Pipelines & Cotizaciones (`src/opportunities`, `src/pipelines`, `src/stages`)

### 4.1. StageTypeEnum
```typescript
export enum StageType {
  OPEN = 0, // Etapa intermedia de negociación
  WON = 1,  // Etapa de éxito / ganada
  LOST = 2, // Etapa de pérdida / cancelada
}
```

### 4.2. Opportunity (`Opportunity` - `opportunities`)
```typescript
@Entity('opportunities')
export class Opportunity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  nombre: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  valor_estimado: number;

  @Column({ type: 'timestamptz', nullable: true })
  fecha_cierre_esperada: Date;

  @Column({ type: 'uuid' })
  cliente_id: string;

  @Column({ type: 'uuid', nullable: true })
  companyId: string;

  @Column({ type: 'uuid' })
  pipeline_id: string;

  @Column({ type: 'uuid' })
  etapa_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'boolean', default: false })
  archived: boolean;

  @OneToMany(() => OpportunityProduct, (op) => op.opportunity, { cascade: true })
  products: OpportunityProduct[];

  @ManyToMany(() => Client)
  @JoinTable({ name: 'opportunity_contacts' })
  contacts: Client[];

  @OneToMany(() => OpportunityFile, (of) => of.opportunity)
  files: OpportunityFile[];
}
```

---

## 5. Tickets & Mesa de Ayuda (`src/tickets`, `src/ticket-interactions`)

### 5.1. Ticket (`Ticket` - `tickets`)
```typescript
@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  folio: string;

  @Column({ type: 'varchar', length: 255 })
  asunto: string;

  @Column({ type: 'text' })
  descripcion: string;

  @Column({ type: 'varchar', length: 20, default: 'media' })
  prioridad: 'baja' | 'media' | 'alta' | 'urgente';

  @Column({ type: 'uuid' })
  helpdesk_id: string;

  @Column({ type: 'uuid' })
  stage_id: string;

  @Column({ type: 'uuid', nullable: true })
  assigned_user_id: string;

  @Column({ type: 'uuid', nullable: true })
  client_id: string;

  @Column({ type: 'uuid', nullable: true })
  company_id: string;

  @Column({ type: 'timestamptz', nullable: true })
  sla_due_date: Date;

  @CreateDateColumn()
  created_at: Date;
}
```

---

## 6. Inteligencia Artificial, RAG & Conversaciones (`src/conversations`, `src/rag`)

### 6.1. AiAgentConfig (`AiAgentConfig` - `ai_agent_configs`)
```typescript
@Entity('ai_agent_configs')
export class AiAgentConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, default: 'Agente CRM' })
  agent_name: string;

  @Column({ type: 'text' })
  system_prompt: string;

  @Column({ type: 'varchar', length: 50, default: 'gemini-1.5-pro' })
  model_name: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.7 })
  temperature: number;

  @Column({ type: 'int', default: 2048 })
  max_tokens: number;

  @Column({ type: 'varchar', length: 50, default: 'google' })
  provider: 'google' | 'openai' | 'watsonx';

  @Column({ type: 'text', nullable: true })
  api_key: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;
}
```

### 6.2. Conversation (`Conversation` - `conversations`)
```typescript
@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  contact_identifier: string; // Teléfono E.164 o SessionID de Webchat

  @Column({ type: 'varchar', length: 150, nullable: true })
  contact_name: string;

  @Column({ type: 'varchar', length: 30, default: 'webchat' })
  channel: 'webchat' | 'whatsapp' | 'api';

  @Column({ type: 'boolean', default: true })
  bot_active: boolean;

  @Column({ type: 'uuid', nullable: true })
  assigned_user_id: string;

  @Column({ type: 'uuid', nullable: true })
  client_id: string;

  @Column({ type: 'int', default: 0 })
  unread_count: number;

  @OneToMany(() => Message, (msg) => msg.conversation)
  messages: Message[];
}
```

---

## 7. Integraciones de Calendario (`src/calendar-integrations`)

### 7.1. UserCalendarIntegration (`user_calendar_integrations`)
```typescript
@Entity('user_calendar_integrations')
export class UserCalendarIntegration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  provider: 'google' | 'outlook' | 'icloud';

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'text', nullable: true })
  accessToken: string;

  @Column({ type: 'text', nullable: true })
  refreshToken: string;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  calendarId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  webhookSubscriptionId: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  syncToken: string;
}
```

---

## 8. Enlaces Relacionados
* [[CRM TIBS API]] — Hub Central del Backend.
* [[Matriz de Endpoints y Servicios]] — Relación de DTOs y entidades con controladores REST.
* [[CRM TIBS - Database Schema & Data Models]] — DDL completo y diagramas de entidades.
