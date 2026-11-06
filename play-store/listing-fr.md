# Google Play listing: French (fr-FR)

App 1.34.0, written 6 Nov 2026 for French-speaking workers in Israel (olim from France, Belgium, Switzerland and
North Africa, often students and young adults in shift jobs). fr-FR because most of them came from France and their
phones are set to French (France); Play shows fr-FR to fr-BE / fr-CH phones when no closer French exists. Written in
French for them, not translated line by line, with the app's own terms from i18n/fr.json (Service, Fiche de paie,
Heures sup., Prime de convalescence, Relevé d'heures) and the Israeli words olim use (tlouch, Bitouah Léoumi,
dmei havraa). Every claim was checked against src/ and matches listing-en.md. Counts printed by node on the exact
strings inside the blocks (`[...s].length`). Paste in Play Console › Manage translations › French – fr-FR.

---

**App name** (max 30 characters: 26)
```
Shaati : heures et salaire
```

**Short description** (max 80 characters: 78)
```
Pointage et salaire en Israël : Shabbat, heures sup. et fiche de paie (tlouch)
```

**Full description** (max 4000 characters: 3952)
```
Shaati aide les salariés à l'heure et en horaires postés en Israël à noter leurs services, à estimer leur salaire et à vérifier que la fiche de paie (le tlouch) correspond aux heures travaillées.

Important : Shaati est une application privée. Elle n'est liée à aucun organisme public et ne le représente pas, y compris le ministère du Travail, l'Autorité fiscale et le Bitouah Léoumi. Les sources officielles sont en lien à la fin et dans l'application.

Pointage et services
• Un geste pour commencer, un pour finir, pauses comprises, ou un service passé
• Import du planning depuis une photo ou un message WhatsApp
• Import d'un relevé d'heures (Excel, CSV, PDF ou photo), comparé à vos services avant la paie
• Plusieurs employeurs et postes, chacun avec son taux ; transport, pourboires, primes et rappels
• Sur Android : début et fin de service depuis un widget, et une notification facultative du montant gagné

Estimation selon les règles du droit du travail israélien
• Majoration Shabbat et fêtes selon les horaires de Shabbat de votre ville
• Heures sup. (125 % et 150 %), majoration de nuit, arrondi et service minimum
• Net estimé : impôt sur le revenu, points de crédit, Bitouah Léoumi, taxe santé, retraite
• Salaire minimum selon l'âge et la date, avec une alerte si votre taux est plus bas

Vérification de la fiche de paie
• Envoyez la fiche (PDF ou photo) : l'application la lit sur votre téléphone
• Comparaison avec vos services : heures manquantes, majorations absentes, transport
• L'écart estimé, chaque ligne expliquée en français, un rapport (PDF) et une lettre courtoise pour l'employeur

Vos droits
• Un guide hors ligne : salaire minimum, heures sup., Shabbat, transport, maladie, congés, dmei havraa, retraite
• Jours fériés payés : pour quelles fêtes un paiement peut vous être dû, et combien
• Jeunes travailleurs : nuit, durée du jour et de la semaine, pauses selon la loi sur le travail des jeunes
• Remboursement d'impôt : une estimation sur 6 ans, d'après vos services, vos fiches ou le formulaire 106

Rapports et objectifs
• Bilans hebdomadaires, mensuels et annuels, graphiques, calendrier hébraïque et grégorien
• Export des heures en PDF, Excel et vers votre agenda
• Objectif mensuel et objectif d'épargne, médailles, cinq petits jeux, tableau des champions et concours entre amis

Confidentialité
• Connexion avec Google ou par e-mail, ou mode invité avec les données sur le téléphone ; fonctionne hors ligne
• Vos données restent sur votre téléphone et dans votre compte, invisibles pour les autres sauf ce que vous partagez avec vos amis, et nous ne les vendons pas
• Sans publicité. Statistiques sans nom, e-mail ni montants, seulement avec votre accord
• Verrouillage par code ou empreinte ; export ou suppression des données et du compte à tout moment
• En français, hébreu, anglais, russe, arabe, espagnol et amharique

Sources officielles (en hébreu)
Ministère du Travail :
• Salaire minimum : https://www.gov.il/he/pages/minimum-wage
• Heures et heures sup. : https://www.gov.il/he/pages/overtime-and-extra-hours
• Repos et fêtes : https://www.gov.il/he/pages/weekends-and-holidays
• Jeunes travailleurs : https://www.gov.il/he/pages/rights-of-working-youth
• Congés : https://www.gov.il/he/pages/annual-vacations
• Convalescence : https://www.gov.il/he/pages/convalescence-pay
• Maladie : https://www.gov.il/he/pages/paid-sick-leave
• Transport : https://www.gov.il/he/pages/travel-allowance
• Retraite : https://www.gov.il/he/pages/pension-insurance
Autorité fiscale :
• Impôt sur le revenu : https://www.gov.il/he/departments/israel_tax_authority/govil-landing-page
• Remboursement d'impôt : https://www.gov.il/he/service/simulator-employee
Bitouah Léoumi :
• Cotisations et taxe santé : https://www.btl.gov.il/Insurance/Rates/Pages/default.aspx

Les calculs sont des estimations, pas un conseil juridique, comptable ou fiscal. En cas de doute, vérifiez auprès de votre employeur ou d'un comptable.
```

---

## Rejection rule (Misleading Claims, 25 Oct 2026)
- Second paragraph: private app, not linked to any public body, the three bodies named.
- "Sources officielles (en hébreu)": the same 12 gov.il / btl.gov.il links as the Hebrew listing.
- "Estimation" throughout; no "exactement", "au shekel près" or "selon la loi" as a promise.

## For a native speaker to check
- "tlouch" for תלוש and "dmei havraa" for דמי הבראה: the spellings olim use vary (tloush, havraa / avraa).
- "Service" for משמרת follows the app (i18n/fr.json). In Israel many French speakers say "shift" or "poste"; the
  short description uses "Pointage" (time clock) to catch that search.
- The name "Shaati : heures et salaire" (French spacing before the colon). A longer option that does not fit is
  "Shaati : heures, salaire et fiche de paie" (41).

## Screenshots
`graphics/screenshots-fr/01-home.png` … `08-dark.png` (see graphics/CHECK-langs.md).
