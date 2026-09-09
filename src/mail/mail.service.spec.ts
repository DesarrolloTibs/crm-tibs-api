import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService - Notice and ICS generation', () => {
  let service: MailService;
  let mockSendMail: jest.Mock;

  beforeEach(async () => {
    mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-msg-id' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'SMTP_HOST') return 'smtp.example.com';
              if (key === 'SMTP_PORT') return 587;
              if (key === 'SMTP_USER') return 'noreply@tibs.com.mx';
              if (key === 'SMTP_PASS') return 'secret';
              if (key === 'SMTP_FROM') return '"Billy Sales & Services" <noreply@tibs.com.mx>';
              if (key === 'API_URL') return 'http://localhost:3091';
              if (key === 'FRONTEND_URL') return 'http://localhost:5173';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    (service as any).transporter = {
      sendMail: mockSendMail,
    };
  });

  it('debe generar un payload de iCalendar (.ics) válido con los campos requeridos', () => {
    const ics = (service as any).generateIcsCalendar({
      uid: 'test-uid-123',
      title: 'Reunión de demostración',
      description: 'Detalles de la reunión técnica',
      date: new Date('2026-11-01T16:00:00Z'),
      executiveName: 'Carlos Asesor',
      clientName: 'Juan Pérez',
      clientEmail: 'juan@cliente.com',
      companyName: 'Empresa Demo',
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:test-uid-123');
    expect(ics).toContain('SUMMARY:Reunión de demostración');
    expect(ics).toContain('ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=Juan Pérez:mailto:juan@cliente.com');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('debe enviar el correo de aviso con el template informativo y el archivo .ics adjunto', async () => {
    await service.sendActivityNoticeToClient(
      'juan@cliente.com',
      'Juan Pérez',
      'Demostración de CRM Tibs',
      'Demostración',
      new Date('2026-11-01T16:00:00Z'),
      'Carlos Asesor',
      'Empresa Demo',
      'Proyecto CRM 2026',
    );

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailOptions = mockSendMail.mock.calls[0][0];

    expect(mailOptions.to).toBe('juan@cliente.com');
    expect(mailOptions.subject).toContain('Aviso: Nueva Actividad Programada');
    expect(mailOptions.html).toContain('Hola Juan Pérez');
    expect(mailOptions.html).toContain('Demostración de CRM Tibs');
    expect(mailOptions.html).toContain('Carlos Asesor');
    expect(mailOptions.html).toContain('Empresa Demo');
    expect(mailOptions.html).toContain('Proyecto CRM 2026');
    // Validar que no contenga botones internos de inicio de sesión o gestión de CRM
    expect(mailOptions.html).not.toContain('Iniciar Sesión');
    expect(mailOptions.html).not.toContain('Ver en CRM');
    expect(mailOptions.html).not.toContain('login');

    // Validar configuración de icalEvent y attachments
    expect(mailOptions.icalEvent).toBeDefined();
    expect(mailOptions.icalEvent.filename).toBe('invitacion-actividad.ics');
    expect(mailOptions.icalEvent.method).toBe('REQUEST');
    expect(mailOptions.attachments).toBeDefined();
    expect(mailOptions.attachments[0].filename).toBe('invitacion-actividad.ics');
  });
});
