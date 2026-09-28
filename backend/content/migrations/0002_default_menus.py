"""The public site's default header and footer (docs/07 §1), editable afterwards.

Links to official pages that don't exist yet are listed here on purpose: the site
only shows a link once its page is published, so the structure is ready from day one.
"""

from django.db import migrations, models

L = tuple[str, str, str]  # label_ar, label_en, path

HEADER: list[tuple[str, str, list[L]]] = [
    (
        "عن الكلية",
        "About",
        [
            ("نبذة عن الكلية", "Overview", "/about"),
            ("تاريخ الكلية", "History", "/about/history"),
            ("الرؤية والرسالة والقيم", "Vision, mission and values", "/about/vision"),
            ("كلمة العميد", "Dean's welcome", "/about/dean"),
            ("القيادة والهيكل الإداري", "Leadership", "/about/leadership"),
            ("الاعتماد والاعتراف", "Accreditation", "/about/accreditation"),
            ("الشركاء", "Partners", "/about/partners"),
            ("الوظائف", "Careers", "/about/careers"),
        ],
    ),
    (
        "الأكاديمية",
        "Academics",
        [
            ("الأقسام", "Departments", "/departments"),
            ("البرامج", "Programmes", "/programs"),
            ("التقويم الأكاديمي", "Academic calendar", "/calendar"),
            ("اللوائح والأنظمة", "Regulations", "/regulations"),
            ("دليل الطالب", "Student guide", "/academics/student-guide"),
            ("المكتبة", "Library", "/academics/library"),
        ],
    ),
    (
        "القبول",
        "Admissions",
        [
            ("القبول والتسجيل", "How to apply", "/admissions"),
            ("الرسوم والمنح", "Fees and scholarships", "/admissions/fees"),
            (
                "المعادلة والطلاب الدوليون",
                "Equivalence and international students",
                "/admissions/equivalence",
            ),
        ],
    ),
    (
        "الحياة الطلابية",
        "Student life",
        [
            ("شؤون الطلاب", "Student affairs", "/student-life/affairs"),
            ("الأنشطة الطلابية", "Activities", "/student-life/activities"),
            ("الخريجون", "Alumni", "/student-life/alumni"),
        ],
    ),
    (
        "المركز الإعلامي",
        "Media",
        [
            ("الأخبار", "News", "/news"),
            ("الإعلانات", "Announcements", "/announcements"),
            ("الفعاليات", "Events", "/events"),
            ("معرض الصور", "Gallery", "/gallery"),
        ],
    ),
]
HEADER_LINKS: list[L] = [("تواصل", "Contact", "/contact")]

FOOTER: list[tuple[str, str, list[L]]] = [
    (
        "الكلية",
        "College",
        [
            ("عن الكلية", "About", "/about"),
            ("القيادة", "Leadership", "/about/leadership"),
            ("الاعتماد", "Accreditation", "/about/accreditation"),
            ("الوظائف", "Careers", "/about/careers"),
            ("تواصل", "Contact", "/contact"),
        ],
    ),
    (
        "الدراسة",
        "Study",
        [
            ("الأقسام", "Departments", "/departments"),
            ("البرامج", "Programmes", "/programs"),
            ("التقويم الأكاديمي", "Academic calendar", "/calendar"),
            ("اللوائح", "Regulations", "/regulations"),
            ("دليل الطالب", "Student guide", "/academics/student-guide"),
        ],
    ),
    (
        "القبول والإعلام",
        "Admissions and media",
        [
            ("القبول", "Admissions", "/admissions"),
            ("الرسوم والمنح", "Fees and scholarships", "/admissions/fees"),
            ("الأخبار", "News", "/news"),
            ("الإعلانات", "Announcements", "/announcements"),
            ("الفعاليات", "Events", "/events"),
        ],
    ),
]


def create(apps, schema_editor):
    Menu = apps.get_model("content", "Menu")
    MenuItem = apps.get_model("content", "MenuItem")

    def fill(key, groups, links=()):
        menu, _ = Menu.objects.get_or_create(key=key)
        if menu.items.exists():  # never overwrite the site manager's menu
            return
        order = 0
        for order, (ar, en, children) in enumerate(groups, start=1):
            group = MenuItem.objects.create(menu=menu, label_ar=ar, label_en=en, url="", order=order)
            for sub, (c_ar, c_en, path) in enumerate(children, start=1):
                MenuItem.objects.create(
                    menu=menu, parent=group, label_ar=c_ar, label_en=c_en, url=path, order=sub
                )
        for extra, (ar, en, path) in enumerate(links, start=order + 1):
            MenuItem.objects.create(menu=menu, label_ar=ar, label_en=en, url=path, order=extra)

    fill("header", HEADER, HEADER_LINKS)
    fill("footer", FOOTER)


class Migration(migrations.Migration):
    dependencies = [("content", "0001_initial")]

    operations = [
        migrations.AlterField(
            model_name="menuitem",
            name="url",
            field=models.CharField(blank=True, max_length=300),
        ),
        migrations.RunPython(create, migrations.RunPython.noop),
    ]
