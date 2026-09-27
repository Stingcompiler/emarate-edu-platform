# بحث المراجع — UX Research (منصات تعليمية احترافية + قدرات PWA على iOS)

> إصدار 1.0 — 2026-09-27. بحث فعلي على الويب (سبتمبر 2026) لتأسيس `09-mobile-experience.md`. المصادر في نهاية المستند.

---

## 1. ما الذي نبحث عنه

ثلاثة أسئلة: (1) كيف تنظّم أفضل تطبيقات الطلاب الشاشة والتنقل؟ (2) ما الذي يمكن لتطبيق PWA على iPhone فعله فعليًا في 2026 حتى لا نعد بما لا يتحقق؟ (3) كيف يُنفَّذ التنزيل للقراءة دون اتصال بشكل موثوق؟

---

## 2. المنصات التعليمية — ما نأخذه وما نتركه

### 2.1 Canvas Student (Instructure)
- **ما تفعله:** لوحة بثلاث طرق عرض (بطاقات ملونة لكل مادة / قائمة زمنية للمستحق / النشاط الأخير)؛ قائمة "To Do" تعرض حتى 7 عناصر قادمة بتواريخها عبر كل المواد؛ تقويم؛ إشعارات فورية؛ في مايو 2026 أُطلقت لوحة جديدة بـ Widgets قابلة للتخصيص (كل الواجبات من كل المواد في قائمة واحدة مع فلاتر "ناقص/قادم"، الدرجات فورًا، الأشخاص للمراسلة).
- **نأخذ:** فكرة "المهام عبر كل المواد بترتيب زمني" كتبويب مستقل؛ بطاقة مادة بلون هوية؛ فلتر ناقص/قادم؛ الدرجات في نظرة.
- **نترك:** تخصيص Widgets (تعقيد لا يحتاجه طالب الكلية)؛ صندوق الرسائل الداخلي (لدينا إشعارات + إعلانات فقط).

### 2.2 Google Classroom
- **ما تفعله:** فصل صارم بين **Stream** (لوحة إعلانات) و**Classwork** (الواجبات مرتبة بموضوعات)؛ ترميز لوني للحالة (أحمر متأخر / أخضر قادم)؛ أزرار كبيرة وواجهة خالية من الزحام؛ تبديل المواد من قائمة واحدة.
- **نأخذ:** الفصل بين "إعلانات المادة" و"أعمال المادة"؛ الحد الأدنى من العناصر على الشاشة؛ التسليم في ≤ 3 نقرات.
- **نترك:** قائمة الهامبرغر للتنقل الرئيسي (نستخدم تبويبات سفلية).

### 2.3 Moodle App
- **ما تفعله:** تنزيل مادة كاملة أو عناصر مفردة؛ التنزيل بترتيب الأولوية (القادم أولًا)؛ استئناف التنزيل بعد الانقطاع؛ مؤشر تقدم لكل مادة؛ مزامنة انتقائية؛ حدود تخزين قابلة للضبط وتنظيف تلقائي (30/60/90 يومًا)؛ أنشطة تعمل دون اتصال وتتزامن لاحقًا.
- **نأخذ:** نموذج التنزيل بالكامل (أولوية، استئناف، حدود، تنظيف تلقائي، مزامنة انتقائية) — هو المرجع لتنزيل المحاضرات.
- **نترك:** كثافة الواجهة وتعدد الأنشطة.

### 2.4 Brightspace Pulse (D2L)
- **ما تفعله:** عرض أسبوعي + **رسم بياني لحجم العمل القادم**؛ "مستحق اليوم / هذا الأسبوع / قادم" عبر المواد؛ إشعارات مجمّعة؛ محتوى دون اتصال يشمل الفيديو والصوت؛ **لا تدعم أداء الاختبارات في التطبيق** (تحيل إلى المتصفح).
- **نأخذ:** تجميع "اليوم/الأسبوع/القادم"؛ مؤشر حجم العمل الأسبوعي؛ الفيديو دون اتصال.
- **نترك:** استبعاد الاختبارات — نحن سندعمها على الهاتف بتصميم مخصص (شاشة نقية، حفظ محلي، زمن الخادم).

### 2.5 دروس من التطبيقات الاستهلاكية
- **Duolingo:** تقدم مرئي واحتفال صغير عند الإتمام؛ يُستخدم عندنا باعتدال ("أنجزت كل واجبات الأسبوع") — لا نقاط ولا لوحات صدارة (لا تناسب السياق الأكاديمي الرسمي).
- **Todoist / Apple Reminders:** تجميع اليوم/القادم، سحب الصف للإكمال/التمييز، قوائم مجمّعة بعناوين.

### 2.6 أدلة التصميم
- **Apple HIG (iOS 26):** الشريط السفلي يطفو فوق المحتوى بمادة زجاجية شفافة ويصغر عند التمرير ثم يتمدد؛ "رف" اختياري فوق الشريط لحالة عامة (مثل عداد الاختبار الجاري)؛ الزجاج للطبقة الملاحية فقط (أشرطة، Sheets، قوائم) لا للمحتوى؛ الـ Sheet تنزلق من الأسفل وتُبقي الصفحة السابقة معتمة خلفها.
- **ما نطبّقه في PWA:** نحاكي الملمس بـ CSS (شريط سفلي عائم بزوايا كبيرة، `backdrop-filter` خفيف، عناوين كبيرة تنكمش، Sheets بمقابض سحب) مع إيقاف الشفافية على الأجهزة الضعيفة أو عند تفعيل "تقليل الشفافية".

---

## 3. قدرات PWA على iPhone (سبتمبر 2026) — الحقائق

| القدرة | الحالة | الأثر على تصميمنا |
|---|---|---|
| التثبيت على الشاشة الرئيسية | iOS 26: أي موقع يُضاف للشاشة الرئيسية يفتح كتطبيق ويب افتراضيًا (خيار "Open as Web App" مفعّل) | شاشة إرشاد تثبيت بخطوتين (مشاركة → إضافة إلى الشاشة الرئيسية) |
| Web Push | منذ iOS 16.4، **للمثبَّت فقط**؛ Safari 18.4 أضاف Declarative Web Push (بلا Service Worker لعرض الإشعار) | طلب الإذن بعد أول قيمة (مثلًا بعد فتح أول مادة)، لا عند الإطلاق |
| Badging (رقم على الأيقونة) | منذ 16.4 مع إذن الإشعارات | عدّاد غير المقروء على الأيقونة |
| منع قفل الشاشة (Wake Lock) | منذ Safari 18.4 للمثبَّت | يُفعَّل أثناء الاختبار والبث |
| File System Access | مدعوم | حفظ الملفات المنزّلة عند الحاجة |
| Background Sync | **غير موثوق/غير مدعوم** | كل مزامنة تتم عند فتح التطبيق؛ لا وعود بـ "يرسل لاحقًا في الخلفية" |
| الاهتزاز اللمسي، البصمة كـ API | غير متاح (البصمة عبر Passkeys/WebAuthn فقط) | نتركهما لمرحلة Capacitor؛ Passkeys للدخول لاحقًا |
| التخزين | Cache API + IndexedDB؛ التطبيق المثبَّت يحتفظ بتخزينه، والمواقع غير المثبَّتة عرضة للإخلاء | `navigator.storage.persist()` + شرط التثبيت لتفعيل "التنزيل دون اتصال" |
| المتجر | لا | لاحقًا عبر Capacitor بنفس الكود |

---

## 4. التنزيل والعمل دون اتصال — أفضل الممارسات

- **Cache Storage API** للملفات (PDF، فيديو، صور) و**IndexedDB** للبيانات المهيكلة (قوائم المحاضرات، حالة التنزيل، مسودات الإجابات).
- الملفات الكبيرة تُكتب **بالتدفق** (Streaming) على دفعات مع تحديد معدل الكتابة؛ لا تُحمَّل في الذاكرة كاملة.
- استراتيجيات مركّبة: `Cache-first` للأصول الثابتة، `Network-first` مع سقوط إلى الذاكرة المؤقتة لبيانات الـ API، `Cache-only` للمحتوى الذي نزّله المستخدم صراحة.
- إدارة السعة: عرض المستخدم قبل التنزيل، حد لكل مادة، تنظيف تلقائي، خيار "Wi-Fi فقط"، استئناف بعد الانقطاع (Range requests).
- الفيديو: تنزيل نسخة MP4 بجودة محددة (Bunny Stream يوفر MP4 fallback) لا HLS.

---

## 5. حقائق عن سلوك الطلاب على الهاتف

- التعلّم عبر الهاتف يحدث في **لحظات مجزأة** وتحت ضغط الوقت — الشاشة الأولى يجب أن تجيب "ماذا عليّ الآن؟" بلا تنقل.
- الواجهات المعقدة سبب رئيسي لهجر التطبيقات (تقارير تذكر ~70%)؛ تتبع التقدم عنصر حاسم؛ التحفيز (Gamification) يفيد فقط إذا عكس تقدمًا حقيقيًا.
- دراسة على طلاب جامعيين: الانخراط في التعلم عبر الهاتف يرتفع مع سهولة الاستخدام المدركة والفائدة المدركة — أي السرعة والوضوح قبل الميزات.

---

## 6. الخلاصة التي تُبنى عليها `09-mobile-experience.md`

1. تبويب "اليوم" كشاشة أولى، وتبويب "المهام" عبر المواد (Canvas/Pulse).
2. فصل الإعلانات عن الأعمال داخل المادة (Classroom).
3. تنزيل بنموذج Moodle (أولوية، استئناف، حدود، تنظيف).
4. الاختبار على الهاتف مدعوم بتصميم خاص (عكس Pulse).
5. ملمس iOS 26 مُحاكى بـ CSS مع احترام القدرة (Pulse/HIG).
6. وعود PWA الصادقة: Push وBadge للمثبَّت؛ لا مزامنة خلفية؛ لا اهتزاز.

---

## المصادر

- [PWA iOS Limitations and Safari Support (2026) — MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Do Progressive Web Apps Work on iOS? 2026 Guide — MobiLoud](https://www.mobiloud.com/blog/progressive-web-apps-ios/)
- [PWA Push Notifications on iOS in 2026 — Webscraft](https://webscraft.org/blog/pwa-pushspovischennya-na-ios-u-2026-scho-realno-pratsyuye?lang=en)
- [What Can PWAs Do on iPhone in 2026? — OJapp](https://tips.ojapp.app/en/safari-pwa-limitations-2/)
- [Progressive Web Apps on iOS — Monterail](https://www.monterail.com/blog/pwa-for-apple-ios)
- [Tab bars — Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/tab-bars)
- [iOS 26 Design Guidelines: Illustrated Patterns — Learn UI Design](https://www.learnui.design/blog/ios-design-guidelines-templates.html)
- [Don't Design Junk in the New iOS 26 Tab Bar — Medium](https://medium.com/design-bootcamp/dont-design-junk-in-the-new-ios-26-tab-bar-4de8e842da89)
- [Liquid Glass: Hierarchy, Harmony and Consistency — Create with Swift](https://www.createwithswift.com/liquid-glass-redefining-design-through-hierarchy-harmony-and-consistency/)
- [Canvas Student Dashboard Changes (May 2026) — Rutgers](https://canvas.rutgers.edu/2026/05/25/canvas-student-dashboard-changes/)
- [Canvas To Do List, Calendar & Notifications — SAS-LPS Helpdesk](https://sas-lps.freshdesk.com/support/solutions/articles/42000092946-canvas-to-do-list-calendar-canvas-notification-preferences-for-students)
- [Canvas Student Mobile App — Emory University](https://canvas-support.emory.edu/instructionalsupport/mobile-student.html)
- [Google Classroom 101: The 2026 Guide](https://digitalteachersolutions.substack.com/p/google-classroom-101-the-2026-guide)
- [Google Classroom Review 2026 — AppViewable](https://appviewable.com/apps/app-google-classroom/)
- [Moodle app offline features — MoodleDocs](https://docs.moodle.org/502/en/Moodle_app_offline_features)
- [Optimizing the Moodle App for 2026 — MetaDesign Solutions](https://metadesignsolutions.com/blog/optimizing-the-moodle-app-for-2026-offline-learning-push-notifications-and-biometric-authentication)
- [About Brightspace Pulse — D2L Community](https://community.d2l.com/brightspace/kb/articles/16502-about-brightspace-pulse)
- [Brightspace Pulse App — University at Buffalo](https://www.buffalo.edu/lms/pulse.html)
- [Top Education App Design Trends — Lollypop](https://lollypop.design/blog/2025/august/top-education-app-design-trends-2025/)
- [UI/UX design in e-learning app development 2026 — LITSLINK](https://litslink.com/blog/ui-ux-nuancese-elearning-app)
- [University Students' Engagement in Mobile Learning — PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9857874/)
- [Mobile Learning Design: UX, Formats, Best Practices — CommLab India](https://www.commlabindia.com/blog/mobile-learning-design-strategy)
- [Offline data — web.dev](https://web.dev/learn/pwa/offline-data)
- [PWA with offline streaming — web.dev](https://web.dev/articles/pwa-with-offline-streaming)
- [Offline-First PWAs: Service Worker Caching Strategies — MagicBell](https://www.magicbell.com/blog/offline-first-pwas-service-worker-caching-strategies)
