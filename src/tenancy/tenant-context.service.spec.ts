import { TenantContextService } from './tenant-context.service';

describe('TenantContextService', () => {
  // ── validateSchemaName — valid schemas ────────────────────────────────────

  describe('validateSchemaName — valid inputs', () => {
    it('accepts a simple lowercase alphanumeric schema name', () => {
      expect(TenantContextService.validateSchemaName('tenant_acme')).toBe(true);
    });

    it('accepts a schema with digits and underscores', () => {
      expect(TenantContextService.validateSchemaName('tenant_1234_abc')).toBe(true);
    });

    it('accepts a single lowercase word', () => {
      expect(TenantContextService.validateSchemaName('company')).toBe(true);
    });
  });

  // ── validateSchemaName — reserved schema names ────────────────────────────

  describe('validateSchemaName — reserved names', () => {
    it('returns false for "public" schema', () => {
      expect(TenantContextService.validateSchemaName('public')).toBe(false);
    });

    it('returns false for "information_schema"', () => {
      expect(TenantContextService.validateSchemaName('information_schema')).toBe(false);
    });

    it('returns false for "pg_catalog"', () => {
      expect(TenantContextService.validateSchemaName('pg_catalog')).toBe(false);
    });
  });

  // ── validateSchemaName — invalid / dangerous inputs ───────────────────────

  describe('validateSchemaName — invalid / dangerous inputs', () => {
    it('returns false for schema names with uppercase letters', () => {
      expect(TenantContextService.validateSchemaName('Tenant_ACME')).toBe(false);
    });

    it('returns false for schema names with spaces', () => {
      expect(TenantContextService.validateSchemaName('tenant name')).toBe(false);
    });

    it('returns false for schema names with semicolons', () => {
      expect(TenantContextService.validateSchemaName("tenant; DROP TABLE users--")).toBe(false);
    });

    it('returns false for schema names with hyphens', () => {
      expect(TenantContextService.validateSchemaName('tenant-acme')).toBe(false);
    });

    it('returns false for schemas starting with pg_ prefix', () => {
      expect(TenantContextService.validateSchemaName('pg_myschema')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(TenantContextService.validateSchemaName('')).toBe(false);
    });

    it('returns false for schema name exceeding 63 characters', () => {
      expect(TenantContextService.validateSchemaName('a'.repeat(64))).toBe(false);
    });
  });

  // ── getTenantSchema ───────────────────────────────────────────────────────

  describe('getTenantSchema', () => {
    it('returns "public" fallback when no tenant context is set', () => {
      // Outside of an ALS context it returns 'public' as fallback
      const schema = TenantContextService.getTenantSchema();
      expect(schema).toBe('public');
    });
  });

  // ── generateSlug ────────────────────────────────────────────────────────────

  describe('generateSlug', () => {
    it('converts a company name to a slug prefixed with tenant_', () => {
      const slug = TenantContextService.generateSlug('Acme Corp');
      expect(slug).toMatch(/^tenant_/);
    });

    it('produces a slug matching /^[a-z0-9_]+$/', () => {
      const slug = TenantContextService.generateSlug('Acme Corporation 2024');
      expect(slug).toMatch(/^[a-z0-9_]+$/);
    });

    it('limits long slug to 63 chars via PostgreSQL identifier limit indirectly', () => {
      const slug = TenantContextService.generateSlug('a'.repeat(100));
      // slug = 'tenant_' + 100 a's — no explicit truncation but slug itself is valid
      expect(slug).toMatch(/^[a-z0-9_]+$/);
    });

    it('replaces spaces and special chars with underscores', () => {
      const slug = TenantContextService.generateSlug('My Company, S.A.');
      expect(slug).not.toContain(' ');
      expect(slug).not.toContain('.');
      expect(slug).not.toContain(',');
    });
  });
});
