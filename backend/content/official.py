"""The college's official pages (docs/07 §1): their paths, titles and what each should say.

Each one is a CMS `Page` whose slug is its path on the public site (`about/history` →
`/ar/about/history/`). The system creates the missing ones as *drafts* holding writing
guidance, never published: the site manager replaces the guidance with the college's
approved text and publishes, and only then does the page (and its menu link) appear.
Nothing here states an official fact.
"""

from dataclasses import dataclass

from django.db import transaction


@dataclass(frozen=True)
class Official:
    slug: str
    title_ar: str
    title_en: str
    # (section heading, what to write there)
    sections: tuple[tuple[str, str], ...]


OFFICIAL_PAGES: tuple[Official, ...] = (
    Official(
        "about",
        "عن الكلية",
        "About the college",
        (
            ("نبذة عن الكلية", "فقرة أو فقرتان تعرّفان بالكلية ورسالتها وما يميزها."),
            (
                "لماذا الكلية",
                "ثلاث إلى خمس نقاط تهم المتقدم: البرامج، هيئة التدريس، المرافق، فرص العمل.",
            ),
        ),
    ),
    Official(
        "about/history",
        "تاريخ الكلية",
        "History",
        (
            ("التأسيس", "سنة التأسيس والجهة المؤسِّسة وقرار الترخيص كما في الوثائق الرسمية."),
            ("مراحل التطور", "المحطات الرئيسية: الأقسام والبرامج التي أُضيفت، والمباني، والدفعات."),
            ("أبرز الإنجازات", "إنجازات موثّقة فقط، مع تواريخها."),
        ),
    ),
    Official(
        "about/vision",
        "الرؤية والرسالة والقيم",
        "Vision, mission and values",
        (
            ("الرؤية", "جملة واحدة معتمدة من مجلس الكلية."),
            ("الرسالة", "فقرة قصيرة معتمدة."),
            ("القيم", "قائمة القيم المعتمدة مع سطر يشرح كل قيمة."),
            ("الأهداف الاستراتيجية", "الأهداف كما في الخطة الاستراتيجية المعتمدة."),
        ),
    ),
    Official(
        "about/dean",
        "كلمة العميد",
        "Dean's welcome",
        (("كلمة العميد", "الكلمة بنص العميد، ثم الاسم والصفة. أضف صورة رسمية بنص بديل."),),
    ),
    Official(
        "about/leadership",
        "القيادة والهيكل الإداري",
        "Leadership",
        (
            ("مجلس الكلية", "الأسماء والصفات كما في قرار التشكيل."),
            ("العمادة", "العميد ووكلاؤه ومسؤولياتهم."),
            ("رؤساء الأقسام", "تظهر أسماؤهم من بيانات الأقسام تلقائيًا؛ أضف هنا ما يلزم فقط."),
            ("الهيكل التنظيمي", "صورة الهيكل المعتمد بنص بديل يصفه."),
        ),
    ),
    Official(
        "about/accreditation",
        "الاعتماد والاعتراف",
        "Accreditation",
        (
            ("الترخيص", "الجهة المرخِّصة ورقم القرار وتاريخه."),
            ("الاعتماد البرامجي", "البرامج المعتمدة والجهة وتاريخ الاعتماد وصلاحيته."),
            ("الاعتراف بالشهادات", "الجهات التي تعترف بشهادات الكلية، بالمستندات الداعمة."),
            ("العضويات", "الاتحادات والشبكات التي تنتمي إليها الكلية."),
        ),
    ),
    Official(
        "about/partners",
        "الشركاء",
        "Partners",
        (
            ("الشراكات الأكاديمية", "الجامعات والمعاهد الشريكة ومجال كل شراكة."),
            ("جهات العمل والتدريب", "الشركات والمؤسسات التي تستقبل المتدربين أو توظّف الخريجين."),
        ),
    ),
    Official(
        "about/careers",
        "الوظائف",
        "Careers",
        (
            (
                "الوظائف المتاحة",
                "المسمى والقسم والمؤهلات وآخر موعد لكل وظيفة، أو «لا توجد وظائف حاليًا».",
            ),
            ("طريقة التقديم", "البريد أو الرابط والمستندات المطلوبة."),
        ),
    ),
    Official(
        "academics/student-guide",
        "دليل الطالب",
        "Student guide",
        (
            ("التسجيل والإضافة والحذف", "المواعيد والخطوات وحدود الساعات."),
            ("الحضور والغياب", "نسبة الحضور المطلوبة وما يترتب على تجاوزها."),
            ("الامتحانات والتقديرات", "نظام التقديرات والإعادة والتظلم؛ اربط باللوائح المنشورة."),
            ("الخدمات", "البوابة، البريد، المكتبة، شؤون الطلاب، وكيف يصل الطالب إليها."),
        ),
    ),
    Official(
        "academics/library",
        "المكتبة",
        "Library",
        (
            ("مواعيد العمل", "الأيام والساعات، ومواعيد الامتحانات إن اختلفت."),
            ("المجموعات والمصادر", "الكتب والدوريات وقواعد البيانات المتاحة."),
            ("الاستعارة", "المدة والعدد والغرامات."),
        ),
    ),
    Official(
        "admissions/fees",
        "الرسوم والمنح",
        "Fees and scholarships",
        (
            ("الرسوم الدراسية", "الرسوم المعتمدة لكل برنامج وللعام، ورسوم التسجيل والامتحانات."),
            ("طرق الدفع والأقساط", "الحسابات المعتمدة ومواعيد الأقساط."),
            ("المنح والتخفيضات", "أنواع المنح وشروطها ومواعيد التقديم لها."),
            ("الاسترداد", "سياسة استرداد الرسوم المعتمدة."),
        ),
    ),
    Official(
        "admissions/equivalence",
        "المعادلة والطلاب الدوليون",
        "Equivalence and international students",
        (
            ("معادلة الشهادات", "الشهادات المقبولة وجهة المعادلة والمستندات."),
            ("الطلاب الدوليون", "شروط القبول والتأشيرة والإقامة وجهة التواصل."),
        ),
    ),
    Official(
        "student-life/affairs",
        "شؤون الطلاب",
        "Student affairs",
        (
            ("الخدمات", "الخدمات التي تقدمها شؤون الطلاب ومواعيدها ومكانها."),
            ("الإرشاد", "الإرشاد الأكاديمي والنفسي وكيف يُحجز."),
            ("الشكاوى والمقترحات", "كيف يقدّم الطالب شكوى ومن يتابعها."),
        ),
    ),
    Official(
        "student-life/activities",
        "الأنشطة الطلابية",
        "Student activities",
        (
            ("الأندية والجمعيات", "الأندية القائمة وكيف ينضم الطالب."),
            ("الرياضة والمسابقات", "الأنشطة الدورية والمسابقات."),
        ),
    ),
    Official(
        "student-life/alumni",
        "الخريجون",
        "Alumni",
        (
            ("شبكة الخريجين", "كيف يتواصل الخريجون مع الكلية ويحدّثون بياناتهم."),
            ("قصص نجاح", "قصص بموافقة أصحابها."),
        ),
    ),
    Official(
        "gallery",
        "معرض الصور",
        "Gallery",
        (("الصور", "صور من الكلية وفعالياتها، ولكل صورة نص بديل ووصف قصير."),),
    ),
    Official(
        "privacy",
        "سياسة الخصوصية",
        "Privacy policy",
        (
            ("البيانات التي نجمعها", "ما يُجمع في التقديم والتواصل والبوابة."),
            ("كيف نستخدمها", "الأغراض فقط."),
            ("من يطّلع عليها", "الجهات داخل الكلية وخارجها إن وُجدت."),
            ("حقوقك والتواصل", "التصحيح والحذف وجهة التواصل."),
        ),
    ),
    Official(
        "terms",
        "شروط الاستخدام",
        "Terms of use",
        (
            ("استخدام الموقع والبوابة", "ما يُسمح به وما لا يُسمح."),
            ("المحتوى والملكية", "حقوق المحتوى والشعار."),
        ),
    ),
    Official(
        "accessibility",
        "بيان إمكانية الوصول",
        "Accessibility statement",
        (
            ("التزامنا", "المعيار المستهدف (WCAG 2.2 AA) وما يشمله."),
            ("الإبلاغ عن مشكلة", "كيف يبلّغ الزائر عن صفحة يصعب استخدامها."),
        ),
    ),
)

BY_SLUG = {page.slug: page for page in OFFICIAL_PAGES}
DRAFT_NOTE = (
    "مسودة أنشأها النظام: استبدل كل إرشاد بالنص المعتمد من الكلية ثم انشر الصفحة. "
    "لا يظهر رابطها في الموقع قبل النشر."
)
DEMO_NOTE = "نص تجريبي للعرض فقط — تكتب الكلية النص المعتمد لهذه الصفحة."


def blocks(page: Official, *, demo: bool = False) -> list[dict]:
    """The draft's guidance, or (dev only) the demo text, which says it is one."""
    out: list[dict] = [{"type": "note", "text": DEMO_NOTE if demo else DRAFT_NOTE}]
    for heading, hint in page.sections:
        text = f"(نص تجريبي) {hint}" if demo else hint
        out += [{"type": "heading", "text": heading}, {"type": "paragraph", "text": text}]
    return out


ORDER = {page.slug: i for i, page in enumerate(OFFICIAL_PAGES)}


def public_path(slug: str) -> str:
    """Where a page lives on the site: official pages at their path, others under /p/."""
    return slug if slug in BY_SLUG else f"p/{slug}"


def ensure_drafts(**kwargs) -> None:
    """Create the official pages that don't exist yet, as drafts (runs after every migrate)."""
    from .models import Page, Status

    existing = set(Page.objects.filter(slug__in=BY_SLUG).values_list("slug", flat=True))
    with transaction.atomic():
        for page in OFFICIAL_PAGES:
            if page.slug not in existing:
                Page.objects.create(
                    slug=page.slug,
                    title_ar=page.title_ar,
                    title_en=page.title_en,
                    blocks=blocks(page),
                    # A gallery reads best side by side; the editor can change it.
                    image_layout="grid" if page.slug == "gallery" else "single",
                    status=Status.DRAFT,
                )
