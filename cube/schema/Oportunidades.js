cube(`Oportunidades`, {
  sql: `SELECT * FROM opportunities`,

  joins: {
    Clientes: {
      sql: `${CUBE}.cliente_id = ${Clientes}.id`,
      relationship: `belongsTo`
    },
    Usuarios: {
      sql: `${CUBE}.ejecutivo_id = ${Usuarios}.id`,
      relationship: `belongsTo`
    },
    Productos: {
      sql: `${CUBE}.id IN (SELECT "opportunitiesId" FROM opportunity_products WHERE "productsId" = ${Productos}.id)`,
      relationship: `belongsTo`
    }
  },

  measures: {
    count: {
      type: `count`,
      drillMembers: [id, nombreProyecto]
    },

    montoTotalSum: {
      type: `sum`,
      sql: `monto_total`
    },

    montoLicenciamientoSum: {
      type: `sum`,
      sql: `monto_licenciamiento`
    },

    montoServiciosSum: {
      type: `sum`,
      sql: `monto_servicios`
    }
  },

  dimensions: {
    id: {
      sql: `id`,
      type: `string`,
      primaryKey: true
    },

    nombreProyecto: {
      sql: `nombre_proyecto`,
      type: `string`
    },

    descripcion: {
      sql: `description`,
      type: `string`
    },

    clienteId: {
      sql: `cliente_id`,
      type: `string`
    },

    ejecutivoId: {
      sql: `ejecutivo_id`,
      type: `string`
    },

    pipelineId: {
      sql: `pipeline_id`,
      type: `string`
    },

    stageId: {
      sql: `stage_id`,
      type: `string`
    },

    montoTotal: {
      sql: `monto_total`,
      type: `number`
    },

    moneda: {
      sql: `moneda`,
      type: `string`
    },

    archived: {
      sql: `archived`,
      type: `boolean`
    },

    estimatedClosureDate: {
      sql: `estimated_closure_date`,
      type: `time`
    },

    createdAt: {
      sql: `"createdAt"`,
      type: `time`
    },

    priority: {
      sql: `priority`,
      type: `number`
    }
  },

  dataSource: `default`
});
