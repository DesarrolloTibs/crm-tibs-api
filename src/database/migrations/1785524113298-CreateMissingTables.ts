import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMissingTables1785524113298 implements MigrationInterface {
    name = 'CreateMissingTables1785524113298'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "opportunity_products" DROP CONSTRAINT "FK_e2b04ed8894036ddf3e58a60524"`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" DROP CONSTRAINT "FK_acd4236ae7de9dab4b95d88c495"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_acd4236ae7de9dab4b95d88c49"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e2b04ed8894036ddf3e58a6052"`);
        await queryRunner.query(`CREATE TABLE "plans" ("plan_id" SERIAL NOT NULL, "plan_name" character varying(100) NOT NULL, "price" numeric(10,2) NOT NULL DEFAULT '0', "tokens_limit" bigint NOT NULL DEFAULT '0', "billing_period_months" integer NOT NULL DEFAULT '1', "blnstatus" boolean NOT NULL DEFAULT true, "dtmcreated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "dtmlastmodified" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_084714de33798c5b96f12725f7e" PRIMARY KEY ("plan_id"))`);
        await queryRunner.query(`CREATE TABLE "tenants" ("id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "schema_name" character varying(63) NOT NULL, "plan_id" integer, "next_renewal_date" TIMESTAMP WITH TIME ZONE, "is_active" boolean NOT NULL DEFAULT true, "allow_extra" boolean NOT NULL DEFAULT false, "logo" character varying(512), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_c2a961556326eec0e3b19f3ced5" UNIQUE ("schema_name"), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "tenant_renewal_queue" ("id" SERIAL NOT NULL, "tenant_id" character varying(63) NOT NULL, "plan_id" integer NOT NULL, "billing_period_months" integer NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0b5219ff2950ff66c9d8f23db09" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "transaction_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "prompt_tokens" integer NOT NULL DEFAULT '0', "completion_tokens" integer NOT NULL DEFAULT '0', "total_tokens" integer NOT NULL DEFAULT '0', "fecha_procesamiento" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "is_extra" boolean NOT NULL DEFAULT false, "action_name" character varying(255), CONSTRAINT "PK_1e2444ea77f6b5952b4ab7cb9a2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "requiere_analisis"`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" DROP CONSTRAINT "PK_5db3d9687161e2da74c41adff02"`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" ADD CONSTRAINT "PK_e2b04ed8894036ddf3e58a60524" PRIMARY KEY ("productsId")`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" DROP COLUMN "opportunitiesId"`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" DROP CONSTRAINT "PK_e2b04ed8894036ddf3e58a60524"`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" DROP COLUMN "productsId"`);
        await queryRunner.query(`ALTER TABLE "products" ADD "unidadMedida" text NOT NULL DEFAULT 'Pieza'`);
        await queryRunner.query(`ALTER TABLE "products" ADD "observaciones" text`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" ADD CONSTRAINT "PK_b6dc230738166b79452dd8dcd54" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" ADD "opportunityId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" ADD "productId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" ADD "cantidad" numeric(10,2) NOT NULL DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "conversations" ADD "summary" text`);
        await queryRunner.query(`ALTER TABLE "ai_sub_agents" ADD "temperature" double precision NOT NULL DEFAULT '0.7'`);
        await queryRunner.query(`ALTER TABLE "ai_agent_configs" ADD "openaiEmbeddingModel" character varying(100) NOT NULL DEFAULT 'text-embedding-ada-002'`);
        await queryRunner.query(`ALTER TABLE "ai_agent_configs" ADD "watsonxEmbeddingModel" character varying(100) NOT NULL DEFAULT 'ibm/slate-125m-english-rtrvr'`);
        await queryRunner.query(`ALTER TABLE "ai_agent_configs" ADD "maxNewTokens" integer NOT NULL DEFAULT '2048'`);
        await queryRunner.query(`ALTER TABLE "ai_agent_configs" ADD "historyMessageLimit" integer NOT NULL DEFAULT '10'`);
        await queryRunner.query(`ALTER TYPE "public"."users_role_enum" RENAME TO "users_role_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('superadmin', 'admin', 'executive')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING "role"::"text"::"public"."users_role_enum"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'executive'`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum_old"`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" ADD CONSTRAINT "FK_d64e2b99803fd0de5f48b40202d" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" ADD CONSTRAINT "FK_71f53a0a0d3d828a4b24e81a64e" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenants" ADD CONSTRAINT "FK_919d143d2411832db812bbc600e" FOREIGN KEY ("plan_id") REFERENCES "plans"("plan_id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_renewal_queue" ADD CONSTRAINT "FK_5b319b263e6a648b59823492780" FOREIGN KEY ("plan_id") REFERENCES "plans"("plan_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_renewal_queue" DROP CONSTRAINT "FK_5b319b263e6a648b59823492780"`);
        await queryRunner.query(`ALTER TABLE "tenants" DROP CONSTRAINT "FK_919d143d2411832db812bbc600e"`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" DROP CONSTRAINT "FK_71f53a0a0d3d828a4b24e81a64e"`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" DROP CONSTRAINT "FK_d64e2b99803fd0de5f48b40202d"`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum_old" AS ENUM('admin', 'executive')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum_old" USING "role"::"text"::"public"."users_role_enum_old"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'executive'`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."users_role_enum_old" RENAME TO "users_role_enum"`);
        await queryRunner.query(`ALTER TABLE "ai_agent_configs" DROP COLUMN "historyMessageLimit"`);
        await queryRunner.query(`ALTER TABLE "ai_agent_configs" DROP COLUMN "maxNewTokens"`);
        await queryRunner.query(`ALTER TABLE "ai_agent_configs" DROP COLUMN "watsonxEmbeddingModel"`);
        await queryRunner.query(`ALTER TABLE "ai_agent_configs" DROP COLUMN "openaiEmbeddingModel"`);
        await queryRunner.query(`ALTER TABLE "ai_sub_agents" DROP COLUMN "temperature"`);
        await queryRunner.query(`ALTER TABLE "conversations" DROP COLUMN "summary"`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" DROP COLUMN "cantidad"`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" DROP COLUMN "productId"`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" DROP COLUMN "opportunityId"`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" DROP CONSTRAINT "PK_b6dc230738166b79452dd8dcd54"`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "observaciones"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "unidadMedida"`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" ADD "productsId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" ADD CONSTRAINT "PK_e2b04ed8894036ddf3e58a60524" PRIMARY KEY ("productsId")`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" ADD "opportunitiesId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" DROP CONSTRAINT "PK_e2b04ed8894036ddf3e58a60524"`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" ADD CONSTRAINT "PK_5db3d9687161e2da74c41adff02" PRIMARY KEY ("opportunitiesId", "productsId")`);
        await queryRunner.query(`ALTER TABLE "products" ADD "requiere_analisis" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`DROP TABLE "transaction_history"`);
        await queryRunner.query(`DROP TABLE "tenant_renewal_queue"`);
        await queryRunner.query(`DROP TABLE "tenants"`);
        await queryRunner.query(`DROP TABLE "plans"`);
        await queryRunner.query(`CREATE INDEX "IDX_e2b04ed8894036ddf3e58a6052" ON "opportunity_products" ("productsId") `);
        await queryRunner.query(`CREATE INDEX "IDX_acd4236ae7de9dab4b95d88c49" ON "opportunity_products" ("opportunitiesId") `);
        await queryRunner.query(`ALTER TABLE "opportunity_products" ADD CONSTRAINT "FK_acd4236ae7de9dab4b95d88c495" FOREIGN KEY ("opportunitiesId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "opportunity_products" ADD CONSTRAINT "FK_e2b04ed8894036ddf3e58a60524" FOREIGN KEY ("productsId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

}
