# أدلة المحور 1.1 — هوية الطالب (التسجيل، الانتحال، نقل حساب الخريج)

المجسات في `backend_probes.py`. كل مجس **يتوقع الخلل**: نجاحه يعني أن الخلل قائم.

```bash
bash scripts/qa/probe.sh docs/qa/evidence/review-2026-11-10/identity sqlite
QA_PG_URL=postgres:///ecst_qa bash scripts/qa/probe.sh docs/qa/evidence/review-2026-11-10/identity pg
```

النتيجة على `34c533a` (قبل الإصلاح): خمسة مجسات نجحت على SQLite وPostgreSQL
(`probes-sqlite.txt`، `probes-postgres.txt`) — أي ستة أعطال مثبتة.

| المعرّف | الخطورة | الخلل المثبت | الإصلاح | اختبار الانحدار الدائم (`accounts/tests/test_registration.py`) |
|---|---|---|---|---|
| R57 | 🔴 | طلب تسجيل اكتمل تحققه قبل أن يصير نقل الخريج معلّقًا يُكمَل فوقه: حساب ثانٍ يرتبط بسجل الماجستير | `complete_registration` يرفض سجلًا له نقل معلّق (409 `pending_approval`) | `test_a_request_verified_before_the_move_cannot_finish_over_it` |
| R58 | 🟠 | بطاقة نقل صار لسجلها حساب آخر تجيب 409 على الاعتماد والرفض معًا، فتبقى للأبد وتُبقي السجل مغلقًا | الاعتماد 409 `stale`؛ الرفض يغلق البطاقة بلا بريد | `test_a_stale_move_card_is_closed_by_rejecting_it` |
| R59 | 🟠 | إيقاف حساب ببلاغ انتحال لا يغلق طلب نقله المعلّق على سجل آخر | الإيقاف يغلق طلبات نقل الحساب المعلّقة | `test_an_upheld_report_closes_the_accounts_pending_move` |
| R60 | 🟢 | الحساب نفسه يطلب النقل إلى سجلين؛ اعتماد الثاني يفشل برسالة «البريد مستعمل» | طلب نقل واحد في وقت واحد (409 `move_pending` عند الطلب) | `test_an_account_asks_for_one_move_at_a_time` |
| R61 | 🟢 | برنامج موقوف يقبل طالبًا جديدًا بالإضافة اليدوية | **قرار المالك 2026-11-10: يُقبل** (طالب قائم في برنامج يُدرَّس حتى ينتهي) والنموذج ينبّه؛ حُذف المجس | `students/tests/test_manage.py::test_a_stopped_programme_still_takes_a_student_added_by_hand` |
| R62 | 🟢 | حذف سجل الماجستير يُسقط أرشفة سجل البكالوريوس (`account_moved_to` = `SET_NULL`) | علامة الأرشفة `account_moved_at` (ترحيل `students/0005`) | `test_an_archived_record_stays_archived_when_the_new_record_is_deleted` |
| R63 | 🟢 | رسائل النقل بصياغة الحساب الجديد: الصفحة «حسابك بانتظار الاعتماد»، بريد الرفض «أعد التسجيل»، إشعار الاعتماد «اعتُمد حسابك» | حالة `move_pending` ونصها، بريد `account_move_rejected`، إشعار `account_move_approved` | `test_a_rejected_move_leaves_the_account_where_it_was`، `test_an_approved_move_tells_the_student_about_the_move` |

بعد دمج #267 (`b42a842`): مجسات R57 وR59 وR60 وR62 **تفشل** (الخلل زال) ومجس R61 كان ما زال ناجحًا (`verify-after-267-sqlite.txt`) ثم حُذف بقرار المالك.

**ما لم يُفحص بعد من جدول 1.1 في الخطة:** توحيد الرسائل والأزمنة عند عدم المطابقة، إغراق البريد
الرسمي بالبلاغات، إبطال الجلسات عند قبول البلاغ، الإضافة اليدوية لكل دور × نطاق، الرقم الجامعي
بحالة أحرف مختلفة، ومسارات تعديل الاسم الأربعة.

## الجولة الرابعة (بقية 1.1)

المجسات في `backend_probes_2.py` (تُلحق بـ `backend_probes.py` عند التشغيل؛ سجلها `probes-round4-sqlite.txt`،
وفيه أيضًا مجسات R57–R62 التي تفشل لأن خللها زال).

| المعرّف | الخطورة | الخلل المثبت | الإصلاح | اختبار الانحدار |
|---|---|---|---|---|
| R78 | 🟠 | الاستيراد لا يوحّد حالة أحرف الرقم الجامعي (نموذج الإضافة يفعل): «26-it-0001» يصير سجلًا ثانيًا بجانب «26-IT-0001» | الاستيراد يكتب الرقم بأحرف كبيرة ويبحث به | `students/tests/test_importer.py::test_an_import_finds_a_number_in_another_case` |
| R79 | 🟠 | طالب يكتب رقمه بأحرف صغيرة في التسجيل يتلقى «لا تطابق» ولا يصله رمز | المطابقة بلا اعتبار لحالة الأحرف | `accounts/tests/test_registration.py::test_a_number_typed_in_lower_case_is_found` |
| R80 | 🟢 | كل بلاغ انتحال بعنوان آخر على الحساب نفسه = إشعار جديد لكل معتمدي القسم | الإشعار عند أول بلاغ مفتوح فقط؛ البقية تُضاف إلى القائمة | `…::test_the_approvers_hear_of_the_first_report_on_an_account` |

**ثبتت صحته:** رسالة موحّدة لكل عدم مطابقة ولا بريد (اختبار قائم)؛ قبول البلاغ يُبطل الجلسات فورًا
(`_revoke_refresh_tokens` يرفع `token_version` فتسقط رموز الدخول المفتوحة أيضًا)؛ البلاغ نفسه من العنوان
نفسه يُحفظ مرة؛ حد الطلبات العامة 20 في الساعة لكل عنوان IP.

**لم يُفحص:** تساوي أزمنة الرد عند المطابقة وعدمها (قياس توقيت).
