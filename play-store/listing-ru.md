# Google Play listing: Russian (ru-RU)

App 1.34.0, written 6 Nov 2026 for Russian-speaking workers in Israel (olim and their children, many of them in
shift jobs). Written in Russian for this audience, not translated line by line from Hebrew: it keeps the Israeli
words people use every day (тлуш, Битуах леуми, некудот зикуй, дмей хавраа) next to the app's own Russian terms
from i18n/ru.json (Расчётный лист, Смена, Сверхурочные, Оплата оздоровления, Таблица чемпионов). Every claim was
checked against src/ and matches listing-en.md. Counts printed by node on the exact strings inside the blocks
(`[...s].length`). Paste in Play Console › Main store listing › Manage translations › Russian – ru-RU.

---

**App name** (max 30 characters: 29)
```
Shaati: смены, зарплата, тлуш
```

**Short description** (max 80 characters: 75)
```
Учёт смен и расчёт зарплаты в Израиле: шаббат, сверхурочные, проверка тлуша
```

**Full description** (max 4000 characters: 3806)
```
Shaati помогает почасовым и сменным работникам в Израиле записывать смены, видеть примерный расчёт зарплаты и проверять, что расчётный лист (тлуш) совпадает с отработанными часами.

Важно: Shaati является частным приложением. Оно не связано ни с одним государственным органом и не представляет его, включая Министерство труда, Налоговое управление и Битуах леуми. Ссылки на официальные источники есть в конце описания и в приложении.

Табель и смены
• Нажали «Начать смену», нажали «Завершить», с перерывами, или добавьте прошедшую смену
• Импорт графика работы с фото или из сообщения в WhatsApp
• Импорт отчёта о часах (Excel, CSV, PDF или фото) и сверка с вашими сменами до дня зарплаты
• Несколько мест работы и должностей со своими ставками; проезд, чаевые, бонусы и напоминания
• На Android: начало и конец смены с виджета на главном экране и, по желанию, уведомление с суммой во время смены

Примерный расчёт по правилам трудового законодательства Израиля
• Надбавка за шаббат и праздники по времени шаббата в вашем городе
• Сверхурочные (125% и 150%), ночная надбавка, округление и минимальная смена
• Примерное нетто: подоходный налог, некудот зикуй, Битуах леуми, налог на здоровье, пенсия
• Минимальная зарплата по возрасту и дате и предупреждение, если ставка ниже

Проверка расчётного листа
• Загрузите тлуш (PDF или фото), и приложение прочитает его на телефоне
• Сравнение со сменами: недостающие часы, неоплаченные надбавки, проезд и другое
• Примерная сумма расхождения и объяснение каждой строки по-русски, отчёт (PDF) и вежливое письмо работодателю

Права работников
• Справочник прав без интернета: минимальная зарплата, сверхурочные, шаббат, проезд, больничные, отпуск, дмей хавраа, пенсия
• Оплата праздников: за какие праздники вам может быть положена оплата и сколько
• Работающие подростки: ночные часы, длина дня и недели и перерывы по Закону о труде подростков
• Проверка возврата налога: оценка до 6 лет назад по сменам, расчётным листам или форме 106

Отчёты и цели
• Итоги за неделю, месяц и год, графики, еврейский и григорианский календарь
• Экспорт часов в PDF, Excel и календарь
• Цель на месяц и цель накоплений, медали, пять коротких игр, таблица чемпионов и соревнование с друзьями

Конфиденциальность
• Вход через Google или по почте либо гостевой режим с данными на телефоне; работает без интернета
• Данные хранятся на телефоне и в вашем аккаунте. Другие пользователи их не видят, кроме того, чем вы делитесь с друзьями, и мы их не продаём
• Без рекламы. Статистика без имени, почты и сумм, только с вашего согласия
• Блокировка кодом или отпечатком пальца; экспорт или удаление данных и аккаунта в любой момент
• На русском, иврите, английском, арабском, французском, испанском и амхарском

Официальные источники (на иврите)
Министерство труда:
• Минимальная зарплата: https://www.gov.il/he/pages/minimum-wage
• Рабочие часы и сверхурочные: https://www.gov.il/he/pages/overtime-and-extra-hours
• Отдых и праздники: https://www.gov.il/he/pages/weekends-and-holidays
• Работающие подростки: https://www.gov.il/he/pages/rights-of-working-youth
• Отпуск: https://www.gov.il/he/pages/annual-vacations
• Оплата оздоровления: https://www.gov.il/he/pages/convalescence-pay
• Больничные: https://www.gov.il/he/pages/paid-sick-leave
• Проезд: https://www.gov.il/he/pages/travel-allowance
• Пенсия: https://www.gov.il/he/pages/pension-insurance
Налоговое управление:
• Подоходный налог: https://www.gov.il/he/departments/israel_tax_authority/govil-landing-page
• Возврат налога: https://www.gov.il/he/service/simulator-employee
Битуах леуми:
• Взносы и налог на здоровье: https://www.btl.gov.il/Insurance/Rates/Pages/default.aspx

Расчёты являются оценкой, а не юридической, бухгалтерской или налоговой консультацией. Если сомневаетесь, уточните у работодателя или бухгалтера.
```

---

## Rejection rule (Misleading Claims, 25 Oct 2026)
- The second paragraph says Shaati is private and not linked to any government body, and names the three bodies.
- The "Официальные источники" block carries the same 12 gov.il / btl.gov.il links as the Hebrew listing, marked
  "на иврите" because the pages are in Hebrew.
- "Примерный расчёт", "оценка", "по правилам трудового законодательства": no "точно", "до шекеля" or "по закону"
  as a promise.

## For a native speaker to check
- "дмей хавраа": Russian-speaking Israelis also write "дмей авраа" or "хавраа". The app itself says "Оплата
  оздоровления", which is kept next to it.
- "некудот зикуй": the app says "Налоговые льготные пункты"; the Hebrew term is used here for room and recognition.
- To fit 4000 characters this text leaves out the AI assistant paragraph, the "forgot to end a shift" line and the
  alerts line (all true, all in listing-en.md or listing-he.md). Same for fr and es.
- "тлуш / тлуша": the everyday word, put in the name and the short description because it is what people type.
  If a reviewer finds it too slangy for the name, the alternative is "Shaati: учёт смен и зарплаты" (28).
- "Табель и смены" as the heading for the time clock part (a personal "шаон нохехут").

## Screenshots
`graphics/screenshots-ru/01-home.png` … `08-dark.png` (see graphics/CHECK-langs.md).
