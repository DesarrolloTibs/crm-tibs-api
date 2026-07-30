# Directorio de Migraciones TypeORM

Este directorio contiene los archivos de migración generados por el CLI de TypeORM.

## Comandos disponibles

```bash
# Generar una nueva migración (detecta diferencias entre entidades y BD actual)
npm run migration:generate -- src/database/migrations/NombreDeLaMigracion

# Aplicar todas las migraciones pendientes
npm run migration:run

# Revertir la última migración aplicada
npm run migration:revert

# Ver el estado de las migraciones (cuáles están aplicadas y cuáles no)
npm run migration:show
```

## Convención de Nombres

Los archivos de migración siguen el formato: `{timestamp}-{NombreCamelCase}.ts`

Ejemplo: `1720000000000-AddCompanyTable.ts`

## Notas

- Las migraciones aplican al esquema `public` (entidades globales: tenants, plans, subscriptions, users superadmin).
- Los esquemas de cada tenant se crean y mantienen por `TenantProvisionerService`.
- Nunca editar manualmente los archivos de migración generados automáticamente.
- Siempre revisar el SQL generado antes de ejecutar `migration:run` en producción.
