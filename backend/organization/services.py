"""Side effects of structure edits that the generic viewset does not cover."""

from content.models import Redirect

LANGS = ("ar", "en")


def redirect_old_code(section: str, old: str, new: str) -> None:
    """The site addresses departments and programmes by code (/ar/departments/IT/): after a
    code change the old links (bookmarks, search results, shared posts) lead to the new page
    through the CMS redirects the site's 404 page follows (review 2026-11 R27)."""
    if old == new:
        return
    for lang in LANGS:
        target = f"/{lang}/{section}/{new}/"
        # Coming back to a code used before: that address is a page again, not a redirect.
        Redirect.objects.filter(from_path__in=[target, target.rstrip("/")]).delete()
        # Older redirects to the old page go straight to the new one (no chains).
        Redirect.objects.filter(to_path=f"/{lang}/{section}/{old}/").update(to_path=target)
        for source in (f"/{lang}/{section}/{old}/", f"/{lang}/{section}/{old}"):
            Redirect.objects.update_or_create(
                from_path=source, defaults={"to_path": target, "permanent": True}
            )
