require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const Database = require('better-sqlite3');
const { Resend } = require('resend');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── BASE DE DATOS ─────────────────────────────────────────────
const db = new Database('reservas.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS reservas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT,
    telefono TEXT,
    fecha_salida TEXT NOT NULL,
    barco TEXT NOT NULL,
    ruta TEXT,
    huespedes INTEGER NOT NULL,
    con_patron INTEGER DEFAULT 1,
    notas TEXT,
    precio_total INTEGER,
    estado TEXT DEFAULT 'confirmada',
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// ─── DATOS DEL NEGOCIO ─────────────────────────────────────────
const BARCOS = {
  'azure_sovereign': {
    nombre: 'Azure Sovereign',
    tipo: 'Yate de Motor',
    eslora: '65ft',
    huespedes: 12,
    precio_dia: 4500,
    con_patron: true,
    descripcion: 'Yate de motor de lujo para grupos premium. Incluye patrón profesional.'
  },
  'horizon_bleu': {
    nombre: 'Horizon Bleu',
    tipo: 'Catamarán',
    eslora: '48ft',
    huespedes: 8,
    precio_dia: 2800,
    con_patron: false,
    descripcion: 'Catamarán espacioso ideal para familias y grupos. Se requiere licencia náutica.'
  },
  'mistral_blanc': {
    nombre: 'Mistral Blanc',
    tipo: 'Velero',
    eslora: '52ft',
    huespedes: 6,
    precio_dia: 1900,
    con_patron: true,
    descripcion: 'Velero clásico para experiencias auténticas. Patrón experto incluido.'
  }
};

const RUTAS = {
  'formentera': { nombre: 'Puesta de sol en Formentera', dias: 7, precio_base: 2800 },
  'menorca':    { nombre: 'Calas Secretas de Menorca',   dias: 5, precio_base: 1900 },
  'amalfi':     { nombre: 'Capri & Costa Amalfitana',    dias: 10, precio_base: 4500 },
  'mallorca':   { nombre: 'Calas de Mallorca',           dias: 3,  precio_base: 1900 },
  'ibiza':      { nombre: 'Ibiza & Formentera',          dias: 5,  precio_base: 2800 },
  'personalizada': { nombre: 'Ruta personalizada', dias: null, precio_base: null }
};

// ─── RESEND EMAIL ─────────────────────────────────────────────
const resend = new Resend(process.env.RESEND_API_KEY);

async function enviarConfirmacionCliente(reserva) {
  if (!reserva.email) return;
  const barco = BARCOS[reserva.barco];
  const ruta = reserva.ruta ? RUTAS[reserva.ruta] : null;
  try {
    await resend.emails.send({
      from: 'Azure Luxury Charters <onboarding@resend.dev>',
      to: reserva.email,
      subject: `Reserva confirmada · Azure Luxury Charters #AL-${reserva.id}`,
      html: `
      <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#04090e;color:#e8ddd0;padding:0;">
        <div style="background:linear-gradient(135deg,#07111f,#0e2240);padding:40px;text-align:center;border-bottom:1px solid rgba(201,169,110,0.3)">
          <h1 style="color:#c9a96e;font-weight:400;font-size:1.8rem;margin:0;letter-spacing:0.05em">AZURE LUXURY CHARTERS</h1>
          <p style="color:rgba(255,255,255,0.4);font-size:0.75rem;letter-spacing:0.2em;margin:8px 0 0;text-transform:uppercase">Reserva Confirmada</p>
        </div>
        <div style="padding:40px;">
          <p style="color:#c9bfb5;line-height:1.8;">Estimado/a <strong style="color:#c9a96e">${reserva.nombre}</strong>,</p>
          <p style="color:#c9bfb5;line-height:1.8;">Su reserva ha sido confirmada. Nuestro equipo se pondrá en contacto con usted para coordinar todos los detalles de su experiencia náutica.</p>

          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(201,169,110,0.2);border-radius:8px;padding:24px;margin:24px 0;">
            <h3 style="color:#c9a96e;font-weight:400;margin:0 0 16px;font-size:0.85rem;letter-spacing:0.1em;text-transform:uppercase">Detalles de la Reserva</h3>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="color:rgba(255,255,255,0.4);padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.85rem;">Referencia</td><td style="color:#c9a96e;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.85rem;text-align:right;font-weight:500;">#AL-${reserva.id}</td></tr>
              <tr><td style="color:rgba(255,255,255,0.4);padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.85rem;">Embarcación</td><td style="color:#e8ddd0;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.85rem;text-align:right;">${barco ? barco.nombre : reserva.barco} ${barco ? '('+barco.tipo+')' : ''}</td></tr>
              <tr><td style="color:rgba(255,255,255,0.4);padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.85rem;">Ruta</td><td style="color:#e8ddd0;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.85rem;text-align:right;">${ruta ? ruta.nombre : (reserva.ruta || 'Por confirmar')}</td></tr>
              <tr><td style="color:rgba(255,255,255,0.4);padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.85rem;">Fecha de salida</td><td style="color:#e8ddd0;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.85rem;text-align:right;">${reserva.fecha_salida}</td></tr>
              <tr><td style="color:rgba(255,255,255,0.4);padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.85rem;">Huéspedes</td><td style="color:#e8ddd0;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.85rem;text-align:right;">${reserva.huespedes} personas</td></tr>
              <tr><td style="color:rgba(255,255,255,0.4);padding:8px 0;font-size:0.85rem;">Precio estimado</td><td style="color:#c9a96e;padding:8px 0;font-size:0.85rem;text-align:right;font-weight:500;">${reserva.precio_total ? '€'+reserva.precio_total.toLocaleString()+'/día' : 'Por confirmar'}</td></tr>
            </table>
          </div>

          <p style="color:rgba(255,255,255,0.5);font-size:0.82rem;line-height:1.8;">
            ⚓ Nuestro equipo le contactará en menos de 24h para confirmar los detalles<br>
            📍 Puerto de salida: según barco y ruta seleccionados<br>
            📞 Cancelación gratuita hasta 48h antes de la salida
          </p>
          <p style="color:#c9a96e;font-size:0.9rem;margin-top:1.5rem;font-style:italic;">Le deseamos una experiencia náutica inolvidable. ⚓</p>
        </div>
        <div style="background:rgba(255,255,255,0.02);border-top:1px solid rgba(255,255,255,0.06);padding:20px;text-align:center;">
          <p style="color:rgba(255,255,255,0.25);font-size:0.75rem;margin:0;letter-spacing:0.06em">AZURE LUXURY CHARTERS · MEDITERRÁNEO · reservas@azureluxury.com</p>
        </div>
      </div>`
    });
  } catch (e) {
    console.error('Error email cliente:', e.message);
  }
}

async function enviarNotificacionAdmin(reserva) {
  if (!process.env.ADMIN_EMAIL) return;
  const barco = BARCOS[reserva.barco];
  const ruta = reserva.ruta ? RUTAS[reserva.ruta] : null;
  try {
    await resend.emails.send({
      from: 'Azure Luxury Bot <onboarding@resend.dev>',
      to: process.env.ADMIN_EMAIL,
      subject: `⚓ Nueva reserva #AL-${reserva.id} — ${reserva.nombre} · ${barco ? barco.nombre : reserva.barco}`,
      html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;border-top:4px solid #c9a96e;">
        <h2 style="color:#07111f;">Nueva Reserva — Azure Luxury Charters</h2>
        <table style="width:100%;border-collapse:collapse;margin-top:20px;">
          <tr style="background:#f9f6f0;"><td style="padding:10px;font-weight:bold;color:#555;">ID</td><td style="padding:10px;color:#c9a96e;font-weight:bold;">#AL-${reserva.id}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;color:#555;">Nombre</td><td style="padding:10px;">${reserva.nombre}</td></tr>
          <tr style="background:#f9f6f0;"><td style="padding:10px;font-weight:bold;color:#555;">Email</td><td style="padding:10px;">${reserva.email || '-'}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;color:#555;">Teléfono</td><td style="padding:10px;">${reserva.telefono || '-'}</td></tr>
          <tr style="background:#f9f6f0;"><td style="padding:10px;font-weight:bold;color:#555;">Barco</td><td style="padding:10px;">${barco ? barco.nombre+' ('+barco.tipo+')' : reserva.barco}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;color:#555;">Ruta</td><td style="padding:10px;">${ruta ? ruta.nombre : (reserva.ruta || '-')}</td></tr>
          <tr style="background:#f9f6f0;"><td style="padding:10px;font-weight:bold;color:#555;">Fecha salida</td><td style="padding:10px;">${reserva.fecha_salida}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;color:#555;">Huéspedes</td><td style="padding:10px;">${reserva.huespedes}</td></tr>
          <tr style="background:#f9f6f0;"><td style="padding:10px;font-weight:bold;color:#555;">Con patrón</td><td style="padding:10px;">${reserva.con_patron ? 'Sí' : 'No (licencia propia)'}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;color:#555;">Precio/día</td><td style="padding:10px;color:#c9a96e;font-weight:bold;">${reserva.precio_total ? '€'+reserva.precio_total.toLocaleString() : 'Por confirmar'}</td></tr>
          <tr style="background:#f9f6f0;"><td style="padding:10px;font-weight:bold;color:#555;">Notas</td><td style="padding:10px;">${reserva.notas || '-'}</td></tr>
        </table>
      </div>`
    });
  } catch (e) {
    console.error('Error email admin:', e.message);
  }
}

// ─── DISPONIBILIDAD ────────────────────────────────────────────
function barcoDisponible(fecha, barco) {
  const r = db.prepare(`
    SELECT COUNT(*) as total FROM reservas
    WHERE fecha_salida = ? AND barco = ? AND estado != 'cancelada'
  `).get(fecha, barco);
  return (r.total || 0) === 0;
}

function barcosDisponibles(fecha) {
  return Object.entries(BARCOS)
    .filter(([key]) => barcoDisponible(fecha, key))
    .map(([key, b]) => ({ id: key, ...b }));
}

// ─── TOOLS IA ─────────────────────────────────────────────────
const tools = [
  {
    name: 'consultar_disponibilidad',
    description: 'Consulta si un barco está disponible en una fecha concreta',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'Fecha de salida en formato YYYY-MM-DD' },
        barco: { type: 'string', enum: ['azure_sovereign', 'horizon_bleu', 'mistral_blanc'] }
      },
      required: ['fecha', 'barco']
    }
  },
  {
    name: 'ver_barcos_disponibles',
    description: 'Muestra qué barcos están disponibles en una fecha dada',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' }
      },
      required: ['fecha']
    }
  },
  {
    name: 'hacer_reserva',
    description: 'Crea una reserva para un barco de lujo',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre completo del cliente' },
        email: { type: 'string', description: 'Email del cliente' },
        telefono: { type: 'string', description: 'Teléfono del cliente' },
        fecha_salida: { type: 'string', description: 'Fecha de salida en formato YYYY-MM-DD' },
        barco: { type: 'string', enum: ['azure_sovereign', 'horizon_bleu', 'mistral_blanc'], description: 'Barco elegido' },
        ruta: { type: 'string', description: 'Ruta elegida: formentera, menorca, amalfi, mallorca, ibiza o personalizada' },
        huespedes: { type: 'number', description: 'Número de huéspedes' },
        con_patron: { type: 'boolean', description: 'Si desean patrón incluido' },
        notas: { type: 'string', description: 'Peticiones especiales, alergias, celebraciones, etc.' }
      },
      required: ['nombre', 'fecha_salida', 'barco', 'huespedes']
    }
  },
  {
    name: 'cancelar_reserva',
    description: 'Cancela una reserva existente',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        fecha_salida: { type: 'string' }
      },
      required: ['nombre', 'fecha_salida']
    }
  },
  {
    name: 'consultar_precios',
    description: 'Proporciona información de precios y características de los barcos',
    input_schema: {
      type: 'object',
      properties: {
        barco: { type: 'string', description: 'Barco específico o "todos" para ver todos' }
      },
      required: []
    }
  }
];

const SYSTEM_PROMPT = `Eres el asistente de reservas de Azure Luxury Charters, empresa de charter náutico de lujo en el Mediterráneo. Tu tono es elegante, sofisticado y cercano — como un concierge de hotel de 5 estrellas.

RESPONDE SIEMPRE en el idioma del cliente (español, inglés o alemán).

NUESTRA FLOTA:
- azure_sovereign: Azure Sovereign (Yate de Motor, 65ft, hasta 12 huéspedes, €4.500/día, patrón incluido)
- horizon_bleu: Horizon Bleu (Catamarán, 48ft, hasta 8 huéspedes, €2.800/día, sin patrón — requiere licencia)
- mistral_blanc: Mistral Blanc (Velero, 52ft, hasta 6 huéspedes, €1.900/día, patrón incluido)

RUTAS DISPONIBLES:
- formentera: Puesta de sol en Formentera (7 días)
- menorca: Calas Secretas de Menorca (5 días)
- amalfi: Capri & Costa Amalfitana (10 días)
- mallorca: Calas de Mallorca (3 días)
- ibiza: Ibiza & Formentera (5 días)
- personalizada: Ruta personalizada según preferencias del cliente

POLÍTICA:
- Precio por día de navegación, barco completo
- Cancelación gratuita hasta 48h antes
- Depósito del 30% para confirmar la reserva (se gestiona manualmente)
- Nuestro equipo confirma y contacta al cliente en menos de 24h

PARA RESERVAR necesito: nombre, email, teléfono, fecha de salida, barco elegido, ruta, número de huéspedes.

USA SIEMPRE las herramientas para verificar disponibilidad antes de confirmar.

Hoy es ${new Date().toISOString().split('T')[0]}.`;

function processTool(name, input) {
  if (name === 'consultar_disponibilidad') {
    const disponible = barcoDisponible(input.fecha, input.barco);
    const b = BARCOS[input.barco];
    return JSON.stringify({
      disponible,
      barco: b ? b.nombre : input.barco,
      precio_dia: b ? b.precio_dia : null,
      mensaje: disponible
        ? `${b ? b.nombre : input.barco} está disponible para el ${input.fecha}. Precio: €${b ? b.precio_dia.toLocaleString() : '?'}/día.`
        : `${b ? b.nombre : input.barco} no está disponible el ${input.fecha}. Sugiera otra fecha o embarcación.`
    });
  }

  if (name === 'ver_barcos_disponibles') {
    const disponibles = barcosDisponibles(input.fecha);
    return JSON.stringify({
      fecha: input.fecha,
      disponibles: disponibles.map(b => ({
        id: b.id, nombre: b.nombre, tipo: b.tipo, precio_dia: b.precio_dia, huespedes: b.huespedes
      })),
      mensaje: disponibles.length > 0
        ? `Disponibles el ${input.fecha}: ${disponibles.map(b => `${b.nombre} (€${b.precio_dia.toLocaleString()}/día)`).join(', ')}`
        : `No hay embarcaciones disponibles el ${input.fecha}. Proponga fechas alternativas.`
    });
  }

  if (name === 'hacer_reserva') {
    const b = BARCOS[input.barco];
    if (b && input.huespedes > b.huespedes) {
      return JSON.stringify({ success: false, mensaje: `${b.nombre} tiene capacidad máxima de ${b.huespedes} huéspedes.` });
    }
    if (!barcoDisponible(input.fecha_salida, input.barco)) {
      return JSON.stringify({ success: false, mensaje: `${b ? b.nombre : input.barco} no está disponible el ${input.fecha_salida}.` });
    }
    const ruta = input.ruta ? RUTAS[input.ruta] : null;
    const precio = b ? b.precio_dia : null;
    const result = db.prepare(`
      INSERT INTO reservas (nombre, email, telefono, fecha_salida, barco, ruta, huespedes, con_patron, notas, precio_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.nombre,
      input.email || '',
      input.telefono || '',
      input.fecha_salida,
      input.barco,
      input.ruta || '',
      input.huespedes,
      input.con_patron !== false ? 1 : 0,
      input.notas || '',
      precio
    );
    const id = result.lastInsertRowid;
    const reserva = { id, ...input, precio_total: precio };
    enviarConfirmacionCliente(reserva);
    enviarNotificacionAdmin(reserva);
    return JSON.stringify({
      success: true,
      id,
      mensaje: `¡Reserva #AL-${id} confirmada! ${b ? b.nombre : input.barco}${ruta ? ' · '+ruta.nombre : ''} — ${input.fecha_salida} para ${input.huespedes} huéspedes. Se enviará confirmación por email. Nuestro equipo le contactará en menos de 24h.`
    });
  }

  if (name === 'cancelar_reserva') {
    const r = db.prepare(`
      SELECT * FROM reservas WHERE LOWER(nombre) = LOWER(?) AND fecha_salida = ? AND estado != 'cancelada'
    `).get(input.nombre, input.fecha_salida);
    if (!r) return JSON.stringify({ success: false, mensaje: 'No se encontró ninguna reserva con esos datos.' });
    db.prepare('UPDATE reservas SET estado = ? WHERE id = ?').run('cancelada', r.id);
    return JSON.stringify({ success: true, mensaje: `Reserva #AL-${r.id} cancelada correctamente.` });
  }

  if (name === 'consultar_precios') {
    if (input.barco && input.barco !== 'todos' && BARCOS[input.barco]) {
      const b = BARCOS[input.barco];
      return JSON.stringify({ barco: b.nombre, precio_dia: b.precio_dia, huespedes: b.huespedes, descripcion: b.descripcion });
    }
    return JSON.stringify({ barcos: Object.entries(BARCOS).map(([k, b]) => ({ id: k, nombre: b.nombre, precio_dia: b.precio_dia, huespedes: b.huespedes })) });
  }

  return JSON.stringify({ error: 'Herramienta no encontrada' });
}

// ─── ENDPOINTS ─────────────────────────────────────────────────
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    let currentMessages = [...messages];
    let response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools,
      messages: currentMessages
    });
    while (response.stop_reason === 'tool_use') {
      const toolBlock = response.content.find(b => b.type === 'tool_use');
      if (!toolBlock) break;
      const result = processTool(toolBlock.name, toolBlock.input);
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolBlock.id, content: result }] }
      ];
      response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools,
        messages: currentMessages
      });
    }
    const textBlock = response.content.find(b => b.type === 'text');
    res.json({ reply: textBlock ? textBlock.text : 'Disculpe, ha habido un error. Contacte con nosotros en reservas@azureluxury.com' });
  } catch (error) {
    console.error('Error chat:', error.message);
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
});

// Reservas para admin
app.get('/reservas', (req, res) => {
  const reservas = db.prepare('SELECT * FROM reservas ORDER BY created_at DESC').all();
  res.json(reservas);
});

app.patch('/reservas/:id/cancelar', (req, res) => {
  db.prepare('UPDATE reservas SET estado = ? WHERE id = ?').run('cancelada', req.params.id);
  res.json({ success: true });
});

app.patch('/reservas/:id/confirmar', (req, res) => {
  db.prepare('UPDATE reservas SET estado = ? WHERE id = ?').run('confirmada', req.params.id);
  res.json({ success: true });
});

// Estadísticas para admin
app.get('/stats', (req, res) => {
  const total = db.prepare("SELECT COUNT(*) as n FROM reservas WHERE estado != 'cancelada'").get();
  const mes = db.prepare(`SELECT COUNT(*) as n FROM reservas WHERE estado != 'cancelada' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`).get();
  const ingresos = db.prepare("SELECT SUM(precio_total) as total FROM reservas WHERE estado != 'cancelada'").get();
  const porBarco = db.prepare("SELECT barco, COUNT(*) as n FROM reservas WHERE estado != 'cancelada' GROUP BY barco").all();
  res.json({ total: total.n, mes: mes.n, ingresos: ingresos.total || 0, porBarco });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Azure Luxury Charters corriendo en http://localhost:${PORT}`));
