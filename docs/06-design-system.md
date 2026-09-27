# نظام التصميم — Design System

> إصدار 1.0 — 2026-09-27. يُبنى على `brand/brand-identity.md` (الألوان المقاسة من الشعار) ويُنفَّذ في `packages/ui`. مرجع كل صفحة في `07-pages-spec.md`.

---

## 1. المبادئ

1. **الأبيض أساس، الأزرق تفاعل، الكحلي بنية، الأحمر تأكيد نادر.**
2. **الوضوح قبل الزخرفة:** أسطح مسطحة، ظلال خفيفة، لا تدرجات.
2b. **الهاتف أولًا للطالب والأستاذ، بملمس iOS** (تبويبات سفلية، Sheets، عناوين كبيرة)؛ سطح المكتب يتوسع منه. الوضع الداكن مواطن من الدرجة الأولى.
3. **RTL أولًا، LTR مكافئ:** خصائص منطقية فقط (`inline-start/end`).
4. **الحالة مرئية دائمًا:** كل كيان له شارة حالة بلون دلالي ثابت عبر النظام.
5. **الوصولية شرط:** WCAG AA للتباين، تنقل بلوحة المفاتيح، `aria` للمكوّنات المركّبة.
6. **Tokens لا قيم:** لا لون ولا مسافة مكتوبة يدويًا في المكوّنات.

---

## 2. نظام الألوان

### 2.1 سلالم الهوية (من الشعار)

| السلّم | 50 | 100 | 200 | 300 | 400 | **500** | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|---|
| **primary** (أزرق المدارات) | #F2F5F9 | #E5ECF4 | #C4D3E6 | #96B1D3 | #618ABD | **#2D64A7** | #26558D | #1F4674 | #18375B | #122842 |
| **accent** (أحمر الكرات) | #FAF1F3 | #F5E4E8 | #E8C1CA | #D792A1 | #C35B72 | **#B02544** | #951F39 | #7B192F | #601425 | #460E1B |
| **navy** (كحلي النص) | #F1F2F3 | #E4E5E8 | #C0C3CB | #8F95A3 | #576075 | **#1F2B47** | #1A243C | #151E31 | #111727 | #0C111C |

### 2.2 المحايدات (رماديات بميل كحلي — تُشتق من navy)

| الرمز | القيمة | الاستخدام |
|---|---|---|
| n0 | #FFFFFF | الخلفية والأسطح |
| n50 | #F7F8FA | خلفية الصفحة خلف البطاقات، صفوف الجدول المتناوبة |
| n100 | #EEF0F3 | أسطح ثانوية، خلفيات الحقول المعطلة |
| n200 | #DCDFE5 | حدود خفيفة، فواصل |
| n300 | #C0C3CB | حدود الحقول |
| n400 | #8F95A3 | نص مساعد، أيقونات غير نشطة (4.0:1 — للنص الكبير/الأيقونات فقط) |
| n500 | #576075 | نص ثانوي (7.6:1) |
| n600 | #3B4459 | نص أساسي بديل |
| n800 | #1F2B47 | نص أساسي، عناوين |
| n900 | #111318 | نص عالي التباين، الصقر |

### 2.3 الدلالية

| الرمز | الأساس | فاتح (خلفية) | داكن (نص على الفاتح) | الاستخدام |
|---|---|---|---|---|
| success | #1E7F4F | #E6F4EC | #14603A | مقبول، منشور، ناجح، فعّال |
| warning | #B7791F | #FBF3E3 | #8A5A14 | بانتظار، ناقص، يقترب الموعد |
| danger | #C0392B | #FBE9E7 | #922B20 | مرفوض، راسب، منتهٍ، حذف — **يختلف عن accent عمدًا** |
| info | #2D64A7 | #E5ECF4 | #1F4674 | مُقدَّم، قيد المراجعة، معلومة |
| neutral | #576075 | #EEF0F3 | #3B4459 | مسودة، مؤرشف، مغلق |
| accent-tag | #B02544 | #F5E4E8 | #7B192F | مميز، جديد، مثبّت |

### 2.4 ألوان الحالات (ثابتة عبر النظام — `StatusBadge`)

| الحالة | اللون |
|---|---|
| draft, archived, closed, ended, retired | neutral |
| submitted, under_review, in_progress, scheduled, published(إعلان), live | info |
| pending_approval, waiting_for_user, missing_documents, waitlisted, pending, has_errors, suggested | warning |
| accepted, approved, active, registered, activated, committed, published(نتيجة), passed, resolved, decided | success |
| rejected, failed, expired, invalidated, suspended, cancelled, dismissed, withdrawn | danger |
| featured, pinned, new | accent-tag |

### 2.5 الرسوم البيانية

- **فئوي (حتى 6 سلاسل):** primary #2D64A7 · accent #B02544 · teal #0F8B8D · amber #D98E04 · violet #6A4C93 · slate #576075.
- **تسلسلي:** primary 100→700. **متباين:** accent 500 → n100 → primary 500.
- المحاور والشبكة n200/n400؛ النص n600؛ لا تدرجات؛ الحالات الدلالية تستخدم ألوان §2.3 حصرًا.

### 2.6 الوضع الداكن (اختياري لاحقًا — الرموز محددة الآن)

| الرمز | فاتح | داكن |
|---|---|---|
| bg | #FFFFFF | #0C111C |
| bg-subtle | #F7F8FA | #111727 |
| surface | #FFFFFF | #151E31 |
| surface-alt | #EEF0F3 | #1A243C |
| border | #C0C3CB | #2A3349 |
| border-soft | #DCDFE5 | #1F2B47 |
| text | #1F2B47 | #F1F2F3 |
| text-muted | #576075 | #C0C3CB |
| primary (تفاعل) | #2D64A7 | #96B1D3 |
| primary-soft | #E5ECF4 | #18375B |
| accent | #B02544 | #D792A1 |
| accent-soft | #F5E4E8 | #460E1B |
| header (البوابة) | #1F2B47 نص أبيض | #0C111C |

### 2.7 قواعد الاستخدام
- نسبة الشاشة: ≥ 70% أبيض/n50، ≤ 20% primary/navy، ≤ 5% accent، الدلالية عند الحاجة فقط.
- نص على primary/accent/navy: أبيض دائمًا. نص على soft: النسخة الداكنة من نفس اللون.
- الروابط: primary-500، تحتها خط عند التحويم؛ الأزرار الأساسية primary-500 → hover 600 → active 700.
- الهيدر: الموقع العام أبيض بشعار ملون؛ البوابة navy-500 بشعار معكوس.

---

## 3. الخطوط

| الرمز | الحجم/السطر | الوزن | الاستخدام |
|---|---|---|---|
| display | 2.25rem / 1.25 | 700 | عناوين الهبوط |
| h1 | 1.875rem / 1.3 | 700 | عنوان الصفحة |
| h2 | 1.5rem / 1.35 | 700 | أقسام |
| h3 | 1.25rem / 1.4 | 600 | بطاقات، حوارات |
| h4 | 1.125rem / 1.45 | 600 | عناوين فرعية |
| body | 1rem / 1.7 | 400 | النص |
| body-strong | 1rem / 1.7 | 600 | تأكيد |
| small | 0.875rem / 1.6 | 400 | جداول، مساعدة |
| caption | 0.75rem / 1.5 | 500 | شارات، تسميات |
| mono | 0.875rem | 500 | الأرقام الجامعية، الرموز، الأرقام المرجعية (`tabular-nums`) |

الخط: **IBM Plex Sans Arabic** (400/500/600/700) مستضاف ذاتيًا؛ بديل `system-ui`. الأرقام غربية (0-9) افتراضيًا. العربية: `line-height ≥ 1.6`، لا `letter-spacing`، لا أحرف كبيرة قسرية للاتيني داخل العربية.

---

## 4. المسافات والشبكة والاستجابة

- الوحدة 4px: `1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 16=64`.
- الحاويات: الموقع العام `max-w 1200px`، البوابة `max-w 1280px` + شريط جانبي 264px.
- Breakpoints: `sm 640`, `md 768`, `lg 1024`, `xl 1280`.
- الشبكة: 12 عمودًا بفجوة 24px (lg)، 4 أعمدة بفجوة 16px (sm).
- **RTL:** `dir` على `<html>`؛ Tailwind بخصائص منطقية (`ps/pe/ms/me/start/end`)؛ الأيقونات الاتجاهية (أسهم، Chevron) تُعكس بـ `rtl:-scale-x-100`؛ الشريط الجانبي في **اليمين** بالعربية واليسار بالإنجليزية.

---

## 5. الشكل والحركة والأيقونات

- الزوايا: `sm 6px` (حقول، شارات)، `md 10px` (أزرار، بطاقات)، `lg 16px` (حوارات، بطاقات كبيرة)، `full` (أفاتار، شرائح).
- الحدود: 1px n300 للحقول، n200 للفواصل؛ التركيز: حلقة 2px primary-300 خارجية.
- الظلال: `sm 0 1px 2px rgb(31 43 71/.06)`، `md 0 4px 12px rgb(31 43 71/.08)`، `lg 0 12px 32px rgb(31 43 71/.12)` (حوارات فقط).
- الحركة: 150ms للحالات، 200ms للظهور، `ease-out`؛ احترام `prefers-reduced-motion`.
- الأيقونات: **lucide-react** بحجم 20px (16 في الشارات، 24 في التنقل)، سماكة 1.75؛ كل أيقونة بلا نص تحمل `aria-label`.

---

## 6. Tokens (المرجع التنفيذي)

```css
/* packages/ui/src/tokens.css */
:root {
  --color-primary-50:#F2F5F9; --color-primary-100:#E5ECF4; --color-primary-200:#C4D3E6; --color-primary-300:#96B1D3;
  --color-primary-400:#618ABD; --color-primary-500:#2D64A7; --color-primary-600:#26558D; --color-primary-700:#1F4674;
  --color-primary-800:#18375B; --color-primary-900:#122842;
  --color-accent-50:#FAF1F3;  --color-accent-100:#F5E4E8;  --color-accent-200:#E8C1CA;  --color-accent-300:#D792A1;
  --color-accent-400:#C35B72; --color-accent-500:#B02544; --color-accent-600:#951F39; --color-accent-700:#7B192F;
  --color-accent-800:#601425; --color-accent-900:#460E1B;
  --color-navy-50:#F1F2F3; --color-navy-100:#E4E5E8; --color-navy-200:#C0C3CB; --color-navy-300:#8F95A3; --color-navy-400:#576075;
  --color-navy-500:#1F2B47; --color-navy-600:#1A243C; --color-navy-700:#151E31; --color-navy-800:#111727; --color-navy-900:#0C111C;
  --color-n0:#FFFFFF; --color-n50:#F7F8FA; --color-n100:#EEF0F3; --color-n200:#DCDFE5; --color-n300:#C0C3CB; --color-n400:#8F95A3;
  --color-n500:#576075; --color-n600:#3B4459; --color-n800:#1F2B47; --color-n900:#111318;
  --color-success:#1E7F4F; --color-success-soft:#E6F4EC; --color-success-strong:#14603A;
  --color-warning:#B7791F; --color-warning-soft:#FBF3E3; --color-warning-strong:#8A5A14;
  --color-danger:#C0392B;  --color-danger-soft:#FBE9E7;  --color-danger-strong:#922B20;
  --color-info:#2D64A7;    --color-info-soft:#E5ECF4;    --color-info-strong:#1F4674;
  /* semantic */
  --bg:var(--color-n0); --bg-subtle:var(--color-n50); --surface:var(--color-n0); --surface-alt:var(--color-n100);
  --border:var(--color-n300); --border-soft:var(--color-n200); --text:var(--color-n800); --text-muted:var(--color-n500);
  --text-inverse:#FFFFFF; --primary:var(--color-primary-500); --primary-hover:var(--color-primary-600); --primary-soft:var(--color-primary-100);
  --accent:var(--color-accent-500); --accent-hover:var(--color-accent-600); --accent-soft:var(--color-accent-100);
  --header-bg:var(--color-navy-500); --focus-ring:var(--color-primary-300);
  --radius-sm:6px; --radius-md:10px; --radius-lg:16px; --radius-full:9999px;
  --shadow-sm:0 1px 2px rgb(31 43 71/.06); --shadow-md:0 4px 12px rgb(31 43 71/.08); --shadow-lg:0 12px 32px rgb(31 43 71/.12);
  --font-sans:"IBM Plex Sans Arabic",system-ui,sans-serif; --font-mono:"IBM Plex Mono",ui-monospace,monospace;
  --dur-fast:150ms; --dur-base:200ms; --ease:cubic-bezier(.2,.8,.2,1);
}
:root[data-theme="dark"] { /* §2.6 */ }
```
Tailwind 4: `@theme { --color-primary: var(--primary); ... }` فتُستخدم `bg-primary text-text border-border`.

---

## 7. المكوّنات

### 7.1 الفهرس

| المكوّن | المتغيرات | الحالات | ملاحظات وصولية |
|---|---|---|---|
| Button | primary, secondary (primary-soft), outline, ghost, danger, link؛ sm/md/lg؛ icon-start/end | default, hover, active, focus, disabled, loading | نص دائمًا (أو `aria-label` لأيقونة فقط)؛ loading يعطّل ويُظهر Spinner |
| IconButton | نفس الأعلى | – | `aria-label` إلزامي، tooltip |
| Input / Textarea | md/lg؛ prefix/suffix؛ عدّاد أحرف | default, focus, error, disabled, readonly | يرتبط بـ `FormField` |
| Select / Combobox | مفرد/متعدد، بحث، غير متزامن | – | Radix Select/Popover + `aria-activedescendant` |
| DatePicker / DateTimePicker | تاريخ، تاريخ+وقت، مدى | – | كتابة يدوية + تقويم؛ تقويم ميلادي |
| PhoneInput | رمز الدولة (افتراضي SD +249) | error | تطبيع E.164 على الخادم |
| OTPInput | 6 خانات | error, resend-countdown | لصق كامل مدعوم |
| PasswordInput | إظهار/إخفاء، مؤشر قوة | – | – |
| Checkbox / Radio / Switch | مع وصف | indeterminate | – |
| FormField | label, hint, error, required, optional | – | `aria-describedby`, `aria-invalid` |
| FileDropzone | مفرد/متعدد، أنواع/حجم، تقدم، معاينة | uploading, error, done | زر بديل للسحب؛ رسائل خطأ محددة |
| Card | flat, outlined, elevated؛ header/footer | clickable | – |
| StatCard (KPI) | قيمة، عنوان، فرق، أيقونة، رابط | loading | – |
| Table | كثيف/عادي؛ فرز؛ اختيار؛ ثابت الرأس؛ أعمدة مثبّتة؛ صف قابل للتوسيع؛ إجراءات | loading (skeleton), empty, error | `<table>` حقيقي؛ على `sm` تتحول إلى `CardList` تلقائيًا |
| Pagination | أرقام + حجم صفحة؛ cursor (تحميل المزيد) | – | – |
| FilterBar | بحث + فلاتر (Select/Date/Chips) + إعادة تعيين + عدد النتائج | – | الحالة في URL |
| Tabs | خط سفلي / حبوب | – | Radix Tabs |
| StatusBadge | حسب §2.4 | – | نص + لون (لا لون فقط) |
| Tag / Chip | قابل للإزالة | – | – |
| Avatar / AvatarGroup | صورة/أحرف | – | – |
| Breadcrumb | – | – | `nav aria-label` |
| PageHeader | عنوان، وصف، Breadcrumb، إجراءات، تبويبات | – | – |
| Sidebar / NavItem / NavGroup | مطوي/ممتد؛ شارة عدد | active | `aria-current` |
| TopBar | شعار، بحث، جرس، لغة، قائمة المستخدم | – | – |
| BottomNav (موبايل) | 4–5 عناصر | active | للطالب والأستاذ |
| Drawer | start/end؛ أحجام | – | Focus trap, Esc |
| Dialog / ConfirmDialog | sm/md/lg؛ خطر | loading | Focus trap؛ الحذف يتطلب كتابة اسم العنصر عند الأثر الكبير |
| Toast | success/info/warning/danger؛ إجراء | – | `aria-live=polite` |
| Alert / Banner | نفس الألوان؛ قابل للإغلاق | – | – |
| EmptyState | أيقونة، عنوان، وصف، إجراء | – | – |
| Skeleton / Spinner / ProgressBar | – | – | `aria-busy` |
| Stepper (Wizard) | أفقي/عمودي؛ خطوات مكتملة/حالية/قادمة | error | يُستخدم للتقديم والتسجيل وإنشاء الاختبار |
| Timeline | تاريخ الحالات (من، إلى، بواسطة، ملاحظة) | – | – |
| Tooltip / Popover / DropdownMenu | – | – | Radix |
| NotificationBell / NotificationItem | غير مقروء، فئة، إجراء | – | – |
| Countdown | للاختبار (من `deadline_at` وserver time) | warning < 5 دقائق | يعلن بقاء الوقت بـ `aria-live` عند 5/1 دقيقة |
| RichTextEditor | عناوين، قوائم، روابط، صور (من الوسائط)، جداول بسيطة | – | يُطهَّر في الخادم |
| MarkdownViewer / BlockRenderer | كتل الصفحات | – | – |
| VideoPlayer | Bunny embed (إنتاج) / `<video>` (تطوير) | – | تعليقات لاحقًا |
| Logo | full, horizontal, mark, mono, inverse | – | – |
| LanguageSwitch / ThemeToggle | – | – | – |
| DataExportButton | CSV/PDF | loading | – |
| StatusTransitionMenu | يعرض `allowed_transitions` من الـ API | – | يطلب ملاحظة عند الرفض/الإرجاع |

### 7.1b مكوّنات الهاتف (ملمس iOS — المواصفة الكاملة في `09-mobile-experience.md` §5)
TabBar (عائم، ينكمش عند التمرير، شارات)، NavigationBar (عنوان كبير → مضمَّن)، Sheet (Detents نصف/كامل، مقبض)، ActionSheet، SegmentedControl، GroupedList/ListRow، SwipeActions، PullToRefresh، CapsuleToast، CardCourse، CountdownPill، OfflineBanner، DownloadButton، InstallPrompt، SearchBar. القاعدة: على الشاشات < `lg` تُستبدل Dialog بـ Sheet، وDropdownMenu بـ ActionSheet، وTable بـ GroupedList، وToast بـ CapsuleToast تلقائيًا عبر نفس الـ API.

### 7.2 تشريح المكوّنات المركّبة
- **Table:** `Toolbar (FilterBar + Actions)` → `Table` → `Footer (Pagination + selection summary)`. الأعمدة تُعرَّف بمصفوفة `{key, header, cell, sortable, width, hideOnMobile}`؛ الصفوف الطويلة على الموبايل تُعرض بطاقة بـ 3 حقول أولية + "المزيد".
- **Form:** `FormLayout` (عمود/عمودان) من `FormField`s؛ التحقق على `blur` ثم عند الإرسال؛ الأخطاء من الخادم تُربط بحقولها (`errors.field`) والباقي في `Alert` أعلى النموذج؛ زر الإرسال يعطَّل أثناء الإرسال فقط.
- **Wizard:** خطوات مستقلة الحفظ (مسودة على الخادم بعد كل خطوة)، شريط تقدم، ملخص قبل الإرسال.
- **Dialog للحذف:** عنوان بصيغة "حذف X؟"، وصف الأثر، زر خطر، إلغاء أولًا في ترتيب التركيز.
- **Notification:** أيقونة الفئة، عنوان، نص مختصر، زمن نسبي، نقطة غير مقروء، إجراء واحد.

---

## 8. الأنماط

| النمط | القاعدة |
|---|---|
| القوائم الكبيرة | ترقيم خادم دائمًا؛ فلاتر في URL؛ حفظ آخر فلتر لكل صفحة في `localStorage` |
| الحالات الفارغة | لكل قائمة `EmptyState` بإجراء أساسي واحد (مثلًا "أضف مادة") |
| التحميل | Skeleton بنفس شكل المحتوى (لا Spinner مركزي للصفحات) |
| الأخطاء | Alert داخل السياق + زر إعادة المحاولة؛ أخطاء 403 تشرح النطاق؛ 404 صفحة موحدة |
| الإجراءات المدمّرة | Confirm دائمًا؛ الأثر الكبير يتطلب كتابة الاسم؛ Toast مع "تراجع" حيث يمكن |
| الحفظ | حفظ صريح (زر) في النماذج؛ حفظ تلقائي فقط في الاختبار والمسودات مع مؤشر "تم الحفظ HH:MM" |
| الرفع | شريط تقدم، إلغاء، إعادة محاولة؛ الفيديو مباشر إلى Bunny (إنتاج) |
| الحالة والتاريخ | كل كيان بحالة يعرض `StatusBadge` + تبويب "السجل" بـ Timeline |
| الأرقام والتواريخ | أرقام غربية؛ التاريخ `d MMM yyyy` بالعربية؛ الوقت 12 ساعة بـ ص/م؛ النسبي ("قبل 3 دقائق") في القوائم فقط |
| ثنائية اللغة | حقول `AR` إلزامية و`EN` اختيارية بتبويب لغة في النموذج |
| الطباعة/PDF | قالب واحد بترويسة الشعار الأفقي واسم الكلية ورقم مرجعي وQR |
| الإشعارات | الجرس في TopBar؛ لوحة منسدلة بآخر 10؛ صفحة كاملة بفلاتر |
| البحث | حقل واحد في TopBar (البوابة) يبحث في نطاق المستخدم (طلاب، مواد، طلبات) |

---

## 9. الهياكل (Shells)

| الهيكل | المكوّنات | ملاحظات |
|---|---|---|
| **الموقع العام** | Header (شعار أفقي، قائمة، لغة، زر "قدّم الآن" accent) → المحتوى → Footer (اتصال، روابط، سياسات، اجتماعي، شعار معكوس على navy) | عرض 1200px؛ أقسام بتناوب أبيض/n50 |
| **البوابة — سطح المكتب (≥ lg)** | TopBar (navy) + Sidebar (يمين، 264px، مطوي 72px) + المحتوى (`PageHeader` + جسم) | الإدارة والأساتذة على الحاسوب |
| **البوابة — الهاتف (< lg)** | **هاتف-أولًا للطالب والأستاذ:** NavigationBar بعنوان كبير + محتوى + TabBar عائم (5 تبويبات)؛ الأدوار الإدارية: Drawer + TabBar بثلاثة تبويبات (الرئيسية/الإشعارات/أنا) | الوضع الداكن مدعوم من المرحلة الأولى؛ التفاصيل في 09 |
| **المصادقة** | بطاقة مركزية 440px على n50 بشعار كامل | تسجيل الدخول، التسجيل (Wizard)، استعادة، تفعيل |
| **الزائر (متابعة الطلب)** | داخل الموقع العام بجلسة OTP؛ بطاقة واسعة 800px | لا شريط جانبي |
| **الاختبار** | شاشة مركّزة: عداد ثابت أعلى، سؤال، تنقل أسئلة جانبي، بلا Sidebar | منع الخروج العرضي بتأكيد |
| **الطباعة** | A4، ترويسة، جدول، تذييل برقم الصفحة | WeasyPrint |

---

## 10. قائمة الوصولية (تُفحص في المراجعة)

تباين AA، ترتيب تركيز منطقي، حلقة تركيز مرئية، `aria-label` للأيقونات، `aria-live` للتحديثات، Focus trap في الحوارات، Esc للإغلاق، أهداف لمس ≥ 44px، لا معلومات باللون وحده، نص بديل للصور، `lang`/`dir` صحيحان، دعم تكبير 200%، `prefers-reduced-motion`.

---

## 11. التنفيذ في `packages/ui`

```
packages/ui/
  src/tokens.css            §6
  src/theme.css             Tailwind @theme + base (fonts, reset, rtl utilities)
  src/fonts/                IBM Plex Sans Arabic woff2
  src/components/<Name>/    Name.tsx, Name.test.tsx, index.ts
  src/patterns/             DataTable, FormLayout, Wizard, StatusTimeline, PageShell, AuthShell, PublicShell
  src/icons.ts              إعادة تصدير lucide المستخدمة فقط
  src/index.ts
  styleguide/               صفحة عرض داخل البوابة `/dev/styleguide` (بلا Storybook في البداية)
```
قواعد: كل مكوّن يقبل `className` ويُمرّر `ref`؛ لا ألوان صريحة؛ اختبارات وصولية بـ `vitest-axe` للمكوّنات التفاعلية.
