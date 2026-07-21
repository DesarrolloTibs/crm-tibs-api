cube(`Tickets`, {
  sql: `SELECT * FROM tickets`,

  joins: {
    Clientes: {
      sql: `${CUBE}.cliente_id = ${Clientes}.id`,
      relationship: `belongsTo`
    },
    Usuarios: {
      sql: `${CUBE}.responsable_id = ${Usuarios}.id`,
      relationship: `belongsTo`
    },
    EtapasTicket: {
      sql: `${CUBE}.stage_id = ${EtapasTicket}.id`,
      relationship: `belongsTo`
    }
  },

  measures: {
    count: {
      type: `count`,
      drillMembers: [id, titulo]
    }
  },

  dimensions: {
    id: {
      sql: `id`,
      type: `string`,
      primaryKey: true
    },

    ticketNumber: {
      sql: `ticket_number`,
      type: `number`
    },

    titulo: {
      sql: `strtitle`,
      type: `string`
    },

    tipoIncidencia: {
      sql: `tipo_incidencia`,
      type: `string`
    },

    description: {
      sql: `description`,
      type: `string`
    },

    priority: {
      sql: `priority`,
      type: `number`
    },

    fechaApertura: {
      sql: `fecha_apertura`,
      type: `time`
    },

    fechaCierre: {
      sql: `fecha_cierre`,
      type: `time`
    },

    notasResolucion: {
      sql: `notas_resolucion`,
      type: `string`
    },

    alertSent: {
      sql: `alert_sent`,
      type: `boolean`
    },

    archived: {
      sql: `archived`,
      type: `boolean`
    },

    clienteId: {
      sql: `cliente_id`,
      type: `string`
    },

    responsableId: {
      sql: `responsable_id`,
      type: `string`
    },

    helpdeskId: {
      sql: `helpdesk_id`,
      type: `string`
    },

    stageId: {
      sql: `stage_id`,
      type: `string`
    },

    stageEnteredAt: {
      sql: `stage_entered_at`,
      type: `time`
    },

    contactName: {
      sql: `"contactName"`,
      type: `string`
    },

    contactEmail: {
      sql: `"contactEmail"`,
      type: `string`
    }
  },

  dataSource: `default`
});
