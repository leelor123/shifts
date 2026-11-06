# Google Play listing: Spanish (es-419, same text for es-ES)

App 1.34.0, written 6 Nov 2026 for Spanish-speaking workers in Israel.

## Which Spanish: es-419 first, the same text also in es-ES
Most Spanish speakers in Israel came from Latin America (Argentina above all, then Uruguay, Mexico, Colombia,
Venezuela, Chile and others), plus younger olim from Spain. Their phones are set to es-419, es-AR, es-MX and so on,
and Play matches a Latin American phone to the es-419 listing. Spain's phones (es-ES) match es-ES. So:
1. Add **Spanish (Latin America) – es-419** with the text below.
2. Add **Spanish (Spain) – es-ES** with the same text. It is written in neutral Spanish that reads naturally on both
   sides: "tú" (no "vos", no "vosotros"), "sueldo" and "salario" both used, "recibo de sueldo" with the app's word
   "nómina" in brackets once, "días festivos" (understood everywhere; "feriados" would sound Latin American only).
Two copies of one text cost nothing and leave no Spanish-language phone on the Hebrew default.

The app's own terms come from i18n/es.json (Turno, Nómina, Horas extra, Pago de convalecencia, Informe de horas,
Tabla de campeones). Every claim was checked against src/ and matches listing-en.md. Counts printed by node on the
exact strings inside the blocks (`[...s].length`).

---

**App name** (max 30 characters: 30)
```
Shaati: horas, turnos y sueldo
```

**Short description** (max 80 characters: 77)
```
Registro de turnos y sueldo en Israel: Shabat, horas extra y recibo de sueldo
```

**Full description** (max 4000 characters: 3815)
```
Shaati ayuda a quienes trabajan por horas o por turnos en Israel a registrar sus turnos, estimar su sueldo y comprobar que el recibo de sueldo (nómina, el tlush) coincide con las horas trabajadas.

Importante: Shaati es una app privada. No está vinculada a ningún organismo del gobierno ni lo representa, incluidos el Ministerio de Trabajo, la Autoridad Tributaria y el Bituaj Leumí. Las fuentes oficiales están enlazadas al final y en la app.

Reloj y turnos
• Tocas al empezar y al terminar, con pausas, o agregas un turno pasado
• Importa tu horario desde una foto o un mensaje de WhatsApp
• Importa un informe de horas (Excel, CSV, PDF o foto) y compáralo con tus turnos antes del día de pago
• Varios trabajos y puestos, cada uno con su tarifa; transporte, propinas, bonos y recordatorios
• En Android: empieza y termina un turno desde un widget y, si quieres, una notificación con lo ganado durante el turno

Estimación según las reglas laborales de Israel
• Plus de Shabat y festivos según el horario de Shabat de tu ciudad
• Horas extra (125 % y 150 %), plus nocturno, redondeo y turno mínimo
• Neto estimado: impuesto sobre la renta, puntos de crédito, Bituaj Leumí, impuesto de salud, jubilación
• Salario mínimo según edad y fecha, con un aviso si tu tarifa está por debajo

Revisión del recibo de sueldo
• Sube tu recibo (PDF o foto) y la app lo lee en tu teléfono
• Comparación con tus turnos: horas que faltan, plus no pagados, transporte y más
• La diferencia estimada, cada línea explicada en español, un informe (PDF) y una carta amable para tu empleador

Tus derechos
• Una guía sin internet: salario mínimo, horas extra, Shabat, transporte, enfermedad, vacaciones, dmei havraá, jubilación
• Pago de festivos: por qué festivos podría corresponderte un pago, y cuánto
• Jóvenes que trabajan: horas nocturnas, largo del día y la semana y pausas según la ley de trabajo de menores
• Devolución de impuestos: una estimación de hasta 6 años atrás, según tus turnos, recibos o el formulario 106

Informes y metas
• Resúmenes semanales, mensuales y anuales, gráficos y calendario hebreo y gregoriano
• Exporta tus horas a PDF, Excel y tu calendario
• Meta mensual y meta de ahorro, medallas, cinco juegos cortos, una tabla de campeones y una competencia con amigos

Privacidad
• Entra con Google o con correo, o como invitado con los datos en el teléfono; funciona sin internet
• Tus datos se guardan en tu teléfono y en tu cuenta. Otros usuarios no los ven, salvo lo que compartes con amigos, y no los vendemos
• Sin anuncios. Estadísticas sin nombre, correo ni montos, solo si aceptas
• Bloqueo con código o huella; exporta o borra tus datos y tu cuenta cuando quieras
• En español, hebreo, inglés, ruso, árabe, francés y amárico

Fuentes oficiales (en hebreo)
Ministerio de Trabajo:
• Salario mínimo: https://www.gov.il/he/pages/minimum-wage
• Horas y horas extra: https://www.gov.il/he/pages/overtime-and-extra-hours
• Descanso y festivos: https://www.gov.il/he/pages/weekends-and-holidays
• Jóvenes que trabajan: https://www.gov.il/he/pages/rights-of-working-youth
• Vacaciones: https://www.gov.il/he/pages/annual-vacations
• Convalecencia: https://www.gov.il/he/pages/convalescence-pay
• Enfermedad: https://www.gov.il/he/pages/paid-sick-leave
• Transporte: https://www.gov.il/he/pages/travel-allowance
• Jubilación: https://www.gov.il/he/pages/pension-insurance
Autoridad Tributaria:
• Impuesto sobre la renta: https://www.gov.il/he/departments/israel_tax_authority/govil-landing-page
• Devolución de impuestos: https://www.gov.il/he/service/simulator-employee
Bituaj Leumí:
• Aportes e impuesto de salud: https://www.btl.gov.il/Insurance/Rates/Pages/default.aspx

Los cálculos son estimaciones, no asesoramiento legal, contable ni fiscal. Si tienes dudas, consulta con tu empleador o un contador.
```

---

## Rejection rule (Misleading Claims, 25 Oct 2026)
- Second paragraph: private app, not linked to any government body, the three bodies named.
- "Fuentes oficiales (en hebreo)": the same 12 gov.il / btl.gov.il links as the Hebrew listing.
- "Estimación" throughout; no "exacto", "hasta el último shekel" or "según la ley" as a promise.

## For a native speaker to check
- "recibo de sueldo" (Argentina, Uruguay) against the app's "nómina" (Spain). Both appear; the screenshots show the
  app's "Nómina".
- "Bituaj Leumí", "tlush", "dmei havraá": transliterations vary (Bituaj Leumi, tlúsh).
- "plus" for a pay premium is natural in Spain and understood in Latin America; "adicional" is the alternative.
- "contador" (Latin America) is used; Spain says "gestor" or "asesor fiscal".

## Screenshots
`graphics/screenshots-es/01-home.png` … `08-dark.png`, the same set for es-419 and es-ES (see graphics/CHECK-langs.md).
