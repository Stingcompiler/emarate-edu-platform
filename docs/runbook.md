# دليل التشغيل — منصة كلية الإمارات (Runbook)

> للفريق التقني. كل الأوامر من جذر المستودع ما لم يُذكر غير ذلك. لا Docker.
>
> **البيئة القائمة بحسب آخر سجل تشغيل (3 أكتوبر 2026): VPS مشترك**، تحت `/opt/ecst`، خلف Caddy، مع PostgreSQL وRedis وsystemd. النشر والتراجع في §3 «على خادم خاص»، والنسخ في §5 «على خادم خاص». أقسام Render تصف خيارًا بديلًا في `render.yaml`، وليس نشرًا تلقائيًا يعمل حاليًا على VPS. اختيار بيئة الإطلاق النهائية ما زال قرار المالك؛ لم يُعد فحص الإعدادات الداخلية عبر SSH في مراجعة 4 أكتوبر.
>
> **جاهزية الإطلاق:** راجع `docs/qa/project-review-2026-10.md`؛ نجاح health أو CI وحده لا يكفي لإغلاق أخطاء الوصول وسلامة الإجابات والقرارات أو مطلب النسخ الخارجية.

## 1. الخدمات (render.yaml)

| الخدمة        | النوع                   | الدور                                                                        |
| ------------- | ----------------------- | ---------------------------------------------------------------------------- |
| `ecst-api`    | Web (Python)            | Django + DRF خلف gunicorn (`gthread 4×4`)، فحص الصحة `/api/public/health`    |
| `ecst-worker` | Worker                  | Celery: توزيع الإشعارات، طابور البريد، Push                                  |
| `ecst-beat`   | Worker                  | Celery Beat: التذكيرات، إغلاق الاختبارات، انتهاء الطلبات، التحقق اليومي      |
| `ecst-backup` | Cron (الجمعة 01:00 UTC) | نسخة `pg_dump` مشفّرة إلى Bunny (`backups/`، آخر 8)                          |
| `ecst-db`     | Postgres 16 (مدفوع)     | نسخ يومية + استعادة لنقطة زمنية من Render                                    |
| `ecst-redis`  | Key Value               | الذاكرة المؤقتة، حدود الطلبات، وسيط Celery                                   |
| `ecst-portal` | Static                  | البوابة (React). `/api/*` يُعاد توجيهه إلى الـ API (نفس الأصل للكوكيز وCSRF) |
| `ecst-site`   | Static                  | الموقع العام (Astro). يُعاد بناؤه عند النشر من لوحة الموقع                   |

النطاقات: `api.ecst.edu.sd` و`portal.ecst.edu.sd` و`ecst.edu.sd` (+`www`) عبر Cloudflare (Proxy مفعّل، SSL: Full strict).

## 2. أول نشر

1. **Blueprint:** Render → New → Blueprint → اختر المستودع؛ يقرأ `render.yaml`.
2. **الأسرار** (`sync: false`) — أنشئها وخزّن نسخة في مدير كلمات مرور الكلية **قبل** إدخالها:
   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # FIELD_ENCRYPTION_KEY, BACKUP_ENCRYPTION_KEY, SITE_BUILD_TOKEN
   ```
   ```bash
   cd backend && uv run python manage.py vapid_keys                  # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
   ```
   - `SITE_BUILD_TOKEN`: القيمة نفسها في `ecst-api` و`ecst-site`.
   - `SITE_REBUILD_HOOK_URL`: من `ecst-site` → Settings → Deploy Hook.
   - مفاتيح Bunny (Storage + Pull Zone token + Stream) وBrevo من لوحاتهما.
3. **النطاقات:** أضف النطاقات المخصصة في Render، ثم سجلات CNAME في Cloudflare.
4. **أول مدير نظام** (Shell الخدمة `ecst-api`):
   ```bash
   uv run python manage.py create_system_admin --email it@ecst.edu.sd --name "اسم المدير"
   ```
   يطبع رابط تفعيل صالحًا 7 أيام لمرة واحدة؛ صاحب البريد يختار كلمة المرور. بعدها تُنشأ بقية الحسابات من `/system/users`.
5. **الهيكل:** من `/system/structure` أضف الأقسام والبرامج والعام والفصل الحالي، ثم استورد سجل الطلاب من `/student-imports`.

## 3. النشر والتراجع

- كل دفع إلى `main` بعد نجاح CI يُنشر تلقائيًا. `preDeployCommand` يطبّق الترحيلات ثم `check --deploy`؛ إن فشل أيٌّ منهما لا يُستبدل الإصدار العامل.
- **التراجع:** Render → الخدمة → Deploys → Rollback إلى الإصدار السابق. الترحيلات قابلة للعكس (مُختبرة على SQLite وPostgres)؛ لعكس ترحيل بعينه قبل التراجع:
  ```bash
  uv run python manage.py migrate <app> <previous_migration>
  ```
- الموقع العام: إن فشل بناؤه (`LANDING_STRICT=1` يوقفه عند تعطّل الـ API) تبقى النسخة المنشورة السابقة كما هي؛ أعد البناء من Deploy Hook بعد إصلاح الـ API.

### على خادم خاص (VPS)

Render لا يُستعمل هنا. النشر بسكربت واحد من جهاز المطوّر، يبني `origin/main` بالضبط لا ملفات العمل المحلية:

```bash
export ECST_SSH=user@host ECST_SSH_KEY=~/.ssh/<key>     # عنوان الخادم لا يُكتب في المستودع (عام)
export VITE_SITE_URL=https://<الموقع>/ar/                # للبوابة فقط
scripts/deploy-vps.sh all          # أو backend | portal | site
scripts/deploy-vps.sh status       # الإصدار المنشور وحالة الخدمات والمؤقتات
scripts/deploy-vps.sh rollback backend   # أو portal | site | all
```

- قبل كل نشر تُحفظ النسخة الحالية في `/opt/ecst/previous/`، ويُكتب الإصدار في `/opt/ecst/DEPLOYED`.
- `rollback` يعيدها في خطوة واحدة.
- السكربت الحالي لا يثبت الاعتماديات الجديدة في venv ولا يجعل فحص HTTP شرطًا لنجاح النشر (تقرير المراجعة A12/A13). قبل نشر تغيير اعتماديات يلزم مزامنة بيئة staging واختبار النشر والتراجع فيها؛ لا يُعد ملف `DEPLOYED` وحده دليلًا على سلامة الخدمة.
- **الترحيلات لا تُعكس تلقائيًا:**
  - اعكسها بـ `migrate <app> <previous>` قبل التراجع؛
  - أو استعد نسخة احتياطية (§5) إن حذف الترحيل بيانات.

## 4. التحقق بعد النشر

- `https://api.ecst.edu.sd/api/public/health` → `status: ok`.
- ادخل إلى البوابة، ثم افتح `/audit`: يجب أن يكون عنوان IP في آخر عملية هو عنوانك العام الحقيقي. إن ظهر عنوان Cloudflare أو Render فعدّل `TRUSTED_PROXIES` (عدد الوكلاء الذين يضيفون إلى `X-Forwarded-For`) — القيمة الخاطئة تسمح بانتحال العنوان في التدقيق وحدود الطلبات.
- أرسل إشعارًا تجريبيًا لنفسك (داخل التطبيق + Push + بريد).
- انشر تعديلًا صغيرًا على صفحة من `/site` وتأكد من إعادة بناء الموقع خلال دقيقتين.

على VPS تُستخدم نطاقات النشر القائمة بدل نطاقات Render أعلاه. قراءة `health` يجب أن تؤكد قاعدة البيانات والذاكرة المؤقتة؛ بعدها يُجرى فحص دخول ورحلة حرجة في نافذة الصيانة المتفق عليها. `systemctl is-active` وحده لا يثبت أن إصدار التطبيق صالح.

## 5. النسخ الاحتياطي والاستعادة

**خط الدفاع الأول:** نسخ Render اليومية واستعادة النقطة الزمنية (PITR) من لوحة `ecst-db`.

**النسخة الخارجية الأسبوعية:** `ecst-backup` يحفظ `backups/ecst-<وقت>.dump.enc` في Bunny (مشفّرة بـ `BACKUP_ENCRYPTION_KEY`).

```bash
# سرد النسخ
uv run python manage.py restore_database --list
# فك تشفير نسخة إلى ملف محلي (لا يلمس قاعدة البيانات)
uv run python manage.py restore_database --name backups/ecst-20261002T010000Z.dump.enc --out /tmp/ecst.dump
```

**على خادم خاص (VPS، مثل نسخة العرض الحالية):**

- المؤقِّت `ecst-backup.timer` يشغّل `backup_database` يوميًا الساعة 03:15، ويحتفظ بآخر `BACKUP_KEEP` نسخة (14).
- لأن الملفات المرفوعة على قرص الخادم (`MEDIA_BACKEND=local`)، تُحفظ معها نسخة مشفّرة `ecst-media-<وقت>.tar.gz.enc`.
- المكان: `/opt/ecst/media/private/backups/`، وهو مجلد خاص لا يقدّمه Caddy.
- **هذه النسخ على قرص الخادم نفسه.** فقدان الخادم يُفقدها معه، فلا بد من نسخة خارجه (Bunny أو تخزين آخر يختاره المالك).
- **المفتاح:**
  - `BACKUP_ENCRYPTION_KEY` في `/opt/ecst/env`؛
  - يقرؤه المالك وحده: `sudo grep '^BACKUP_ENCRYPTION_KEY=' /opt/ecst/env`؛
  - ويحفظه في مدير كلمات المرور؛
  - بدونه لا تُقرأ أي نسخة.

```bash
systemctl list-timers ecst-backup.timer        # الموعد القادم
sudo systemctl start ecst-backup.service      # نسخة الآن
journalctl -u ecst-backup -n 5                # نتيجة آخر نسخة
```

**تدريب الاستعادة (كل ربع سنة) — على قاعدة مؤقتة لا الإنتاج:**

```bash
createdb ecst_drill
pg_restore --no-owner --no-privileges --dbname ecst_drill /tmp/ecst.dump
psql -d ecst_drill -c "select count(*) from students_studentrecord"
dropdb ecst_drill
```

دوّن التاريخ والمدة وعدد الصفوف في سجل التدريبات.

**ملفات VPS جزء من تدريب الاستعادة أيضًا.** فك تشفير أرشيف الملفات من الطابع الزمني نفسه إلى مكان خاص، وفكّه إلى مجلد مؤقت منفصل، ثم تحقق من عدد الملفات وأحجامها وفتح عينة من المرفقات. لا تفك الأرشيف إلى `/opt/ecst/media` أثناء التدريب. الأمر `restore_database --name backups/ecst-media-<وقت>.tar.gz.enc --out <مجلد-خاص>/media.tar.gz` يفك التشفير فقط؛ هذا الأرشيف يغطي مساري `public/` و`private/` تحت MEDIA_ROOT. اختبر الاستعادة من النسخة **الخارجية** بعد إعدادها، مع المفتاح المحفوظ خارج الخادم؛ استعادة ملف على القرص نفسه لا تختبر فقدان الخادم.

| التاريخ    | البيئة           | النتيجة                                                                                               |
| ---------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| 2026-10-03 | VPS (نسخة العرض) | 89 جدولًا، والأعداد مطابقة للإنتاج. المدة 5 ثوانٍ. سجل التدقيق يزيد صفًا في الإنتاج: صف النسخة نفسها. |

**استعادة حقيقية:** أوقف `ecst-worker` و`ecst-beat` وضع `ecst-api` في وضع صيانة (Suspend)، ثم:

```bash
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$DATABASE_URL" /tmp/ecst.dump
uv run python manage.py migrate --noinput
```

ثم أعد تشغيل الخدمات وتحقق كما في §4.

> بلا `BACKUP_ENCRYPTION_KEY` لا تُقرأ أي نسخة. بلا `FIELD_ENCRYPTION_KEY` تُفقد روابط البث المشفّرة فقط (تُعاد إضافتها).

## 6. تدوير المفاتيح

| المفتاح                 | الأثر                                  | الإجراء                                                            |
| ----------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `DJANGO_SECRET_KEY`     | يُخرج كل المستخدمين (توقيع JWT)        | غيّره في Render وأعد النشر؛ أبلغ المستخدمين                        |
| `FIELD_ENCRYPTION_KEY`  | القيم المشفّرة القديمة تصبح غير مقروءة | لا تدوّره إلا عند التسريب؛ بعده أعد إدخال روابط جلسات البث القادمة |
| `BACKUP_ENCRYPTION_KEY` | النسخ الجديدة بالمفتاح الجديد          | احتفظ بالقديم لقراءة النسخ السابقة حتى تُحذف (8 أسابيع)            |
| مفاتيح VAPID            | تبطل اشتراكات Push الحالية             | الطلاب يعيدون التفعيل من الإعدادات                                 |
| Bunny / Brevo           | —                                      | أنشئ المفتاح الجديد، حدّث Render، ثم ألغِ القديم                   |
| `SITE_BUILD_TOKEN`      | —                                      | حدّثه في `ecst-api` و`ecst-site` معًا                              |

## 7. المراقبة

- **Sentry** (اختياري، `SENTRY_DSN`): أخطاء الـ API بلا بيانات شخصية (`send_default_pii=False`).
- **فحص التوفر:** راقب `/api/public/health` كل دقيقة (Cloudflare Health Checks أو UptimeRobot).
- **السجلات:** JSON في Render Logs؛ ابحث بـ `"level":"ERROR"`.
- **البريد:** طابور `Outbox` في لوحة Django (`/admin/notifications/outbox/`): الحالة `failed` بعد إعادة المحاولات تعني مشكلة مزود.
- **Beat:** إن توقفت التذكيرات فتحقق من أن `ecst-beat` يعمل (خدمة واحدة فقط).

على VPS، بحسب سجل التشغيل الحالي، Beat يعمل داخل `ecst-worker --beat`، وليس خدمة `ecst-beat` منفصلة. استخدم `systemctl is-active ecst-api ecst-worker` و`journalctl -u ecst-api -u ecst-worker --since -1h --no-pager`، و`systemctl list-timers ecst-backup.timer ecst-site-build.timer`. لا تطبع `/opt/ecst/env` أو كلمات مرور العرض. لا تُغيّر Redis أو Caddy أو منافذ المشاريع الأخرى على الخادم المشترك. يبقى إعداد التنبيهات للتوفر والقرص وفشل النسخ مطلوبًا؛ وجود السجلات ليس تنبيهًا.

## 8. أيام الاختبارات

- قبل الاختبار بيوم: في Render راجع خطة `ecst-api` وعدد النسخ؛ على VPS راجع الذاكرة والعمال والاتصالات وحصة الموارد المشتركة.
- قياس `scripts/loadtest` بتاريخ 28 سبتمبر كان على **MacBook Air M1، PostgreSQL16، تسعة عمال × أربعة خيوط**: 500 طالب، حفظ p95 = 16ms. لا يثبت قدرة VPS الحالي (الإعداد المسجل أربعة عمال × أربعة خيوط). أعد القياس في بيئة معزولة بمواصفات الخادم قبل اختبار الكلية؛ لا تشغل k6 على الإنتاج المشترك دون موافقة المالك ونافذة محددة.
- لا تنشر إلى `main` أثناء اختبار جارٍ.
- انقطاع أثناء الاختبار: الوقت من الخادم، والإجابات محفوظة سؤالًا بسؤال؛ يمكن للأستاذ تمديد المحاولة أو إعادة فتحها من صفحة المراقبة.

## 9. حوادث شائعة

| العرَض                       | السبب المرجّح                | الإجراء                                                                            |
| ---------------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| البوابة تعرض 403 عند الحفظ   | CSRF/الأصل                   | تحقق من `DJANGO_CSRF_TRUSTED_ORIGINS` وقاعدة إعادة توجيه `/api/*` في `ecst-portal` |
| الموقع العام لا يتحدث        | Deploy Hook أو بناء صارم فشل | سجل بناء `ecst-site`؛ `SITE_REBUILD_HOOK_URL` و`SITE_BUILD_TOKEN`                  |
| نموذج التواصل يفشل من الموقع | CORS                         | `PUBLIC_SITE_ORIGINS` يطابق أصل الموقع حرفيًا (https + www)                        |
| 429 كثيرة                    | حدود الطلبات                 | `public_read` 120/د للزائر، المستخدم 240/د؛ تحقق من `TRUSTED_PROXIES` أولًا        |
| الفيديو لا يعمل              | Bunny Stream                 | حالة الفيديو في Stream و`BUNNY_STREAM_TOKEN_KEY`                                   |
